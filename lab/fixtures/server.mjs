import http from 'node:http';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGUlEQVQokWOonVJDEmIY1TBlNJRqh2vSAAAPsI0QBMelfQAAAABJRU5ErkJggg==', 'base64');
const host = process.env.FIXTURE_BIND || '127.0.0.1';
http.createServer((req, res) => {
  if (req.url === '/redirect') { res.writeHead(302, { Location: 'http://internal-canary:4102/' }); return res.end(); }
  if (req.url !== '/sample.png') { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(png);
}).listen(4101, host);
http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ marker: 'SHOPLAB_CANARY_ONLY', secret: false })); }).listen(4102, host);
