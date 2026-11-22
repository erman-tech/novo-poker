// Online Novo Poker: masa aç / katıl / lobi ve sunucu bağlantısı.
// Oyunu sunucu yürütür (online/oda.js); bu dosya bağlantıyı tutar, lobiyi çizer,
// oyun başlayınca durumu Novo ekranına (novo_masa.js) verir.
import { $, ekranGoster, kacis, para, onayla } from './arayuz.js';
import { onlineAc, onlineDurum, onlineHata, onlineKapat, yatayKilitle } from './novo_masa.js';
import { ultimateOnlineAc, ultimateOnlineDurum, ultimateOnlineHata, ultimateOnlineKapat } from './ultimate_masa.js';
import * as ses from './ses.js';

// Yayındaki sunucu adresi. Yerelde (localhost) yerel deneme sunucusu kullanılır;
// ?sunucu=wss://… ile elle verilebilir.
const YAYIN_SUNUCU = 'wss://novo-poker.novo-poker.workers.dev';
function sunucuAdresi() {
  const q = new URLSearchParams(location.search).get('sunucu');
  if (q) return q.replace(/\/$/, '');
  if (['localhost', '127.0.0.1'].includes(location.hostname)) return 'ws://' + location.hostname + ':8787';
  return YAYIN_SUNUCU;
}

const oku = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const yaz = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* özel sekme */ } };

function istemciId() {
  let id = oku('novo.istemci');
  if (!id || id.length < 16) {
    const r = new Uint8Array(12); crypto.getRandomValues(r);
    id = Array.from(r, b => b.toString(16).padStart(2, '0')).join('');
    yaz('novo.istemci', id);
  }
  return id;
}

function kodUret() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = new Uint32Array(5); crypto.getRandomValues(r);
  return Array.from(r, x => abc[x % abc.length]).join('');
}

let ws = null, kod = null, ad = '', kapatildi = true, deneme = 0, oyunda = null, son = null, kip = 'ac', oyun = 'novo';
const OYUN_AD = { novo: 'Novo Poker', ultimate: "Ultimate Texas Hold'em · BETA" };
// Oyun ekranı: masanın oyununa göre Novo ya da Ultimate
const EKRAN = {
  novo: { ac: onlineAc, durum: onlineDurum, hata: onlineHata, kapat: onlineKapat },
  ultimate: { ac: ultimateOnlineAc, durum: ultimateOnlineDurum, hata: ultimateOnlineHata, kapat: ultimateOnlineKapat },
};
const oyunHata = t => EKRAN[oyunda].hata(t);

function gonder(m) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(m));
  else { const t = 'Bağlantı yok, yeniden bağlanılıyor…'; oyunda ? oyunHata(t) : ($('l-hata').textContent = t); }
}

function baglan() {
  const adres = sunucuAdresi();
  if (!adres) { $('on-hata').textContent = 'Online sunucu henüz yayında değil.'; return false; }
  kapatildi = false;
  try { ws = new WebSocket(`${adres}/masa/${kod}?id=${istemciId()}`); } catch (e) { $('on-hata').textContent = 'Sunucuya bağlanılamadı.'; return false; }
  ws.onopen = () => { deneme = 0; gonder({ tip: 'katil', ad, oyun }); };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } gelen(m); };
  ws.onclose = () => {
    if (kapatildi) return;
    const t = 'Bağlantı koptu, yeniden bağlanıyor…';
    oyunda ? oyunHata(t) : ($('l-hata').textContent = t);
    setTimeout(() => { if (!kapatildi) baglan(); }, Math.min(5000, 600 * (++deneme)));
  };
  return true;
}

function gelen(m) {
  if (m.tip === 'hata') {
    if (oyunda) oyunHata(m.hata);
    else if (document.querySelector('#e-lobi.etkin')) $('l-hata').textContent = m.hata;
    else $('on-hata').textContent = m.hata;
    return;
  }
  if (m.tip !== 'durum') return;
  son = m;
  if (m.benim >= 0) { yaz('novo.sonMasa', m.kod); const benimAd = m.koltuklar[m.benim].ad; if (!/^Guest\d+$/.test(benimAd)) yaz('novo.ad', benimAd); }
  const tur = EKRAN[m.oyun] ? m.oyun : 'novo';
  if (!m.g) { if (oyunda) EKRAN[oyunda].kapat(); oyunda = null; lobiCiz(m); return; }
  if (oyunda !== tur) { if (oyunda) EKRAN[oyunda].kapat(); oyunda = tur; EKRAN[tur].ac({ gonder, cik }); yatayKilitle(); }
  EKRAN[tur].durum(m);
}

function lobiCiz(m) {
  if (!document.querySelector('#e-lobi.etkin')) ekranGoster('e-lobi');
  $('l-kod').textContent = m.kod;
  $('l-oyun').textContent = OYUN_AD[m.oyun] || OYUN_AD.novo;
  $('l-sayi').textContent = `${m.koltuklar.length}/3`;
  $('l-oyuncular').innerHTML = m.koltuklar.map((k, i) => `<div class="lobi-oyuncu ${i === m.benim ? 'ben' : ''}">
      <span class="no">${i + 1}</span><b>${kacis(k.ad)}</b>${i === 0 ? '<span class="etiket">masayı açan</span>' : ''}${i === m.benim ? '<span class="etiket sen">sen</span>' : ''}</div>`).join('')
    + (m.koltuklar.length < 3 ? '<div class="lobi-oyuncu bos">Boş koltuk · kodu paylaş</div>' : '');
  $('l-ad-satir').hidden = m.benim < 0;
  if (document.activeElement !== $('l-ad')) $('l-ad').value = m.benim >= 0 ? m.koltuklar[m.benim].ad : '';
  $('l-ayar').querySelectorAll('select').forEach(s => { s.disabled = !m.sahipMi; });
  $('l-ante').value = String(m.ayar.ante);
  $('l-basla').hidden = !m.sahipMi;
  $('l-not').textContent = m.benim < 0 ? 'Masa dolu ya da oyun başladı: izleyici olarak bağlısın.'
    : m.sahipMi ? `Herkes geldiğinde oyunu başlat. Herkes ${para(m.ayar.baslangicFis)} ile başlar, ante ${para(m.ayar.ante)}. Para yalnız sen yükleyebilirsin.`
    : `Masayı açanın oyunu başlatması bekleniyor. Herkes ${para(m.ayar.baslangicFis)} ile başlar, ante ${para(m.ayar.ante)}.`;
}

function cik() {
  // Oyun sürerken çıkan molaya alınır (çipleri kalır); aynı kodla dönüp "Masaya dön" der.
  if (ws && !kapatildi) { try { ws.send(JSON.stringify(son && son.g ? { tip: 'mola', mola: true } : { tip: 'ayril' })); } catch (e) { /* kapalı */ } }
  kapatildi = true;
  try { ws && ws.close(); } catch (e) { /* zaten kapalı */ }
  ws = null; son = null;
  if (oyunda) EKRAN[oyunda].kapat();
  oyunda = null;
  yaz('novo.sonMasa', null);
  history.replaceState(null, '', location.pathname);
  anaMenuCiz();
  ekranGoster('e-giris');
}

function formAc(yeniKip, onKod = '', yeniOyun = 'novo') {
  kip = yeniKip; oyun = yeniOyun;
  $('on-baslik').textContent = kip === 'ac' ? (oyun === 'ultimate' ? 'Ultimate masası aç (BETA)' : 'Online Novo masası aç') : 'Masaya katıl';
  $('on-tamam').textContent = kip === 'ac' ? 'Masayı aç' : 'Katıl';
  $('on-kod-alan').hidden = kip === 'ac';
  $('on-kod').value = onKod;
  $('on-ad').value = oku('novo.ad') || '';
  $('on-hata').textContent = sunucuAdresi() ? '' : 'Online sunucu henüz yayında değil.';
  ekranGoster('e-online');
}

function anaMenuCiz() {
  const s = oku('novo.sonMasa');
  $('a-don').hidden = !s;
  $('a-don-kod').textContent = s ? `Masa ${s}` : '';
}

export function onlineBagla() {
  anaMenuCiz();
  $('a-online').onclick = () => { ses.acil(); formAc('ac'); };
  $('a-ultimate').onclick = () => { ses.acil(); formAc('ac', '', 'ultimate'); };
  $('a-katil').onclick = () => { ses.acil(); formAc('katil'); };
  $('a-don').onclick = () => { ses.acil(); kod = oku('novo.sonMasa'); ad = oku('novo.ad') || ''; if (kod) baglan(); };
  $('on-geri').onclick = () => ekranGoster('e-giris');
  $('on-tamam').onclick = () => {
    ses.acil();
    ad = $('on-ad').value.trim();
    if (kip === 'katil') {
      const k = $('on-kod').value.trim().toUpperCase();
      if (!/^[A-Z0-9]{4,8}$/.test(k)) { $('on-hata').textContent = 'Masa kodunu yaz (4-8 harf/rakam).'; return; }
      kod = k;
    } else kod = kodUret();
    $('on-hata').textContent = 'Bağlanıyor…';
    baglan();
  };
  $('l-ad-kaydet').onclick = () => { const a = $('l-ad').value.trim(); if (a) gonder({ tip: 'ad', ad: a }); };
  $('l-ante').onchange = () => gonder({ tip: 'ayar', ante: Number($('l-ante').value) });
  $('l-basla').onclick = () => { ses.acil(); $('l-hata').textContent = ''; gonder({ tip: 'basla' }); };
  $('l-cik').onclick = async () => { if (await onayla('Masadan çıkılsın mı?', 'Çık')) cik(); };
  $('l-davet').onclick = async () => {
    const url = `${location.origin}${location.pathname}?masa=${kod}`;
    const metin = `${son && son.oyun === 'ultimate' ? 'Ultimate Texas' : 'Novo Poker'} masama gel: ${kod}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Novo Poker', text: metin, url });
      else { await navigator.clipboard.writeText(`${metin} ${url}`); $('l-not').textContent = 'Davet bağlantısı kopyalandı.'; }
    } catch (e) { /* paylaşım iptal */ }
  };
  // Davet bağlantısıyla gelen: katılma formu kod dolu açılır
  const davet = new URLSearchParams(location.search).get('masa');
  if (davet && /^[A-Za-z0-9]{4,8}$/.test(davet)) formAc('katil', davet.toUpperCase());
}
