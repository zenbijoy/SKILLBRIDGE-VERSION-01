const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const APK_PATH = path.join(__dirname, '..', 'SkillBridge.apk');

const server = http.createServer((req, res) => {
  if (req.url === '/download' || req.url === '/SkillBridge.apk' || req.url === '/app.apk') {
    if (!fs.existsSync(APK_PATH)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('APK not found on server.');
    }
    const stat = fs.statSync(APK_PATH);
    res.writeHead(200, {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Length': stat.size,
      'Content-Disposition': 'attachment; filename="SkillBridge.apk"'
    });
    const readStream = fs.createReadStream(APK_PATH);
    readStream.pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SkillBridge App Download</title>
  <style>
    body {
      margin: 0;
      padding: 24px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      text-align: center;
    }
    .card {
      background: #1e293b;
      padding: 32px 24px;
      border-radius: 20px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      max-width: 420px;
      width: 100%;
      border: 1px solid #334155;
    }
    .logo {
      font-size: 52px;
      margin-bottom: 12px;
    }
    h1 {
      margin: 0 0 8px 0;
      font-size: 24px;
      color: #38bdf8;
    }
    p {
      margin: 0 0 24px 0;
      color: #94a3b8;
      font-size: 15px;
      line-height: 1.5;
    }
    .btn {
      display: inline-block;
      background: linear-gradient(135deg, #0284c7, #2563eb);
      color: #ffffff;
      text-decoration: none;
      padding: 16px 28px;
      font-size: 18px;
      font-weight: 600;
      border-radius: 12px;
      box-shadow: 0 4px 14px rgba(37,99,235,0.4);
      transition: all 0.2s ease;
      width: 80%;
    }
    .btn:active {
      transform: scale(0.97);
    }
    .info {
      margin-top: 20px;
      font-size: 13px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">📱</div>
    <h1>SkillBridge Android App</h1>
    <p>অফিসিয়াল SkillBridge রিলিজ APK আপনার ফোনে সরাসরি ডাউনলোড করে ইন্সটল করুন।</p>
    <a href="/download" class="btn">ডাউনলোড APK (৬২ MB)</a>
    <div class="info">ডাউনলোড শেষে ফাইলে ক্লিক করে "Install" সিলেক্ট করুন।</div>
  </div>
</body>
</html>`);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`APK Download Server running at http://0.0.0.0:${PORT}`);
});
