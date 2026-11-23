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
  ws.onopen = () => {
    deneme = 0;
    // Yeniden bağlanınca eski "bağlantı koptu" yazısı kalmasın (sunucu yayınlanırken bağlantılar kısa süre kopar).
    if (/^Bağlantı/.test($('l-hata').textContent)) $('l-hata').textContent = '';
    if (oyunda) oyunHata('');
    gonder({ tip: 'katil', ad, oyun });
  };
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
  // Masa görünümü masayı açanın seçimi; herkeste aynı (Erman 23 Kas)
  document.documentElement.dataset.masa = (m.ayar && m.ayar.masa) || 'yesil';
  sohbetGuncelle(m);
  izleyenGuncelle(m);
  // Yalnız sohbet değiştiyse oyun ekranı yeniden çizilmez (animasyon bölünmesin).
  if (m.olay && m.olay.tip === 'sohbet' && son) { son = { ...m, olay: null }; return; }
  // Masayı açan masayı kapattı: herkes ana ekrana döner.
  if (m.olay && m.olay.tip === 'kapandi') { son = null; cik(); $('on-hata').textContent = ''; setTimeout(() => alert('Masa kapatıldı.'), 50); return; }
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
  // Kasaya / komşuya express: oyun başlamadan seçilebilir (Novo), ilk elden geçerli.
  const yanSatir = $('l-yan');
  if (yanSatir) {
    const y = (m.benim >= 0 && m.koltuklar[m.benim].yan) || {};
    yanSatir.hidden = m.benim < 0 || m.oyun === 'ultimate';
    yanSatir.innerHTML = `<button class="btn-ikincil ${y.kasa ? 'oto-acik' : ''}" data-lyan="kasa">Kasaya express: ${y.kasa ? 'Açık' : 'Kapalı'}</button>
      <button class="btn-ikincil ${y.komsu ? 'oto-acik' : ''}" data-lyan="komsu">Komşuya express: ${y.komsu ? 'Açık' : 'Kapalı'}</button>`;
    yanSatir.querySelectorAll('[data-lyan]').forEach(b => b.onclick = () => { const t = b.dataset.lyan; gonder({ tip: 'yan', [t]: !y[t] }); });
  }
  if (document.activeElement !== $('l-ad')) $('l-ad').value = m.benim >= 0 ? m.koltuklar[m.benim].ad : '';
  $('l-ayar').querySelectorAll('select').forEach(s => { s.disabled = !m.sahipMi; });
  $('l-ante').value = String(m.ayar.ante);
  if ($('l-masa')) $('l-masa').value = m.ayar.masa || 'yesil';
  $('l-basla').hidden = !m.sahipMi;
  $('l-not').textContent = m.benim < 0 ? 'Masa dolu ya da oyun başladı: izleyici olarak bağlısın.'
    : m.sahipMi ? `Herkes geldiğinde oyunu başlat. Herkes ${para(m.ayar.baslangicFis)} ile başlar, ante ${para(m.ayar.ante)}. Para yalnız sen yükleyebilirsin.`
    : `Masayı açanın oyunu başlatması bekleniyor. Herkes ${para(m.ayar.baslangicFis)} ile başlar, ante ${para(m.ayar.ante)}.`;
}

// ---------- Sohbet (oyuncular arası) ----------
let sohbetSon = 0, sohbetAcik = false;
function sohbetKur() {
  if (document.getElementById('sohbet-dugme')) return;
  const d = document.createElement('button');
  d.id = 'sohbet-dugme'; d.className = 'sohbet-dugme'; d.hidden = true; d.innerHTML = '💬<b id="sohbet-rozet" hidden></b>';
  const k = document.createElement('div');
  k.id = 'sohbet-kutu'; k.className = 'sohbet-kutu'; k.hidden = true;
  k.innerHTML = `<div class="sohbet-ust"><b>Sohbet</b><button id="sohbet-kapat" aria-label="Kapat">✕</button></div>
    <div id="sohbet-liste" class="sohbet-liste"></div>
    <form id="sohbet-form" class="sohbet-form"><input id="sohbet-yazi" maxlength="200" placeholder="Mesaj yaz" autocomplete="off"><button class="btn-ana">Gönder</button></form>`;
  document.body.append(d, k);
  d.onclick = () => { sohbetAcik = !sohbetAcik; k.hidden = !sohbetAcik; if (sohbetAcik) { sohbetOkundu(); $('sohbet-yazi').focus(); } };
  $('sohbet-kapat').onclick = () => { sohbetAcik = false; k.hidden = true; };
  $('sohbet-form').onsubmit = e => { e.preventDefault(); const v = $('sohbet-yazi').value.trim(); if (!v) return; gonder({ tip: 'sohbet', metin: v }); $('sohbet-yazi').value = ''; };
}
function sohbetOkundu() {
  const l = (son && son.sohbet) || [];
  sohbetSon = l.length ? l[l.length - 1].t : sohbetSon;
  const r = $('sohbet-rozet'); if (r) r.hidden = true;
}
function sohbetGuncelle(m) {
  sohbetKur();
  // Sohbet yalnız oyun başlayınca (Erman 22 Kas): lobide düğme ve kutu yok.
  const oyunVar = !!m.g;
  $('sohbet-dugme').hidden = !oyunVar;
  if (!oyunVar) { $('sohbet-kutu').hidden = true; sohbetAcik = false; }
  const l = m.sohbet || [];
  const liste = $('sohbet-liste');
  liste.innerHTML = l.length ? l.map(x => `<div class="sohbet-satir"><b>${x.no ? x.no + '. ' : ''}${kacis(x.ad)}</b> ${kacis(x.metin)}</div>`).join('') : '<div class="sohbet-bos">Henüz mesaj yok.</div>';
  liste.scrollTop = liste.scrollHeight;
  const yeni = l.filter(x => x.t > sohbetSon).length;
  if (sohbetAcik) sohbetSon = l.length ? l[l.length - 1].t : 0;
  else { const r = $('sohbet-rozet'); r.hidden = !yeni; r.textContent = yeni > 9 ? '9+' : String(yeni); if (yeni && m.olay && m.olay.tip === 'sohbet') ses.fis && ses.fis(1); }
}
// Ekranın sol altında: kim izliyor, kim sırada (Erman 22 Kas).
function izleyenGuncelle(m) {
  let e = document.getElementById('izleyen-not');
  if (!e) { e = document.createElement('div'); e.id = 'izleyen-not'; e.className = 'izleyen-not'; document.body.appendChild(e); }
  const iz = (m.izleyenler || []).filter(a => !(m.sira || []).includes(a)), sira = m.sira || [];
  const parca = [];
  if (iz.length) parca.push(`👁 ${iz.map(kacis).join(', ')} izliyor`);
  if (sira.length) parca.push(`Sırada: ${sira.map((a, k) => `${k + 1}. ${kacis(a)}`).join(', ')}`);
  e.innerHTML = parca.join(' · ');
  e.hidden = !parca.length;
}
function sohbetGizle() {
  const n = document.getElementById('izleyen-not'); if (n) n.hidden = true; const d = document.getElementById('sohbet-dugme'), k = document.getElementById('sohbet-kutu'); if (d) d.hidden = true; if (k) k.hidden = true; sohbetAcik = false; }

function cik() {
  // Oyun sürerken çıkan molaya alınır (çipleri kalır); aynı kodla dönüp "Masaya dön" der.
  if (ws && !kapatildi) { try { ws.send(JSON.stringify(son && son.g ? { tip: 'mola', mola: true } : { tip: 'ayril' })); } catch (e) { /* kapalı */ } }
  kapatildi = true;
  try { ws && ws.close(); } catch (e) { /* zaten kapalı */ }
  ws = null; son = null; sohbetGizle(); sohbetSon = 0;
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
  // Masa açarken de kod kendin seçilebilir; boş bırakılırsa üretilir (Erman 22 Kas).
  $('on-kod-alan').hidden = false;
  $('on-kod-yazi').textContent = kip === 'ac' ? 'Masa kodu (istersen kendin seç, boşsa üretilir)' : 'Masa kodu';
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
    } else {
      const k = $('on-kod').value.trim().toUpperCase();
      if (k && !/^[A-Z0-9]{4,8}$/.test(k)) { $('on-hata').textContent = 'Masa kodu 4-8 harf/rakam olmalı ya da boş bırak.'; return; }
      kod = k || kodUret();
    }
    $('on-hata').textContent = 'Bağlanıyor…';
    baglan();
  };
  $('l-ad-kaydet').onclick = () => { const a = $('l-ad').value.trim(); if (a) gonder({ tip: 'ad', ad: a }); };
  $('l-ante').onchange = () => gonder({ tip: 'ayar', ante: Number($('l-ante').value) });
  $('l-masa').onchange = () => gonder({ tip: 'ayar', masa: $('l-masa').value });
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
