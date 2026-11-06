'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { createGame } = require('./core.js'); const S = require('./stages.js');
const mk = () => { const g = createGame({ seed: 3, players: ['p1', 'p2'], config: S.get(3).config }); g.start(); return g; };
const run = (g, sec, inp) => { let ev = []; for (let i = 0; i < Math.round(sec * 30); i++) ev = ev.concat(g.step(1 / 30, typeof inp === 'function' ? inp(i) : (inp || {}))); return ev; };
const put = (g, id, x, y) => { const p = g.state.players.find(q => q.id === id); p.x = x; p.y = y; return p; };
const act = (g, id, n) => g.step(0, { [id]: { interact: n } });
const W = { // input layar untuk gerak sepanjang sumbu dunia
  xm: { sx: -0.894, sy: -0.447 }, xp: { sx: 0.894, sy: 0.447 }, ym: { sx: 0.894, sy: -0.447 }, yp: { sx: -0.894, sy: 0.447 } };
let n = 100;

test('truk: dinding kiri tertutup lalu terbuka; karung turun di x6y5', () => {
  const g = mk(), s = g.state;
  assert.equal(s.dock.open, false); assert.equal(s.sack.mode, 'none');
  run(g, 1.7); assert.equal(s.dock.phase, 'unloading'); assert.equal(s.sack.mode, 'floor'); assert.deepEqual([s.sack.x, s.sack.y], [6, 5]);
  assert.equal(s.dock.open, false, 'pintu masih tertutup saat truk di dalam');
  const ev = run(g, 2.5); assert.equal(s.dock.open, true); assert.ok(ev.some(e => e.type === 'dock:door'));
});

test('dinding: pemain tidak bisa masuk dock selagi pintu tertutup, bisa setelah terbuka', () => {
  const g = mk(), s = g.state, p = put(g, 'p1', 5.0, 5.0);
  run(g, 1, { p1: W.xp }); assert.ok(p.x < 5.6, 'tertahan dinding kiri: x=' + p.x.toFixed(2));
  put(g, 'p1', 6.5, 4.0); run(g, 1, { p1: W.yp }); assert.ok(p.y < 4.6, 'tertahan dinding atas: y=' + p.y.toFixed(2));
  run(g, 3); assert.equal(s.dock.open, true);
  put(g, 'p1', 5.0, 6.0); s.sack.mode = 'none'; run(g, 1.5, { p1: W.xp }); assert.ok(p.x > 6.5, 'masuk dock lewat pintu terbuka: x=' + p.x.toFixed(2));
});

test('angkat sendiri: jalan 1/4 kecepatan, peti tidak bisa dipakai saat membawa karung, taruh lagi', () => {
  const g = mk(), s = g.state; run(g, 4.2);
  const p = put(g, 'p1', 5.05, 5.0); p.facingX = 1; p.facingY = 0;
  assert.equal(g.targetOf('p1'), 'sack');
  act(g, 'p1', ++n); assert.equal(s.sack.mode, 'carry'); assert.equal(p.held.type, 'sack');
  const x0 = p.x, y0 = p.y; run(g, 1, { p1: W.xm }); const slow = Math.hypot(p.x - x0, p.y - y0);
  put(g, 'p2', 5.0, 2.0); const q = s.players[1]; const a0 = [q.x, q.y]; run(g, 0.25, { p2: W.xm }); const norm = Math.hypot(q.x - a0[0], q.y - a0[1]) * 4;
  assert.ok(Math.abs(slow / norm - 0.25) < 0.06, 'rasio kecepatan ' + (slow / norm).toFixed(2));
  assert.equal(s.sack.x, p.x); assert.equal(s.sack.y, p.y);
  act(g, 'p1', ++n); assert.equal(s.sack.mode, 'floor'); assert.equal(p.held, null); assert.ok(Number.isInteger(s.sack.x) && Number.isInteger(s.sack.y));
});

test('berdua: satu angkat, satu bantu -> tarik/dorong sumbu x ke kiri; hanya jalan bila keduanya searah', () => {
  const g = mk(), s = g.state; run(g, 4.2);
  const a = put(g, 'p1', 5.05, 5.0), b = put(g, 'p2', 6.95, 5.0); a.facingX = 1; a.facingY = 0;
  act(g, 'p1', ++n); act(g, 'p2', ++n);
  assert.equal(s.sack.mode, 'drag'); assert.equal(s.sack.axis, 'x'); assert.deepEqual([s.sack.x, s.sack.y], [6, 5]); assert.equal(a.held, null);
  const x0 = s.sack.x; run(g, 1, { p1: W.xm }); assert.equal(s.sack.x, x0, 'satu orang saja tidak menggerakkan');
  run(g, 1, { p1: W.xm, p2: W.xp }); assert.equal(s.sack.x, x0, 'berlawanan arah: diam');
  run(g, 1, { p1: W.xm, p2: W.xm }); assert.ok(x0 - s.sack.x > 2.3, 'dua orang searah: bergerak normal, geser ' + (x0 - s.sack.x).toFixed(2));
  assert.ok(Math.abs(a.x - (s.sack.x - 0.95)) < 1e-6 || Math.abs(a.x - (s.sack.x + 0.95)) < 1e-6);
});

test('bantu gagal bila tidak berseberangan; lepas dengan Aksi', () => {
  const g = mk(), s = g.state; run(g, 4.2);
  const a = put(g, 'p1', 5.05, 5.0), b = put(g, 'p2', 5.1, 5.9); a.facingX = 1; a.facingY = 0;
  act(g, 'p1', ++n); const ev = act(g, 'p2', ++n);
  assert.equal(s.sack.mode, 'carry'); assert.ok(ev.some(e => e.code === 'sack_align'));
  put(g, 'p2', 6.95, 5.0); act(g, 'p2', ++n); assert.equal(s.sack.mode, 'drag');
  act(g, 'p1', ++n); assert.equal(s.sack.mode, 'floor'); assert.equal(s.sack.grip.length, 0);
});

test('alur penuh: dock -> sudut (angkat sendiri) -> lorong -> restok; stok penuh lagi; truk berikutnya', () => {
  const g = mk(), s = g.state; run(g, 4.2);
  const dough = s.stations.find(x => x.id === 'dough');
  for (const [i, who] of [[0, 'p1'], [1, 'p1'], [2, 'p1']]) { put(g, who, 1.0, 2.0); s.players[0].held = null; act(g, who, ++n); }
  assert.equal(dough.stock, 2, 'tiga kali ambil adonan: stok 5 -> 2');
  // dock: berdua geser ke kiri sepanjang y5
  const a = put(g, 'p1', 5.05, 5.0), b = put(g, 'p2', 6.95, 5.0); a.held = null; a.facingX = 1; a.facingY = 0;
  act(g, 'p1', ++n); act(g, 'p2', ++n); assert.equal(s.sack.mode, 'drag');
  run(g, 6, { p1: W.xm, p2: W.xm });
  assert.ok(s.sack.x > 1.4 && s.sack.x < 1.7, 'berhenti di sudut karena penarik mentok tembok: x=' + s.sack.x.toFixed(2));
  // sudut: p2 (kanan) angkat sendiri, taruh di x1y5
  b.facingX = -1; b.facingY = 0; act(g, 'p1', ++n); assert.equal(s.sack.mode, 'floor');   // p1 melepas lalu naik lewat lorong
  put(g, 'p1', 1.0, 4.03); put(g, 'p2', 2.2, 5.0); b.facingX = -1; b.facingY = 0; act(g, 'p2', ++n); assert.equal(s.sack.mode, 'carry');
  run(g, 0.5, { p2: W.xm }); b.facingX = -1; b.facingY = 0; act(g, 'p2', ++n);
  assert.equal(s.sack.mode, 'floor'); assert.deepEqual([s.sack.x, s.sack.y], [1, 5], 'sack di sel lorong: ' + [s.sack.x, s.sack.y]);
  // p1 naik lewat lorong ke atas, p2 di bawah
  put(g, 'p2', 1.0, 5.93);
  act(g, 'p2', ++n); assert.equal(s.sack.mode, 'carry'); act(g, 'p1', ++n); assert.equal(s.sack.mode, 'drag'); assert.equal(s.sack.axis, 'y');
  const ev = run(g, 2, { p1: W.ym, p2: W.ym });
  assert.ok(ev.some(e => e.type === 'dock:restock'), 'restok terjadi');
  assert.equal(dough.stock, 5); assert.equal(s.sack.mode, 'none'); assert.equal(s.players[0].held, null);
  assert.equal(s.dock.phase, 'waiting');
  let evs = []; for (let i = 0; i < 200 && s.dock.phase === 'waiting'; i++) evs = evs.concat(g.step(1 / 30, {}));
  assert.equal(s.dock.phase, 'arriving'); assert.equal(s.dock.open, false, 'pintu menutup sebelum truk masuk'); assert.ok(evs.some(e => e.type === 'dock:truck'));
  run(g, 4.1); assert.equal(s.sack.mode, 'floor'); assert.ok(s.dock.open); assert.deepEqual([s.sack.x, s.sack.y], [6, 5]);
});

test('truk menunggu bila ada pemain di dalam dock', () => {
  const g = mk(), s = g.state; run(g, 4.2);
  s.sack.mode = 'none'; s.dock.phase = 'waiting'; s.dock.t = 0.1; put(g, 'p1', 6.5, 5.5);
  run(g, 3); assert.equal(s.dock.phase, 'waiting'); assert.equal(s.dock.open, true);
  put(g, 'p1', 4, 6); run(g, 0.2); assert.equal(s.dock.phase, 'arriving');
});

test('peti kosong menolak ambil; stage tanpa dock tidak berubah', () => {
  const g = mk(), s = g.state, dough = s.stations.find(x => x.id === 'dough'); run(g, 4.2); dough.stock = 0;
  const p = put(g, 'p1', 1.0, 2.0); p.facingX = 0; p.facingY = -1; const ev = act(g, 'p1', ++n);
  assert.ok(ev.some(e => e.code === 'crate_empty')); assert.equal(p.held, null);
  const g2 = createGame({ seed: 1, players: ['p1'], config: S.get(2).config }); g2.start(); assert.equal(g2.state.sack, null); assert.equal(g2.state.dock, null);
});
