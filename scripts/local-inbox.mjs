import net from 'node:net';
import http from 'node:http';
// Development-only SMTP sink. Bound to loopback, no relay and no persistence.
export async function startInbox() {
  const messages = []; const sockets = new Set();
  const smtp = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    socket.setEncoding('utf8'); socket.write('220 ShopLab local inbox\r\n'); let buffer = ''; let reading = false; let parts = [];
    socket.on('data', data => {
      buffer += data; if (buffer.length > 100000) return socket.destroy();
      let index;
      while ((index = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 2);
        if (reading) {
          if (line === '.') { reading = false; messages.unshift(parts.join('\n')); messages.splice(20); parts = []; socket.write('250 Stored\r\n'); }
          else parts.push(line.startsWith('..') ? line.slice(1) : line);
        } else if (/^(EHLO|HELO)/i.test(line)) socket.write('250 shoplab.local\r\n');
        else if (/^DATA/i.test(line)) { reading = true; socket.write('354 End with dot\r\n'); }
        else if (/^QUIT/i.test(line)) socket.end('221 Bye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
    socket.on('error', () => {});
  });
  const escape = s => s.replaceAll('&', '&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const web = http.createServer((req, res) => {
    if (req.headers.host !== '127.0.0.1:8025' && req.headers.host !== 'localhost:8025') { res.writeHead(403); return res.end(); }
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
    res.end(`<title>ShopLab local inbox</title><style>body{font:15px system-ui;margin:40px;background:#f5f4ee}pre{white-space:pre-wrap;background:white;padding:25px}</style><h1>ShopLab local inbox</h1><p>Development messages only. Refresh to see new mail. Copy the reset link from the message below.</p>${messages.map(m=>`<pre>${escape(m.replace(/=\n/g, '').replace(/=3D/g,'='))}</pre>`).join('') || '<p>No messages yet.</p>'}`);
  });
  await new Promise((resolve, reject) => smtp.once('error', reject).listen(1025, '127.0.0.1', resolve));
  await new Promise((resolve, reject) => web.once('error', reject).listen(8025, '127.0.0.1', resolve));
  return () => { for (const socket of sockets) socket.destroy(); smtp.close(); web.close(); };
}
