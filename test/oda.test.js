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
  assert.match(islem(o, 'yabanci', { tip: 'katil', ad: 'Z' }).hata, /izleyici/);
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

test('geri sayım: biri hazır deyince 5 sn sonra hazır olanlarla dağıtılır, basmayan o eli dışarıda geçirir', () => {
  const o = yeniOda('T');
  isle(o, 'a', { tip: 'katil', ad: 'A' }, 0); isle(o, 'b', { tip: 'katil', ad: 'B' }, 0);
  isle(o, 'a', { tip: 'basla' }, 0);
  isle(o, 'b', { tip: 'hazir' }, 1000);
  assert.equal(o.sayac.tip, 'hazir');
  assert.equal(o.sayac.bitis, 1000 + SURE.hazir);
  assert.deepEqual(sureDoldu(o, 3000), {}, 'süre dolmadan bir şey olmaz');
  assert.equal(sureDoldu(o, 1000 + SURE.hazir).olay.tip, 'dagit');
  assert.equal(o.g.el.oyuncular[0].katildi, false, 'basmayan A bu elde yok');
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
