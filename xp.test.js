'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('./xp.js');

test('level: kumulatif, naik monoton, level 1 mulai dari 0 XP', () => {
  assert.equal(X.need(1), 0); assert.equal(X.need(2), 200);
  for (let L = 2; L <= 50; L++) assert.ok(X.need(L) > X.need(L - 1), 'threshold naik di level ' + L);
  assert.equal(X.levelOf(0), 1); assert.equal(X.levelOf(199), 1); assert.equal(X.levelOf(200), 2);
  assert.equal(X.levelOf(X.need(7) - 1), 6); assert.equal(X.levelOf(X.need(7)), 7);
  assert.equal(X.levelOf(1e9), 50, 'ada batas level'); assert.equal(X.levelOf(-5), 1); assert.equal(X.levelOf('x'), 1); assert.equal(X.levelOf(NaN), 1);
});
test('info: posisi di dalam level dan pecahan bar', () => {
  const a = X.info(0); assert.deepEqual([a.level, a.into, a.span, a.frac], [1, 0, 200, 0]);
  const b = X.info(100); assert.equal(b.frac, 0.5); assert.equal(b.hi, 200);
  const c = X.info(X.need(3)); assert.deepEqual([c.level, c.into, c.frac], [3, 0, 0]);
  const m = X.info(1e9); assert.equal(m.max, true); assert.equal(m.frac, 1);
});
test('orderXp: +50 per order, +20 bila cepat; combo tidak dihitung sebagai cepat; event lain 0', () => {
  assert.equal(X.orderXp({ type: 'order:completed', earned: 100, combo: 0 }), 50);
  assert.equal(X.orderXp({ type: 'order:completed', earned: 125, combo: 0 }), 70, 'bonus cepat');
  assert.equal(X.orderXp({ type: 'order:completed', earned: 130, combo: 30 }), 50, 'combo saja bukan cepat');
  assert.equal(X.orderXp({ type: 'order:completed', earned: 155, combo: 30 }), 70, 'cepat + combo');
  assert.equal(X.orderXp({ type: 'item:trashed' }), 0); assert.equal(X.orderXp(null), 0);
});
test('pakaian kepala: koki bawaan, bandana level 4, topi level 7; id tidak dikenal jatuh ke koki', () => {
  assert.deepEqual(X.unlockedAt(1).map(h => h.id), ['koki']); assert.deepEqual(X.unlockedAt(4).map(h => h.id), ['koki', 'bandana']); assert.deepEqual(X.unlockedAt(7).map(h => h.id), ['koki', 'bandana', 'topi']);
  assert.deepEqual(X.unlockedBetween(3, 7).map(h => h.id), ['bandana', 'topi']); assert.deepEqual(X.unlockedBetween(7, 9), []);
  assert.equal(X.cleanHeadwear('topi', 3), 'koki', 'belum terbuka'); assert.equal(X.cleanHeadwear('topi', 7), 'topi'); assert.equal(X.cleanHeadwear('<b>', 50), 'koki'); assert.equal(X.cleanHeadwear('bandana'), 'bandana', 'tanpa level = hanya validasi nama');
});
test('laju: ronde 8 order cepat sekitar 560 XP, level 7 butuh beberapa ronde (angka untuk disetel)', () => {
  const perRound = 8 * 70; assert.equal(perRound, 560);
  const rounds = Math.ceil(X.need(7) / perRound); assert.ok(rounds >= 2 && rounds <= 12, 'ronde sampai level 7: ' + rounds);
});
