// Yerel deneme sunucusu: Cloudflare olmadan aynı oda mantığıyla çalışır (bağımlılık yok).
// node online/yerel.mjs  →  ws://localhost:8787/masa/<KOD>?id=<istemci>
import http from 'node:http';
import crypto from 'node:crypto';
import { yeniOda, isle, sureDoldu, gorunum } from './oda.js';

const PORT = Number(process.env.PORT || 8787);
const odalar = new Map(); // kod -> { oda, baglar: Set<{soket,id}> }

function cerceve(metin) {
  const veri = Buffer.from(metin);
  const n = veri.length;
  const bas = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x81; b[1] = 127; b.writeBigUInt64BE(BigInt(n), 2); return b; })();
  return Buffer.concat([bas, veri]);
}

function coz(tampon) {
  const cikti = [];
  let i = 0;
  while (tampon.length - i >= 2) {
    const op = tampon[i] & 15, maskeli = tampon[i + 1] & 128;
    let n = tampon[i + 1] & 127, j = i + 2;
    if (n === 126) { if (tampon.length < j + 2) break; n = tampon.readUInt16BE(j); j += 2; }
    else if (n === 127) { if (tampon.length < j + 8) break; n = Number(tampon.readBigUInt64BE(j)); j += 8; }
    const maske = maskeli ? tampon.slice(j, j + 4) : null; if (maskeli) j += 4;
    if (tampon.length < j + n) break;
    const yuk = Buffer.from(tampon.slice(j, j + n));
    if (maske) for (let k = 0; k < n; k++) yuk[k] ^= maske[k & 3];
    cikti.push({ op, yuk });
    i = j + n;
  }
  return { cikti, kalan: tampon.slice(i) };
}

function yayinla(masa, olay) {
  for (const b of masa.baglar) { try { b.soket.write(cerceve(JSON.stringify(gorunum(masa.oda, b.id, olay)))); } catch (e) { /* kopmuş */ } }
  zamanla(masa);
}
// Geri sayım: süre dolunca varsayılan hamle yapılır ve herkese yollanır.
function zamanla(masa) {
  clearTimeout(masa.zaman);
  if (!masa.oda.sayac) return;
  masa.zaman = setTimeout(() => {
    const s = sureDoldu(masa.oda);
    if (s.olay) yayinla(masa, s.olay); else zamanla(masa);
  }, Math.max(0, masa.oda.sayac.bitis - Date.now()) + 30);
}

const sunucu = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('Novo Poker yerel sunucu'); });
sunucu.on('upgrade', (req, soket) => {
  const url = new URL(req.url, 'http://x');
  const m = url.pathname.match(/^\/masa\/([A-Za-z0-9]{4,8})$/);
  const id = (url.searchParams.get('id') || '').slice(0, 40);
  if (!m || id.length < 8) { soket.destroy(); return; }
  const kod = m[1].toUpperCase();
  const anahtar = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  soket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${anahtar}\r\n\r\n`);
  if (!odalar.has(kod)) odalar.set(kod, { oda: yeniOda(kod), baglar: new Set() });
  const masa = odalar.get(kod);
  const bag = { soket, id };
  masa.baglar.add(bag);
  soket.write(cerceve(JSON.stringify(gorunum(masa.oda, id))));
  let tampon = Buffer.alloc(0);
  soket.on('data', d => {
    const { cikti, kalan } = coz(Buffer.concat([tampon, d]));
    tampon = kalan;
    for (const { op, yuk } of cikti) {
      if (op === 8) { soket.end(); return; }
      if (op !== 1) continue;
      let msj; try { msj = JSON.parse(yuk.toString()); } catch (e) { continue; }
      if (msj.tip === 'merhaba') { soket.write(cerceve(JSON.stringify(gorunum(masa.oda, id)))); continue; }
      const s = isle(masa.oda, id, msj);
      if (s.hata) soket.write(cerceve(JSON.stringify({ tip: 'hata', hata: s.hata })));
      if (s.olay) yayinla(masa, s.olay);
    }
  });
  const kapat = () => masa.baglar.delete(bag);
  soket.on('close', kapat); soket.on('error', kapat);
});
sunucu.listen(PORT, () => console.log('Novo Poker yerel sunucu: ws://localhost:' + PORT));
