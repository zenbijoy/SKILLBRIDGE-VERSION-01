const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const DIST_DIR = path.join(__dirname, '..', 'frontend', 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  if (pathname === '/') pathname = '/index.html';

  let filePath = path.join(DIST_DIR, pathname);

  // If path exists and is directory, check index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  // If file doesn't exist, try adding .html (Expo static export uses route.html)
  if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.html')) {
    filePath = filePath + '.html';
  }

  // SPA fallback
  if (!fs.existsSync(filePath)) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', contentType);

  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    res.writeHead(500);
    res.end('Internal Server Error');
  });
  stream.pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`SkillBridge Web Server running at http://127.0.0.1:${PORT}`);
});
