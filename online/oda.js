// Online Novo masası: sunucu tarafı oyun odası (saf mantık, ağ yok).
// Cloudflare Durable Object (online/worker.js) ve yerel deneme sunucusu (online/yerel.mjs)
// aynı dosyayı kullanır. Deste ve kasanın kapalı kartları yalnız burada durur; istemcilere
// giden görünümde yoktur, yani kimse telefonundan kasanın elini ya da sıradaki kartı göremez.
import {
  yeniNovo, yanAyarla, novoDagit, novoHamle, novoYasal, oyunSatinAl, novoYenidenBaslat, paraYukle, molaAyarla,
  NOVO_AZAMI_OYUNCU, ANTE_SECENEKLERI,
} from '../js/novo.js';
import {
  yeniUltimate, ultimateDagit, ultimateKarar, ultimateZamanAsimi, ultimateMola, tripsAyarla, ultimateYukle,
  ultimateYenidenBaslat, bekleyenler, gereken, ULTIMATE_AZAMI_OYUNCU,
} from '../js/ultimate.js';

export const OYUNLAR = ['novo', 'ultimate'];
const AZAMI = { novo: NOVO_AZAMI_OYUNCU, ultimate: ULTIMATE_AZAMI_OYUNCU };
// Oyuna göre motor işlevleri
const MOTOR = {
  novo: { yeni: yeniNovo, dagit: novoDagit, mola: molaAyarla, yukle: paraYukle, yeniden: novoYenidenBaslat, gereken: g => 4 * g.ante },
  ultimate: { yeni: yeniUltimate, dagit: ultimateDagit, mola: ultimateMola, yukle: ultimateYukle, yeniden: ultimateYenidenBaslat, gereken },
};
const motor = oda => MOTOR[oda.oyun || 'novo'];

const klon = o => JSON.parse(JSON.stringify(o));
export const AD_AZAMI = 16;

// Geri sayımlar (ms). Kimse beklemesin diye her karar süreyle sınırlı; süre dolunca
// varsayılan hamle yapılır. Dağıtım ve kart dağıtma animasyonu telefonlarda sürerken
// karar süresi başlamasın diye o süre eklenir.
export const SURE = {
  hazir: 5000,          // biri "hazırım" deyince el bu kadar sonra dağıtılır
  karar: 10000,         // kart çekme, oyna/pas, sigorta, kasaya kart çektirme (Erman 22 Kas: 5 sn hızlı, 10 sn olsun)
  dagitimPayi: 22000,
  dagitimPayiUltimate: 9000, // Ultimate dağıtımı (2 kart + kasa) daha kısa
  sokakPayi: 3000,           // flop / river açılışı   // dağıtım + express animasyonu (telefonda ölçüldü ~20 sn)
  cekmePayi: 4000,      // çekilen kartların dağıtılması
  otoKarar: 10000,       // otomatik oynayan oyuncunun karar süresi (dolunca kontrol, son kararda pas)
  sonucPayi: 4000,      // el bitince sonuç görünsün diye otomatik dağıtım bu kadar daha bekler
};
// Süre dolunca yapılan hamle: kart çekmez, oyuna girmez, sigorta yapmaz, ante'yi alır.
export const VARSAYILAN = { cekme: 'gec', karar: 'pas' };

export function yeniOda(kod) {
  return { kod, oyun: 'novo', koltuklar: [], bekleyen: [], izleyenler: [], sahip: null, g: null, ayar: { baslangicFis: BASLANGIC_FIS, ante: 25 }, secimler: {}, hazir: {}, oto: {}, sayac: null, misafirNo: 100, rev: 0 };
}

// Online masada herkes $1.000 ile başlar; para biten, masayı açan yüklemezse oynayamaz.
export const BASLANGIC_FIS = 1000;

// Ad girilmezse Guest101, Guest102 … (masa içinde sırayla)
export function adTemizle(ad) {
  return String(ad || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, AD_AZAMI);
}
function misafirAdi(oda) {
  const kullanilan = new Set(oda.koltuklar.map(k => k.ad));
  let ad;
  do { oda.misafirNo += 1; ad = 'Guest' + oda.misafirNo; } while (kullanilan.has(ad));
  return ad;
}

export function koltugu(oda, id) { return oda.koltuklar.findIndex(k => k.id === id); }

const araDaMi = g => !g.el || g.el.faz === 'bitti';

// Oyun sürerken gelen oyuncuyu masaya oturtur (yalnız el aradayken çağrılır).
function oturt(oda, { id, ad }) {
  const g = oda.g, i = g.oyuncular.length;
  oda.koltuklar.push({ id, ad });
  const fis = g.baslangicFis;
  g.oyuncular.push(oda.oyun === 'ultimate' ? { ad, fis, giris: fis, mola: false, trips: false } : { ad, koltuk: i, fis });
  if (g.el && g.el.oyuncular) g.el.oyuncular.push({ katildi: false });
}
// El bitince bekleyenleri oturtur. Değişiklik olduysa true.
export function bekleyenleriOturt(oda) {
  if (oda.g && araDaMi(oda.g) && oda.yenidenIstek) {
    oda.yenidenIstek = false; oda.hazir = {}; oda.molaIstek = {};
    oda.g = motor(oda).yeniden(oda.g);
    bekleyenleriOturt(oda);
    return true;
  }
  const g = oda.g;
  if (g && araDaMi(g) && oda.molaIstek && Object.keys(oda.molaIstek).length) {
    for (const k of Object.keys(oda.molaIstek)) {
      const j = Number(k);
      if (g.oyuncular[j]) { oda.g = motor(oda).mola(oda.g, j, true); if (oda.hazir) delete oda.hazir[j]; if (oda.oto) delete oda.oto[j]; }
    }
    oda.molaIstek = {};
    return bekleyenleriOturt(oda) || true;
  }
  if (!g || !araDaMi(g) || !(oda.bekleyen && oda.bekleyen.length)) return false;
  const yer = AZAMI[oda.oyun] - oda.koltuklar.length;
  const gelen = oda.bekleyen.splice(0, Math.max(0, yer));
  gelen.forEach(b => oturt(oda, b));
  for (const b of oda.bekleyen) if (!oda.izleyenler.includes(b.id)) oda.izleyenler.push(b.id);
  oda.bekleyen = [];
  return gelen.length > 0;
}

// Bir istemcinin isteğini uygular. Dönüş: { olay } (yayınlanacak animasyon ipucu) ya da { hata }.
export function islem(oda, id, m) {
  const i = koltugu(oda, id);
  const g = oda.g;
  try {
    switch (m && m.tip) {
      case 'katil': {
        if (i >= 0) { const ad = adTemizle(m.ad); if (ad) adDegistir(oda, i, ad); return { olay: { tip: 'katil', koltuk: i } }; }
        if (g) {
          // Oyun başladıysa ve masada yer varsa: el aradaysa hemen oturur, el sürüyorsa el bitince.
          oda.bekleyen = oda.bekleyen || [];
          if (oda.bekleyen.some(b => b.id === id)) return { hata: 'El sürüyor; bu el bitince masaya oturacaksın.' };
          if (oda.koltuklar.length + oda.bekleyen.length >= AZAMI[oda.oyun]) {
            if (!oda.izleyenler.includes(id)) oda.izleyenler.push(id);
            return { hata: `Masa dolu (en çok ${AZAMI[oda.oyun]} oyuncu); izleyici olarak bağlandın.` };
          }
          let ad = adTemizle(m.ad);
          const adlar = [...oda.koltuklar, ...oda.bekleyen].map(k => k.ad.toLocaleLowerCase('tr'));
          if (ad && adlar.includes(ad.toLocaleLowerCase('tr'))) return { hata: 'Bu ad masada var, başka bir ad yaz.' };
          if (!ad) ad = misafirAdi(oda);
          oda.izleyenler = oda.izleyenler.filter(x => x !== id);
          if (araDaMi(g)) { oturt(oda, { id, ad }); return { olay: { tip: 'katil', koltuk: oda.koltuklar.length - 1 } }; }
          oda.bekleyen.push({ id, ad });
          return { hata: 'El sürüyor; bu el bitince masaya oturacaksın.' };
        }
        if (!oda.koltuklar.length && OYUNLAR.includes(m.oyun)) oda.oyun = m.oyun; // masayı açan oyunu seçer
        if (oda.koltuklar.length >= AZAMI[oda.oyun]) return { hata: `Masa dolu (en çok ${AZAMI[oda.oyun]} oyuncu).` };
        let ad = adTemizle(m.ad);
        if (ad && oda.koltuklar.some(k => k.ad.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr'))) return { hata: 'Bu ad masada var, başka bir ad yaz.' };
        if (!ad) ad = misafirAdi(oda);
        oda.koltuklar.push({ id, ad });
        if (!oda.sahip) oda.sahip = id;
        return { olay: { tip: 'katil', koltuk: oda.koltuklar.length - 1 } };
      }
      case 'ad': {
        if (i < 0) return { hata: 'Masada değilsin.' };
        const ad = adTemizle(m.ad);
        if (!ad) return { hata: 'Ad boş olamaz.' };
        if (oda.koltuklar.some((k, j) => j !== i && k.ad.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr'))) return { hata: 'Bu ad masada var.' };
        adDegistir(oda, i, ad);
        return { olay: { tip: 'ad', koltuk: i } };
      }
      case 'ayril': {
        if (i < 0) { oda.bekleyen = (oda.bekleyen || []).filter(b => b.id !== id); return {}; }
        if (g) return { hata: 'Oyun sürerken masadan kalkılamaz; molaya çıkabilirsin.' };
        oda.koltuklar.splice(i, 1);
        if (oda.sahip === id) oda.sahip = oda.koltuklar[0] ? oda.koltuklar[0].id : null;
        return { olay: { tip: 'ayril' } };
      }
      case 'ayar': {
        if (id !== oda.sahip) return { hata: 'Ayarları masayı açan değiştirir.' };
        if (g) return { hata: 'Oyun başladıktan sonra ayar değişmez.' };
        const a = Number(m.ante);
        if (a && ANTE_SECENEKLERI.includes(a)) oda.ayar.ante = a;
        return { olay: { tip: 'ayar' } };
      }
      case 'basla': {
        if (id !== oda.sahip) return { hata: 'Oyunu masayı açan başlatır.' };
        if (g) return { hata: 'Oyun zaten başladı.' };
        if (!oda.koltuklar.length) return { hata: 'Masada oyuncu yok.' };
        oda.g = motor(oda).yeni({ adlar: oda.koltuklar.map(k => k.ad), kod: oda.kod, baslangicFis: oda.ayar.baslangicFis, ante: oda.ayar.ante });
        return { olay: { tip: 'basla' } };
      }
      case 'dagit':
      case 'hazir': {
        // Herkes kendi adına "hazırım" der; herkes hazır olunca hemen, değilse geri sayımla dağıtılır.
        // Basmayan da ele girer (molada değilse).
        if (!g) return { hata: 'Oyun başlamadı.' };
        if (i < 0) return { hata: 'İzleyici oyuna giremez.' };
        if (!araDaMi(g)) return { hata: 'El sürüyor.' };
        if (m.iptal) {
          // Geri sayımda vazgeçme: hazır ve otomatik oynama kapanır.
          if (oda.hazir) delete oda.hazir[i];
          if (oda.oto) delete oda.oto[i];
          return { olay: { tip: 'hazir', koltuk: i, iptal: true } };
        }
        // Moladaki oyuncu "ele gir" derse masaya döner.
        if (g.oyuncular[i].mola) { oda.g = motor(oda).mola(g, i, false); return islem(oda, id, m); }
        const ger = motor(oda).gereken;
        if (g.oyuncular[i].fis < ger(g, i)) return { hata: 'Paran girişe yetmiyor.' };
        oda.hazir = { ...(oda.hazir || {}), [i]: true };
        const aday = g.oyuncular.map((o, j) => j).filter(j => !g.oyuncular[j].mola && g.oyuncular[j].fis >= ger(g, j));
        if (aday.every(j => oda.hazir[j])) return hazirDagit(oda);
        return { olay: { tip: 'hazir', koltuk: i } };
      }
      case 'hamle': {
        if (!g || !g.el) return { hata: 'El yok.' };
        if (oda.oyun === 'ultimate') {
          if (i < 0) return { hata: 'İzleyici karar veremez.' };
          const secim = m.hamle && m.hamle.secim;
          oda.g = ultimateKarar(g, i, secim);
          return { olay: { tip: 'karar', koltuk: i, secim, faz: g.el.faz } };
        }
        const y = novoYasal(g);
        if (!y) return { hata: 'Şu an karar beklenmiyor.' };
        if (y.oyuncu !== i) return { hata: 'Sıra sende değil.' };
        const h = m.hamle || {};
        if (!['pas', 'gec', 'oyna', 'degistir', 'alti', 'sigorta'].includes(h.tip)) return { hata: 'Bilinmeyen hamle.' };
        const temiz = { tip: h.tip };
        if (h.tip === 'degistir') temiz.konumlar = (h.konumlar || []).map(Number);
        if (h.tip === 'sigorta') temiz.miktar = Number(h.miktar) || 0;
        if (h.tip === 'gec' && h.oyna) temiz.oyna = true; // "çekmiyorum, oyna": sırası gelince tekrar sorulmadan oynar
        oda.g = novoHamle(g, temiz);
        return { olay: { tip: h.tip, koltuk: i } };
      }
      case 'trips': {
        if (oda.oyun !== 'ultimate' || !g || i < 0) return { hata: 'Trips yalnız Ultimate\'te.' };
        oda.g = tripsAyarla(g, i, !!m.acik);
        return { olay: { tip: 'trips', koltuk: i } };
      }
      case 'satinal': {
        if (oda.oyun !== 'novo') return { hata: 'Bilinmeyen istek.' };
        if (!g || !g.el || g.el.faz !== 'oyunsuz') return { hata: 'Şu an kasaya kart çektirme sorulmuyor.' };
        const p = g.el.oyuncular[i];
        if (!p || p.satinAldi !== null || p.durum !== 'oynadi') return { hata: 'Bu soru sana sorulmadı.' };
        oda.secimler[i] = !!m.al;
        const bekleyen = g.el.oyuncular.map((q, j) => j).filter(j => {
          const q = g.el.oyuncular[j];
          return q.katildi && q.durum === 'oynadi' && q.satinAldi === null;
        });
        if (bekleyen.every(j => j in oda.secimler)) {
          oda.g = oyunSatinAl(g, oda.secimler);
          oda.secimler = {};
          return { olay: { tip: 'satinal' } };
        }
        return { olay: { tip: 'secim', koltuk: i } };
      }
      case 'oto': {
        // Otomatik oyna: parası yettikçe her ele kendiliğinden girer. Kararlar yine oyuncunun;
        // karar vermezse 5 sn sonra kontrol, son kararda pas.
        if (!g) return { hata: 'Oyun başlamadı.' };
        if (i < 0) return { hata: 'İzleyici otomatik oynayamaz.' };
        oda.oto = oda.oto || {};
        if (m.acik) {
          oda.oto[i] = true;
          if (araDaMi(g) && g.oyuncular[i].fis >= motor(oda).gereken(g, i)) oda.hazir = { ...(oda.hazir || {}), [i]: true };
        } else {
          delete oda.oto[i];
          if (araDaMi(g) && oda.hazir) delete oda.hazir[i];
        }
        return { olay: { tip: 'oto', koltuk: i, acik: !!m.acik } };
      }
      case 'yan': {
        // Kasaya ve komşuya express (1 ante): eller arasında, sonraki elde geçerli. Yalnız Novo.
        if (!g || i < 0) return { hata: 'Oyun başlamadı.' };
        if (oda.oyun === 'ultimate') return { hata: 'Yan express yalnız Novo masasında.' };
        if (!araDaMi(g)) return { hata: 'El bitince değiştirilebilir.' };
        const yan = {};
        if ('kasa' in m) yan.kasa = !!m.kasa;
        if ('komsu' in m) yan.komsu = !!m.komsu;
        oda.g = yanAyarla(g, i, yan);
        return { olay: { tip: 'yan', koltuk: i } };
      }
      case 'mola': {
        if (!g || i < 0) return { hata: 'Oyun başlamadı.' };
        // El sürerken mola isteği el bitince uygulanır (oyuncu o eli bitirir ya da süre dolunca pas geçer).
        if (!araDaMi(g)) {
          oda.molaIstek = { ...(oda.molaIstek || {}) };
          if (m.mola) oda.molaIstek[i] = true; else delete oda.molaIstek[i];
          if (m.mola && oda.oto) delete oda.oto[i];
          return { olay: { tip: 'mola', koltuk: i, bekliyor: true } };
        }
        if (oda.molaIstek) delete oda.molaIstek[i];
        oda.g = motor(oda).mola(g, i, !!m.mola);
        if (m.mola && oda.hazir) delete oda.hazir[i];
        if (m.mola && oda.oto) delete oda.oto[i];
        return { olay: { tip: 'mola', koltuk: i } };
      }
      case 'yukle': {
        // Para yalnız masayı açan yükler (kendine ya da başkasına); ötekiler yalnız kendi kararlarını verir.
        if (!g) return { hata: 'Oyun başlamadı.' };
        if (id !== oda.sahip) return { hata: 'Para yalnız masayı açan yükleyebilir.' };
        const kim = Number.isInteger(Number(m.koltuk)) ? Number(m.koltuk) : i;
        if (!g.oyuncular[kim]) return { hata: 'Oyuncu yok.' };
        oda.g = motor(oda).yukle(g, kim, Number(m.miktar));
        return { olay: { tip: 'yukle', koltuk: kim } };
      }
      case 'yeniden': {
        if (id !== oda.sahip) return { hata: 'Baştan başlatmayı masayı açan yapar.' };
        if (!g) return { hata: 'Oyun başlamadı.' };
        // El sürerken istenirse el bitince baştan başlar (Erman 22 Kas: "çalışmıyor" gibi görünüyordu).
        if (!araDaMi(g)) { oda.yenidenIstek = true; return { olay: { tip: 'yenidenIstek' }, hata: 'El sürüyor; el bitince masa baştan başlayacak.' }; }
        oda.hazir = {};
        oda.g = motor(oda).yeniden(g);
        return { olay: { tip: 'yeniden' } };
      }
      default: return { hata: 'Bilinmeyen istek.' };
    }
  } catch (e) {
    return { hata: e.message || String(e) };
  }
}

// Hazır olanlarla eli dağıt: hazır olmayan o eli dışarıda (molada) geçirir.
function hazirDagit(oda) {
  let g = oda.g;
  const mt = motor(oda);
  // Molada olmayan ve parası yeten herkes ele girer; "hazırım" yalnız beklemeyi kısaltır
  // (Erman 22 Kas: basmayan ele giremiyordu). Oynamak istemeyen "Molaya çık" der.
  oda.g = mt.dagit(g);
  oda.hazir = {};
  oda.secimler = {};
  return { olay: { tip: 'dagit' } };
}

// Şu anki karar ya da bekleme için geri sayımı kurar. Aynı karar sürerken süre yenilenmez.
export function sayacKur(oda, simdi, olay = null) {
  const g = oda.g;
  let tip = null, anahtar = null, sure = 0;
  if (g && araDaMi(g)) {
    if (Object.keys(oda.hazir || {}).length) { tip = 'hazir'; anahtar = 'h' + (g.el ? g.el.no : 0); sure = SURE.hazir; }
  } else if (g && oda.oyun === 'ultimate') {
    if (bekleyenler(g).length) { tip = 'ukarar'; anahtar = `${g.el.no}:${g.el.faz}`; sure = SURE.karar; }
  } else if (g && g.el.faz === 'oyunsuz') {
    tip = 'oyunsuz'; anahtar = 'o' + g.el.no; sure = SURE.karar;
  } else if (g && g.el) {
    const y = novoYasal(g);
    if (y) { tip = 'sigorta' in y ? 'sigorta' : y.asama; anahtar = `${g.el.no}:${tip}:${y.oyuncu}`; sure = SURE.karar; }
  }
  if (!tip) { oda.sayac = null; return; }
  if (oda.sayac && oda.sayac.anahtar === anahtar) return;
  const oto = oda.oto || {};
  const koltuk = ['cekme', 'karar', 'sigorta'].includes(tip) ? novoYasal(g).oyuncu : null;
  // Otomatik oynayan oyuncu 5 sn içinde karar vermezse varsayılan karar verilir.
  if (tip !== 'hazir') {
    const kimler = tip === 'ukarar' ? bekleyenler(g) : tip === 'oyunsuz'
      ? g.el.oyuncular.map((p, j) => j).filter(j => { const p = g.el.oyuncular[j]; return p.katildi && p.durum === 'oynadi' && p.satinAldi === null; })
      : [koltuk];
    if (kimler.length && kimler.every(j => oto[j])) sure = SURE.otoKarar;
  }
  let pay = 0;
  if (olay && olay.tip === 'dagit') pay = oda.oyun === 'ultimate' ? SURE.dagitimPayiUltimate : SURE.dagitimPayi;
  else if (oda.oyun === 'ultimate' && olay && olay.tip === 'karar') pay = SURE.sokakPayi;
  else if (olay && tip === 'karar' && ['gec', 'degistir', 'alti', 'pas'].includes(olay.tip) && !(oda.sayac && oda.sayac.tip === 'karar')) pay = SURE.cekmePayi;
  // El bitiminde otomatik oyuncular hazır sayıldıysa sonuç önce görünsün
  if (tip === 'hazir' && olay && olay.tip !== 'hazir' && olay.tip !== 'oto') pay = SURE.sonucPayi;
  oda.sayac = { tip, anahtar, bitis: simdi + pay + sure, sure, koltuk };
}

// Süre dolduysa varsayılan hamleyi yapar. Dönüş: islem gibi { olay } ya da {}.
export function zamanAsimi(oda, simdi) {
  const s = oda.sayac, g = oda.g;
  if (!s || !g || simdi < s.bitis - 50) return {};
  oda.sayac = null;
  try {
    if (s.tip === 'hazir') {
      if (!araDaMi(g) || !Object.keys(oda.hazir || {}).length) return {};
      return hazirDagit(oda);
    }
    if (s.tip === 'ukarar') {
      if (!bekleyenler(g).length) return {};
      oda.g = ultimateZamanAsimi(g);
      return { olay: { tip: 'karar', sure: true, faz: g.el.faz } };
    }
    if (s.tip === 'oyunsuz') {
      if (g.el.faz !== 'oyunsuz') return {};
      const sec = { ...oda.secimler };
      g.el.oyuncular.forEach((p, j) => { if (p.katildi && p.durum === 'oynadi' && p.satinAldi === null && !(j in sec)) sec[j] = false; });
      oda.g = oyunSatinAl(g, sec);
      oda.secimler = {};
      return { olay: { tip: 'satinal', sure: true } };
    }
    const y = novoYasal(g);
    if (!y) return {};
    const h = 'sigorta' in y ? { tip: 'sigorta', miktar: 0 } : { tip: VARSAYILAN[y.asama] || 'pas' };
    oda.g = novoHamle(g, h);
    return { olay: { tip: h.tip, koltuk: y.oyuncu, sure: true } };
  } catch (e) {
    return {};
  }
}

// Sunucuların çağırdığı iki giriş: istek ve süre dolumu. İkisi de değişiklik olduysa sürümü
// artırır ve geri sayımı yeniden kurar; sunucu sonra herkese durumu yollar ve oda.sayac.bitis'e kurar.
export function isle(oda, id, m, simdi = Date.now()) {
  const s = islem(oda, id, m);
  if (bekleyenleriOturt(oda) && !s.olay) s.olay = { tip: 'katil' };
  if (s.olay) { otoHazirla(oda); oda.rev += 1; sayacKur(oda, simdi, s.olay); }
  return s;
}
export function sureDoldu(oda, simdi = Date.now()) {
  const s = zamanAsimi(oda, simdi);
  if (bekleyenleriOturt(oda) && !s.olay) s.olay = { tip: 'katil' };
  if (s.olay) { otoHazirla(oda); oda.rev += 1; sayacKur(oda, simdi, s.olay); }
  return s;
}

// El aralarında otomatik oynayan ve parası yeten herkes hazır sayılır (5 sn içinde iptal edebilir).
// Parası yetmeyenin otomatiği kapanır.
export function otoHazirla(oda) {
  const g = oda.g;
  if (!g || !araDaMi(g) || !oda.oto) return;
  const ger = motor(oda).gereken;
  for (const k of Object.keys(oda.oto)) {
    const j = Number(k);
    if (!g.oyuncular[j]) { delete oda.oto[k]; continue; }
    if (g.oyuncular[j].fis < ger(g, j)) { delete oda.oto[k]; continue; }
    if (!(oda.hazir && oda.hazir[j])) oda.hazir = { ...(oda.hazir || {}), [j]: true };
  }
}

function adDegistir(oda, i, ad) {
  oda.koltuklar[i].ad = ad;
  if (oda.g && oda.g.oyuncular[i]) oda.g.oyuncular[i].ad = ad;
}

// İstemciye giden görünüm: deste ve kasanın kapalı kartları çıkarılır.
// ben: bakan oyuncunun koltuğu. Ultimate'ta el bitene kadar başkalarının kartları gizlidir.
export function gizle(g, ben = -1) {
  if (!g) return null;
  const v = klon(g);
  if (v.el && v.tur === 'ultimate') {
    delete v.el.deste;
    if (!v.el.krupiyeAcik) v.el.krupiye = [null, null];
    v.el.ortak = v.el.ortak.map((k, j) => (j < v.el.acikOrtak ? k : null));
    if (v.el.faz !== 'bitti') v.el.oyuncular.forEach((p, i) => { if (i !== ben && p.kartlar) p.kartlar = [null, null]; });
    return v;
  }
  if (v.el) {
    delete v.el.deste;
    if (!v.el.krupiyeAcik) v.el.krupiye = v.el.krupiye.map((k, j) => (j === 4 ? k : null));
  }
  return v;
}

export function gorunum(oda, id, olay = null) {
  return {
    tip: 'durum', rev: oda.rev, kod: oda.kod, oyun: oda.oyun || 'novo',
    koltuklar: oda.koltuklar.map(k => ({ ad: k.ad })),
    benim: koltugu(oda, id), molaIstek: !!(oda.molaIstek && oda.molaIstek[koltugu(oda, id)]), bekliyor: (oda.bekleyen || []).some(b => b.id === id), sahipMi: oda.sahip === id, ayar: oda.ayar,
    secimler: oda.secimler, hazir: oda.hazir || {}, oto: oda.oto || {}, g: gizle(oda.g, koltugu(oda, id)), olay,
    sayac: oda.sayac ? { tip: oda.sayac.tip, koltuk: oda.sayac.koltuk, kalan: Math.max(0, oda.sayac.bitis - Date.now()), toplam: oda.sayac.sure || (oda.sayac.tip === 'hazir' ? SURE.hazir : SURE.karar) } : null,
  };
}
