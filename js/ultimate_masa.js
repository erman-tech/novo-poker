// Online Ultimate Texas Hold'em masası. Oyunu sunucu yürütür (online/oda.js + js/ultimate.js);
// bu ekran gelen durumu çizer, kararı sunucuya yollar. Herkes aynı anda karar verir.
import { $, ekranGoster, kartEl, kartYuzu, kartUcur, bekle, perdeAc, perdeKapat, onayla, ekranAcikTut, para, kacis } from './arayuz.js';
import { ustCipEl } from './fis.js';
import { krupiyeKur, ruh, kurpiyeAyarla, eldekiKurpiye } from './krupiye.js';
import { KARARLAR, KAT, BLIND_ODEME, TRIPS_ODEME, gereken, elAdi } from './ultimate.js';
import { enIyiEl } from './kart.js';
import * as ses from './ses.js';

let api = null;   // { gonder, cik, benim, sahipMi, koltuklar, hazir, sayac, kod }
let g = null;
let mesgul = false;
let hata = '';
let kuyruk = Promise.resolve();
let kurulu = false;

const KARAR_YAZI = { kontrol: 'Kontrol', bet4: '4x bahis', bet3: '3x bahis', bet2: '2x bahis', bet1: '1x bahis', pas: 'Pas' };
const FAZ_AD = { preflop: 'Preflop', flop: 'Flop', river: 'Turn ve river', bitti: 'Sonuç' };

export function ultimateOnlineAc(a) {
  api = a; g = null; mesgul = false; hata = '';
  if (!kurulu) bagla();
}
export function ultimateOnlineKapat() { api = null; g = null; mesgul = false; }
export function ultimateOnlineHata(t) { hata = t; if (g) panelCiz(); }
export function ultimateOnlineDurum(m) {
  kuyruk = kuyruk.then(() => isle(m)).catch(e => { console.error(e); mesgul = false; if (g) ciz(); });
  return kuyruk;
}

async function isle(m) {
  if (!api) return;
  Object.assign(api, { benim: m.benim, sahipMi: m.sahipMi, koltuklar: m.koltuklar, hazir: m.hazir || {}, oto: m.oto || {}, kod: m.kod,
    sayac: m.sayac ? { ...m.sayac, bitis: Date.now() + m.sayac.kalan } : null });
  if (!m.g) return;
  const once = g, yeni = m.g, t = m.olay && m.olay.tip;
  if (!once || !document.querySelector('#e-ultimate.etkin')) {
    g = yeni;
    ekranGoster('e-ultimate'); krupiyeKur($('u-krupiye-kadin')); kurpiyeAyarla(eldekiKurpiye(g.elNo || 1)); ekranAcikTut();
    ciz(); return;
  }
  hata = m.olay && m.olay.sure ? 'Süre doldu: karar vermeyenler kontrol etti ya da pas geçti.' : '';
  if (t === 'dagit') { await dagitAnimasyon(yeni); return; }
  if (t === 'karar' && once.el && yeni.el && once.el.no === yeni.el.no) {
    const ko = m.olay.koltuk;
    if (ko != null && yeni.el.oyuncular[ko] && yeni.el.oyuncular[ko].play > (once.el.oyuncular[ko].play || 0)) ses.fis(3);
    await sokakAnimasyon(once, yeni);
    return;
  }
  g = yeni; ciz();
}

// ---------------- Çizim ----------------
function spotX(i, n) { return (n === 1 ? [50] : n === 2 ? [30, 70] : [17, 50, 83])[i]; }
function telefon() { return matchMedia('(max-height: 520px) and (orientation: landscape)').matches; }

let maske = null; // animasyon sürerken eski görünüm: { acikOrtak, krupiyeAcik, faz }
function gorunen() {
  const el = g.el;
  if (!el || !maske) return el;
  return { ...el, ...maske };
}

function ciz() {
  if (!g) return;
  const el = gorunen();
  $('e-ultimate').classList.toggle('ytel', telefon());
  $('u-elno').textContent = el ? el.no : '–';
  $('u-ante').textContent = para(g.ante);
  const kn = el && el.faz !== 'bitti' && !maske ? g.kasaNet - (el.kasaNet || 0) : g.kasaNet;
  $('u-kasa').textContent = (kn > 0 ? '+' : kn < 0 ? '−' : '') + para(Math.abs(kn || 0));
  $('u-kasa').className = kn >= 0 ? 'artı' : 'eksi';
  // Kasa
  const kr = $('u-krupiye'); kr.innerHTML = '';
  for (let j = 0; j < 2; j++) {
    const k = el && el.krupiye[j];
    kr.appendChild(el ? (el.krupiyeAcik && k ? kartEl(k, true) : kartEl(null, false)) : Object.assign(kartEl(null), { className: 'kart bos' }));
  }
  $('u-krupiye-ad').textContent = el && el.krupiyeAcik ? `${el.krupiyeEl}${el.kalifiye ? '' : ' · kalifiye değil (ante iade)'}` : 'Kasa çift ve üstüyle kalifiye olur';
  // Ortak kartlar
  const ok = $('u-ortak'); ok.innerHTML = '';
  for (let j = 0; j < 5; j++) {
    const k = el && el.ortak[j];
    ok.appendChild(el && j < el.acikOrtak && k ? kartEl(k, true) : Object.assign(kartEl(null), { className: el ? 'kart' : 'kart bos' }));
  }
  if (!el) ok.querySelectorAll('.kart').forEach(e => e.classList.add('bos'));
  // Oyuncular
  const alan = $('u-alan');
  alan.querySelectorAll('.uspot').forEach(e => e.remove());
  const n = g.oyuncular.length;
  g.oyuncular.forEach((o, i) => {
    const p = el ? el.oyuncular[i] : null;
    const s = document.createElement('div');
    s.className = 'uspot'; s.dataset.i = i;
    if (api && i === api.benim) s.classList.add('benim');
    if (p && p.durum === 'pas') s.classList.add('pas');
    if (o.mola || (el && p && !p.katildi)) s.classList.add('mola');
    s.style.left = spotX(i, n) + '%';
    const kartlar = document.createElement('div'); kartlar.className = 'ukartlar';
    if (p && p.katildi) p.kartlar.forEach(k => kartlar.appendChild(kartEl(k, !!k)));
    const et = document.createElement('div'); et.className = 'uel';
    if (p && p.katildi && !p.kartlar[0] && el.faz !== 'bitti') {
      et.textContent = p.karar === 'kontrol' && p.durum === 'bekliyor' ? 'Kontrol etti' : p.durum === 'oynadi' ? `${KARAR_YAZI[p.karar]}` : p.durum === 'pas' ? 'Pas' : 'Düşünüyor…';
    } else if (p && p.katildi) {
      const acik = el.ortak.slice(0, el.acikOrtak).filter(Boolean);
      const hepsi = [...p.kartlar.filter(Boolean), ...acik];
      let t = hepsi.length >= 5 ? elAdi(enIyiEl(hepsi).guc) : (p.kartlar[0] && p.kartlar[1] && p.kartlar[0].d === p.kartlar[1].d ? 'Bir çift' : 'Yüksek kart');
      if (el.faz === 'bitti') {
        t = p.sonuc.tip === 'pas' ? 'Pas' : `${p.elAdi} · ${p.sonuc.tip === 'kazandi' ? 'kazandı' : p.sonuc.tip === 'berabere' ? 'berabere' : 'kaybetti'} ${p.net > 0 ? '+' : p.net < 0 ? '−' : ''}${p.net ? para(Math.abs(p.net)) : ''}`;
        et.classList.add(p.net > 0 ? 'kazanc' : p.net < 0 ? 'kayip' : 'notr');
      } else if (p.karar && p.durum === 'bekliyor') t += ' · kontrol';
      else if (p.durum === 'oynadi') t += ` · ${KARAR_YAZI[p.karar]}`;
      et.textContent = t;
    } else if (el) et.textContent = 'Bu elde oturuyor';
    const daireler = document.createElement('div'); daireler.className = 'udaireler';
    for (const [k, ad] of [['ante', 'ANTE'], ['blind', 'BLIND'], ['play', 'PLAY'], ['trips', 'TRIPS']]) {
      const d = document.createElement('div'); d.className = 'udaire ' + k;
      d.innerHTML = `<span>${ad}</span>`;
      const tutar = p && p.katildi ? p[k] : 0;
      if (tutar > 0 && !(el.faz === 'bitti' && !maske)) { d.appendChild(ustCipEl(tutar, 30)); d.insertAdjacentHTML('beforeend', `<b>${para(tutar)}</b>`); }
      daireler.appendChild(d);
    }
    const levha = document.createElement('div'); levha.className = 'nlevha';
    const fark = o.fis - o.giris;
    levha.innerHTML = `<div class="ad">${kacis(o.ad)}${o.mola ? ' <span class="mola-etiket">MOLADA</span>' : ''}</div><div class="fis-sayi">${para(o.fis)}</div>
      <div class="fark ${fark > 0 ? 'art' : fark < 0 ? 'eks' : ''}">${fark > 0 ? '+' : fark < 0 ? '−' : '±'}${para(Math.abs(fark))}</div>${o.trips ? '<div class="yuk">trips açık</div>' : ''}`;
    s.append(kartlar, et, daireler, levha);
    alan.appendChild(s);
  });
  panelCiz();
}

// ---------------- Geri sayım ----------------
function geriSayimHtml() {
  const s = api && api.sayac;
  if (!s) return '';
  const yazi = s.tip === 'hazir' ? 'El dağıtılıyor' : 'Karar süresi';
  return `<div class="geri-sayim"><div class="gs-cubuk"><i id="ugs-dolgu"></i></div><span class="gs-yazi">${yazi}</span><b id="ugs-sayi"></b></div>`;
}
function geriSayimGuncelle() {
  const s = api && api.sayac, d = document.getElementById('ugs-dolgu'), n = document.getElementById('ugs-sayi');
  if (!s || !d || !n) return;
  const kalan = Math.max(0, s.bitis - Date.now());
  n.textContent = Math.ceil(Math.min(kalan, s.toplam) / 1000) + ' sn';
  d.style.width = (100 * Math.min(1, kalan / s.toplam)) + '%';
  d.parentElement.parentElement.classList.toggle('az', kalan < 4000);
}
setInterval(geriSayimGuncelle, 200);

// ---------------- Panel ----------------
function panelCiz() {
  const pn = $('u-panel');
  if (mesgul) { pn.innerHTML = '<div class="bekleme"><div class="ne">…</div></div>'; return; }
  const el = g.el, ben = api ? api.benim : -1;
  let html = api && api.sayac ? geriSayimHtml() : '';
  if (!el || el.faz === 'bitti') {
    const hz = api.hazir || {}, oto = api.oto || {};
    const o = ben >= 0 ? g.oyuncular[ben] : null;
    const yetmez = o && o.fis < gereken(g, ben);
    const hazirim = !!hz[ben], otom = !!oto[ben];
    let ozet = '';
    if (el) {
      const tut = v => (v > 0 ? '+' : v < 0 ? '−' : '') + (v ? para(Math.abs(v)) : '');
      ozet = `<div class="sonuc-kutu dokum"><div class="baslik">${el.no}. el · kasa: ${kacis(el.krupiyeEl)}${el.kalifiye ? '' : ' (kalifiye değil)'}</div>
        ${el.oyuncular.map((p, i) => p.katildi ? `<div class="dokum-satir"><b>${kacis(g.oyuncular[i].ad)}</b>
          ${(p.odemeler || []).map(k => `<span class="${k.tutar > 0 ? 'art' : k.tutar < 0 ? 'eks' : ''}">${kacis(k.yazi)} ${tut(k.tutar)}</span>`).join('')}
          <span class="toplam ${p.net >= 0 ? 'art' : 'eks'}">= ${tut(p.net) || '$0'}</span></div>` : '').join('')}</div>`;
    }
    html += `<div class="bekleme">${ozet}
      <div class="mola-satir">${g.oyuncular.map((x, i) => `<span class="mola-dugme ${hz[i] ? 'hazir' : ''}">${kacis(x.ad)} · ${hz[i] ? (oto[i] ? 'otomatik' : 'hazır') : x.fis < gereken(g, i) ? 'parası bitti' : 'bekleniyor'}</span>`).join('')}</div>
      <div class="satir" style="width:min(640px,100%)">
        ${api.sahipMi ? '<button class="btn-ikincil" id="u-yukle">Para yükle</button>' : ''}
        ${o ? `<button class="btn-ikincil" id="u-trips">Trips: ${o.trips ? 'Açık' : 'Kapalı'}</button>` : ''}
        <button class="btn-ikincil ${otom ? 'oto-acik' : ''}" id="u-oto" ${ben < 0 || (yetmez && !otom) ? 'disabled' : ''}>Otomatik: ${otom ? 'Açık' : 'Kapalı'}</button>
        ${hazirim ? '<button class="btn-tehlike" id="u-iptal">İptal</button>' : `<button class="btn-ana" id="u-hazir" ${ben < 0 || yetmez ? 'disabled' : ''}>${el ? 'Sonraki ele gir' : 'İlk ele gir'}</button>`}
      </div>
      <div class="hata">${kacis(hata)}${hata ? ' ' : ''}${yetmez ? (api.sahipMi ? 'Paran yetmiyor: kendine para yükleyebilirsin.' : 'Paran yetmiyor; masayı açan para yüklerse dönebilirsin.') : hazirim ? (otom ? 'Otomatik oynuyorsun: parası yettikçe her ele girersin. Karar vermezsen 5 sn sonra kontrol, river\'da pas.' : 'Bu ele giriyorsun; vazgeçmek için İptal.') : ben >= 0 ? `Giriş: ante ${para(g.ante)} + blind ${para(g.ante)}${o && o.trips ? ` + trips ${para(g.ante)}` : ''}. Basmazsan bu eli dışarıda geçirirsin.` : ''}</div></div>`;
    pn.innerHTML = html;
    if ($('u-yukle')) $('u-yukle').onclick = yukleAc;
    if ($('u-trips')) $('u-trips').onclick = () => api.gonder({ tip: 'trips', acik: !o.trips });
    if ($('u-hazir')) $('u-hazir').onclick = () => { ses.acil(); api.gonder({ tip: 'hazir' }); };
    if ($('u-iptal')) $('u-iptal').onclick = () => api.gonder({ tip: 'hazir', iptal: true });
    $('u-oto').onclick = () => { ses.acil(); api.gonder({ tip: 'oto', acik: !otom }); };
    geriSayimGuncelle();
    return;
  }
  const p = ben >= 0 ? el.oyuncular[ben] : null;
  const bekleyen = el.oyuncular.map((q, i) => i).filter(i => el.oyuncular[i].katildi && el.oyuncular[i].durum === 'bekliyor' && !el.oyuncular[i].karar);
  const baslik = `<div class="eylem-baslik"><span class="kim">${FAZ_AD[el.faz]}</span><span class="ne">${bekleyen.length ? `Bekleniyor: ${bekleyen.map(i => kacis(g.oyuncular[i].ad)).join(', ')}` : ''}</span></div>`;
  if (p && p.katildi && p.durum === 'bekliyor' && !p.karar) {
    const secenek = KARARLAR[el.faz];
    const A = el.ante, fis = g.oyuncular[ben].fis;
    const ipucu = el.faz === 'preflop' ? 'Kontrol et ya da şimdi 4x / 3x bahis yap.' : el.faz === 'flop' ? 'Kontrol et ya da 2x bahis yap.' : 'Son karar: 1x bahis ya da pas (pas ante ve blind\'ı kaybettirir).';
    html += baslik + `<div class="ne" style="text-align:center">${ipucu}</div>
      <div class="dugmeler" style="grid-template-columns:repeat(${secenek.length},1fr)">${secenek.map(s => {
        const m = KAT[s] ? KAT[s] * A : 0;
        const cls = s === 'pas' ? 'b-pas' : s === 'kontrol' ? 'b-kontrol' : s === 'bet4' || s === 'bet1' ? 'b-yukselt' : 'b-allin';
        return `<button class="${cls}" data-s="${s}" ${m > fis ? 'disabled' : ''}>${KARAR_YAZI[s]}${m ? ' ' + para(m) : ''}</button>`;
      }).join('')}</div>`;
  } else {
    const ne = !p || !p.katildi ? 'Bu eli izliyorsun.' : p.durum === 'oynadi' ? `Bahsin: ${KARAR_YAZI[p.karar]} ${para(p.play)}. Kartlar açılıyor…` : p.durum === 'pas' ? 'Pas geçtin.' : 'Kontrol ettin, ötekiler bekleniyor…';
    html += baslik + `<div class="ne" style="text-align:center;font-size:15px">${ne}</div>`;
  }
  html += `<div class="hata">${kacis(hata)}</div>`;
  pn.innerHTML = html;
  pn.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { ses.acil(); api.gonder({ tip: 'hamle', hamle: { secim: b.dataset.s } }); });
  geriSayimGuncelle();
}

// ---------------- Animasyonlar ----------------
function kasaRect() { return $('u-krupiye-kadin').getBoundingClientRect(); }
async function dagitAnimasyon(yeni) {
  g = yeni; mesgul = true; maske = { acikOrtak: 0, krupiyeAcik: false };
  ciz();
  const gizle = e => { e.style.visibility = 'hidden'; };
  const spotlar = [...$('u-alan').querySelectorAll('.uspot')].filter(s => s.querySelector('.ukartlar .kart'));
  spotlar.forEach(s => s.querySelectorAll('.ukartlar .kart').forEach(gizle));
  [...$('u-krupiye').children].forEach(gizle);
  kurpiyeAyarla(eldekiKurpiye(yeni.el.no));
  ruh('dagit');
  ses.karistir(); await bekle(700);
  for (let k = 0; k < 2; k++) {
    for (const s of spotlar) { const c = s.querySelectorAll('.ukartlar .kart')[k]; ses.kartAt(); await kartUcur(kasaRect(), c, 380); c.style.visibility = ''; await bekle(90); }
    const d = $('u-krupiye').children[k]; ses.kartAt(); await kartUcur(kasaRect(), d, 380); d.style.visibility = ''; await bekle(120);
  }
  ruh('normal'); ses.fis(3);
  maske = null; mesgul = false; ciz();
}

async function sokakAnimasyon(once, yeni) {
  const eskiAcik = once.el.acikOrtak, yeniAcik = yeni.el.acikOrtak;
  const bitti = yeni.el.faz === 'bitti';
  if (yeniAcik === eskiAcik && !bitti) { g = yeni; ciz(); return; }
  g = yeni; mesgul = true;
  maske = { acikOrtak: eskiAcik, krupiyeAcik: false, faz: bitti ? once.el.faz : yeni.el.faz };
  ciz();
  // Yeni ortak kartları tek tek aç
  const ok = $('u-ortak').children;
  for (let j = eskiAcik; j < yeniAcik; j++) {
    ses.kartAt(); await kartUcur(kasaRect(), ok[j], 320);
    kartYuzu(ok[j], yeni.el.ortak[j]); ok[j].classList.add('acik'); ses.kartCevir(); await bekle(260);
  }
  if (bitti) {
    await bekle(400);
    const kr = $('u-krupiye').children;
    for (let j = 0; j < 2; j++) { kartYuzu(kr[j], yeni.el.krupiye[j]); kr[j].classList.add('acik'); ses.kartCevir(); await bekle(380); }
    await bekle(500);
    maske = null; mesgul = false; ciz();
    const kazanan = yeni.el.oyuncular.some(p => p.katildi && p.net > 0);
    ruh(kazanan ? 'gulen' : 'goz', 1400);
    ses.fis(kazanan ? 6 : 3);
    return;
  }
  maske = null; mesgul = false; ciz();
}

function yukleAc() {
  if (!api || !api.sahipMi) return;
  perdeAc(`<div style="font-size:20px;font-weight:800">Para yükle</div>
    <label>Oyuncu<select id="uy-kim">${g.oyuncular.map((o, i) => `<option value="${i}">${kacis(o.ad)} · ${para(o.fis)}</option>`).join('')}</select></label>
    <label>Tutar<select id="uy-tutar">${[100, 250, 500, 1000, 2000].map(t => `<option value="${t}" ${t === 1000 ? 'selected' : ''}>${para(t)}</option>`).join('')}</select></label>
    <div class="satir"><button class="btn-ikincil" id="uy-iptal">Vazgeç</button><button class="btn-ana" id="uy-ok">Yükle</button></div>`, k => {
    k.querySelector('#uy-iptal').onclick = perdeKapat;
    k.querySelector('#uy-ok').onclick = () => { api.gonder({ tip: 'yukle', koltuk: Number(k.querySelector('#uy-kim').value), miktar: Number(k.querySelector('#uy-tutar').value) }); perdeKapat(); };
  });
}

function kurallarAc() {
  const blind = [['Royal flush', '500:1'], ['Renkli kent', '50:1'], ['Kare', '10:1'], ['Full', '3:1'], ['Renk', '3:2'], ['Kent', '1:1'], ['Daha düşük', 'iade']];
  const trips = [['Royal flush', TRIPS_ODEME.RF], ['Renkli kent', TRIPS_ODEME[8]], ['Kare', TRIPS_ODEME[7]], ['Full', TRIPS_ODEME[6]], ['Renk', TRIPS_ODEME[5]], ['Kent', TRIPS_ODEME[4]], ['Üçlü', TRIPS_ODEME[3]]];
  const tablo = (bas, l) => `<table class="kural-tablo"><tr><th colspan="2">${bas}</th></tr>${l.map(([a, v]) => `<tr><td>${a}</td><td>${typeof v === 'number' ? v + ':1' : v}</td></tr>`).join('')}</table>`;
  const s = (b, m) => `<details class="kural-sss"><summary>${b}</summary><div>${m}</div></details>`;
  perdeAc(`<div style="font-size:20px;font-weight:800">Ultimate Texas Hold'em <span class="rozet-beta" style="position:static">BETA</span></div>
    <div class="kural-tablolar">${tablo('BLIND (kazanınca)', blind)}${tablo('TRIPS (isteğe bağlı)', trips)}</div>
    <div class="kural-liste">
    ${s('Nasıl oynanır?', 'Ante ve ante kadar blind koyarsın; istersen trips de. Herkese 2 kart, kasaya 2 kapalı kart gelir, ortada 5 kart açılır. Kasaya karşı oynarsın; en iyi 5 kart kazanır.')}
    ${s('Kararlar', 'Preflop: kontrol ya da 4x / 3x ante bahis. Flop (3 kart): kontrol ya da 2x. River (5 kart): 1x bahis ya da pas. Bahis yaptıysan o elde bir daha karar vermezsin. Herkes aynı anda karar verir, süre 15 saniye; süre dolunca kontrol (river’da pas) yapılır.')}
    ${s('Kasa kalifiye', 'Kasa en az bir çiftle kalifiye olur. Olmazsa ante iade edilir; blind ve play yine kasayla karşılaştırılır.')}
    ${s('Ödemeler', 'Kazanırsan play 1:1, ante 1:1 (kasa kalifiyeyse), blind tabloya göre (kentten aşağısı iade). Kaybedersen play ve blind gider, kasa kalifiyeyse ante de. Beraberlikte hepsi iade. Pas geçersen ante ve blind gider.')}
    ${s('Trips', 'İsteğe bağlı yan bahis, ante kadar. Kasadan bağımsız olarak elin üçlü ve üstüyse tabloya göre öder. Eller arasında Trips düğmesiyle açılır.')}
    </div><button class="btn-ana" id="uk-tamam">Kapat</button>`, k => { k.querySelector('#uk-tamam').onclick = perdeKapat; });
}

function bagla() {
  kurulu = true;
  $('u-ses').onclick = () => { ses.acil(); ses.sesAyarla(!ses.sesAcikMi()); $('u-ses').textContent = ses.sesAcikMi() ? '🔊' : '🔇'; };
  $('u-menu').onclick = () => {
    perdeAc(`<div style="font-size:20px;font-weight:800">Ultimate masası</div>
      <div class="ne" style="text-align:center">Masa kodu: <b>${kacis((api && api.kod) || '')}</b></div>
      <button class="btn-ikincil" id="um-kurallar">Kurallar ve ödeme tablosu</button>
      ${api && api.sahipMi ? '<button class="btn-ikincil" id="um-yukle">Para yükle</button><button class="btn-ikincil" id="um-yeniden">Baştan başlat (herkese $1.000)</button>' : ''}
      <button class="btn-tehlike" id="um-cik">Masadan çık</button>
      <button class="btn-ana" id="um-tamam">Kapat</button>`, k => {
      k.querySelector('#um-tamam').onclick = perdeKapat;
      k.querySelector('#um-kurallar').onclick = kurallarAc;
      if (k.querySelector('#um-yukle')) k.querySelector('#um-yukle').onclick = () => { perdeKapat(); if (!g.el || g.el.faz === 'bitti') yukleAc(); };
      if (k.querySelector('#um-yeniden')) k.querySelector('#um-yeniden').onclick = async () => { perdeKapat(); if (await onayla('Herkes yeniden $1.000 ile başlasın mı?', 'Başlat')) api.gonder({ tip: 'yeniden' }); };
      k.querySelector('#um-cik').onclick = async () => { perdeKapat(); if (await onayla('Masadan çıkılsın mı? Aynı kodla geri dönebilirsin.', 'Çık')) api.cik(); };
    });
  };
  window.addEventListener('resize', () => { if (g && document.querySelector('#e-ultimate.etkin') && !mesgul) ciz(); });
}
