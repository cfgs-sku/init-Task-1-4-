#!/usr/bin/env node
/**
 * scripts/extract.js
 * 自动从原始 index.html 提取各模块到 src/ 目录
 * 运行：node scripts/extract.js
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT    = path.join(__dirname, '..');
const SRC_HTML = path.join(ROOT, 'index.html');
const OUT_DIR  = path.join(ROOT, 'src');

if (!fs.existsSync(SRC_HTML)) {
  console.error('❌ 找不到 index.html，请在项目根目录运行此脚本');
  process.exit(1);
}

const raw   = fs.readFileSync(SRC_HTML, 'utf-8');
const lines = raw.split('\n');

/** 取第 from 行到第 to 行（1-indexed，闭区间） */
function L(from, to) { return lines.slice(from - 1, to).join('\n'); }

/** 确保目录存在 */
function mkdir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

/** 写文件（跳过已存在的） */
function write(relPath, content, force) {
  const full = path.join(OUT_DIR, relPath);
  if (!force && fs.existsSync(full)) {
    console.log('⏭  已存在，跳过：' + relPath);
    return;
  }
  mkdir(path.dirname(full));
  fs.writeFileSync(full, content, 'utf-8');
  console.log('✓  ' + relPath);
}

// ══════════════════════════════════════════════════════
// CSS
// ══════════════════════════════════════════════════════

// theme.css: :root 变量 + 基础重置（行 9-21）
write('css/theme.css',
`/* theme.css — CSS 变量 & 基础重置 */\n` + L(9, 21));

// layout.css: 所有组件样式（行 22-669 + 第二段样式块 7298-7350）
write('css/layout.css',
`/* layout.css — 组件 & 布局样式 */\n` + L(22, 669) +
`\n\n/* ── 赋码匹配补充样式 (来自原文件第二段 <style>) */\n` + L(7298, 7350));

// ══════════════════════════════════════════════════════
// JS 模块
// ══════════════════════════════════════════════════════

// ApiService.js: 云端数据加载（行 1625-1674）
write('js/ApiService.js',
`// ApiService.js — 云端数据加载 & localStorage 缓存\n` + L(1625, 1674));

// ProjectService.js: _K 常量 + ProjectService（行 4463-4604）
write('js/ProjectService.js',
`// ProjectService.js — 采购项目 & 地址管理\n` + L(4463, 4604));

// SKUService.js: SKU 查重（行 4609-4651）
write('js/SKUService.js',
`// SKUService.js — SKU 检索 & 查重\n` + L(4609, 4651));

// PCService.js: 采购中心 + 定制采购（行 4656-5937）
write('js/PCService.js',
`// PCService.js — 采购中心 (PCService) + 定制采购 (CustomService)\n` + L(4656, 5937));

// AuthSystem.js: TempSKU + DataMgr + AuthSystem + FeishuSync（行 5939-7293）
write('js/AuthSystem.js',
`// AuthSystem.js — 临时物资(TempSKU) + 数据管理(DataMgr) + 权限系统(AuthSystem) + 飞书同步(FeishuSync)\n` +
L(5939, 7293));

// DemandService.js: URLGateway + AuditService + StatsService + UserService + ReviewService + DemandService（行 7602-10095）
write('js/DemandService.js',
`// DemandService.js — 需求池服务集合\n// 包含: URLGateway / AuditService / StatsService / UserService / ReviewService / DemandService\n` +
L(7602, 10095));

// main.js: embed-data 兜底 + 全部核心业务逻辑（行 1679-1682 + 1685-4452，跳过</script>行4453）
write('js/main.js',
`// main.js — 核心业务逻辑入口\n// 包含: AppState 全局状态、initDB、goPage、SKU搜索、购物车、历史、Excel导出等\n` +
L(1679, 1682) + '\n' + L(1685, 4452));

// ══════════════════════════════════════════════════════
// 清洁 HTML 模板
// ══════════════════════════════════════════════════════

// HTML 主体内容（三段）
const bodyMain   = L(673,  1623);   // 主页面 HTML（导航栏、各分页）
const bodyModal1 = L(7352, 7595);   // 图片预览层、链接编辑器等弹窗
const bodyModal2 = L(10099, 10272); // 数据管理弹窗、使用说明弹窗

const indexHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>城服公司物资采购管理系统 SKU25 · 2026.06.02</title>
<!-- CDN 依赖（保持外链，不内联） -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<!-- 模块化 CSS -->
<link rel="stylesheet" href="./css/theme.css">
<link rel="stylesheet" href="./css/layout.css">
</head>
<body>

${bodyMain}

${bodyModal1}

${bodyModal2}

<!-- ════════════════════════════════
     脚本加载（严格按依赖顺序）
     开发：修改各 src/js/*.js 文件
     生产：npm run build → dist/index.html
════════════════════════════════ -->
<script src="./js/ApiService.js"></script>
<!-- 历史订单外置数据（与 index.html 同目录部署） -->
<script src="../embed-data.js"></script>
<script>
// 兜底：embed-data.js 未加载时给空默认值，避免引用报错
if(typeof ORDER_ITEMS==='undefined') window.ORDER_ITEMS=[];
if(typeof ORDER_PATCHES==='undefined') window.ORDER_PATCHES={};
if(typeof PRESET_ORDERS==='undefined') window.PRESET_ORDERS={};
</script>
<script src="./js/ProjectService.js"></script>
<script src="./js/SKUService.js"></script>
<script src="./js/PCService.js"></script>
<script src="./js/AuthSystem.js"></script>
<script src="./js/DemandService.js"></script>
<script src="./js/main.js"></script>
</body>
</html>
`;

write('index.html', indexHtml, true); // force overwrite HTML

console.log('\n✅ 模块化提取完成！');
console.log('   开发服务器：npm run dev');
console.log('   生产构建  ：npm run build  →  dist/index.html');
