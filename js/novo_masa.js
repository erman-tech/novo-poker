// Novo Poker masası (iPad). Kasaya karşı; oyuncu kartları açık, her şey bu ekranda.
import {
  yeniNovo, novoDagit, novoHamle, novoYasal, oyunSatinAl, novoYenidenBaslat, paraYukle, molaAyarla, yanAyarla,
  katilabilir, ODEME, BONUS, EL_ADI, YAKILAN_ILK, sinif, bonusAnahtari, kombinasyonlar, betOrani,
} from './novo.js';
import { yiginEl, ustCipEl } from './fis.js';
import { DEGER_AD, RENK_SIMGE } from './kart.js';
import { $, ekranGoster, kartEl, kartYuzu, kartUcur, bekle, perdeAc, perdeKapat, onayla, ekranAcikTut, para, kacis } from './arayuz.js';
import * as ses from './ses.js';
import { krupiyeKur, ruh, kurpiyeAyarla, kurpiyeDegistir, eldekiKurpiye, degisimEli, konusuyor, gala } from './krupiye.js';
import * as konus from './konus.js';
import { havaiFisek } from './havai.js';
konus.konusmaDinle(sure => konusuyor(sure));

const ANAHTAR = 'poker.novo.v1';
let N = null;          // { g, gecmis }
let mesgul = false;
let secili = new Set(); // değiştirilecek kart konumları
let secimModu = false;
let oyunsuzSecim = {};  // oyuncu -> true (oyun satın al) / false (ante al)
let hata = '';
// Online masa: sunucu oyunu yürütür, bu ekran gelen durumu çizer ve hamleyi sunucuya yollar.
let online = null; // { gonder(m), cik(), benim, sahipMi, koltuklar, secimler, kod }

// Telefonda gizli boş kutu, çip uçmadan önce görünür olur (uçuşun hedefi kaybolmasın)
const goster = e => { if (e) e.classList.remove('bos'); return e; };
// Masa görünümü (Erman 23 Kas): masayı açan seçer. Online'da sunucuya gider ve herkeste aynı görünür;
// tek cihazda bu cihazda saklanır.
const MASA_AD = { klasik: 'Klasik', lacivert: 'Lacivert', yesil: 'Yeşil', antrasit: 'Antrasit' };
const masaSimdi = () => document.documentElement.dataset.masa || 'yesil';
function masaSec(m) {
  if (online) { online.gonder({ tip: 'ayar', masa: m }); return; }
  document.documentElement.dataset.masa = m;
  try { localStorage.setItem('novo.masa', m); } catch (e) { /* özel pencere */ }
}
try { if (!document.documentElement.dataset.masa) document.documentElement.dataset.masa = localStorage.getItem('novo.masa') || 'yesil'; } catch (e) { /* özel pencere */ }
// Yan express dairesi: bahis çipi, etiket ve tutar; el bitince kazanan yeşil, kaybeden soluk.
function koltukKutusu(g, el, p, i, n) {
  const bitti = el && el.faz === 'bitti';
  const kutu = document.createElement('div'); kutu.className = 'ndaireler nkutu';
  // Üst sıra: öteki koltukların numaraları; komşuya express oynandıysa çip o numaranın üstünde
  const komsu = document.createElement('div'); komsu.className = 'nkomsu';
  for (let j = 0; j < n; j++) {
    if (j === i) continue;
    const k = document.createElement('div'); k.className = 'nk'; k.dataset.j = j;
    k.innerHTML = `<i>${j + 1}</i>`;
    const yk = p && p.katildi && p.yanKomsu && p.yanKomsu.bahis > 0 && p.yanKomsu.kime === j ? p.yanKomsu : null;
    if (yk) {
      k.classList.add('dolu');
      if (bitti) k.classList.add(yk.odeme > 0 ? 'kazandi' : 'kaybetti');
      k.title = `${j + 1}. oyuncuya express`;
      const yer = document.createElement('div'); yer.className = 'yer'; yer.appendChild(ustCipEl(yk.bahis, 22)); k.appendChild(yer);
      const b = document.createElement('b'); b.className = 'ntutar'; b.textContent = bitti && yk.odeme > 0 ? '+' + para(yk.odeme) : para(yk.bahis); k.appendChild(b);
    }
    komsu.appendChild(k);
  }
  kutu.appendChild(komsu);
  // D: kasaya express
  const yd = p && p.katildi && p.yanKasa && p.yanKasa.bahis > 0 ? p.yanKasa : null;
  const dk = document.createElement('div');
  dk.className = 'ndaire yan dkasa' + (yd ? ' dolu' : '') + (yd && bitti ? (yd.odeme > 0 ? ' kazandi' : ' kaybetti') : '');
  dk.title = 'Kasaya express';
  dk.innerHTML = '<span>D</span>';
  if (yd) {
    const yer = document.createElement('div'); yer.className = 'yer'; yer.appendChild(ustCipEl(yd.bahis, 26)); dk.appendChild(yer);
    const b = document.createElement('b'); b.className = 'ntutar'; b.textContent = bitti && yd.odeme > 0 ? '+' + para(yd.odeme) : para(yd.bahis); dk.appendChild(b);
  }
  kutu.appendChild(dk);
  for (const [k, ad] of [['ante', 'ANTE'], ['express', String(i + 1)], ['bet', 'BET']]) {
    const d = document.createElement('div');
    d.className = 'ndaire ' + k; d.dataset.k = k;
    d.innerHTML = `<span>${ad}</span>`;
    if (k === 'express') d.title = 'Express (ilk 5 kart)';
    if (k === 'express' && p && p.katildi && !bitti) d.classList.add(p.bonusOdeme ? 'ex-kazanc' : 'ex-kayip');
    const yer = document.createElement('div'); yer.className = 'yer';
    const tutar = daireTutari(p, k);
    if (tutar > 0) yer.appendChild(ustCipEl(tutar, k === 'express' ? 26 : 30));
    d.appendChild(yer);
    if (tutar > 0) { const tt = document.createElement('b'); tt.className = 'ntutar'; tt.textContent = para(tutar); d.appendChild(tt); }
    else if (k === 'express' && p && p.katildi && !bitti && !expressBekliyor) {
      const tt = document.createElement('b'); tt.className = 'ntutar';
      tt.textContent = p.bonusOdeme ? '+' + para(p.bonusOdeme - p.bonus) : 'kasaya';
      d.appendChild(tt);
    }
    kutu.appendChild(d);
  }
  const cek = document.createElement('div'); cek.className = 'ncekme';
  cek.innerHTML = '<span>ÇEKME</span>';
  if (p && p.ucret > 0 && !bitti) cek.appendChild(yiginEl(p.ucret, { boyut: 16, enCok: 4 }));
  else cek.classList.add('bos');
  kutu.appendChild(cek);
  const sig = document.createElement('div'); sig.className = 'ncekme nsigorta';
  sig.innerHTML = '<span>SİGORTA</span>';
  if (p && p.sigorta > 0 && !bitti) sig.appendChild(yiginEl(p.sigorta, { boyut: 16, enCok: 4 }));
  else if (!(p && p.sigorta > 0)) sig.classList.add('bos');
  if (p && p.sigorta > 0 && el.krupiyeAcik && el.ilkOyun === false) {
    sig.classList.add('kazandi');
    sig.insertAdjacentHTML('beforeend', `<b class="sig-kazanc">+${para(p.sigorta)}</b>`);
  }
  kutu.appendChild(sig);
  return kutu;
}
function yanDaire(y, etiket, bitti) {
  const d = document.createElement('div');
  d.className = 'ndaire yan' + (bitti ? (y.odeme > 0 ? ' kazandi' : ' kaybetti') : '');
  d.innerHTML = `<span>${etiket}</span>`;
  const yer = document.createElement('div'); yer.className = 'yer'; yer.appendChild(ustCipEl(y.bahis, 26)); d.appendChild(yer);
  const b = document.createElement('b'); b.className = 'ntutar'; b.textContent = bitti && y.odeme > 0 ? '+' + para(y.odeme) : para(y.bahis); d.appendChild(b);
  return d;
}
function kaydet() {
  if (online) return; // online masa uçak modunun kaydını ezmez
  try { localStorage.setItem(ANAHTAR, JSON.stringify(N)); }
  catch (e) { N.gecmis = N.gecmis.slice(-5); try { localStorage.setItem(ANAHTAR, JSON.stringify(N)); } catch (e2) {} }
}
export function novoKaydiVar() {
  try { return !!JSON.parse(localStorage.getItem(ANAHTAR) || 'null'); } catch (e) { return false; }
}
export function novoAc({ adlar, baslangicFis, ante }) {
  N = { g: yeniNovo({ adlar, kod: 'N', baslangicFis, ante }), gecmis: [] };
  kaydet();
  ekran();
}
export function novoDevam() {
  try { N = JSON.parse(localStorage.getItem(ANAHTAR) || 'null'); } catch (e) { N = null; }
  if (!N || !N.g) return false;
  ekran();
  return true;
}

export function onlineAc(api) { karsilanan = -1; konus.sus(false); ses.ortamSustur(false); online = api; N = { g: null, gecmis: [] }; maske = null; mesgul = false; krupiyeKur($('n-krupiye-kadin')); }
export function onlineKapat() { konus.sus(true); ses.ortamSustur(true); online = null; N = null; maske = null; mesgul = false; }
let onlineKuyruk = Promise.resolve();
export function onlineDurum(m) {
  // Ayarlarım penceresi animasyon kuyruğunu beklemeden son seçimi göstersin
  if (online && m.g && m.benim >= 0 && m.g.oyuncular[m.benim]) online.sonYan = m.g.oyuncular[m.benim].yan || {};
  onlineKuyruk = onlineKuyruk.then(() => onlineIsle(m)).catch(e => { console.error(e); mesgul = false; maske = null; if (N && N.g) ciz(); });
  return onlineKuyruk;
}
const HAMLE_TIPLERI = ['pas', 'gec', 'oyna', 'degistir', 'alti', 'sigorta', 'satinal'];
async function onlineIsle(m) {
  if (!online) return;
  Object.assign(online, { benim: m.benim, sahipMi: m.sahipMi, koltuklar: m.koltuklar, secimler: m.secimler || {}, hazir: m.hazir || {}, oto: m.oto || {}, kod: m.kod, molaIstek: !!m.molaIstek,
    sayac: m.sayac ? { ...m.sayac, bitis: Date.now() + m.sayac.kalan } : null });
  if (!m.g) return;
  const once = N.g, yeni = m.g, t = m.olay && m.olay.tip;
  const sureNotu = m.olay && m.olay.sure && m.olay.koltuk != null && yeni.oyuncular[m.olay.koltuk]
    ? `${yeni.oyuncular[m.olay.koltuk].ad}: süre doldu, ${t === 'gec' ? 'kart çekmedi' : t === 'pas' ? 'pas geçti' : t === 'sigorta' ? 'sigorta yapmadı' : 'devam edildi'}.` : '';
  if (!once || !document.querySelector('#e-novo.etkin')) { N.g = yeni; ekran(); return; }
  hata = sureNotu;
  if (t === 'dagit') { await dagitAnimasyon(yeni); return; }
  if (HAMLE_TIPLERI.includes(t) && once.el && yeni.el && once.el.no === yeni.el.no) {
    if (t === 'satinal') oyunsuzSecim = {};
    await animasyonla(once, yeni, t);
    return;
  }
  N.g = yeni;
  if (t === 'yukle') ses.fis(5);
  ciz();
}
// Geri sayım şeridi: sunucunun verdiği süreyi gösterir, kendi kendine akar.
function geriSayimHtml() {
  const s = online && online.sayac;
  if (!s) return '';
  let yazi;
  if (s.tip === 'hazir') yazi = 'El dağıtılıyor';
  else if (s.tip === 'oyunsuz') yazi = 'Seçim süresi';
  else {
    const ad = N.g && N.g.oyuncular[s.koltuk] ? N.g.oyuncular[s.koltuk].ad : '';
    yazi = s.koltuk === online.benim ? 'Karar süren' : `${kacis(ad)} karar veriyor`;
  }
  return `<div class="geri-sayim" data-tip="${s.tip}"><div class="gs-cubuk"><i id="gs-dolgu"></i></div><span class="gs-yazi">${yazi}</span><b id="gs-sayi"></b></div>`;
}
function geriSayimGuncelle() {
  const s = online && online.sayac, d = document.getElementById('gs-dolgu'), n = document.getElementById('gs-sayi');
  if (!s || !d || !n) return;
  const kalan = Math.max(0, s.bitis - Date.now());
  n.textContent = Math.ceil(Math.min(kalan, s.toplam) / 1000) + ' sn';
  d.style.width = (100 * Math.min(1, kalan / s.toplam)) + '%';
  d.parentElement.parentElement.classList.toggle('az', kalan < 4000);
}
setInterval(geriSayimGuncelle, 200);

export function onlineHata(metin) { hata = metin; if (N && N.g && document.querySelector('#e-novo.etkin')) panelCiz(); }

function ekran() {
  ekranGoster('e-novo');
  kurpiyeAyarla(eldekiKurpiye(N.g.elNo || 1));
  ekranAcikTut();
  $('n-ses').textContent = ses.sesAcikMi() ? '🔊' : '🔇';
  ciz();
}

// Geri al hileye kapı açmasın: yalnız SON karar, tek adım ve o karardan sonra
// hiç kart dağıtılmadıysa (yeni kart çekilmedi, kasa açılmadı, yeni el başlamadı) geri alınır.
// Eller arasındaki işlemler (mola, para yükleme) kart göstermediği için geri alınabilir.
function geriAlinabilir() {
  if (!N.gecmis.length || N.geriAlindi) return false;
  let p;
  try { p = JSON.parse(N.gecmis[N.gecmis.length - 1]).el; } catch (e) { return false; }
  const c = N.g.el;
  if (!p || !c || p.no !== c.no) return false;
  if (p.faz === 'bitti' && c.faz === 'bitti') return true;
  return p.faz !== 'bitti' && c.faz !== 'bitti' && p.cek === c.cek && !c.krupiyeAcik && !p.krupiyeAcik;
}

function gecmiseAt() {
  N.geriAlindi = false;
  N.gecmis.push(JSON.stringify(N.g));
  if (N.gecmis.length > 40) N.gecmis.shift();
}

// ---------------- Çizim ----------------
function spotKonumu(i, n) {
  const x = n === 1 ? [50] : n === 2 ? [32, 68] : n === 3 ? [15, 50, 85] : [14, 38, 62, 86];
  const y = n <= 2 ? [60, 60] : n === 3 ? [58, 63, 58] : [57, 63, 63, 57];
  return { x: x[i], y: y[i] };
}

function kasaYazi(v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + para(Math.abs(v || 0)); }

// Görünüm maskesi: motor eli sonuçlandırmış olsa da animasyon bitene kadar ekran eski hali gösterir.
// Dağıtım animasyonunda express (ve komşuya express) ödemesi fişler oyuncuya gidene kadar
// bakiyede görünmez; ödeme ekranda yapılınca o oyuncunun bakiyesi güncellenir (Erman, 22 Kas).
const odenmedi = new Set();
function gosterilenFis(o, p) {
  if (!p || !p.katildi || !odenmedi.has(o.koltuk ?? -1)) return o.fis;
  return o.fis - (p.bonusOdeme || 0) - (p.yanKomsu ? p.yanKomsu.odeme : 0);
}
let maske = null; // { faz?, krupiyeAcik?, kasa }
function gorunenEl(el) {
  return el && maske && maske.faz ? { ...el, faz: maske.faz, krupiyeAcik: maske.krupiyeAcik } : el;
}
// Üst çubuktaki kasa artı/eksisi: express dağıtımda sonuçlanır, el sürerken anında yansır.
function kasaCanli(g) {
  let canli = g.kasaNet || 0;
  if (g.el && g.el.faz !== 'bitti') for (const p of g.el.oyuncular) if (p.katildi) canli += p.bonus - p.bonusOdeme;
  return canli;
}

function ciz() {
  const g = N.g, el = gorunenEl(g.el);
  $('n-elno').textContent = el ? el.no : '–';
  $('n-ante').textContent = para(g.ante);
  $('n-yazi').innerHTML = `KASAYA KARŞI · KASA AS-PAPAZ VE ÜSTÜYLE OYUNA GİRER<br>ANTE ${para(g.ante)} · EXPRESS ${para(g.ante)} · KART ÇEKME ${para(g.ante)} · OYNA ${para(2 * g.ante)}`;
  const canli = maske ? maske.kasa : kasaCanli(g);
  const kn = $('n-kasa');
  kn.textContent = kasaYazi(canli);
  kn.className = canli >= 0 ? 'artı' : 'eksi';
  $('n-kasatop').textContent = g.oyunNo > 1 ? `· masa açıldığından beri ${kasaYazi(g.kasaToplam)}` : '';
  $('n-geri').hidden = !!online;
  $('n-geri').disabled = !geriAlinabilir() || mesgul;

  // Krupiye
  const kr = $('n-krupiye');
  kr.innerHTML = '';
  if (el) {
    el.krupiye.forEach((k, j) => {
      const acik = el.krupiyeAcik || j === 4;
      // Kapalı kartın yüzü sayfaya hiç konmaz (iPad'de 3B gizleme bazen tutmuyor); açılırken eklenir.
      kr.appendChild(acik ? kartEl(k, true) : kartEl(null, false));
    });
  } else for (let j = 0; j < 5; j++) kr.appendChild(Object.assign(kartEl(null), { className: 'kart bos' }));
  // Yakılan (gömülen) kartlar destesi
  const yk = $('n-yakilan');
  if (yk) {
    const n = el ? YAKILAN_ILK + (el.cekmeYakilan ? 1 : 0) + (el.krupiyeYakilan ? 1 : 0) + (el.krupiyeAtilan ? 1 : 0) : 0;
    yk.innerHTML = `<div class="yk-yigin">${Array.from({ length: n }, (_, j) => `<div class="kart yk-kart" style="--j:${j}"><div class="yuz"></div><div class="arka"></div></div>`).join('')}</div>` +
      `<div class="yk-ad">${n ? `YAKILAN ${n}` : ''}</div>`;
  }
  $('n-krupiye-ad').textContent = el && el.krupiyeAcik
    ? (el.krupiyeOyunu ? el.krupiyeElAdi : 'Kasanın oyunu yok' + (el.krupiyeDegisim ? '' : ''))
    : '';

  // Oyuncu yerleri
  const alan = $('n-alan');
  alan.querySelectorAll('.nspot').forEach(e => e.remove());
  const n = g.oyuncular.length;
  // Yatay telefon: masa solda, karar paneli sağda; oyuncular masanın altında yan yana, küçük.
  const ytel = yatayTelefonMu();
  $('e-novo').classList.toggle('ytel', ytel);
  const benim = online ? online.benim : -1;
  g.oyuncular.forEach((o, i) => {
    const p = el ? el.oyuncular[i] : null;
    const { x, y } = ytel ? { x: (n === 1 ? [50] : n === 2 ? [27, 73] : [17, 50, 83])[i], y: 73 } : spotKonumu(i, n);
    const s = document.createElement('div');
    s.className = 'nspot';
    s.dataset.i = i;
    if (el && (el.faz === 'karar' || el.faz === 'cekme') && el.sira === i) s.classList.add('sira');
    if (p && p.durum === 'pas') s.classList.add('pas');
    if (i === benim) s.classList.add('benim');
    s.style.left = x + '%'; s.style.top = y + '%';

    const kartlar = document.createElement('div'); kartlar.className = 'nkartlar';
    if (p && p.katildi) p.kartlar.forEach((k, j) => {
      const ke = kartEl(k, true);
      if (el.sira === i && secimModu && secili.has(j)) ke.classList.add('secili');
      if (p.cekKarar && p.cekKarar.tip === 'degistir' && p.cekKarar.konumlar.includes(j)) ke.classList.add('atilacak');
      kartlar.appendChild(ke);
    });
    if (p && p.cekKarar && p.cekKarar.tip === 'alti') {
      const h = document.createElement('div'); h.className = 'kart hayalet'; h.textContent = '+1'; kartlar.appendChild(h);
    }
    const etiket = document.createElement('div'); etiket.className = 'nel';
    if (p && p.katildi) {
      const s1 = sinif(p.kartlar);
      const kb = kombinasyonlar(p.kartlar);
      let t = EL_ADI[s1.anahtar] + (kb.ikinci != null ? ' + ' + EL_ADI[kb.ikinci] : '');
      if (p.bonusOdeme) t = `BONUS ÖDEME ${EL_ADI[bonusAnahtari(p.ilk)]} +${para(p.bonusOdeme - p.bonus)}`;
      if (el.faz === 'bitti' && p.durum === 'oynadi') t = sonucYazi(p);
      if (el.faz === 'bitti' && p.durum === 'pas') t = 'Pas';
      etiket.textContent = t;
      if (p.bonusOdeme && el.faz !== 'bitti') etiket.classList.add('express');
      if (el.faz === 'bitti') etiket.classList.add(p.net > 0 ? 'kazanc' : p.net < 0 ? 'kayip' : 'notr');
    } else if (el) etiket.textContent = katilabilir(g, i) ? '' : 'Bu elde oturuyor';

    // Koltuk kutusu (Erman 23 Kas, gerçek Novo masası örneği): solda D (kasaya express), ortada
    // ANTE / koltuk numaralı EXPRESS / BET, sağda ÇEKME ve SİGORTA, üstte öteki koltukların
    // numara halkaları (komşuya express). Kartlar kutunun önünde dizilir.
    const daireler = koltukKutusu(g, el, p, i, n);

    const levha = document.createElement('div'); levha.className = 'nlevha';
    if (o.mola) s.classList.add('mola');
    // Koltuk numarası ve bu elde kime yan express oynadığı (kasaya / komşunun adı)
    const yanNot = p && p.katildi && (p.yanKasa || p.yanKomsu)
      ? `<div class="yan-not">express → ${[p.yanKasa ? 'kasa' : '', p.yanKomsu && g.oyuncular[p.yanKomsu.kime] ? `${p.yanKomsu.kime + 1}. ${kacis(g.oyuncular[p.yanKomsu.kime].ad)}` : ''].filter(Boolean).join(' · ')}</div>` : '';
    levha.innerHTML = `<div class="ad"><span class="koltuk-no">${i + 1}</span>${kacis(o.ad)}${o.mola ? ' <span class="mola-etiket">MOLADA</span>' : ''}</div><div class="fis-sayi">${para(gosterilenFis(o, p))}</div>` +
      oyuncuHesap(g, o, p, el);
    const yig = document.createElement('div'); yig.className = 'yigin-yeri';
    if (gosterilenFis(o, p) > 0) yig.appendChild(yiginEl(gosterilenFis(o, p), { cesitli: true, boyut: 20, enCok: 7 }));
    levha.appendChild(yig);
    s.append(daireler, kartlar, etiket, levha);
    alan.appendChild(s);
  });
  // Kenardaki oyuncunun bahis sırası (yan express daireleriyle) masadan taşmasın: içeri kaydır
  const ar = alan.getBoundingClientRect();
  if (ar.width) alan.querySelectorAll('.nspot').forEach(s => {
    const r = [...s.querySelectorAll('.ndaireler > *, .nkartlar')].map(e => e.getBoundingClientRect()).filter(b => b.width);
    if (!r.length) return;
    const sol = Math.min(...r.map(b => b.left)) - ar.left - 6, sag = ar.right - Math.max(...r.map(b => b.right)) - 6;
    const kay = sol < 0 ? -sol : sag < 0 ? sag : 0;
    if (kay) s.style.left = `calc(${s.style.left} + ${Math.round(kay)}px)`;
  });
  panelCiz();
}
// Telefon yatay tutulduğunda (yükseklik az) kompakt yatay düzen kullanılır. Dikey telefonda
// oyun ekranı "telefonu yan çevir" der (CSS); Android'de mümkünse ekran yatay kilitlenir.
function yatayTelefonMu() { return matchMedia('(max-height: 520px) and (orientation: landscape)').matches; }
export function yatayKilitle() {
  try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* desteklenmiyor */ }
}

// Oyuncunun toplam girişi (başlangıç + yüklenen) ve ona göre artısı/eksisi.
// El sürerken masada duran ante, bet ve sigorta da oyuncunun sayılır (express dağıtımda kapanmıştır).
function oyuncuHesap(g, o, p, el) {
  const giris = (g.baslangicFis || 0) + (o.yuklenen || 0);
  const masada = p && p.katildi && el && el.faz !== 'bitti' ? (p.durum === 'pas' ? 0 : p.ante) + (p.bahis || 0) + (p.sigorta || 0) : 0;
  const fark = o.fis + masada - giris;
  const isaret = fark > 0 ? '+' : fark < 0 ? '−' : '±';
  return `<div class="yuk">giriş ${para(giris)}${o.yuklenen ? ` (yüklenen ${para(o.yuklenen)})` : ''}</div>` +
    `<div class="fark ${fark > 0 ? 'art' : fark < 0 ? 'eks' : ''}">${isaret}${para(Math.abs(fark))}</div>`;
}

// Dairede o an duran fiş
function daireTutari(p, k) {
  if (!p || !p.katildi) return 0;
  const bitti = gorunenEl(N.g.el).faz === 'bitti';
  if (bitti) return 0;
  // Express yalnız ilk 5 karta bakar ve dağıtım biter bitmez kapanır: kazanan ödenir,
  // kaybedenin express'i kasaya gider. Dağıtım animasyonu sürerken dairesinde durur.
  if (k === 'express') return expressBekliyor ? p.bonus : 0;
  if (k === 'ante') return p.durum === 'pas' ? 0 : p.ante;
  if (k === 'bet') return p.bahis;
  return 0;
}

function sonucYazi(p) {
  const s = p.sonuc;
  if (!s) return '';
  const net = (p.net >= 0 ? '+' : '−') + para(Math.abs(p.net)) + (p.sigorta ? (p.sigortaGeri ? ` · sigorta kazandı +${para(p.sigorta)}` : ' · sigorta yandı') : '');
  if (s.tip === 'oyunyok') return `Kasanın oyunu yok · ${net}`;
  if (s.tip === 'berabere') return `Berabere · ${net}`;
  if (s.tip === 'kazandi') return `${p.elAdi}${s.ikinciEl != null ? ' + ' + EL_ADI[s.ikinciEl] : s.ikinciAK ? ' + As-Papaz' : ''} ${s.oran}:1 · ${net}`;
  return `${p.elAdi} · kasa kazandı · ${net}`;
}

function panelCiz() {
  panelCiz0();
  if (online && !mesgul && online.sayac) { $('n-panel').insertAdjacentHTML('afterbegin', geriSayimHtml()); geriSayimGuncelle(); }
}
function panelCiz0() {
  const g = N.g, el = g.el, pn = $('n-panel');
  if (mesgul) { pn.innerHTML = '<div class="bekleme"><div class="ne">…</div></div>'; return; }

  if (!el || el.faz === 'bitti') {
    const kimse = !g.oyuncular.some((_, i) => katilabilir(g, i));
    const molada = g.oyuncular.some(o => o.mola);
    // El sonu tablosu (Erman 23 Kas): her oyuncu tek satır — numara, ad, kalemler etiket olarak,
    // durum/ayar ve net sonuç aynı satırda; ayrı durum satırı yok.
    const tutar = v => (v > 0 ? '+' : v < 0 ? '−' : '') + (v ? para(Math.abs(v)) : '');
    const kAd = k => (DEGER_AD[k.d] || String(k.d)) + RENK_SIMGE[k.r];
    const satirlar = durum => `<div class="dk-tablo">${g.oyuncular.map((o, i) => {
      const p = el && el.oyuncular[i];
      // Kısa etiket (EX, ANTE, BET 3:1, K.EX …); uzun açıklama title'da ve satıra dokununca açılır. Sıfır kalemler gösterilmez.
      const ks = (p && p.katildi ? p.odemeler || [] : []).filter(k => k.tutar);
      const kalem = p && p.katildi ? (ks.map(k => `<span class="dk-kalem ${k.tutar > 0 ? 'art' : 'eks'}" title="${kacis(k.yazi)}"><i>${kacis(kisaKalem(k.yazi))}</i><b>${tutar(k.tutar)}</b><em>${kacis(k.yazi)}</em></span>`).join('') || '<span class="dk-bos">ödeme yok</span>') : `<span class="dk-bos">${el ? 'yoktu' : ''}</span>`;
      const net = p && p.katildi ? `<span class="dk-net ${p.net > 0 ? 'art' : p.net < 0 ? 'eks' : ''}">${tutar(p.net) || '$0'}</span>` : '<span class="dk-net"></span>';
      return `<div class="dk-satir" data-dk="${i}"><span class="dk-no">${i + 1}</span><span class="dk-ad">${kacis(o.ad)}</span><span class="dk-kalemler">${kalem}</span>${net}<span class="dk-durum-yer">${durum(o, i)}</span></div>`;
    }).join('')}</div>`;
    let baslik = '';
    if (el) {
      const kn = el.kasaNet;
      const cekti = el.krupiyeAtilan && el.krupiyeYeni ? `<span class="dk-not">kasa ${kAd(el.krupiyeAtilan)} attı, ${kAd(el.krupiyeYeni)} çekti</span>` : '';
      baslik = `<div class="dk-baslik"><span class="dk-elno">${el.no}. el</span><span>Kasa: <b>${kacis(el.krupiyeOyunu ? el.krupiyeElAdi : 'oyun yok')}</b></span><span class="dk-kasa ${kn > 0 ? 'art' : kn < 0 ? 'eks' : ''}">kasa ${kasaYazi(kn)}</span>${cekti}</div>`;
    }
    if (online) {
      const ben = online.benim, hz = online.hazir || {}, oto = online.oto || {};
      const benimO = ben >= 0 ? g.oyuncular[ben] : null;
      const yetmez = benimO && benimO.fis < 4 * g.ante;
      const hazirim = !!hz[ben], otom = !!oto[ben];
      pn.innerHTML = `<div class="bekleme sonuc-panel">${baslik}
        ${satirlar((o, i) => `<span class="dk-durum ${hz[i] ? 'hazir' : o.mola ? 'kapali' : ''}" title="${o.mola ? 'oyunda değil' : hz[i] ? (oto[i] ? 'otomatik' : 'hazır') : o.fis < 4 * g.ante ? 'parası bitti' : 'bekleniyor'}">${o.mola ? 'mola' : hz[i] ? (oto[i] ? '✓ oto' : '✓') : o.fis < 4 * g.ante ? '$0' : '…'}</span>`)}
        <div class="satir" style="width:min(640px,100%)">
          ${online.sahipMi ? '<button class="btn-ikincil" id="n-yukle">Para yükle</button>' : ''}
          ${benimO ? '<button class="btn-ikincil" id="n-ayarlarim">Ayarlarım ⚙</button>' : ''}
          ${hazirim ? '<button class="btn-tehlike" id="n-iptal">İptal</button>' : `<button class="btn-ana" id="n-hazir" ${ben < 0 || yetmez ? 'disabled' : ''}>${el ? 'Sonraki ele gir' : 'İlk ele gir'}</button>`}
        </div>
        <div class="hata">${kacis(hata)}${hata ? ' ' : ''}${yetmez ? (online.sahipMi ? 'Paran bitti: kendine para yükleyebilirsin.' : 'Paran bitti; masayı açan para yüklerse oyuna dönebilirsin.') : hazirim ? (otom ? 'Otomatik oynuyorsun: parası yettikçe her ele girersin. Her kararın süresi 10 sn; dolunca kart çekmeden geçilir, son kararda pas.' : 'Bu ele giriyorsun; vazgeçmek için İptal.') : ben >= 0 ? (benimO.mola || online.molaIstek ? 'Oyunda değilsin: sana kart dağıtılmaz. Dönmek için Ayarlarım → Oyuna gir.' : `Basmasan da ele girersin. Ayarların: ${ayarOzet(benimO, otom)}.`) : ''}</div></div>`;
      if ($('n-yukle')) $('n-yukle').onclick = yukleAc;
      if ($('n-hazir')) $('n-hazir').onclick = () => { ses.acil(); konus.kilidiAc(); online.gonder({ tip: 'hazir' }); };
      if ($('n-iptal')) $('n-iptal').onclick = () => online.gonder({ tip: 'hazir', iptal: true });
      if ($('n-ayarlarim')) $('n-ayarlarim').onclick = () => { ses.acil(); konus.kilidiAc(); benimAyar(); };
      dkAcilir(pn);
      return;
    }
    pn.innerHTML = `<div class="bekleme sonuc-panel">${baslik}
      ${satirlar((o, i) => `<button class="dk-durum dk-ayar ${o.mola ? 'kapali' : ''}" data-ayar="${i}" title="${kacis(ayarOzet(o))}">${o.mola ? 'mola ' : ''}⚙</button>`)}
      <div class="satir" style="width:min(640px,100%)">
        <button class="btn-ikincil" id="n-yukle">Para yükle</button>
        <button class="btn-ana" id="n-dagit" ${kimse ? 'disabled' : ''}>${el ? 'Sonraki eli dağıt' : 'İlk eli dağıt'}</button>
      </div>
      <div class="hata">${kacis(hata)}${kimse ? (molada ? 'Masada oynayan kimse yok: molada olanı oyuna alın ya da para yükleyin.' : 'Kimsenin parası girişe yetmiyor: para yükleyin.') : ''}</div></div>`;
    $('n-dagit').onclick = dagit;
    $('n-yukle').onclick = yukleAc;
    pn.querySelectorAll('[data-ayar]').forEach(b => b.onclick = e => { e.stopPropagation(); ses.acil(); konus.kilidiAc(); oyuncuAyar(Number(b.dataset.ayar)); });
    dkAcilir(pn);
    return;
  }

  if (el.faz === 'oyunsuz' && online) {
    const bekleyen = el.oyuncular.map((p, i) => i).filter(i => el.oyuncular[i].katildi && el.oyuncular[i].durum === 'oynadi' && el.oyuncular[i].satinAldi === null);
    const ben = online.benim, bana = bekleyen.includes(ben) && !(ben in online.secimler);
    pn.innerHTML = `<div class="eylem-baslik"><span class="kim">Kasanın oyunu yok</span>
      <span class="ne">${bana ? 'Ante\'yi al ya da kasaya kart çektir. Çektirirsen ante 1:1 ödenmez, ante yanmaz.' : 'İyi eli olan oyuncular seçiyor…'}</span></div>
      <div class="oyunsuz">${bekleyen.map(i => `<div class="satir"><b style="flex:0 0 120px">${kacis(g.oyuncular[i].ad)}</b>${
        i === ben && bana ? `<button class="b-kontrol" data-al="0">Ante al</button><button class="b-yukselt" data-al="1">Kasaya kart çektir</button>`
        : `<span class="ne">${i in online.secimler ? 'seçti' : 'seçiyor…'}</span>`}</div>`).join('')}</div>
      <div class="hata">${kacis(hata)}</div>`;
    pn.querySelectorAll('[data-al]').forEach(b => b.onclick = () => { ses.acil(); online.gonder({ tip: 'satinal', al: b.dataset.al === '1' }); });
    return;
  }

  if (el.faz === 'oyunsuz') {
    const oynayan = el.oyuncular.map((p, i) => i).filter(i => el.oyuncular[i].katildi && el.oyuncular[i].durum === 'oynadi' && el.oyuncular[i].satinAldi === null);
    pn.innerHTML = `<div class="eylem-baslik"><span class="kim">Kasanın oyunu yok</span>
      <span class="ne">İyi eli olan seçsin: ante'yi al ya da kasaya kart çektir; çektirirsen ante 1:1 ödenmez, ante yanmaz (kasa açarsa bet'in oynar). Diğerlerinin ante'si otomatik ödenir.</span></div>
      <div class="oyunsuz">${oynayan.map(i => `
        ${el.oyuncular[i].sigorta ? `<div class="sig-not">${kacis(g.oyuncular[i].ad)}: sigortan kazandı, +${para(el.oyuncular[i].sigorta)} kesin</div>` : ''}
        <div class="satir"><b style="flex:0 0 120px">${kacis(g.oyuncular[i].ad)}</b>
          <button class="${oyunsuzSecim[i] ? 'btn-ikincil' : 'b-kontrol'}" data-o="${i}" data-v="0">Ante al</button>
          <button class="${oyunsuzSecim[i] ? 'b-yukselt' : 'btn-ikincil'}" data-o="${i}" data-v="1">Kasaya kart çektir</button>
        </div>`).join('')}</div>
      <button class="btn-ana" id="n-oyunsuz-tamam">Devam</button>
      <div class="hata">${kacis(hata)}</div>`;
    pn.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { oyunsuzSecim[b.dataset.o] = b.dataset.v === '1'; panelCiz(); });
    $('n-oyunsuz-tamam').onclick = () => uygula(g2 => oyunSatinAl(g2, oyunsuzSecim));
    return;
  }

  const y = novoYasal(g);
  const i = y.oyuncu, p = el.oyuncular[i], o = g.oyuncular[i];
  const A = el.ante;
  if (online && i !== online.benim) {
    const ne = 'sigorta' in y ? 'sigorta kararı veriyor' : y.asama === 'cekme' ? 'kart çekme kararı veriyor' : 'oyuna girip girmeyeceğine karar veriyor';
    pn.innerHTML = `<div class="bekleme"><div class="eylem-baslik"><span class="kim">Sıra: ${kacis(o.ad)}</span><span class="ne">${ne}…</span></div><div class="hata">${kacis(hata)}</div></div>`;
    return;
  }
  // Karar başlığı (Erman 23 Kas): ad + aşama + el + bakiye kısa rozetler; açıklama ⓘ'de
  const asamaAd = 'sigorta' in y ? 'SİGORTA' : y.asama === 'cekme' ? 'KART ÇEKME' : 'OYUNA GİRİŞ';
  const ipucu = 'sigorta' in y ? 'Kasa açmazsa sigorta 1:1 öder. Yapmazsan kasa açmadığında yalnız ante\'yi alırsın; kasaya kart çektirirsen ve yine açmazsa ante ve bet geri gelir.'
    : y.asama === 'cekme' ? 'Önce herkes kart çeker; oyuna girme kararı herkes kartını aldıktan sonra sorulur.' : 'Oynarsan bet koyarsın (2 ante); pas dersen ante yanar.';
  let html = `<div class="eylem-baslik karar-bas"><span class="kim">${kacis(o.ad)}</span><span class="asama">${asamaAd}</span>
    <span class="el-pill">${(k => EL_ADI[k.ana] + (k.ikinci != null ? ' + ' + EL_ADI[k.ikinci] : ''))(kombinasyonlar(p.kartlar))}</span>
    <span class="bakiye">${para(o.fis)}</span><button class="bilgi-i" title="${kacis(ipucu)}" aria-label="Bilgi" onclick="this.classList.toggle('acik')">ⓘ<span>${kacis(ipucu)}</span></button></div>`;
  const dg = (cls, a, ust, alt, acik = true) => `<button class="${cls}" data-a="${a}" ${acik ? '' : 'disabled'}><b>${ust}</b><small>${alt}</small></button>`;
  if ('sigorta' in y) {
    const s = y.sigorta;
    html += `<div class="dugmeler d2" style="grid-template-columns:repeat(${s.enAz === s.enCok ? 2 : 3},1fr)">
        <button class="btn-ikincil" data-s="0">Sigorta yok</button>
        ${s.enAz === s.enCok ? '' : `<button class="b-kontrol" data-s="${s.enAz}">Min ${para(s.enAz)}</button>`}
        <button class="b-yukselt" data-s="${s.enCok}">${s.enAz === s.enCok ? '' : 'Max '}${para(s.enCok)}</button>
      </div>`;
  } else if (secimModu) {
    html += `<div class="buyuk-kartlar" id="n-secim">${p.kartlar.map((_, j) => `<div data-j="${j}"></div>`).join('')}</div>
      <div class="ne" style="text-align:center;color:var(--soluk)">Değiştirmek istediğin kartlara dokun</div>
      <div class="satir"><button class="btn-ikincil" id="n-vazgec">Vazgeç</button>
      <button class="b-yukselt" id="n-degis" ${secili.size ? '' : 'disabled'}>${secili.size || ''} kartı değiştir · ${para(A)}</button></div>`;
  } else if (y.asama === 'cekme') {
    html += `<div class="dugmeler d2 d5">
      ${dg('b-yukselt ana', 'degistir', 'Kart çek', para(A), y.degistir)}
      ${dg('b-allin', 'alti', '6. kart', para(A), y.alti)}
      ${dg('b-kontrol', 'gecoyna', 'Çekmeden oyna', para(2 * A), o.fis >= 2 * A)}
      ${dg('b-kontrol koyu', 'gec', 'Çekmiyorum', 'sonra karar')}
      ${dg('b-pas ince', 'pas', 'Pas', 'çekil')}</div>`;
  } else {
    html += `<div class="dugmeler d2" style="grid-template-columns:2fr 1fr">
      ${dg('b-kontrol ana', 'oyna', 'Oyna', 'bet ' + para(2 * A), y.oyna)}
      ${dg('b-pas ince', 'pas', 'Pas', 'ante yanar')}</div>`;
  }
  html += `<div class="hata">${kacis(hata)}</div>`;
  pn.innerHTML = html;
  if ('sigorta' in y) {
    pn.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
      ses.acil(); konus.kilidiAc();
      uygula(g2 => novoHamle(g2, { tip: 'sigorta', miktar: Number(b.dataset.s) }), 'sigorta', { tip: 'hamle', hamle: { tip: 'sigorta', miktar: Number(b.dataset.s) } });
    });
  } else if (secimModu) {
    const kap = $('n-secim');
    [...kap.children].forEach((d, j) => {
      const ke = kartEl(p.kartlar[j], true);
      if (secili.has(j)) ke.classList.add('secili');
      d.appendChild(ke);
      d.onclick = () => { ses.acil(); secili.has(j) ? secili.delete(j) : secili.add(j); ses.kartCevir(); panelCiz(); ciz(); };
    });
    $('n-vazgec').onclick = () => { secimModu = false; secili.clear(); ciz(); };
    $('n-degis').onclick = () => degistir([...secili]);
  } else {
    pn.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      ses.acil(); konus.kilidiAc();
      const a = b.dataset.a;
      if (a === 'degistir') { secimModu = true; secili.clear(); hata = ''; ciz(); return; }
      if (a === 'alti') return altinciKart();
      if (a === 'gecoyna') return uygula(g2 => novoHamle(g2, { tip: 'gec', oyna: true }), 'gec', { tip: 'hamle', hamle: { tip: 'gec', oyna: true } });
      uygula(g2 => novoHamle(g2, { tip: a }), a, { tip: 'hamle', hamle: { tip: a } });
    });
  }
}

const g0ad = i => N.g.oyuncular[i].ad;
let duyuruZaman = null;
function duyuru(html) {
  const d = $('duyuru');
  d.innerHTML = html;
  d.classList.add('acik');
  clearTimeout(duyuruZaman);
  duyuruZaman = setTimeout(() => d.classList.remove('acik'), 4000);
  d.onclick = () => d.classList.remove('acik');
}

// ---------------- Hamleler ve animasyonlar ----------------
function spotEl(i) { return $('n-alan').querySelector(`.nspot[data-i="${i}"]`); }
function kasaRect() { return $('n-kasa-kutu').getBoundingClientRect(); }

async function fisUcur(kaynak, hedef, miktar, sure = 450) {
  if (!(miktar > 0) || !kaynak || !hedef) return;
  const a = kaynak.getBoundingClientRect ? kaynak.getBoundingClientRect() : kaynak;
  const b = hedef.getBoundingClientRect ? hedef.getBoundingClientRect() : hedef;
  const y = yiginEl(miktar, { boyut: 22, enCok: 5 });
  y.classList.add('ucan');
  y.style.left = (a.left + a.width / 2 - 20) + 'px';
  y.style.top = (a.top + a.height / 2 - 12) + 'px';
  y.style.transition = `transform ${sure}ms cubic-bezier(.3,.7,.3,1)`;
  document.body.appendChild(y);
  y.getBoundingClientRect();
  y.style.transform = `translate(${(b.left + b.width / 2) - (a.left + a.width / 2)}px, ${(b.top + b.height / 2) - (a.top + a.height / 2)}px)`;
  // Kasa ödüyor ya da topluyorsa gerçek fiş sesi; oyuncu bahis koyarken kibar, kısık ses
  const kasaIle = !kaynak.getBoundingClientRect || !hedef.getBoundingClientRect;
  if (kasaIle) { if (!sessizOdeme) ses.fis(miktar >= 10 * (N.g.ante || 25) ? 8 : 4); } else ses.fisHafif();
  await bekle(sure);
  y.remove();
}

// Hamleler sırayla işlenir: bir hamlenin animasyonu sürerken gelen ikinci dokunuş (ör. sıradaki
// oyuncunun hızlı "Oyna"sı) yok sayılır. Yoksa önceki hamlenin animasyonu biterken ekranı yeni
// durumla çizip kasanın kartlarını açılıştan önce bir an gösteriyordu.
let islemde = false;
async function uygula(fn, tip, aksiyon) {
  if (online) { if (!mesgul && aksiyon) online.gonder(aksiyon); return; }
  if (mesgul || islemde) return;
  islemde = true;
  try { await uygula0(fn, tip); } finally { islemde = false; }
}
async function uygula0(fn, tip) {
  const once = N.g;
  let yeni;
  try { yeni = fn(once); } catch (e) { hata = e.message; panelCiz(); return; }
  hata = '';
  gecmiseAt();
  await animasyonla(once, yeni, tip);
}
async function animasyonla(once, yeni, tip) {
  // Bu hamleyle kasa açılıyorsa (el sonuçlandı), açılış animasyonu başlayana kadar ekran hamleden
  // önceki gibi kalır: kasanın kartları kapalı, kasa toplamı ve sonuç etiketleri görünmez.
  if (once.el && !once.el.krupiyeAcik && yeni.el && yeni.el.krupiyeAcik) {
    maske = { faz: once.el.faz, krupiyeAcik: false, kasa: kasaCanli(once) };
    mesgul = true;
  }
  N.g = yeni; kaydet();
  if (tip === 'pas') ses.kartlariAt();
  if (tip === 'oyna') {
    const i = once.el.sira;
    ciz();
    await fisUcur(spotEl(i).querySelector('.nlevha'), spotEl(i).querySelector('.ndaire.bet'), 2 * once.el.ante);
  }
  if (tip === 'sigorta') {
    const i = once.el.sira;
    const m = yeni.el.oyuncular[i].sigorta;
    ciz();
    if (m) await fisUcur(spotEl(i).querySelector('.nlevha'), goster(spotEl(i).querySelector('.nsigorta')), m);
  }
  if (tip === 'pas') {
    const i = once.el.sira;
    await fisUcur(spotEl(i).querySelector('.ndaire.ante'), kasaRect(), once.el.ante);
  }
  if (tip === 'degistir' || tip === 'alti') {
    const i = once.el.sira;
    if (yeni.el.faz === 'cekme') ciz(); // karar işaretli görünsün (kart henüz gelmez)
    await fisUcur(spotEl(i).querySelector('.nlevha'), goster(spotEl(i).querySelector('.ncekme')), once.el.ante, 350);
  }
  if (once.el.faz === 'cekme' && yeni.el.faz !== 'cekme') await topluDagit();
  oyunsuzSecim = {};
  await sonAnimasyon(once, yeni);
}

function degistir(konumlar) {
  secimModu = false; secili.clear();
  return uygula(g2 => novoHamle(g2, { tip: 'degistir', konumlar }), 'degistir', { tip: 'hamle', hamle: { tip: 'degistir', konumlar } });
}

function altinciKart() {
  return uygula(g2 => novoHamle(g2, { tip: 'alti' }), 'alti', { tip: 'hamle', hamle: { tip: 'alti' } });
}

// Yakılan kartı desteden yakılanlar yığınına uçur (yığının j. kartı gizliyken)
async function yak(j, sure = 420) {
  const yk = $('n-yakilan').querySelectorAll('.yk-kart')[j];
  if (!yk) return;
  yk.style.visibility = 'hidden';
  ses.kartAt();
  await kartUcur(kasaRect(), yk, sure);
  yk.style.visibility = '';
}

// Herkes karar verdi: kasa yeni kartları koltuk sırasıyla toplu dağıtır.
async function topluDagit() {
  const el = N.g.el;
  const cekenler = el.oyuncular.map((p, i) => [p, i]).filter(([p]) => p.katildi && (p.degisti || p.alti));
  if (!cekenler.length) return;
  mesgul = true;
  ciz();
  const yeniKartlar = [];
  for (const [p, i] of cekenler) {
    const ks = spotEl(i).querySelectorAll('.nkartlar .kart');
    const konum = p.alti ? [ks.length - 1] : p.degisenler;
    for (const j of konum) { ks[j].style.visibility = 'hidden'; yeniKartlar.push(ks[j]); }
  }
  ses.kartlariAt();
  const ykIdx = YAKILAN_ILK; // çekme öncesi gömülen kart
  const ykEl = $('n-yakilan').querySelectorAll('.yk-kart')[ykIdx];
  if (ykEl) ykEl.style.visibility = 'hidden';
  await bekle(350);
  ruh('dagit');
  if (el.cekmeYakilan) { await yak(ykIdx); await bekle(200); }
  for (const k of yeniKartlar) {
    ses.kartAt();
    await kartUcur(kasaRect(), k, 260);
    k.style.visibility = '';
  }
  ses.kartCevir();
  ruh('normal');
  // Kart çekerek iyi el yapanı krupiye söyler (üçlü ve üstü ya da iki kombinasyon)
  for (const [p, i] of cekenler) {
    const k = kombinasyonlar(p.kartlar), b = betOrani(p.kartlar);
    const iyi = k.ikinci != null || k.ana === 'SF' || k.ana === 'RF' || (typeof k.ana === 'number' && k.ana >= 3);
    if (!iyi) continue;
    ruh('saskin', 1800);
    konus.soyle('tebrikler', konus.oyuncu(i), konus.el(k.ana), k.ikinci != null ? ['ve', konus.el(k.ikinci)] : [], konus.sayi(b.oran), 'kat_odeme');
  }
  mesgul = false;
  ciz();
}

// Krupiye açılınca: kartları çevir, kasa kaybedenleri toplasın, kazananlara ödesin.
async function sonAnimasyon(once, yeni) {
  const el = yeni.el;
  const acildi = !once.el.krupiyeAcik && el.krupiyeAcik;
  const degisti = el.krupiyeDegisim && once.el.faz === 'oyunsuz';
  if (!acildi && !degisti && el.faz !== 'bitti') { maske = null; ciz(); return; }
  mesgul = true;
  // önce kapalı haliyle çiz, sonra krupiye kartlarını tek tek çevir
  const g = N.g;
  const gercekFaz = el.faz;
  el.faz = once.el.faz === 'oyunsuz' ? 'oyunsuz' : 'karar';
  el.krupiyeAcik = once.el.krupiyeAcik;
  const krupiyeSon = el.krupiye;
  const kAtilan = el.krupiyeAtilan, kYakilan = el.krupiyeYakilan;
  if (degisti) { el.krupiye = once.el.krupiye; el.krupiyeAtilan = undefined; el.krupiyeYakilan = undefined; }
  maske = { kasa: maske ? maske.kasa : kasaCanli(once) }; // kartlar animasyonla açılır, kasa toplamı sonra
  ciz();
  await bekle(300);
  const kr = $('n-krupiye').children;
  if (acildi) {
    for (let j = 0; j < 4; j++) { kartYuzu(kr[j], el.krupiye[j]); kr[j].classList.add('acik'); ses.kartCevir(); await bekle(380); }
    await bekle(300);
    const sigortalilar = el.oyuncular.map((p, i) => [p, i]).filter(([p]) => p.katildi && p.sigorta > 0);
    if (el.ilkOyun) {
      konus.soyle(konus.kasaEl(sinif(el.krupiye).anahtar));
      for (const [, i] of sigortalilar) konus.soyle(konus.oyuncu(i), 'sigortayi_kaybetti');
    } else {
      konus.soyle('kasa_bos');
      for (const [p, i] of sigortalilar) konus.soyle(konus.oyuncu(i), 'sigortadan', konus.sayi(p.sigorta), 'dolar_kazanir');
    }
    // Kasa boş açtı: sigorta yapanlar kazandı, bunu büyük söyle
    if (!el.ilkOyun) {
      const sigortali = el.oyuncular.map((p, i) => [p, i]).filter(([p]) => p.katildi && p.sigorta > 0);
      if (sigortali.length) {
        ruh('saskin', 2500);
        duyuru(`<div class="no" style="font-size:clamp(34px,6vw,64px)">KASA BOŞ AÇTI</div>
          <div style="font-size:24px">Sigorta kazandı: ${sigortali.map(([p, i]) => `<b>${kacis(g.oyuncular[i].ad)} +${para(p.sigorta)}</b>`).join(' · ')}</div>
          <div class="kk">Sigorta 1'e 1 ödendi; kasa sonradan kart çekse de geçerli</div>`);
        ses.fis(6);
      }
    }
  }
  if (degisti) {
    // Kasa en yüksek kartını atar, 1 kart gömülür, sıradaki kart açılır
    const idx = once.el.krupiye.findIndex(k => k.d === kAtilan.d && k.r === kAtilan.r);
    ruh('dagit');
    const eski = $('n-krupiye').children[idx];
    const eskiRect = eski.getBoundingClientRect();
    eski.style.visibility = 'hidden';
    el.krupiyeAtilan = kAtilan; el.krupiyeYakilan = kYakilan;
    el.krupiye = krupiyeSon; el.krupiyeAcik = true;
    ciz();
    const yigin = $('n-yakilan').querySelectorAll('.yk-kart');
    const n = yigin.length;
    yigin[n - 1].style.visibility = 'hidden'; yigin[n - 2].style.visibility = 'hidden';
    const yeniK = $('n-krupiye').children[idx];
    yeniK.style.visibility = 'hidden';
    ses.kartlariAt();
    await kartUcur(eskiRect, yigin[n - 2], 450); yigin[n - 2].style.visibility = '';   // atılan
    await bekle(200);
    ses.kartAt(); await kartUcur(kasaRect(), yigin[n - 1], 450); yigin[n - 1].style.visibility = ''; // gömülen
    await bekle(250);
    ses.kartAt(); await kartUcur(kasaRect(), yeniK, 520); yeniK.style.visibility = ''; ses.kartCevir();
    ruh('normal');
    await bekle(500);
  }
  el.faz = gercekFaz; el.krupiyeAcik = true; maske = null;
  if (gercekFaz !== 'bitti') { mesgul = false; ciz(); return; }
  // Hesaplaşma: fişler daireler doluyken
  ciz();
  const spotlar = el.oyuncular.map((p, i) => [p, i]).filter(([p]) => p.katildi && p.durum === 'oynadi');
  // daireleri bitiş öncesi tutarlarla doldur
  for (const [p, i] of spotlar) {
    const s = spotEl(i);
    s.querySelector('.ndaire.ante .yer').appendChild(ustCipEl(p.ante, 34));
    s.querySelector('.ndaire.bet .yer').appendChild(ustCipEl(p.bahis, 34));
  }
  await bekle(500);
  // Bet'te 5 kat ve üstü kazanan varsa kurpiye gala kutlaması (express'teki gibi), sonraki dağıtıma kadar
  if (spotlar.some(([p]) => p.sonuc && p.sonuc.tip === 'kazandi' && p.sonuc.oran >= 5)) { gala(true); havaiFisek(); }
  if (degisti) konus.soyle('kasa_kart_cekti', el.krupiyeOyunu ? [konus.el(sinif(el.krupiye).anahtar), 'oldu'] : 'yine_bos');
  for (const [p, i] of spotlar) {
    const ad = g.oyuncular[i].ad, t = p.sonuc.tip;
    if (t === 'kazandi') {
      const k = kombinasyonlar(p.kartlar);
      const odeme = p.bahis * p.sonuc.oran;
      konus.soyle(konus.el(k.ana), k.ikinci != null ? ['ve', konus.el(k.ikinci)] : [], konus.oyuncu(i), konus.sayi(odeme), 'dolar_odeme',
        odeme >= 10 * el.ante ? ['tebrikler', konus.oyuncu(i)] : []);
    } else if (t === 'kaybetti') konus.soyle(konus.oyuncu(i), 'kaybetti');
    else if (t === 'berabere') konus.soyle(konus.oyuncu(i), 'berabere');
    else if (t === 'oyunyok' && p.satinAldi) konus.soyle(konus.oyuncu(i), 'berabere');
  }
  // Kasaya express kazananı (kasanın ilk 5 kartına göre, el sonunda ödenir)
  for (const [p, i] of spotlar) {
    if (p.yanKasa && p.yanKasa.odeme > 0) konus.soyle(konus.oyuncu(i), 'kasa_expressten', konus.sayi(p.yanKasa.odeme - p.yanKasa.bahis), 'dolar_kazanir');
  }
  // Elif konuşurken ödeme yapılmaz; fişler konuşma bitince gider, çip sesi sonda bir kez çalar.
  await konus.bitince();
  sessizOdeme = true;
  let fisOynadi = false;
  for (const [p, i] of spotlar) {
    fisOynadi = true;
    const s = spotEl(i);
    const ante = s.querySelector('.ndaire.ante'), bet = s.querySelector('.ndaire.bet'), levha = s.querySelector('.nlevha');
    const t = p.sonuc.tip;
    if (t === 'kaybetti') {
      ante.querySelector('.yer').innerHTML = ''; bet.querySelector('.yer').innerHTML = '';
      await fisUcur(bet, kasaRect(), p.ante + p.bahis);
    } else {
      const odeme = p.geri - p.ante - p.bahis; // ante kazancı + bahis ödemesi
      if (odeme > 0) await fisUcur(kasaRect(), bet, odeme, 500);
      ante.querySelector('.yer').innerHTML = ''; bet.querySelector('.yer').innerHTML = '';
      await fisUcur(bet, levha, p.geri, 450);
    }
    if (p.ucret) await fisUcur(s.querySelector('.ncekme'), kasaRect(), p.ucret, 350);
    if (p.sigorta) {
      const sg = s.querySelector('.nsigorta');
      if (p.sigortaGeri) { await fisUcur(kasaRect(), sg, p.sigorta, 450); await fisUcur(sg, levha, p.sigortaGeri, 400); }
      else await fisUcur(sg, kasaRect(), p.sigorta, 350);
    }
  }
  sessizOdeme = false;
  if (fisOynadi) ses.fis(8);
  mesgul = false;
  void g;
  const enBuyuk = Math.max(0, ...el.oyuncular.map(p => (p.katildi ? p.net : 0)));
  if (enBuyuk >= 10 * el.ante) ruh('saskin', 2500);
  else if (el.kasaNet > 0) ruh('gulen', 2500);
  ciz();
}

let sessizOdeme = false; // toplu ödeme sırasında her fiş uçuşu ayrı ses çıkarmasın
let expressBekliyor = false; // dağıtım animasyonu bitene kadar express dairesinde durur

function bakiyeYaz(s, i) {
  const o = N.g.oyuncular[i], f = s && s.querySelector('.nlevha .fis-sayi');
  if (f) f.textContent = para(o.fis);
  const y = s && s.querySelector('.nlevha .yigin-yeri');
  if (y) { y.innerHTML = ''; if (o.fis > 0) y.appendChild(yiginEl(o.fis, { cesitli: true, boyut: 20, enCok: 7 })); }
}
async function dagit() {
  if (mesgul) return;
  ses.acil();
  konus.kilidiAc();
  if (online) { online.gonder({ tip: 'dagit' }); return; }
  let yeni;
  try { yeni = novoDagit(N.g); } catch (e) { hata = e.message; panelCiz(); return; }
  gecmiseAt(); hata = '';
  await dagitAnimasyon(yeni);
}
// Her kurpiye masaya gelince bir kez: "Hoş geldiniz, bol şans" (Erman 23 Kas)
let karsilanan = -1;
function karsila(d) { if (d === karsilanan) return; karsilanan = d; konus.soyle('hosgeldiniz'); }
async function dagitAnimasyon(yeni) {
  N.g = yeni; kaydet();
  mesgul = true; expressBekliyor = true;
  odenmedi.clear(); (N.g.el ? N.g.el.oyuncular : []).forEach((p, i) => { if (p.katildi) odenmedi.add(N.g.oyuncular[i].koltuk ?? i); });
  if (yeni.el.krupiyeAcik) maske = { faz: 'karar', krupiyeAcik: false, kasa: kasaCanli({ ...N.g, kasaNet: (N.g.kasaNet || 0) - (yeni.el.kasaNet || 0) }) };
  const el = N.g.el;
  ciz();
  const spotlar = el.oyuncular.map((p, i) => [p, i]).filter(([p]) => p.katildi);
  const gizle = e => { e.style.visibility = 'hidden'; };
  $('n-alan').querySelectorAll('.nkartlar .kart, .nel').forEach(gizle);
  [...$('n-krupiye').children].forEach(gizle);
  $('n-yakilan').querySelectorAll('.yk-kart').forEach(gizle);
  // 10 elde bir kurpiye değişir: "Dealer change"
  if (degisimEli(el.no)) {
    duyuru('<div class="no" style="font-size:clamp(34px,6vw,64px)">DEALER CHANGE</div><div class="kk">Yeni kurpiye masaya geliyor</div>');
    konus.soyle('dealer_change');
    await konus.bitince(3000);
    await kurpiyeDegistir(eldekiKurpiye(el.no));
    karsila(eldekiKurpiye(el.no));
    await bekle(400);
  } else { kurpiyeAyarla(eldekiKurpiye(el.no)); karsila(eldekiKurpiye(el.no)); }
  // Girişler daireye
  for (const [p, i] of spotlar) {
    const s = spotEl(i);
    const levha = s.querySelector('.nlevha');
    await fisUcur(levha, s.querySelector('.ndaire.ante'), p.ante, 300);
    await fisUcur(levha, s.querySelector('.ndaire.express'), p.bonus, 300);
  }
  ruh('dagit');
  const sure = ses.karistir() || 0;
  await bekle(Math.min(1500, sure * 700));
  // Novo: dağıtımdan önce 3 kart yakılır
  for (let j = 0; j < YAKILAN_ILK; j++) { await yak(j, 520); await bekle(150); }
  await bekle(250);
  // 5 tur: önce oyuncular, sonra krupiye
  for (let k = 0; k < 5; k++) {
    for (const [, i] of spotlar) {
      const c = spotEl(i).querySelectorAll('.nkartlar .kart')[k];
      ses.kartAt(); await kartUcur(kasaRect(), c, 419); c.style.visibility = ''; await bekle(131);
    }
    const d = $('n-krupiye').children[k];
    ses.kartAt(); await kartUcur(kasaRect(), d, 419); d.style.visibility = ''; await bekle(197);
  }
  ses.kartCevir();
  ruh('normal');
  await bekle(300);
  let galaGosterildi = false;
  // Express hemen: kazanan ödenir, kaybedenin express'i kasaya. Önce Elif bonusları söyler,
  // fişler konuşma bitince gider, çip sesi sonda bir kez çalar.
  for (const [p, i] of spotlar) {
    spotEl(i).querySelector('.nel').style.visibility = '';
    if (p.bonusOdeme) {
      ruh(p.bonusOran >= 30 ? 'saskin' : 'goz', 1600);
      if (p.bonusOran >= 30 && !galaGosterildi) { galaGosterildi = true; gala(true); havaiFisek(); }
      konus.soyle(konus.oyuncu(i), 'bonus_odeme', konus.el(bonusAnahtari(p.ilk)), konus.sayi(p.bonusOdeme - p.bonus), 'dolar');
    }
  }
  // Komşuya express kazananı: "Bir numara komşu express'ten 75 dolar kazanır" (Erman 22 Kas)
  for (const [p, i] of spotlar) {
    if (p.yanKomsu && p.yanKomsu.odeme > 0) konus.soyle(konus.oyuncu(i), 'komsu_expressten', konus.sayi(p.yanKomsu.odeme - p.yanKomsu.bahis), 'dolar_kazanir');
  }
  await konus.bitince();
  sessizOdeme = true;
  for (const [p, i] of spotlar) {
    const s = spotEl(i);
    const ex = s.querySelector('.ndaire.express');
    if (p.bonusOdeme) {
      await fisUcur(kasaRect(), ex, p.bonusOdeme - p.bonus, 500);
      ex.querySelector('.yer').innerHTML = '';
      await fisUcur(ex, s.querySelector('.nlevha'), p.bonusOdeme, 450);
      odenmedi.delete(N.g.oyuncular[i].koltuk ?? i); bakiyeYaz(s, i);
    } else {
      // bonus yok: express kasaya
      ex.querySelector('.yer').innerHTML = '';
      await fisUcur(ex, kasaRect(), p.bonus, 350);
    }
  }
  sessizOdeme = false;
  for (const [, i] of spotlar) { if (odenmedi.delete(N.g.oyuncular[i].koltuk ?? i)) bakiyeYaz(spotEl(i), i); }
  if (spotlar.length) ses.fis(spotlar.length > 1 ? 8 : 4);
  expressBekliyor = false;
  mesgul = false;
  ciz();
  if (N.g.el.faz !== 'karar' && N.g.el.faz !== 'cekme') await sonAnimasyon({ el: { ...N.g.el, krupiyeAcik: false, faz: 'karar' } }, N.g);
}

function yukleAc() {
  const g = N.g;
  if (online && !online.sahipMi) return;
  perdeAc(`<div style="font-size:20px;font-weight:800">Para yükle</div>
    <label>Oyuncu<select id="y-kim">${g.oyuncular.map((o, i) => `<option value="${i}">${kacis(o.ad)} · ${para(o.fis)}</option>`).join('')}</select></label>
    <label>Tutar<select id="y-tutar">${[100, 250, 500, 1000, 2000].map(t => `<option value="${t}" ${t === g.baslangicFis ? 'selected' : ''}>${para(t)}</option>`).join('')}</select></label>
    <div class="hata" id="y-hata"></div>
    <div class="satir"><button class="btn-ikincil" id="y-iptal">Vazgeç</button><button class="btn-ana" id="y-ok">Yükle</button></div>`,
  k => {
    k.querySelector('#y-iptal').onclick = perdeKapat;
    k.querySelector('#y-ok').onclick = () => {
      if (online) { online.gonder({ tip: 'yukle', koltuk: Number(k.querySelector('#y-kim').value), miktar: Number(k.querySelector('#y-tutar').value) }); perdeKapat(); return; }
      try {
        const yeni = paraYukle(N.g, Number(k.querySelector('#y-kim').value), Number(k.querySelector('#y-tutar').value));
        gecmiseAt(); N.g = yeni; kaydet(); perdeKapat(); ses.fis(5); ciz();
      } catch (e) { k.querySelector('#y-hata').textContent = e.message; }
    };
  });
}

function odemeListeleri() {
  const ana = [['Royal flush', ODEME.RF], ['Renkli kent', ODEME.SF], ['Kare', ODEME[7]], ['Full', ODEME[6]], ['Renk', ODEME[5]],
    ['Kent', ODEME[4]], ['Üçlü', ODEME[3]], ['İki çift', ODEME[2]], ['Çift', ODEME[1]], ['As-Papaz', ODEME.AK]];
  const ex = [['Royal flush', BONUS.RF], ['Renkli kent', BONUS.SF], ['Kare', BONUS[7]], ['5 surat', BONUS.SURAT], ['Full', BONUS[6]], ['Renk', BONUS[5]],
    ['Kent', BONUS[4]], ['Üçlü', BONUS[3]], ['As-Papaz-Kız', BONUS.AKQ], ['Sahte renk', BONUS.SAHTE]];
  return { ana, ex };
}

// Oyuncu ayarları tek düğmede (ekran dolmasın): oyunda / molada, otomatik (online), kasaya ve
// komşuya express (express kadar, 1 ante). Online'da herkes yalnız kendi ayarını görür ve değiştirir.
// El sonu tablosunda kalemlerin kısa adı (uzun metin motordan gelir, değişmez)
function kisaKalem(y) {
  const oran = (y.match(/(\d+):1/) || [])[1];
  const o = oran ? ' ' + oran + ':1' : '';
  if (/^Kasaya express/.test(y)) return 'K.EX' + o;
  if (/^Komşuya express/.test(y)) return 'KOM.EX' + o;
  if (/^Bonus ödeme/.test(y)) return 'EX' + o;
  if (/^Express/.test(y)) return 'EX';
  if (/^Ante \(pas\)/.test(y)) return 'PAS';
  if (/^Ante/.test(y)) return 'ANTE';
  if (/^Bet/.test(y)) return 'BET' + o;
  if (/^Kasa kazandı/.test(y)) return 'KASA';
  if (/^6\. kart/.test(y)) return '6. KART';
  if (/^Kart çekme/.test(y)) return 'ÇEKME';
  if (/^Sigorta/.test(y)) return 'SİG' + o;
  return y.length > 12 ? y.slice(0, 11) + '…' : y;
}
function dkAcilir(pn) { pn.querySelectorAll('.dk-satir').forEach(r => r.onclick = () => r.classList.toggle('acik')); }
function ayarOzet(o, oto = false) {
  const y = o.yan || {}, ek = [oto ? 'otomatik' : '', y.kasa ? 'kasaya ex' : '', y.komsu ? 'komşuya ex' : ''].filter(Boolean);
  return (o.mola ? 'molada' : 'oyunda') + (ek.length ? ' · ' + ek.join(' · ') : '');
}
const ayarDugme = (id, yazi, acik) => `<button class="mola-dugme oto-dugme ${acik ? 'oto-acik' : ''}" id="${id}">${yazi}: ${acik ? 'açık' : 'kapalı'}</button>`;
function oyuncuAyar(i) {
  const ciz0 = k => {
    const o = N.g.oyuncular[i], y = o.yan || {};
    k.innerHTML = `<div style="font-size:20px;font-weight:800">${kacis(o.ad)}</div>
      <div class="mola-satir" style="flex-direction:column">
        <button class="mola-dugme ${o.mola ? 'molada' : ''}" id="oa-mola">${o.mola ? 'Molada · oyuna dön' : 'Oyunda · molaya çık'}</button>
        ${ayarDugme('oa-kasa', `Kasaya express (${para(N.g.ante)})`, y.kasa)}
        ${N.g.oyuncular.length > 1 ? ayarDugme('oa-komsu', `Komşuya express (${para(N.g.ante)})`, y.komsu) : ''}
      </div>
      <div class="hata">${kacis(hata)}</div>
      <button class="btn-ana" id="oa-tamam">Tamam</button>`;
    const yap = fn => { try { fn(); hata = ''; kaydet(); } catch (e) { hata = e.message; } ciz0(k); panelCiz(); };
    k.querySelector('#oa-mola').onclick = () => yap(() => { const yeni = molaAyarla(N.g, i, !N.g.oyuncular[i].mola); gecmiseAt(); N.g = yeni; });
    k.querySelector('#oa-kasa').onclick = () => yap(() => { N.g = yanAyarla(N.g, i, { kasa: !(N.g.oyuncular[i].yan || {}).kasa }); });
    if (k.querySelector('#oa-komsu')) k.querySelector('#oa-komsu').onclick = () => yap(() => { N.g = yanAyarla(N.g, i, { komsu: !(N.g.oyuncular[i].yan || {}).komsu }); });
    k.querySelector('#oa-tamam').onclick = () => { perdeKapat(); ciz(); };
  };
  perdeAc('', ciz0);
}
// Online: kendi ayarların. Her dokunuş sunucuya gider; pencere kapanır, durum gelince panel güncellenir.
function benimAyar() {
  const ben = online.benim, o = N.g.oyuncular[ben]; if (!o) return;
  const y = online.sonYan || o.yan || {}, otom = !!(online.oto || {})[ben], mola = o.mola || online.molaIstek;
  const yetmez = o.fis < 4 * N.g.ante;
  perdeAc(`<div style="font-size:20px;font-weight:800">Ayarlarım</div>
    <div class="mola-satir" style="flex-direction:column">
      <button class="mola-dugme ${mola ? 'molada' : ''}" id="ba-mola">${mola ? 'Oyunda değilsin · oyuna gir' : 'Oyundasın · oyundan çık'}</button>
      ${ayarDugme('ba-oto', 'Otomatik oyna', otom)}
      ${ayarDugme('ba-kasa', `Kasaya express (${para(N.g.ante)})`, y.kasa)}
      ${N.g.oyuncular.length > 1 ? ayarDugme('ba-komsu', `Komşuya express (${para(N.g.ante)})`, y.komsu) : ''}
      <button class="mola-dugme" id="ba-kalk">Masadan kalk (yerimi sıradakine bırak)</button>
    </div>
    <div class="ne" style="color:var(--soluk);font-size:13px">Express seçimleri bir sonraki elde geçerli; komşun sağındaki oyuncu. El sürerken oyundan çıkarsan el bitince çıkarsın.</div>
    <button class="btn-ana" id="ba-tamam">Tamam</button>`, k => {
    const git = m => { online.gonder(m); perdeKapat(); };
    // Express ve otomatik seçimlerinde pencere açık kalır: sunucu cevabıyla yeniden çizilir (ikisi birlikte seçilebilsin)
    const sec = m => { online.gonder(m); perdeKapat(); setTimeout(benimAyar, 350); };
    k.querySelector('#ba-mola').onclick = () => git({ tip: 'mola', mola: !mola });
    k.querySelector('#ba-oto').onclick = () => { if (yetmez && !otom) return; sec({ tip: 'oto', acik: !otom }); };
    k.querySelector('#ba-kasa').onclick = () => sec({ tip: 'yan', kasa: !y.kasa });
    if (k.querySelector('#ba-komsu')) k.querySelector('#ba-komsu').onclick = () => sec({ tip: 'yan', komsu: !y.komsu });
    k.querySelector('#ba-tamam').onclick = perdeKapat;
    k.querySelector('#ba-kalk').onclick = async () => { perdeKapat(); if (await onayla('Masadan kalkılsın mı? Koltuğun boşalır, çiplerin masada kalmaz; sırada bekleyen oturur.', 'Kalk')) online.gonder({ tip: 'kalk' }); };
  });
}

function kurallarAc() {
  const { ana, ex } = odemeListeleri();
  const tablo = (bas, l) => `<table class="kural-tablo"><tr><th colspan="2">${bas}</th></tr>${l.map(([a, v]) => `<tr><td>${a}</td><td>${v}:1</td></tr>`).join('')}</table>`;
  const s = (b, m) => `<details class="kural-sss"><summary>${b}</summary><div>${m}</div></details>`;
  perdeAc(`<div style="font-size:20px;font-weight:800">Kurallar ve ödeme tablosu</div>
    <div class="kural-tablolar">${tablo('BET (oyna bahsi)', ana)}${tablo('EXPRESS (ilk 5 kart)', ex)}</div>
    <div class="kural-liste">
    ${s('Oyun nasıl başlar?', 'Herkes ante ve ante kadar express koyar. Herkese 5 açık kart, kasaya 5 kart (1 tanesi açık) dağıtılır. Dağıtımdan önce desteden 3 kart yakılır.')}
    ${s('Express ne zaman öder?', 'İlk 5 karta göre hemen öder; sonra ne olursa olsun geri alınmaz. As-Papaz-Kız elde çift olsa da öder. Daha yüksek bir express eli varsa yalnız o ödenir.')}
    ${s('Kart değiştirme ve 6. kart', 'Herkes sırayla karar verir: bir ya da birden çok kartı değiştirebilir ya da 6. kartı alabilir; bedeli 1 ante. Kartlar herkes karar verince sırayla dağıtılır, dağıtımdan önce 1 kart gömülür. Kart alan da kasanın oyunu olmazsa ante 1:1 alır.')}
    ${s('Oyna ya da pas', 'Oyna bahsi 2 ante. Pas diyen ante ve express\'i bırakır (express ödemesi zaten yapılmıştır).')}
    ${s('Kasanın oyunu', 'Kasa As-Papaz ya da daha iyi ele sahipse oyunu var. Oyunu yoksa oynayan oyuncu antesini 1:1 kazanır, bet\'i geri alır.')}
    ${s('Kasaya kart çektirmek', 'Kasanın oyunu yokken üçlü ve üstü eli olan oyuncuya sorulur: ante mi alırsın, kasaya kart mı çektirirsin? Çektirmenin bedeli yalnız ante kazancından vazgeçmektir. Kasa en yüksek kartını atar, bir kart gömer, sıradakini alır. Kasa yine boşsa ante ve bet geri gelir.')}
    ${s('Karşılaştırma', 'Kasanın oyunu varsa eller karşılaştırılır. Oyuncu kazanırsa bet ödeme tablosuna göre ödenir; ante ödenmez, yalnız iade edilir. Beraberlikte ante ve bet geri gelir. Gerçek döper (bir çift + As + Papaz) yalancı döperi (A-A-K ya da K-K-A) yener.')}
    ${s('İki kombinasyon', '6 kartla iki ayrı el çıkarsa ikisi birlikte ödenir (ör. kent + çift As = 5 kat). İkinci el ana elin kartlarından çıkamaz. Çift ve üstü elde ayrıca As ve Papaz varsa +1 ödenir.')}
    ${s('Sigorta', 'Bet\'i en az 4 kat ödeyen el, oynadıktan sonra sigorta yapabilir: en az oyna bahsi, en çok kazanılacak bet parasının yarısı. Kasanın ilk açılışta oyunu yoksa sigorta 1:1 öder, oyunu varsa sigorta kasanındır.')}
    ${s('Kasaya ve komşuya express', 'İstersen kendi express\'ine ek olarak kasanın ve sağındaki oyuncunun ilk 5 kartına da express kadar (1 ante) oynayabilirsin. O ellerde express eli gelirse ödemeyi sen alırsın; komşunun ödemesi hemen, kasanınki kasa açılınca yapılır. Seçim eller arasında değişir. Oyna parası kalmıyorsa o elde yan express oynanmaz.')}
    ${s('Mola ve para yükleme', 'Eller arasında oyuncu molaya çıkabilir; çipleri onda kalır ve bir sonraki dağıtımda geri döner. Para yükleme de yalnız eller arasında yapılır. Bir ele girmek için en az 4 ante gerekir.')}
    </div>
    <button class="btn-ana" id="kr-tamam">Kapat</button>`, k => { k.querySelector('#kr-tamam').onclick = perdeKapat; });
}

export function novoBagla() {
  krupiyeKur($('n-krupiye-kadin'));
  $('n-ses').onclick = () => { ses.acil(); ses.sesAyarla(!ses.sesAcikMi()); if (!ses.sesAcikMi()) konus.dur(); $('n-ses').textContent = ses.sesAcikMi() ? '🔊' : '🔇'; };
  $('n-geri').onclick = async () => {
    if (!geriAlinabilir() || mesgul) return;
    if (!(await onayla('Son hamle geri alınsın mı?', 'Geri al'))) return;
    N.g = JSON.parse(N.gecmis.pop()); N.geriAlindi = true; secimModu = false; secili.clear(); hata = ''; kurpiyeAyarla(eldekiKurpiye(N.g.elNo || 1));
    kaydet(); ciz();
  };
  $('n-menu').onclick = () => {
    perdeAc(`<div style="font-size:20px;font-weight:800">Novo masası</div>
      ${online && online.benim >= 0 ? '<button class="btn-ikincil" id="nm-ayarlarim">Ayarlarım ⚙ (express, otomatik, oyundan çık)</button>' : ''}
      <button class="btn-ikincil" id="nm-yukle">Para yükle</button>
      <button class="btn-ikincil" id="nm-konus">Seslendirme: ${konus.acikMi() ? 'Açık' : 'Kapalı'}</button>
      ${online && !online.sahipMi ? '' : `<button class="btn-ikincil" id="nm-masa">Masa: ${MASA_AD[masaSimdi()]} (değiştir)</button>`}
      <button class="btn-ikincil" id="nm-ortam">Casino uğultusu: ${ses.ortamAcikMi() ? 'Açık' : 'Kapalı'}</button>
      <button class="btn-ikincil" id="nm-kurallar">Kurallar ve ödeme tablosu</button>
      <button class="btn-ikincil" id="nm-cekmeler">Kasanın çektiği kartlar</button>
      <button class="btn-ikincil" id="nm-kutlama">Büyük bonus kutlamasını göster</button>
      ${online && !online.sahipMi ? '' : `<button class="btn-ikincil" id="nm-yeniden">Baştan başlat (herkese ${para(N.g.baslangicFis)})</button>`}
      ${online ? `<div class="ne" style="text-align:center">Masa kodu: <b>${kacis(online.kod || '')}</b></div>` : ''}
      ${online && online.sahipMi ? '<button class="btn-tehlike" id="nm-herkes">Masayı kapat (herkes için)</button>' : ''}
      <button class="btn-tehlike" id="nm-kapat">${online ? 'Masadan çık' : 'Masayı kapat'}</button>
      <button class="btn-ana" id="nm-tamam">Kapat</button>`, k => {
      k.querySelector('#nm-tamam').onclick = perdeKapat;
      if (k.querySelector('#nm-masa')) k.querySelector('#nm-masa').onclick = e => {
        const sira = Object.keys(MASA_AD), yeni = sira[(sira.indexOf(masaSimdi()) + 1) % sira.length];
        masaSec(yeni); e.target.textContent = `Masa: ${MASA_AD[yeni]} (değiştir)`;
      };
      k.querySelector('#nm-ortam').onclick = e => { ses.acil(); ses.ortamAyarla(!ses.ortamAcikMi()); e.target.textContent = 'Casino uğultusu: ' + (ses.ortamAcikMi() ? 'Açık' : 'Kapalı'); };
      k.querySelector('#nm-konus').onclick = e => { konus.ayarla(!konus.acikMi()); e.target.textContent = 'Seslendirme: ' + (konus.acikMi() ? 'Açık' : 'Kapalı'); if (konus.acikMi()) { konus.kilidiAc(); konus.soyle('seslendirme_acik'); } };
      k.querySelector('#nm-kurallar').onclick = kurallarAc;
      k.querySelector('#nm-cekmeler').onclick = () => {
        const liste = N.g.kasaCekmeleri || [];
        const kAd = c => (DEGER_AD[c.d] || String(c.d)) + RENK_SIMGE[c.r];
        const say = {};
        for (const c of liste) say[c.yeni.d] = (say[c.yeni.d] || 0) + 1;
        const sira = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
        perdeAc(`<div style="font-size:20px;font-weight:800">Kasanın çektiği kartlar</div>
          <div class="ne">${liste.length ? `Bu masada kasaya ${liste.length} kez kart çektirildi.` : 'Bu masada henüz kasaya kart çektirilmedi.'} Deste her elde baştan karıştırılır; kasa en yüksek kartını atar, bir kart gömer, sıradakini alır.</div>
          ${liste.length ? `<div class="dokum-satir">${sira.filter(d => say[d]).map(d => `<span><b>${DEGER_AD[d] || d}</b> ${say[d]}</span>`).join('')}</div>
          <div class="ne" style="font-size:13px">Son çekişler: ${liste.slice(-15).reverse().map(c => `${kAd(c.at)} attı → ${kAd(c.yeni)}`).join(' · ')}</div>` : ''}
          <button class="btn-ana" id="kc-tamam">Kapat</button>`, k2 => { k2.querySelector('#kc-tamam').onclick = perdeKapat; });
      };
      k.querySelector('#nm-kutlama').onclick = async () => {
        perdeKapat();
        if (mesgul) return;
        ses.acil(); konus.kilidiAc();
        // Önizleme: oyun durumu değişmez, yalnız 30 kat ve üstü express kutlaması oynar
        ruh('saskin', 1600); gala(true); havaiFisek();
        konus.soyle('tebrikler', 'bonus_odeme', konus.el('7'), konus.sayi(5000), 'dolar');
        ses.fis(8);
        await bekle(9000);
        if (!mesgul) gala(false);
      };
      k.querySelector('#nm-yukle').onclick = () => { perdeKapat(); if (!N.g.el || N.g.el.faz === 'bitti') yukleAc(); };
      if (online && !online.sahipMi) k.querySelector('#nm-yukle').remove();
      if (k.querySelector('#nm-yeniden')) k.querySelector('#nm-yeniden').onclick = async () => {
        perdeKapat();
        if (online) { if (await onayla(`Herkes yeniden ${para(N.g.baslangicFis)} ile başlasın mı?`, 'Başlat')) online.gonder({ tip: 'yeniden' }); return; }
        if (!(await onayla(`Herkes yeniden ${para(N.g.baslangicFis)} ile başlasın mı? Kasanın bu oyun sayacı sıfırlanır.`, 'Başlat'))) return;
        gecmiseAt(); N.g = novoYenidenBaslat(N.g); kaydet(); ciz();
      };
      if (k.querySelector('#nm-ayarlarim')) k.querySelector('#nm-ayarlarim').onclick = () => { perdeKapat(); benimAyar(); };
      if (k.querySelector('#nm-herkes')) k.querySelector('#nm-herkes').onclick = async () => {
        perdeKapat();
        if (await onayla('Masa herkes için kapatılsın mı? Oyun biter, herkes ana ekrana döner.', 'Kapat')) online.gonder({ tip: 'kapat' });
      };
      k.querySelector('#nm-kapat').onclick = async () => {
        perdeKapat();
        if (online) { if (await onayla('Masadan çıkılsın mı? Aynı kodla geri dönebilirsin.', 'Çık')) online.cik(); return; }
        if (!(await onayla('Novo masası silinsin mi?', 'Sil'))) return;
        try { localStorage.removeItem(ANAHTAR); } catch (e) {}
        N = null; ekranGoster('e-giris');
      };
    });
  };
  window.addEventListener('resize', () => { if (N && document.querySelector('#e-novo.etkin') && !mesgul) ciz(); });
}
