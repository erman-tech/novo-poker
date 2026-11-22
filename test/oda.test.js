import test from 'node:test';
import assert from 'node:assert/strict';
import { yeniOda, islem, gorunum, gizle, isle, sureDoldu, SURE } from '../online/oda.js';
import { novoYasal } from '../js/novo.js';

test('ad girmeyen Guest101 ile başlar, sonraki Guest102; ad yazan kendi adını alır', () => {
  const o = yeniOda('ABC');
  islem(o, 'a', { tip: 'katil', ad: '' });
  islem(o, 'b', { tip: 'katil', ad: '  ' });
  islem(o, 'c', { tip: 'katil', ad: 'Ayşe' });
  assert.deepEqual(o.koltuklar.map(k => k.ad), ['Guest101', 'Guest102', 'Ayşe']);
  assert.equal(o.sahip, 'a');
  assert.match(islem(o, 'd', { tip: 'katil' }).hata, /dolu/);
  assert.match(islem(yeniOdaIle(['Ayşe']), 'x', { tip: 'katil', ad: 'ayşe' }).hata, /var/);
  islem(o, 'a', { tip: 'ad', ad: 'Can' });
  assert.equal(o.koltuklar[0].ad, 'Can');
});

function yeniOdaIle(adlar) {
  const o = yeniOda('K');
  adlar.forEach((a, i) => islem(o, 'id' + i, { tip: 'katil', ad: a }));
  return o;
}

test('yalnız masayı açan başlatır; sıra kimdeyse o hamle yapar', () => {
  const o = yeniOdaIle(['A', 'B']);
  assert.match(islem(o, 'id1', { tip: 'basla' }).hata, /açan/);
  assert.ok(islem(o, 'id0', { tip: 'basla' }).olay);
  assert.equal(islem(o, 'id1', { tip: 'hazir' }).olay.tip, 'hazir', 'tek kişi hazır: geri sayım başlar, dağıtılmaz');
  assert.equal(islem(o, 'id0', { tip: 'hazir' }).olay.tip, 'dagit', 'herkes hazır: hemen dağıtılır');
  const sira = novoYasal(o.g).oyuncu;
  const baska = sira === 0 ? 'id1' : 'id0';
  assert.match(islem(o, baska, { tip: 'hamle', hamle: { tip: 'gec' } }).hata, /Sıra/);
  assert.equal(islem(o, 'id' + sira, { tip: 'hamle', hamle: { tip: 'gec' } }).olay.tip, 'gec');
  assert.match(islem(o, 'yabanci', { tip: 'katil', ad: 'Z' }).hata, /el bitince/);
});

test('görünümde deste yok, kasanın kapalı 4 kartı yok', () => {
  const o = yeniOdaIle(['A']);
  islem(o, 'id0', { tip: 'basla' });
  islem(o, 'id0', { tip: 'dagit' });
  const v = gorunum(o, 'id0');
  assert.equal(v.g.el.deste, undefined);
  assert.deepEqual(v.g.el.krupiye.slice(0, 4), [null, null, null, null]);
  assert.ok(v.g.el.krupiye[4] && v.g.el.krupiye[4].d);
  assert.ok(o.g.el.deste.length, 'sunucuda deste duruyor');
  assert.equal(v.benim, 0);
  assert.equal(JSON.stringify(v).includes('"deste"'), false);
});

test('kasa açılınca kartlar görünür', () => {
  const g = { el: { krupiyeAcik: true, krupiye: [{ d: 2, r: 's' }, { d: 3, r: 's' }, { d: 4, r: 's' }, { d: 5, r: 's' }, { d: 9, r: 'h' }], deste: [1] } };
  assert.equal(gizle(g).el.krupiye[0].d, 2);
});

test('geri sayım: biri hazır deyince 5 sn sonra dağıtılır; basmayan da ele girer (molada değilse)', () => {
  const o = yeniOda('T');
  isle(o, 'a', { tip: 'katil', ad: 'A' }, 0); isle(o, 'b', { tip: 'katil', ad: 'B' }, 0);
  isle(o, 'a', { tip: 'basla' }, 0);
  isle(o, 'b', { tip: 'hazir' }, 1000);
  assert.equal(o.sayac.tip, 'hazir');
  assert.equal(o.sayac.bitis, 1000 + SURE.hazir);
  assert.deepEqual(sureDoldu(o, 3000), {}, 'süre dolmadan bir şey olmaz');
  assert.equal(sureDoldu(o, 1000 + SURE.hazir).olay.tip, 'dagit');
  assert.equal(o.g.el.oyuncular[0].katildi, true, 'basmayan A da ele girdi (Erman 22 Kas)');
  assert.equal(o.g.el.oyuncular[1].katildi, true);
  // Karar süresi dağıtım animasyonu payıyla başlar
  assert.equal(o.sayac.tip, 'cekme');
  assert.equal(o.sayac.bitis, 1000 + SURE.hazir + SURE.dagitimPayi + SURE.karar);
});

test('karar süresi dolunca: kart çekmez, sonra oyuna girmez (pas)', () => {
  const o = yeniOda('T');
  isle(o, 'a', { tip: 'katil', ad: 'A' }, 0);
  isle(o, 'a', { tip: 'basla' }, 0);
  isle(o, 'a', { tip: 'hazir' }, 0);
  assert.equal(o.g.el.faz, 'cekme');
  let s = sureDoldu(o, o.sayac.bitis);
  assert.equal(s.olay.tip, 'gec');
  assert.equal(o.sayac.tip, 'karar');
  s = sureDoldu(o, o.sayac.bitis);
  assert.equal(s.olay.tip, 'pas');
  assert.equal(o.g.el.faz, 'bitti');
  assert.equal(o.sayac, null);
});

test('herkes $1.000 başlar; para yalnız masayı açan yükler; parası biten hazır diyemez', () => {
  const o = yeniOda('T');
  isle(o, 'a', { tip: 'katil', ad: 'A' }); isle(o, 'b', { tip: 'katil', ad: 'B' });
  isle(o, 'a', { tip: 'basla' });
  assert.deepEqual(o.g.oyuncular.map(x => x.fis), [1000, 1000]);
  assert.match(isle(o, 'b', { tip: 'yukle', miktar: 500 }).hata, /masayı açan/);
  o.g.oyuncular[1].fis = 10;
  assert.match(isle(o, 'b', { tip: 'hazir' }).hata, /yetmiyor/);
  assert.equal(isle(o, 'a', { tip: 'yukle', koltuk: 1, miktar: 500 }).olay.tip, 'yukle');
  assert.equal(o.g.oyuncular[1].fis, 510);
  assert.equal(isle(o, 'a', { tip: 'ayar', baslangicFis: 5000 }).hata, 'Oyun başladıktan sonra ayar değişmez.');
});

test('Ultimate masası: oyun ilk girişte seçilir; eşzamanlı karar; süre dolunca kontrol ve pas', () => {
  const o = yeniOda('U1');
  isle(o, 'a', { tip: 'katil', ad: 'A', oyun: 'ultimate' }, 0);
  isle(o, 'b', { tip: 'katil', ad: 'B', oyun: 'novo' }, 0);
  assert.equal(o.oyun, 'ultimate', 'ikinci gelenin seçimi oyunu değiştirmez');
  isle(o, 'a', { tip: 'basla' }, 0);
  assert.equal(o.g.tur, 'ultimate');
  isle(o, 'a', { tip: 'hazir' }, 0); isle(o, 'b', { tip: 'hazir' }, 0);
  assert.equal(o.g.el.faz, 'preflop');
  assert.equal(o.sayac.tip, 'ukarar');
  const v = gorunum(o, 'a');
  assert.deepEqual(v.g.el.krupiye, [null, null]);
  assert.deepEqual(v.g.el.ortak, [null, null, null, null, null]);
  assert.ok(v.g.el.oyuncular[0].kartlar[0], 'kendi kartlarını görür');
  assert.deepEqual(v.g.el.oyuncular[1].kartlar, [null, null], 'başkasının kartları el bitene kadar gizli');
  assert.equal(v.g.el.deste, undefined);
  assert.equal(isle(o, 'a', { tip: 'hamle', hamle: { secim: 'kontrol' } }, 100).olay.tip, 'karar');
  assert.equal(o.g.el.faz, 'preflop');
  assert.equal(sureDoldu(o, o.sayac.bitis).olay.tip, 'karar');
  assert.equal(o.g.el.faz, 'flop');
  assert.equal(gorunum(o, 'a').g.el.ortak.filter(Boolean).length, 3);
  sureDoldu(o, o.sayac.bitis); sureDoldu(o, o.sayac.bitis);
  assert.equal(o.g.el.faz, 'bitti');
  assert.ok(gorunum(o, 'a').g.el.krupiye[0], 'el bitince kasa kartları görünür');
  assert.ok(gorunum(o, 'a').g.el.oyuncular[1].kartlar[0], 'el bitince herkesin kartı görünür');
});

test('otomatik oyna: her el kendiliğinden hazır, 5 sn içinde iptal edilebilir, karar süresi 5 sn', () => {
  const o = yeniOda('OT');
  isle(o, 'a', { tip: 'katil', ad: 'A' }, 0); isle(o, 'b', { tip: 'katil', ad: 'B' }, 0);
  isle(o, 'a', { tip: 'basla' }, 0);
  isle(o, 'a', { tip: 'oto', acik: true }, 0);
  isle(o, 'b', { tip: 'oto', acik: true }, 0);
  assert.deepEqual(o.hazir, { 0: true, 1: true }, 'otomatik açan hazır sayılır');
  assert.equal(o.g.el, null, 'hepsi otomatikse hemen değil, geri sayımla dağıtılır');
  assert.equal(o.sayac.tip, 'hazir');
  // B geri sayımda vazgeçer: hazır ve otomatik kapanır
  isle(o, 'b', { tip: 'hazir', iptal: true }, 100);
  assert.deepEqual(o.hazir, { 0: true }); assert.equal(o.oto[1], undefined);
  sureDoldu(o, o.sayac.bitis);
  assert.ok(o.g.el && o.g.el.oyuncular[0].katildi && o.g.el.oyuncular[1].katildi, 'iptal eden B de ele girdi (oynamak istemeyen oyundan çıkar)');
  // A otomatik: karar süresi 5 sn; karar vermezse varsayılan (çekmez, sonra pas)
  assert.equal(o.sayac.sure, SURE.otoKarar);
  assert.equal(gorunum(o, 'a').sayac.toplam, SURE.otoKarar);
  let t = o.sayac.bitis, son = t;
  for (let k = 0; k < 6 && o.g.el.faz !== 'bitti'; k++) { son = t; sureDoldu(o, t); if (o.sayac) t = o.sayac.bitis; }
  assert.equal(o.g.el.faz, 'bitti');
  assert.equal(o.g.el.oyuncular[0].durum, 'pas', 'karar vermeyen otomatik oyuncu son kararda pas');
  // El bitince A yine kendiliğinden hazır; sonuç görünsün diye ek bekleme var
  assert.deepEqual(o.hazir, { 0: true });
  assert.equal(o.sayac.tip, 'hazir');
  assert.equal(o.sayac.bitis - son, SURE.sonucPayi + SURE.hazir);
});

test('otomatik oynayan parası bitince ele girmez ve otomatiği kapanır', () => {
  const o = yeniOda('OP');
  isle(o, 'a', { tip: 'katil', ad: 'A' }, 0); isle(o, 'a', { tip: 'basla' }, 0);
  o.g.oyuncular[0].fis = 10;
  isle(o, 'a', { tip: 'oto', acik: true }, 0);
  assert.deepEqual(o.hazir, {});
  isle(o, 'a', { tip: 'ad', ad: 'Ayşe' }, 0);
  assert.equal(o.oto[0], undefined);
});

test('Ultimate: otomatik oyuncu 5 sn içinde karar vermezse kontrol, river\'da pas', () => {
  const o = yeniOda('UO');
  isle(o, 'a', { tip: 'katil', ad: 'A', oyun: 'ultimate' }, 0);
  isle(o, 'a', { tip: 'basla' }, 0);
  isle(o, 'a', { tip: 'oto', acik: true }, 0);
  sureDoldu(o, o.sayac.bitis);
  assert.equal(o.g.el.faz, 'preflop');
  assert.equal(o.sayac.sure, SURE.otoKarar);
  let k = 0; while (o.g.el.faz !== 'bitti' && k++ < 5) sureDoldu(o, o.sayac.bitis);
  assert.equal(o.g.el.oyuncular[0].durum, 'pas');
});

test('oyun başladıktan sonra gelen: el aradaysa hemen, el sürüyorsa el bitince oturur; masa doluysa izler', () => {
  const o = yeniOdaIle(['A']);
  islem(o, 'id0', { tip: 'basla' });
  const s1 = isle(o, 'f', { tip: 'katil', ad: 'Fidan' });
  assert.equal(s1.olay.tip, 'katil');
  assert.equal(gorunum(o, 'f').benim, 1);
  assert.equal(o.g.oyuncular[1].fis, o.g.baslangicFis);
  isle(o, 'id0', { tip: 'hazir' }); isle(o, 'f', { tip: 'hazir' });
  assert.ok(o.g.el && o.g.el.faz !== 'bitti', 'el başladı');
  const s2 = isle(o, 'g', { tip: 'katil', ad: 'Gül' });
  assert.match(s2.hata, /el bitince/);
  assert.equal(gorunum(o, 'g').benim, -1);
  assert.equal(gorunum(o, 'g').bekliyor, true);
  assert.match(isle(o, 'h', { tip: 'katil', ad: 'Hale' }).hata, /dolu/, 'üçüncü koltuk bekleyene ayrıldı');
  for (let k = 0; k < 20 && o.g.el.faz !== 'bitti'; k++) {
    const y = novoYasal(o.g); if (!y) break;
    isle(o, y.oyuncu === 1 ? 'f' : 'id0', { tip: 'hamle', hamle: { tip: 'pas' } });
  }
  assert.equal(o.g.el.faz, 'bitti');
  assert.equal(gorunum(o, 'g').benim, 2, 'el bitince oturdu');
  assert.equal(o.g.oyuncular.length, 3);
  assert.equal(o.g.el.oyuncular[2].katildi, false);
  assert.ok(gizle(o.g, 2));
});

test('Ultimate: oyun sürerken gelen el aradayken oturur', () => {
  const o = yeniOda('U');
  islem(o, 'id0', { tip: 'katil', ad: 'A', oyun: 'ultimate' });
  islem(o, 'id0', { tip: 'basla' });
  assert.equal(isle(o, 'f', { tip: 'katil', ad: 'Fidan' }).olay.tip, 'katil');
  assert.equal(o.g.oyuncular[1].trips, false);
  assert.equal(o.g.oyuncular[1].fis, o.g.baslangicFis);
});

test('karar süresi 10 sn', () => { assert.equal(SURE.karar, 10000); assert.equal(SURE.otoKarar, 10000); });

test('yan express: oyuncu kendi seçimini eller arasında açar, dağıtımda bahis alınır', () => {
  const o = yeniOdaIle(['A', 'B']);
  islem(o, 'id0', { tip: 'basla' });
  assert.equal(isle(o, 'id0', { tip: 'yan', kasa: true, komsu: true }).olay.tip, 'yan');
  assert.deepEqual(o.g.oyuncular[0].yan, { kasa: true, komsu: true });
  const once = o.g.oyuncular[0].fis;
  isle(o, 'id0', { tip: 'hazir' }); isle(o, 'id1', { tip: 'hazir' });
  const p = o.g.el.oyuncular[0];
  assert.equal(p.yanBahis, 2 * o.g.ante);
  assert.equal(o.g.oyuncular[0].fis, once - 2 * o.g.ante - p.yanBahis + p.yanOdeme + p.bonusOdeme, 'kendi express ödemesi de rastgele gelebilir');
  assert.match(isle(o, 'id0', { tip: 'yan', kasa: false }).hata, /El bitince/);
});

test('mola: el sürerken istenirse el bitince uygulanır; çıkan molaya alınır, ele gir diyen döner', () => {
  const o = yeniOdaIle(['A', 'B']);
  islem(o, 'id0', { tip: 'basla' });
  isle(o, 'id0', { tip: 'hazir' }); isle(o, 'id1', { tip: 'hazir' });
  assert.equal(isle(o, 'id1', { tip: 'mola', mola: true }).olay.bekliyor, true);
  assert.equal(gorunum(o, 'id1').molaIstek, true);
  for (let k = 0; k < 20 && o.g.el.faz !== 'bitti'; k++) { const y = novoYasal(o.g); if (!y) break; isle(o, 'id' + y.oyuncu, { tip: 'hamle', hamle: { tip: 'pas' } }); }
  assert.equal(o.g.el.faz, 'bitti');
  assert.equal(o.g.oyuncular[1].mola, true, 'el bitince molaya geçti');
  assert.equal(isle(o, 'id0', { tip: 'hazir' }).olay.tip, 'dagit', 'moladaki beklenmez');
  for (let k = 0; k < 20 && o.g.el.faz !== 'bitti'; k++) { const y = novoYasal(o.g); if (!y) break; isle(o, 'id' + y.oyuncu, { tip: 'hamle', hamle: { tip: 'pas' } }); }
  isle(o, 'id1', { tip: 'hazir' });
  assert.equal(o.g.oyuncular[1].mola, false, 'ele gir diyen masaya döndü');
});

test('"çekmiyorum, oyna": karar sırası gelince tekrar sorulmadan oynar', () => {
  const o = yeniOdaIle(['A', 'B']);
  islem(o, 'id0', { tip: 'basla' });
  isle(o, 'id0', { tip: 'hazir' }); isle(o, 'id1', { tip: 'hazir' });
  const y0 = novoYasal(o.g);
  isle(o, 'id' + y0.oyuncu, { tip: 'hamle', hamle: { tip: 'gec', oyna: true } });
  const ilk = y0.oyuncu, diger = 1 - ilk;
  isle(o, 'id' + diger, { tip: 'hamle', hamle: { tip: 'gec' } });
  // karar aşaması: ilk oyuncu otomatik oynadı (sigorta sorulmuyorsa)
  const p = o.g.el.oyuncular[ilk];
  if (!p.sigortaSor) assert.equal(p.durum, 'oynadi');
  assert.equal(p.bahis, 2 * o.g.ante);
});

test('baştan başlat: yalnız masayı açan; el sürerken istenirse el bitince başlar', () => {
  const o = yeniOdaIle(['A', 'B']);
  islem(o, 'id0', { tip: 'basla' });
  isle(o, 'id0', { tip: 'hazir' }); isle(o, 'id1', { tip: 'hazir' });
  assert.match(isle(o, 'id1', { tip: 'yeniden' }).hata, /açan/);
  assert.match(isle(o, 'id0', { tip: 'yeniden' }).hata, /el bitince/);
  for (let k = 0; k < 20 && o.g.el; k++) { const y = novoYasal(o.g); if (!y) break; isle(o, 'id' + y.oyuncu, { tip: 'hamle', hamle: { tip: 'pas' } }); }
  assert.equal(o.g.el, null, 'el bitince masa baştan başladı');
  assert.deepEqual(o.g.oyuncular.map(x => x.fis), [o.g.baslangicFis, o.g.baslangicFis]);
});

test('Ultimate: oyundan çıkan dağıtılmaz, ele gir diyen döner', () => {
  const o = yeniOda('UM');
  isle(o, 'a', { tip: 'katil', ad: 'A', oyun: 'ultimate' }); isle(o, 'b', { tip: 'katil', ad: 'B' });
  isle(o, 'a', { tip: 'basla' });
  isle(o, 'b', { tip: 'mola', mola: true });
  assert.equal(o.g.oyuncular[1].mola, true);
  assert.equal(isle(o, 'a', { tip: 'hazir' }).olay.tip, 'dagit', 'moladaki beklenmez');
  assert.equal(o.g.el.oyuncular[1].katildi, false);
});

test('masayı kapat: yalnız açan; herkesin koltuğu ve oyun silinir', () => {
  const o = yeniOdaIle(['A', 'B']);
  islem(o, 'id0', { tip: 'basla' });
  assert.match(isle(o, 'id1', { tip: 'kapat' }).hata, /açan/);
  assert.equal(isle(o, 'id0', { tip: 'kapat' }).olay.tip, 'kapandi');
  assert.equal(o.g, null); assert.equal(o.koltuklar.length, 0); assert.equal(o.sahip, null);
  assert.equal(isle(o, 'yeni', { tip: 'katil', ad: 'C' }).olay.tip, 'katil', 'aynı kodla yeni masa açılır');
  assert.equal(o.sahip, 'yeni');
});
