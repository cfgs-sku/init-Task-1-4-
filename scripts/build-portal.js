#!/usr/bin/env node
/**
 * scripts/build-portal.js
 * 将 src/portal.html + src/js/*.js 内联打包成 dist/portal.html（单文件，可直接部署）
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT     = path.join(__dirname, '..');
const SRC_DIR  = path.join(ROOT, 'src');
const DIST_DIR = path.join(ROOT, 'dist');

if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });

let html = fs.readFileSync(path.join(SRC_DIR, 'portal.html'), 'utf-8');

// 内联本地 JS（./js/xxx.js）
html = html.replace(/<script\s+src="\.\/js\/([^"]+)"><\/script>/g, function(_, filename) {
  const jsPath = path.join(SRC_DIR, 'js', filename);
  if (!fs.existsSync(jsPath)) {
    console.warn('⚠️  找不到 JS 文件：' + filename);
    return '';
  }
  const js = fs.readFileSync(jsPath, 'utf-8');
  console.log('  内联 JS : ' + filename + ' (' + Math.round(js.length / 1024) + ' KB)');
  return '<script>\n' + js + '\n</script>';
});

// 写出
const outPath = path.join(DIST_DIR, 'portal.html');
fs.writeFileSync(outPath, html, 'utf-8');
console.log('✅ dist/portal.html (' + Math.round(html.length / 1024) + ' KB)');
