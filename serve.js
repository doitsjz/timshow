// 极简静态服务器 — 仅供本地预览
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || '.';
const PORT = parseInt(process.argv[3] || '8080', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8'
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/pages/index.html';
  if (urlPath === '/stopwatch' || urlPath === '/index') urlPath = '/pages/index.html';
  if (urlPath === '/countdown') urlPath = '/pages/countdown.html';
  if (urlPath === '/settings') urlPath = '/pages/settings.html';

  const filePath = path.join(ROOT, urlPath);
  // 防目录穿越
  if (!filePath.startsWith(path.resolve(ROOT))) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + urlPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('极简计时器本地预览服务已启动:');
  console.log('  秒表:    http://127.0.0.1:' + PORT + '/');
  console.log('  倒计时:  http://127.0.0.1:' + PORT + '/countdown');
  console.log('  设置:    http://127.0.0.1:' + PORT + '/settings');
  console.log('按 Ctrl+C 停止');
});
