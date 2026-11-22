// Online Novo masası: sunucu tarafı oyun odası (saf mantık, ağ yok).
// Cloudflare Durable Object (online/worker.js) ve yerel deneme sunucusu (online/yerel.mjs)
// aynı dosyayı kullanır. Deste ve kasanın kapalı kartları yalnız burada durur; istemcilere
// giden görünümde yoktur, yani kimse telefonundan kasanın elini ya da sıradaki kartı göremez.
import {
  yeniNovo, novoDagit, novoHamle, novoYasal, oyunSatinAl, novoYenidenBaslat, paraYukle, molaAyarla,
  NOVO_AZAMI_OYUNCU, ANTE_SECENEKLERI,
} from '../js/novo.js';

const klon = o => JSON.parse(JSON.stringify(o));
export const AD_AZAMI = 16;

// Geri sayımlar (ms). Kimse beklemesin diye her karar süreyle sınırlı; süre dolunca
// varsayılan hamle yapılır. Dağıtım ve kart dağıtma animasyonu telefonlarda sürerken
// karar süresi başlamasın diye o süre eklenir.
export const SURE = {
  hazir: 5000,          // biri "hazırım" deyince el bu kadar sonra dağıtılır
  karar: 15000,         // kart çekme, oyna/pas, sigorta, kasaya kart çektirme
  dagitimPayi: 22000,   // dağıtım + express animasyonu (telefonda ölçüldü ~20 sn)
  cekmePayi: 4000,      // çekilen kartların dağıtılması
};
// Süre dolunca yapılan hamle: kart çekmez, oyuna girmez, sigorta yapmaz, ante'yi alır.
export const VARSAYILAN = { cekme: 'gec', karar: 'pas' };

export function yeniOda(kod) {
  return { kod, koltuklar: [], izleyenler: [], sahip: null, g: null, ayar: { baslangicFis: BASLANGIC_FIS, ante: 25 }, secimler: {}, hazir: {}, sayac: null, misafirNo: 100, rev: 0 };
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

// Bir istemcinin isteğini uygular. Dönüş: { olay } (yayınlanacak animasyon ipucu) ya da { hata }.
export function islem(oda, id, m) {
  const i = koltugu(oda, id);
  const g = oda.g;
  try {
    switch (m && m.tip) {
      case 'katil': {
        if (i >= 0) { const ad = adTemizle(m.ad); if (ad) adDegistir(oda, i, ad); return { olay: { tip: 'katil', koltuk: i } }; }
        if (g) { if (!oda.izleyenler.includes(id)) oda.izleyenler.push(id); return { hata: 'Oyun başladı; izleyici olarak bağlandın.' }; }
        if (oda.koltuklar.length >= NOVO_AZAMI_OYUNCU) return { hata: `Masa dolu (en çok ${NOVO_AZAMI_OYUNCU} oyuncu).` };
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
        if (i < 0) return {};
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
        oda.g = yeniNovo({ adlar: oda.koltuklar.map(k => k.ad), kod: oda.kod, baslangicFis: oda.ayar.baslangicFis, ante: oda.ayar.ante });
        return { olay: { tip: 'basla' } };
      }
      case 'dagit':
      case 'hazir': {
        // Herkes kendi adına "hazırım" der. Hazır olanlar elde oynar; basmayan o eli dışarıda geçirir.
        if (!g) return { hata: 'Oyun başlamadı.' };
        if (i < 0) return { hata: 'İzleyici oyuna giremez.' };
        if (!araDaMi(g)) return { hata: 'El sürüyor.' };
        if (g.oyuncular[i].fis < 4 * g.ante) return { hata: 'Paran girişe yetmiyor: para yükle.' };
        oda.hazir = { ...(oda.hazir || {}), [i]: true };
        const aday = g.oyuncular.map((o, j) => j).filter(j => g.oyuncular[j].fis >= 4 * g.ante);
        if (aday.every(j => oda.hazir[j])) return hazirDagit(oda);
        return { olay: { tip: 'hazir', koltuk: i } };
      }
      case 'hamle': {
        if (!g || !g.el) return { hata: 'El yok.' };
        const y = novoYasal(g);
        if (!y) return { hata: 'Şu an karar beklenmiyor.' };
        if (y.oyuncu !== i) return { hata: 'Sıra sende değil.' };
        const h = m.hamle || {};
        if (!['pas', 'gec', 'oyna', 'degistir', 'alti', 'sigorta'].includes(h.tip)) return { hata: 'Bilinmeyen hamle.' };
        const temiz = { tip: h.tip };
        if (h.tip === 'degistir') temiz.konumlar = (h.konumlar || []).map(Number);
        if (h.tip === 'sigorta') temiz.miktar = Number(h.miktar) || 0;
        oda.g = novoHamle(g, temiz);
        return { olay: { tip: h.tip, koltuk: i } };
      }
      case 'satinal': {
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
      case 'mola': {
        if (!g || i < 0) return { hata: 'Oyun başlamadı.' };
        oda.g = molaAyarla(g, i, !!m.mola);
        if (m.mola && oda.hazir) delete oda.hazir[i];
        return { olay: { tip: 'mola', koltuk: i } };
      }
      case 'yukle': {
        // Para yalnız masayı açan yükler (kendine ya da başkasına); ötekiler yalnız kendi kararlarını verir.
        if (!g) return { hata: 'Oyun başlamadı.' };
        if (id !== oda.sahip) return { hata: 'Para yalnız masayı açan yükleyebilir.' };
        const kim = Number.isInteger(Number(m.koltuk)) ? Number(m.koltuk) : i;
        if (!g.oyuncular[kim]) return { hata: 'Oyuncu yok.' };
        oda.g = paraYukle(g, kim, Number(m.miktar));
        return { olay: { tip: 'yukle', koltuk: kim } };
      }
      case 'yeniden': {
        if (id !== oda.sahip) return { hata: 'Baştan başlatmayı masayı açan yapar.' };
        if (!g || !araDaMi(g)) return { hata: 'El bitince baştan başlatılabilir.' };
        oda.hazir = {};
        oda.g = novoYenidenBaslat(g);
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
  for (let j = 0; j < g.oyuncular.length; j++) g = molaAyarla(g, j, !oda.hazir[j]);
  oda.g = novoDagit(g);
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
  } else if (g && g.el.faz === 'oyunsuz') {
    tip = 'oyunsuz'; anahtar = 'o' + g.el.no; sure = SURE.karar;
  } else if (g && g.el) {
    const y = novoYasal(g);
    if (y) { tip = 'sigorta' in y ? 'sigorta' : y.asama; anahtar = `${g.el.no}:${tip}:${y.oyuncu}`; sure = SURE.karar; }
  }
  if (!tip) { oda.sayac = null; return; }
  if (oda.sayac && oda.sayac.anahtar === anahtar) return;
  let pay = 0;
  if (olay && olay.tip === 'dagit') pay = SURE.dagitimPayi;
  else if (olay && tip === 'karar' && ['gec', 'degistir', 'alti', 'pas'].includes(olay.tip) && !(oda.sayac && oda.sayac.tip === 'karar')) pay = SURE.cekmePayi;
  oda.sayac = { tip, anahtar, bitis: simdi + pay + sure, koltuk: tip === 'cekme' || tip === 'karar' || tip === 'sigorta' ? novoYasal(g).oyuncu : null };
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
  if (s.olay) { oda.rev += 1; sayacKur(oda, simdi, s.olay); }
  return s;
}
export function sureDoldu(oda, simdi = Date.now()) {
  const s = zamanAsimi(oda, simdi);
  if (s.olay) { oda.rev += 1; sayacKur(oda, simdi, s.olay); }
  return s;
}

function adDegistir(oda, i, ad) {
  oda.koltuklar[i].ad = ad;
  if (oda.g && oda.g.oyuncular[i]) oda.g.oyuncular[i].ad = ad;
}

// İstemciye giden görünüm: deste ve kasanın kapalı kartları çıkarılır.
export function gizle(g) {
  if (!g) return null;
  const v = klon(g);
  if (v.el) {
    delete v.el.deste;
    if (!v.el.krupiyeAcik) v.el.krupiye = v.el.krupiye.map((k, j) => (j === 4 ? k : null));
  }
  return v;
}

export function gorunum(oda, id, olay = null) {
  return {
    tip: 'durum', rev: oda.rev, kod: oda.kod,
    koltuklar: oda.koltuklar.map(k => ({ ad: k.ad })),
    benim: koltugu(oda, id), sahipMi: oda.sahip === id, ayar: oda.ayar,
    secimler: oda.secimler, hazir: oda.hazir || {}, g: gizle(oda.g), olay,
    sayac: oda.sayac ? { tip: oda.sayac.tip, koltuk: oda.sayac.koltuk, kalan: Math.max(0, oda.sayac.bitis - Date.now()), toplam: oda.sayac.tip === 'hazir' ? SURE.hazir : SURE.karar } : null,
  };
}
