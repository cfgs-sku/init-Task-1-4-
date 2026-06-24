import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

/**
 * vite.config.js
 * 开发：src/ 目录直接服务静态文件
 * 生产：npm run build → scripts/build-single.js 输出 dist/index.html
 *
 * 关键：src/js/*.js 全是传统脚本（非 ES 模块），
 * 用中间件拦截后直接返回原始内容，绕过 Vite 的 import-analysis 解析。
 */
export default defineConfig({
  root: 'src',
  server: {
    port: 3000,
    open: '/index.html',
    fs: { allow: ['..'] }   // 允许访问上级目录的 embed-data.js
  },
  plugins: [
    {
      name: 'serve-legacy-js-raw',
      configureServer(server) {
        // 拦截 /js/*.js 请求，绕过 Vite 的 ES 模块解析管道
        server.middlewares.use(function(req, res, next) {
          if (req.url && /^\/js\/[^?]+\.js(\?.*)?$/.test(req.url)) {
            const filePath = path.join(__dirname, 'src', req.url.split('?')[0]);
            if (fs.existsSync(filePath)) {
              res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
              res.setHeader('Cache-Control', 'no-cache');
              res.end(fs.readFileSync(filePath, 'utf-8'));
              return;
            }
          }
          next();
        });
      }
    }
  ]
});
