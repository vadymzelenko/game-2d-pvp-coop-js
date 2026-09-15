const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

const { handleConnection } = require('./src/server/ws');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.svg':  'image/svg+xml'
};

const server = http.createServer((req, res) => {
    let url = req.url.split('?')[0];
    if (url === '/') url = '/index.html';
    const filePath = path.normalize(path.join(PUBLIC_DIR, url));
    if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end(); return; }

    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('404'); return; }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            'Cache-Control': 'no-cache'
        });
        res.end(data);
    });
});

const wss = new WebSocket.Server({ server });
wss.on('connection', handleConnection);

server.listen(PORT, () => {
    console.log(`\n  SANATORIUM MP v4.0\n  ────────────────────`);
    console.log(`  Local:   http://localhost:${PORT}`);
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets))
        for (const net of nets[name])
            if (net.family === 'IPv4' && !net.internal)
                console.log(`  LAN:     http://${net.address}:${PORT}`);
    console.log('');
});