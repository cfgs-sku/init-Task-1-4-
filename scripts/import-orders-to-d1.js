#!/usr/bin/env node
/**
 * scripts/import-orders-to-d1.js
 * 将线下 Excel/CSV 订单批量导入 D1
 *
 * Excel 格式（第一行为表头）：
 *   项目名称 | 采购员 | 日期(YYYY-MM-DD) | 物资名称 | 规格 | 品牌 | 单位 | 数量 | 单价
 *
 * 用法：
 *   node scripts/import-orders-to-d1.js orders.csv          # 预览
 *   node scripts/import-orders-to-d1.js orders.csv --apply  # 写入
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT    = path.join(__dirname, '..');
const FILE    = process.argv[2];
const APPLY   = process.argv.includes('--apply');
const DB_NAME = 'cfgs-purchase-db';

if (!FILE) {
  console.log('用法: node scripts/import-orders-to-d1.js <csv文件> [--apply]');
  console.log('\nCSV 格式（UTF-8，逗号分隔）：');
  console.log('项目名称,采购员,日期,物资名称,规格,品牌,单位,数量,单价');
  process.exit(0);
}

// ── 读取 CSV ────────────────────────────────────────────────────
const lines = fs.readFileSync(path.resolve(FILE), 'utf-8')
  .replace(/^﻿/, '')          // 剥离 UTF-8 BOM
  .split('\n').map(l => l.trim()).filter(Boolean);

const headers = lines[0].split(',').map(h => h.trim());
const rows    = lines.slice(1).map(l => {
  const vals = l.split(',');
  const obj  = {};
  headers.forEach((h, i) => obj[h] = (vals[i] || '').trim());
  return obj;
});

console.log(`📂 读取 ${rows.length} 行`);

// ── 按"项目+日期+采购员"分组为订单 ─────────────────────────────
const orderMap = new Map();
rows.forEach(r => {
  const key = [r['项目名称'], r['采购员'], r['日期']].join('|');
  if (!orderMap.has(key)) orderMap.set(key, { meta: r, items: [] });
  orderMap.get(key).items.push(r);
});

console.log(`   分组为 ${orderMap.size} 张订单\n`);
orderMap.forEach((ord, key) => {
  const m = ord.meta;
  console.log(`  [${m['项目名称']}] ${m['采购员']} ${m['日期']}  共 ${ord.items.length} 项`);
});

if (!APPLY) {
  console.log('\n⚠️  预览模式。加 --apply 正式写入 D1。');
  process.exit(0);
}

// ── 写入 D1 ─────────────────────────────────────────────────────
function d1(sql) {
  const tmp = path.join(__dirname, '_tmp_order.sql');
  fs.writeFileSync(tmp, sql, 'utf-8');
  try {
    execSync(`wrangler d1 execute ${DB_NAME} --remote --file="${tmp}"`, { stdio:'pipe', cwd: ROOT });
  } finally { fs.unlinkSync(tmp); }
}

function esc(v) { return String(v||'').replace(/'/g,"''"); }
function id()   { return 'ord_' + Date.now() + Math.random().toString(36).slice(2,6); }
function iid()  { return 'item_' + Date.now() + Math.random().toString(36).slice(2,6); }

let n = 0;
orderMap.forEach((ord) => {
  const m        = ord.meta;
  const projName = esc(m['项目名称']);
  const buyer    = esc(m['采购员']);
  const date     = esc(m['日期'] || new Date().toISOString().slice(0,10));
  const ordId    = id();

  // 确保项目存在
  d1(`INSERT OR IGNORE INTO projects(id,name,code,created_at)
      SELECT '${id()}','${projName}','','${date}'
      WHERE NOT EXISTS (SELECT 1 FROM projects WHERE name='${projName}');`);

  // 获取项目 id
  // 无法直接用 SELECT 返回值，用已知 name 在 INSERT 时引用
  const tmpOrdId = ordId;

  // 插入订单
  d1(`INSERT INTO orders(id,project_id,submitter_id,status,remark,created_at,updated_at)
      SELECT '${tmpOrdId}', p.id, 'legacy', 'archived',
             '线下导入-${buyer}', '${date}T00:00:00', datetime('now')
      FROM projects p WHERE p.name='${projName}' LIMIT 1;`);

  // 插入明细
  ord.items.forEach(it => {
    const qty   = parseFloat(it['数量'])  || 1;
    const price = parseFloat(it['单价'])  || 0;
    d1(`INSERT INTO order_items(id,order_id,sku_code,sku_name,brand,spec,unit,qty,est_price,is_temp)
        VALUES('${iid()}','${tmpOrdId}','','${esc(it['物资名称'])}',
               '${esc(it['品牌'])}','${esc(it['规格'])}','${esc(it['单位'])}',
               ${qty},${price},0);`);
  });

  process.stdout.write(`\r  已写入 ${++n}/${orderMap.size} 张订单`);
});

console.log(`\n✅ 完成！${n} 张线下订单已导入 D1，招采部视图「已归档」可查看。`);
