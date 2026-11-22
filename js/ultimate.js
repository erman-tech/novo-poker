// Ultimate Texas Hold'em: kasaya karşı Texas. Saf: her fonksiyon yeni durum döndürür.
// Giriş: ante + blind (ante kadar) + isteğe bağlı trips. Herkese 2 kart, kasaya 2 kapalı kart, 5 ortak kart.
// Kararlar sokak sokak ve eşzamanlı (herkes aynı anda karar verir):
//   preflop: kontrol ya da 4x / 3x ante bahis   flop: kontrol ya da 2x   river: 1x ya da pas
// Bahis yapan o elde bir daha karar vermez. Kasa en az bir çiftle "kalifiye" olur;
// olmazsa ante iade edilir. Kazanan oyuncu: play 1:1, ante 1:1 (kasa kalifiyeyse), blind tabloya göre.
import { rastgeleDeste, enIyiEl, gucKarsilastir } from './kart.js';

const klon = o => JSON.parse(JSON.stringify(o));

export const ULTIMATE_AZAMI_OYUNCU = 3;
export const ULTIMATE_ANTE_SECENEKLERI = [5, 10, 25, 50, 100];
// Kategori: 0 yüksek, 1 çift, 2 iki çift, 3 üçlü, 4 kent, 5 renk, 6 full, 7 kare, 8 renkli kent
export const BLIND_ODEME = { RF: 500, 8: 50, 7: 10, 6: 3, 5: 1.5, 4: 1 }; // kaça bir; kent altı iade
export const TRIPS_ODEME = { RF: 50, 8: 40, 7: 30, 6: 8, 5: 7, 4: 4, 3: 3 };
export const KARARLAR = { preflop: ['kontrol', 'bet4', 'bet3'], flop: ['kontrol', 'bet2'], river: ['bet1', 'pas'] };
export const KAT = { bet4: 4, bet3: 3, bet2: 2, bet1: 1 };
// Süre dolunca: preflop ve flop'ta kontrol, river'da pas.
export const VARSAYILAN_KARAR = { preflop: 'kontrol', flop: 'kontrol', river: 'pas' };
export const EL_ADLARI = ['Yüksek kart', 'Bir çift', 'İki çift', 'Üçlü', 'Kent', 'Renk', 'Full', 'Kare', 'Renkli kent'];

export function elAnahtari(guc) { return guc[0] === 8 && guc[1] === 14 ? 'RF' : guc[0]; }
export function elAdi(guc) { return guc[0] === 8 && guc[1] === 14 ? 'Royal flush' : EL_ADLARI[guc[0]]; }

export function yeniUltimate({ adlar, kod, baslangicFis = 1000, ante = 25 }) {
  if (!ULTIMATE_ANTE_SECENEKLERI.includes(ante)) throw new Error('Geçersiz ante');
  return {
    tur: 'ultimate', kod, ante, baslangicFis, elNo: 0, oyunNo: 1, kasaNet: 0, kasaToplam: 0, el: null,
    oyuncular: adlar.map(ad => ({ ad, fis: baslangicFis, giris: baslangicFis, mola: false, trips: false })),
  };
}

// Ele girmek için: ante + blind + en büyük bahis (4 ante) = 6 ante (+ trips açıksa 1 ante)
export function gereken(g, i) { return 6 * g.ante + (g.oyuncular[i].trips ? g.ante : 0); }
export function katilabilir(g, i) { return !g.oyuncular[i].mola && g.oyuncular[i].fis >= gereken(g, i); }

export function ultimateMola(g0, i, mola) {
  const g = klon(g0);
  if (g.el && g.el.faz !== 'bitti') throw new Error('El bitince değiştirilebilir');
  g.oyuncular[i].mola = !!mola;
  return g;
}
export function tripsAyarla(g0, i, acik) {
  const g = klon(g0);
  if (g.el && g.el.faz !== 'bitti') throw new Error('Trips el bitince değiştirilir');
  g.oyuncular[i].trips = !!acik;
  return g;
}
export function ultimateYukle(g0, i, miktar) {
  const g = klon(g0);
  const m = Math.floor(Number(miktar));
  if (!(m > 0) || m > 100000) throw new Error('Geçersiz tutar');
  if (g.el && g.el.faz !== 'bitti') throw new Error('Para el bitince yüklenir');
  g.oyuncular[i].fis += m; g.oyuncular[i].giris += m;
  return g;
}
export function ultimateYenidenBaslat(g0) {
  const g = klon(g0);
  g.oyuncular.forEach(o => { o.fis = g.baslangicFis; o.giris = g.baslangicFis; o.mola = false; });
  g.el = null; g.kasaNet = 0; g.oyunNo += 1;
  return g;
}

// Deste düzeni: koltuk i: 2i, 2i+1 · kasa 6,7 · ortak 8..12
export function ultimateDagit(g0, desteVerilen = null) {
  const g = klon(g0);
  if (g.el && g.el.faz !== 'bitti') throw new Error('El sürüyor');
  const katilan = g.oyuncular.map((o, i) => i).filter(i => katilabilir(g, i));
  if (!katilan.length) throw new Error('Ele girecek oyuncu yok');
  g.elNo += 1;
  const deste = desteVerilen || rastgeleDeste();
  const A = g.ante;
  g.el = {
    no: g.elNo, faz: 'preflop', ante: A, deste, acikOrtak: 0,
    krupiye: deste.slice(6, 8), ortak: deste.slice(8, 13), krupiyeAcik: false,
    oyuncular: g.oyuncular.map((o, i) => {
      if (!katilan.includes(i)) return { katildi: false };
      const trips = o.trips ? A : 0;
      o.fis -= 2 * A + trips;
      return { katildi: true, kartlar: deste.slice(2 * i, 2 * i + 2), ante: A, blind: A, trips, play: 0, durum: 'bekliyor', karar: null, sonuc: null };
    }),
  };
  return g;
}

// Bu sokakta karar bekleyen oyuncular
export function bekleyenler(g) {
  const el = g.el;
  if (!el || !KARARLAR[el.faz]) return [];
  return el.oyuncular.map((p, i) => i).filter(i => { const p = el.oyuncular[i]; return p.katildi && p.durum === 'bekliyor' && !p.karar; });
}

// Bir oyuncunun kararı (eşzamanlı). Hepsi karar verince sokak ilerler.
export function ultimateKarar(g0, i, secim) {
  const g = klon(g0);
  const el = g.el;
  if (!el || !KARARLAR[el.faz]) throw new Error('Şu an karar beklenmiyor');
  const p = el.oyuncular[i];
  if (!p || !p.katildi) throw new Error('Bu elde değilsin');
  if (p.durum !== 'bekliyor' || p.karar) throw new Error('Kararını verdin');
  if (!KARARLAR[el.faz].includes(secim)) throw new Error('Geçersiz karar');
  const o = g.oyuncular[i];
  if (KAT[secim]) {
    const m = KAT[secim] * el.ante;
    if (o.fis < m) throw new Error('Bahis için yeterli fiş yok');
    o.fis -= m; p.play = m; p.durum = 'oynadi'; p.karar = secim; p.bahisSokak = el.faz;
  } else if (secim === 'pas') {
    p.durum = 'pas'; p.karar = 'pas';
  } else {
    p.karar = 'kontrol';
  }
  if (!bekleyenler(g).length) sokakIlerle(g);
  return g;
}

function sokakIlerle(g) {
  const el = g.el;
  // Kontrol edenlerin kararı bir sonraki sokakta sıfırlanır
  const kalan = () => el.oyuncular.some(p => p.katildi && p.durum === 'bekliyor');
  if (el.faz === 'preflop' && kalan()) { el.faz = 'flop'; el.acikOrtak = 3; }
  else if (el.faz === 'flop' && kalan()) { el.faz = 'river'; el.acikOrtak = 5; }
  else { el.acikOrtak = 5; return bitir(g); }
  el.oyuncular.forEach(p => { if (p.katildi && p.durum === 'bekliyor') p.karar = null; });
}

// Süre dolumu: bekleyen herkese varsayılan karar
export function ultimateZamanAsimi(g0) {
  let g = klon(g0);
  const faz = g.el && g.el.faz;
  for (const i of bekleyenler(g)) g = ultimateKarar(g, i, VARSAYILAN_KARAR[faz]);
  return g;
}

function bitir(g) {
  const el = g.el;
  el.faz = 'bitti'; el.krupiyeAcik = true;
  const k = enIyiEl([...el.krupiye, ...el.ortak]);
  el.krupiyeEl = elAdi(k.guc);
  el.kalifiye = k.guc[0] >= 1;
  let oyuncuNet = 0;
  el.oyuncular.forEach((p, i) => {
    if (!p.katildi) return;
    const o = g.oyuncular[i];
    const e = enIyiEl([...p.kartlar, ...el.ortak]);
    const an = elAnahtari(e.guc);
    p.elAdi = elAdi(e.guc);
    const kalem = [];
    let geri = 0;
    // Trips: elin kendisine göre, kasadan bağımsız
    if (p.trips) {
      const kat = TRIPS_ODEME[an] || 0;
      if (kat) { geri += p.trips * (kat + 1); kalem.push({ yazi: `Trips ${p.elAdi} ${kat}:1`, tutar: p.trips * kat }); }
      else kalem.push({ yazi: 'Trips', tutar: -p.trips });
    }
    if (p.durum === 'pas') {
      p.sonuc = { tip: 'pas' };
      kalem.push({ yazi: 'Pas: ante ve blind', tutar: -(p.ante + p.blind) });
    } else {
      const c = gucKarsilastir(e.guc, k.guc);
      if (c > 0) {
        p.sonuc = { tip: 'kazandi' };
        geri += 2 * p.play; kalem.push({ yazi: `Play ${p.play / el.ante}x 1:1`, tutar: p.play });
        if (el.kalifiye) { geri += 2 * p.ante; kalem.push({ yazi: 'Ante 1:1', tutar: p.ante }); }
        else { geri += p.ante; kalem.push({ yazi: 'Ante iade (kasa kalifiye değil)', tutar: 0 }); }
        const bk = BLIND_ODEME[an];
        if (bk) { const od = Math.floor(p.blind * bk); geri += p.blind + od; kalem.push({ yazi: `Blind ${p.elAdi} ${bk === 1.5 ? '3:2' : bk + ':1'}`, tutar: od }); }
        else { geri += p.blind; kalem.push({ yazi: 'Blind iade', tutar: 0 }); }
      } else if (c === 0) {
        p.sonuc = { tip: 'berabere' };
        geri += p.play + p.ante + p.blind;
        kalem.push({ yazi: 'Berabere: hepsi iade', tutar: 0 });
      } else {
        p.sonuc = { tip: 'kaybetti' };
        kalem.push({ yazi: `Play ${p.play / el.ante}x`, tutar: -p.play });
        kalem.push({ yazi: 'Blind', tutar: -p.blind });
        if (el.kalifiye) kalem.push({ yazi: 'Ante', tutar: -p.ante });
        else { geri += p.ante; kalem.push({ yazi: 'Ante iade (kasa kalifiye değil)', tutar: 0 }); }
      }
    }
    o.fis += geri;
    p.geri = geri;
    p.odemeler = kalem;
    p.net = geri - (p.ante + p.blind + p.trips + p.play);
    oyuncuNet += p.net;
  });
  el.kasaNet = -oyuncuNet;
  g.kasaNet = (g.kasaNet || 0) - oyuncuNet;
  g.kasaToplam = (g.kasaToplam || 0) - oyuncuNet;
  return g;
}
