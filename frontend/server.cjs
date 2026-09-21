/**
 * 生产模式静态服务器（零第三方依赖）：
 * - 托管 dist/ 下的前端构建产物；
 * - 把 /api/* 反向代理到后端容器（BACKEND_URL，默认 http://backend:3001）。
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 8080);
const BACKEND = process.env.BACKEND_URL || 'http://backend:3001';
const DIST = path.join(__dirname, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');

  if (url.pathname.startsWith('/api/')) {
    const target = new URL(url.pathname + url.search, BACKEND);
    const proxyReq = http.request(
      target,
      { method: req.method, headers: req.headers },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );
    proxyReq.on('error', () => {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: `无法连接后端算法服务（${BACKEND}）` }));
    });
    req.pipe(proxyReq);
    return;
  }

  let filePath = path.join(DIST, url.pathname);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, 'index.html'); // SPA 回退
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`LogicLab 前端（含 /api 代理到 ${BACKEND}）监听 http://0.0.0.0:${PORT}`);
});
