// Cloudflare Worker: wss://<alan>/masa/<KOD>?id=<istemci> → o masanın Durable Object'i.
// Her masa tek bir nesnede yaşar; oyun durumu orada tutulur ve depoya yazılır.
import { yeniOda, isle, sureDoldu, gorunum } from './oda.js';

const KOD = /^[A-Z0-9]{4,8}$/;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/masa\/([A-Za-z0-9]{4,8})$/);
    if (m && req.headers.get('Upgrade') === 'websocket') {
      const kod = m[1].toUpperCase();
      const stub = env.MASA.get(env.MASA.idFromName(kod));
      return stub.fetch(req);
    }
    if (url.pathname === '/saglik') return new Response('ok');
    return new Response('Novo Poker online sunucusu', { status: 404 });
  },
};

export class Masa {
  constructor(state) {
    this.state = state;
    this.oda = null;
    state.blockConcurrencyWhile(async () => { this.oda = (await state.storage.get('oda')) || null; });
  }

  async fetch(req) {
    const url = new URL(req.url);
    const kod = url.pathname.split('/').pop().toUpperCase();
    const id = (url.searchParams.get('id') || '').slice(0, 40);
    if (!KOD.test(kod) || id.length < 8) return new Response('geçersiz', { status: 400 });
    if (!this.oda) this.oda = yeniOda(kod);
    const [istemci, sunucu] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(sunucu, [id]);
    sunucu.send(JSON.stringify(gorunum(this.oda, id)));
    return new Response(null, { status: 101, webSocket: istemci });
  }

  async webSocketMessage(ws, veri) {
    let m;
    try { m = JSON.parse(veri); } catch (e) { return; }
    const id = this.state.getTags(ws)[0];
    if (m.tip === 'merhaba') { ws.send(JSON.stringify(gorunum(this.oda, id))); return; }
    const s = isle(this.oda, id, m);
    if (s.hata) ws.send(JSON.stringify({ tip: 'hata', hata: s.hata }));
    if (s.olay) await this.yayinla(s.olay);
  }

  async yayinla(olay) {
    await this.state.storage.put('oda', this.oda);
    for (const w of this.state.getWebSockets()) {
      try { w.send(JSON.stringify(gorunum(this.oda, this.state.getTags(w)[0], olay))); } catch (e) { /* kopmuş */ }
    }
    // Geri sayım: Durable Object alarmı süre dolunca alarm()'ı çağırır.
    if (this.oda.sayac) await this.state.storage.setAlarm(this.oda.sayac.bitis + 30);
    else await this.state.storage.deleteAlarm();
  }

  async alarm() {
    if (!this.oda) return;
    const s = sureDoldu(this.oda);
    if (s.olay) await this.yayinla(s.olay);
    else if (this.oda.sayac) await this.state.storage.setAlarm(this.oda.sayac.bitis + 30);
  }

  async webSocketClose(ws) { try { ws.close(); } catch (e) { /* zaten kapalı */ } }
}
