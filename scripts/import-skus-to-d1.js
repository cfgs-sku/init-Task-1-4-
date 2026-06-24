#!/usr/bin/env node
/**
 * scripts/import-skus-to-d1.js
 * 将 embed-data.js 里的 ORDER_ITEMS 去重后批量导入 D1 的 sku_library 表
 *
 * 用法：
 *   node scripts/import-skus-to-d1.js           # 预览（不写库）
 *   node scripts/import-skus-to-d1.js --apply   # 真正写入 D1
 *   node scripts/import-skus-to-d1.js --apply --local  # 写本地 D1（wrangler dev 用）
 */
'use strict';

const fs     = require('fs');
const path   = require('path');
const vm     = require('vm');
const { execSync } = require('child_process');

const ROOT        = path.join(__dirname, '..');
const EMBED_FILE  = path.join(ROOT, 'embed-data.js');
const APPLY       = process.argv.includes('--apply');
const USE_LOCAL   = process.argv.includes('--local');
const DB_NAME     = 'cfgs-purchase-db';
const BATCH_SIZE  = 50;   // 每批插入条数（避免命令行过长）

// ── 1. 加载 embed-data.js ────────────────────────────────────────
console.log('📂 读取 embed-data.js …');
if (!fs.existsSync(EMBED_FILE)) {
  console.error('❌ 找不到 embed-data.js，请先运行 npm run build 或将文件放到项目根目录');
  process.exit(1);
}

const code = fs.readFileSync(EMBED_FILE, 'utf-8');
const sandbox = { ORDER_ITEMS: [], ORDER_PATCHES: {}, PRESET_ORDERS: {} };
try {
  vm.runInNewContext(code, sandbox);
} catch (e) {
  console.error('❌ embed-data.js 执行出错:', e.message);
  process.exit(1);
}

const rawItems = sandbox.ORDER_ITEMS;
console.log(`   原始记录：${rawItems.length} 条`);

// ── 2. 去重 & 标准化 ─────────────────────────────────────────────
// 用 "名称|规格" 作为唯一键，保留最新价格
const skuMap = new Map();

rawItems.forEach(function(it) {
  const name  = (it.n || '').trim();
  const spec  = (it.s || '').trim();
  const brand = (it.b || '').trim();
  const unit  = (it.u || '').trim();
  const price = parseFloat(it.p) || 0;

  if (!name) return;

  const url   = (it.url || '').trim();
  const key   = name + '|' + spec;
  if (!skuMap.has(key)) {
    skuMap.set(key, { name, spec, brand, unit, price, url });
  } else {
    const cur = skuMap.get(key);
    if (price > cur.price) cur.price = price;
    if (!cur.brand && brand) cur.brand = brand;
    if (!cur.unit  && unit)  cur.unit  = unit;
    if (!cur.url   && url)   cur.url   = url;
  }
});

const skus = Array.from(skuMap.values());
console.log(`   去重后：${skus.length} 条唯一物资`);

// ── 3. 生成编码 ─────────────────────────────────────────────────
// 格式：SKU-YYYYNNNN（按顺序编）
const year = new Date().getFullYear();
const records = skus.map(function(s, i) {
  return {
    code:     'SKU-' + year + String(i + 1).padStart(4, '0'),
    name:     s.name,
    spec:     s.spec,
    unit:     s.unit  || '个',
    brand:    s.brand || '',
    category: '其他',
    price:    s.price,
    url:      s.url   || '',
  };
});

// ── 4. 预览 ─────────────────────────────────────────────────────
console.log('\n📋 前 5 条预览：');
records.slice(0, 5).forEach(function(r) {
  console.log(`  ${r.code}  ${r.name}  ${r.spec}  ${r.unit}  ¥${r.price}`);
});

if (!APPLY) {
  console.log('\n⚠️  预览模式，未写入。加 --apply 参数正式导入。');
  console.log(`   预计写入 ${records.length} 条 → D1 sku_library`);
  process.exit(0);
}

// ── 5. 分批执行 wrangler d1 execute ────────────────────────────
console.log(`\n🚀 开始导入 ${records.length} 条到 D1 (${DB_NAME}) …`);
const remoteFlag = USE_LOCAL ? '--local' : '--remote';
let inserted = 0;

for (let i = 0; i < records.length; i += BATCH_SIZE) {
  const batch = records.slice(i, i + BATCH_SIZE);

  // 拼 SQL：INSERT OR IGNORE（已存在 code 则跳过）
  const values = batch.map(function(r) {
    const esc = function(v) { return String(v || '').replace(/'/g, "''"); };
    return `('${esc(r.code)}','${esc(r.name)}','${esc(r.spec)}','${esc(r.unit)}','${esc(r.brand)}','${esc(r.category)}',0,${r.price},'${esc(r.url)}',datetime('now'))`;
  }).join(',\n  ');

  const sql =
    `INSERT OR IGNORE INTO sku_library(code,name,spec,unit,brand,category,is_temporary,last_price,purchase_url,updated_at)\nVALUES\n  ${values};`;

  // 写临时 SQL 文件（避免命令行长度限制）
  const tmpFile = path.join(__dirname, '_tmp_batch.sql');
  fs.writeFileSync(tmpFile, sql, 'utf-8');

  try {
    execSync(
      `wrangler d1 execute ${DB_NAME} ${remoteFlag} --file="${tmpFile}"`,
      { stdio: 'pipe', cwd: ROOT }
    );
    inserted += batch.length;
    process.stdout.write(`\r   进度：${inserted}/${records.length}`);
  } catch (e) {
    console.error(`\n❌ 第 ${i / BATCH_SIZE + 1} 批失败:`, e.stderr?.toString() || e.message);
    fs.unlinkSync(tmpFile);
    process.exit(1);
  }

  fs.unlinkSync(tmpFile);
}

console.log(`\n✅ 导入完成！共写入 ${inserted} 条物资到 D1 sku_library`);
console.log('   重新访问 portal.html 搜索物资即可看到数据。');
