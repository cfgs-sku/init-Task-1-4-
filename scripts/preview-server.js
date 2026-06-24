#!/usr/bin/env node
/**
 * scripts/preview-server.js
 * 预览 dist/ 目录的生产构建结果
 * 运行：npm run preview
 */
'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'dist');
const PORT = 4000;
const MIME = {
  '.html':'text/html; charset=utf-8',
  '.js':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
};

if (!fs.existsSync(ROOT)) {
  console.error('❌ dist/ 目录不存在，请先运行 npm run build');
  process.exit(1);
}

http.createServer(function(req, res) {
  var url = (req.url || '/').split('?')[0];
  if (url === '/') url = '/index.html';
  var filePath = path.join(ROOT, url);
  var ext = path.extname(filePath).toLowerCase();
  if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(fs.readFileSync(filePath));
}).listen(PORT, '127.0.0.1', function() {
  console.log('  ✅ 预览服务器: http://localhost:' + PORT);
  require('child_process').exec('start "" "http://localhost:' + PORT + '"');
});
