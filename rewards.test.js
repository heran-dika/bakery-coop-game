'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('./xp.js');

test('hadiah: satu hadiah baru di tiap level 8 sampai 20, urut sesuai rencana', () => {
  const want = { 8: 'ap:emas', 9: 'hw:mahkota', 10: 'nc:merah', 11: 'nc:biru', 12: 'nc:hijau', 13: 'nc:ungu', 14: 'nc:emas', 15: 'ap:garis', 16: 'ap:polkadot', 17: 'ap:kotak', 18: 'bd:bintang', 19: 'bd:roti', 20: 'bd:api' };
  for (let L = 8; L <= 20; L++) assert.deepEqual(X.unlockedBetweenAll(L - 1, L).map(h => h.kind + ':' + h.id), [want[L]], 'level ' + L);
  assert.deepEqual(X.unlockedBetweenAll(20, 50), [], 'tidak ada hadiah setelah level 20');
  assert.deepEqual(X.unlockedBetween(7, 8), []); assert.deepEqual(X.unlockedBetween(8, 9).map(h => h.id), ['mahkota']);
  for (const k of Object.keys(X.REWARDS)) assert.equal(X.REWARDS[k].find(x => x.id === X.DEFAULTS[k]).level, 1, 'bawaan ' + k);
});
test('hadiah: cleanReward menjaga level dan daftar putih; id tidak dikenal jatuh ke bawaan', () => {
  assert.equal(X.cleanReward('ap', 'emas', 7), 'biasa'); assert.equal(X.cleanReward('ap', 'emas', 8), 'emas');
  assert.equal(X.cleanReward('hw', 'mahkota', 8), 'koki'); assert.equal(X.cleanReward('hw', 'mahkota', 9), 'mahkota');
  assert.equal(X.cleanReward('nc', 'ungu', 12), 'biasa'); assert.equal(X.cleanReward('nc', 'ungu', 13), 'ungu');
  assert.equal(X.cleanReward('ap', 'kotak', 16), 'biasa'); assert.equal(X.cleanReward('ap', 'kotak', 17), 'kotak');
  assert.equal(X.cleanReward('bd', 'api', 19), 'tanpa'); assert.equal(X.cleanReward('bd', 'api', 20), 'api');
  assert.equal(X.cleanReward('hw', 'mahkota'), 'mahkota', 'tanpa level = hanya validasi nama');
  assert.equal(X.cleanReward('ap', '<img src=x>', 50), 'biasa'); assert.equal(X.cleanReward('zz', 'x', 50), null);
  assert.equal(X.cleanHeadwear('mahkota', 9), 'mahkota', 'API lama tetap jalan');
});
test('hadiah: isKnown untuk server (tanpa level); warna nama punya hex, bawaan null', () => {
  assert.equal(X.isKnown('hw', 'mahkota'), true); assert.equal(X.isKnown('ap', 'polkadot'), true); assert.equal(X.isKnown('bd', 'x'), false); assert.equal(X.isKnown('zz', 'koki'), false);
  assert.equal(X.nameColor('merah'), '#c34f5a'); assert.equal(X.nameColor('biasa'), null); assert.equal(X.nameColor('<b>'), null);
  for (const c of X.NAMECOLOR.filter(c => c.color)) assert.match(c.color, /^#[0-9a-f]{6}$/);
});
