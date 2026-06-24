#!/usr/bin/env node
/**
 * scripts/dev-server.js
 * 零依赖静态文件服务器，原样伺服 src/ 下所有文件，不做任何 JS 转换。
 * 专为传统脚本（非 ES 模块）设计，解决 Vite import-analysis 解析错误。
 *
 * 访问：http://localhost:3000
 */
'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');

const ROOT  = path.join(__dirname, '..', 'src');
const PARENT = path.join(__dirname, '..');   // embed-data.js 在上级目录
const PORT  = 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

http.createServer(function(req, res) {
  // 去掉 query string
  var url = (req.url || '/').split('?')[0].split('#')[0];

  // 默认首页
  if (url === '/') url = '/index.html';

  // 处理 embed-data.js：src/index.html 里写的是 ../embed-data.js
  // 浏览器会请求 /embed-data.js（浏览器自动合并路径）
  var filePath;
  if (url === '/embed-data.js') {
    filePath = path.join(PARENT, 'embed-data.js');
  } else {
    // 安全：防止路径穿越攻击（仅限 src/ 内）
    var safePath = path.normalize(path.join(ROOT, url));
    if (!safePath.startsWith(ROOT)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    filePath = safePath;
  }

  var ext = path.extname(filePath).toLowerCase();

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found: ' + url);
    return;
  }

  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(fs.readFileSync(filePath));

}).listen(PORT, '127.0.0.1', function() {
  var addr = 'http://localhost:' + PORT;
  console.log('');
  console.log('  ✅ 开发服务器已启动');
  console.log('  📦 http://localhost:' + PORT);
  console.log('  按 Ctrl+C 停止');
  console.log('');

  // 自动打开浏览器（Windows）
  var { exec } = require('child_process');
  exec('start "" "' + addr + '"');
});
