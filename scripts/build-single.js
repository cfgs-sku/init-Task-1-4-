#!/usr/bin/env node
/**
 * scripts/build-single.js
 * 将 src/ 下所有 CSS <link> 和本地 JS <script src> 内联进 dist/index.html
 * 生成单文件部署包，与原 index.html 兼容
 *
 * 运行：node scripts/build-single.js  （或 npm run build）
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const SRC_DIR  = path.join(__dirname, '..', 'src');
const DIST_DIR = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(path.join(SRC_DIR, 'index.html'))) {
  console.error('❌ src/index.html 不存在，请先运行 npm run setup');
  process.exit(1);
}

if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });

let html = fs.readFileSync(path.join(SRC_DIR, 'index.html'), 'utf-8');

// ── 1. 内联 CSS <link rel="stylesheet" href="./css/xxx.css">
html = html.replace(/<link\s+rel="stylesheet"\s+href="\.\/css\/([^"]+)"\s*>/g, (_, filename) => {
  const cssPath = path.join(SRC_DIR, 'css', filename);
  if (!fs.existsSync(cssPath)) {
    console.warn('⚠️  找不到 CSS 文件：' + filename);
    return '';
  }
  const css = fs.readFileSync(cssPath, 'utf-8');
  console.log('  内联 CSS: ' + filename + ' (' + Math.round(css.length / 1024) + ' KB)');
  return `<style>\n${css}\n</style>`;
});

// ── 2. 内联本地 JS <script src="./js/xxx.js"></script>
html = html.replace(/<script\s+src="\.\/js\/([^"]+)"><\/script>/g, (_, filename) => {
  const jsPath = path.join(SRC_DIR, 'js', filename);
  if (!fs.existsSync(jsPath)) {
    console.warn('⚠️  找不到 JS 文件：' + filename);
    return '';
  }
  const js = fs.readFileSync(jsPath, 'utf-8');
  console.log('  内联 JS : ' + filename + ' (' + Math.round(js.length / 1024) + ' KB)');
  return `<script>\n${js}\n</script>`;
});

// ── 3. 修正 embed-data.js 路径（部署时与 index.html 同目录）
html = html.replace('src="../embed-data.js"', 'src="embed-data.js"');

// ── 4. 写出
const outPath = path.join(DIST_DIR, 'index.html');
fs.writeFileSync(outPath, html, 'utf-8');

const sizeKB = Math.round(html.length / 1024);
console.log('\n✅ 构建完成：dist/index.html (' + sizeKB + ' KB)');
console.log('   部署时将 dist/index.html 与 embed-data.js 放在同一目录即可');
