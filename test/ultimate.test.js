import test from 'node:test';
import assert from 'node:assert/strict';
import { yeniUltimate, ultimateDagit, ultimateKarar, ultimateZamanAsimi, bekleyenler, tripsAyarla, katilabilir } from '../js/ultimate.js';
import { yeniDeste, kartYazi } from '../js/kart.js';

const D = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
const K = s => s.split(/\s+/).filter(Boolean).map(t => ({ d: D[t[0]] || Number(t.slice(0, -1)), r: t.at(-1) }));
// koltuk i: 2i,2i+1 · kasa 6,7 · ortak 8..12
function deste(eller, kasa, ortak) {
  const d = new Array(52).fill(null);
  eller.forEach((e, i) => K(e).forEach((k, j) => { d[2 * i + j] = k; }));
  K(kasa).forEach((k, j) => { d[6 + j] = k; });
  K(ortak).forEach((k, j) => { d[8 + j] = k; });
  const kul = new Set(d.filter(Boolean).map(kartYazi));
  const kalan = yeniDeste().filter(k => !kul.has(kartYazi(k)));
  for (let i = 0; i < 52; i++) if (!d[i]) d[i] = kalan.shift();
  return d;
}
const oyun = (n = 1) => yeniUltimate({ adlar: ['A', 'B', 'C'].slice(0, n), kod: 'U', ante: 10 });

test('preflop 4x bahis: el hemen sonuçlanır; kazanırsa play 1:1, ante 1:1, blind kent 1:1', () => {
  let g = ultimateDagit(oyun(), deste(['As Ks'], '2c 3d', 'Qs Js Th 7c 2h'));
  assert.equal(g.oyuncular[0].fis, 1000 - 20);
  g = ultimateKarar(g, 0, 'bet4');
  assert.equal(g.el.faz, 'bitti');
  const p = g.el.oyuncular[0];
  assert.equal(p.sonuc.tip, 'kazandi');
  // ante 10 + blind 10 + play 40; kazanç: play 40, ante 10 (kasa çift 2 → kalifiye), blind kent 1:1 = 10
  assert.equal(g.el.kalifiye, true);
  assert.equal(g.oyuncular[0].fis, 1000 + 40 + 10 + 10);
  assert.equal(p.net, 60);
});

test('kasa kalifiye değilse ante iade; kontrol-kontrol-river 1x', () => {
  let g = ultimateDagit(oyun(), deste(['As 9s'], '4c 3d', 'Kh Jd 8c 7h 2s'));
  g = ultimateKarar(g, 0, 'kontrol');
  assert.equal(g.el.faz, 'flop'); assert.equal(g.el.acikOrtak, 3);
  g = ultimateKarar(g, 0, 'kontrol');
  assert.equal(g.el.faz, 'river'); assert.equal(g.el.acikOrtak, 5);
  assert.throws(() => ultimateKarar(g, 0, 'kontrol'), /Geçersiz/);
  g = ultimateKarar(g, 0, 'bet1');
  assert.equal(g.el.kalifiye, false);
  // As yüksek > Papaz yüksek: play 10 kazanır, ante iade, blind iade (kent altı)
  assert.equal(g.el.oyuncular[0].sonuc.tip, 'kazandi');
  assert.equal(g.oyuncular[0].fis, 1000 + 10);
});

test('river pas: ante ve blind gider; trips üçlü 3:1 kasadan bağımsız öder', () => {
  let g = tripsAyarla(oyun(), 0, true);
  g = ultimateDagit(g, deste(['9s 9h'], 'Ac Ad', '9c 4d 2c Kh 7s'));
  assert.equal(g.oyuncular[0].fis, 1000 - 30);
  g = ultimateKarar(g, 0, 'kontrol'); g = ultimateKarar(g, 0, 'kontrol'); g = ultimateKarar(g, 0, 'pas');
  const p = g.el.oyuncular[0];
  assert.equal(p.sonuc.tip, 'pas');
  // trips 10 * 3 = +30 kazanç, ante+blind -20 → net +10
  assert.equal(p.net, 10);
  assert.equal(g.oyuncular[0].fis, 1010);
});

test('kaybeden: play, blind, ante gider (kasa kalifiye)', () => {
  let g = ultimateDagit(oyun(), deste(['7s 2h'], 'Ac Ad', 'Kc 9d 8c 4h 3s'));
  g = ultimateKarar(g, 0, 'bet3');
  assert.equal(g.el.oyuncular[0].sonuc.tip, 'kaybetti');
  assert.equal(g.oyuncular[0].fis, 1000 - 20 - 30);
  assert.equal(g.kasaNet, 50);
});

test('eşzamanlı kararlar: herkes karar verince sokak ilerler; süre dolumu kontrol/pas yapar', () => {
  let g = ultimateDagit(oyun(2), deste(['As Ks', '7s 2h'], '2c 3d', 'Qs Js Th 8c 4h'));
  g = ultimateKarar(g, 1, 'kontrol');
  assert.equal(g.el.faz, 'preflop', 'öteki oyuncu daha karar vermedi');
  assert.deepEqual(bekleyenler(g), [0]);
  g = ultimateKarar(g, 0, 'bet4');
  assert.equal(g.el.faz, 'flop');
  assert.deepEqual(bekleyenler(g), [1], 'bahis yapan bir daha karar vermez');
  g = ultimateZamanAsimi(g);
  assert.equal(g.el.faz, 'river');
  g = ultimateZamanAsimi(g);
  assert.equal(g.el.faz, 'bitti');
  assert.equal(g.el.oyuncular[1].sonuc.tip, 'pas');
});

test('ele girmek için 6 ante gerekir (trips açıksa 7)', () => {
  const g = oyun();
  g.oyuncular[0].fis = 59;
  assert.equal(katilabilir(g, 0), false);
  g.oyuncular[0].fis = 60;
  assert.equal(katilabilir(g, 0), true);
});
