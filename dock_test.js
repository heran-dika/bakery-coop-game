'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { createGame } = require('./core.js'); const S = require('./stages.js');
const mk = () => { const g = createGame({ seed: 3, players: ['p1', 'p2'], config: S.get(3).config }); g.start(); return g; };
const run = (g, sec, inp) => { let ev = []; for (let i = 0; i < Math.round(sec * 30); i++) ev = ev.concat(g.step(1 / 30, typeof inp === 'function' ? inp(i) : (inp || {}))); return ev; };
const put = (g, id, x, y) => { const p = g.state.players.find(q => q.id === id); p.x = x; p.y = y; p.held = null; return p; };
const act = (g, id) => g.step(0, { [id]: { interact: 'r' + (++n) } });
const W = { xm: { sx: -0.894, sy: -0.447 }, xp: { sx: 0.894, sy: 0.447 }, ym: { sx: 0.894, sy: -0.447 }, yp: { sx: -0.894, sy: 0.447 } };   // input layar untuk gerak sepanjang sumbu dunia
let n = 100;
const ready = () => { const g = mk(); run(g, 4.2); return g; };

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

test('tidak pernah diangkat: sendirian memegang lalu menyeret pelan (1/4), pemain terkunci di sisi karung', () => {
  const g = ready(), s = g.state, a = put(g, 'p1', 5.05, 5.0);
  assert.equal(g.targetOf('p1'), 'sack');
  act(g, 'p1'); assert.equal(s.sack.mode, 'drag'); assert.equal(s.sack.axis, 'x'); assert.deepEqual(s.sack.grip, ['p1']); assert.equal(a.held, null);
  const x0 = s.sack.x; run(g, 1, { p1: W.xm }); const d = x0 - s.sack.x;
  assert.ok(Math.abs(d - 0.6) < 0.1, 'sendirian geser ' + d.toFixed(2) + ' per detik (harapan ±0,6)');
  assert.ok(Math.abs(a.x - (s.sack.x - 0.95)) < 1e-6, 'pemain tetap di sisi kiri karung');
  act(g, 'p1'); assert.equal(s.sack.mode, 'floor'); assert.ok(Number.isInteger(s.sack.y));
});

test('berdua: searah = cepat langsung; berlawanan = berhenti; satu diam = tetap pelan', () => {
  const g = ready(), s = g.state, a = put(g, 'p1', 5.05, 5.0), b = put(g, 'p2', 6.95, 5.0);
  act(g, 'p1'); act(g, 'p2'); assert.deepEqual(s.sack.grip, ['p1', 'p2']); assert.deepEqual(s.sack.side, [-1, 1]);
  let x0 = s.sack.x; run(g, 1, { p1: W.xm }); const solo = x0 - s.sack.x;                       // p2 hanya memegang
  x0 = s.sack.x; run(g, 0.5, { p1: W.xm, p2: W.xp }); assert.equal(s.sack.x, x0, 'berlawanan arah: diam');
  x0 = s.sack.x; run(g, 1, { p1: W.xm, p2: W.xm }); const two = x0 - s.sack.x;
  assert.ok(two > 2.2, 'berdua searah normal: ' + two.toFixed(2)); assert.ok(solo < 0.8, 'satu menarik, satu diam: ' + solo.toFixed(2));
  assert.ok(two / solo > 3, 'bantu dorong langsung jauh lebih cepat');
});

test('pegang dari sisi salah ditolak; pegang dari seberang diterima', () => {
  const g = ready(), s = g.state, a = put(g, 'p1', 5.05, 5.0); act(g, 'p1');
  put(g, 'p2', 5.1, 5.1); let ev = act(g, 'p2'); assert.ok(ev.some(e => e.code === 'sack_align'), 'sisi sama ditolak'); assert.equal(s.sack.grip.length, 1);
  put(g, 'p2', 6.0, 5.95); ev = act(g, 'p2'); assert.ok(ev.some(e => e.code === 'sack_align'), 'sumbu berbeda ditolak'); assert.equal(s.sack.grip.length, 1);
  put(g, 'p2', 6.9, 5.0); act(g, 'p2'); assert.equal(s.sack.grip.length, 2);
});

test('alur penuh: dock -> sudut (satu dorong pelan) -> lorong -> restok; stok penuh lagi; truk berikutnya', () => {
  const g = ready(), s = g.state, dough = s.stations.find(x => x.id === 'dough');
  for (let i = 0; i < 3; i++) { put(g, 'p1', 1.0, 2.0); s.players[0].facingX = 0; s.players[0].facingY = -1; act(g, 'p1'); }
  assert.equal(dough.stock, 2, 'tiga kali ambil adonan: stok 5 -> 2');
  const a = put(g, 'p1', 5.05, 5.0), b = put(g, 'p2', 6.95, 5.0); act(g, 'p1'); act(g, 'p2');
  run(g, 6, { p1: W.xm, p2: W.xm });
  assert.ok(s.sack.x > 1.4 && s.sack.x < 1.7, 'berhenti di sudut karena penarik mentok tembok: x=' + s.sack.x.toFixed(2));
  act(g, 'p1'); assert.deepEqual(s.sack.grip, ['p2']);                                           // p1 lepas, naik lewat lorong
  const xs = s.sack.x; run(g, 1, { p2: W.xm }); assert.ok(xs - s.sack.x < 0.7 && xs - s.sack.x > 0.1, 'p2 sendirian pelan: ' + (xs - s.sack.x).toFixed(2));
  run(g, 3, { p2: W.xm }); assert.ok(Math.abs(s.sack.x - 1) < 0.01, 'sampai ujung lorong x1: ' + s.sack.x); assert.equal(s.sack.y, 5);
  act(g, 'p2'); assert.equal(s.sack.mode, 'floor');
  put(g, 'p1', 1.0, 4.03); put(g, 'p2', 1.0, 5.93);
  act(g, 'p1'); assert.equal(s.sack.axis, 'y'); assert.deepEqual(s.sack.side, [-1]); act(g, 'p2'); assert.deepEqual(s.sack.side, [-1, 1]);
  const ev = run(g, 2, { p1: W.ym, p2: W.ym });
  assert.ok(ev.some(e => e.type === 'dock:restock'), 'restok terjadi');
  assert.equal(dough.stock, 5); assert.equal(s.sack.mode, 'none'); assert.equal(s.sack.grip.length, 0); assert.equal(s.dock.phase, 'waiting');
  let evs = []; for (let i = 0; i < 200 && s.dock.phase === 'waiting'; i++) evs = evs.concat(g.step(1 / 30, {}));
  assert.equal(s.dock.phase, 'arriving'); assert.equal(s.dock.open, false, 'pintu menutup sebelum truk masuk'); assert.ok(evs.some(e => e.type === 'dock:truck'));
  run(g, 4.1); assert.equal(s.sack.mode, 'floor'); assert.ok(s.dock.open); assert.deepEqual([s.sack.x, s.sack.y], [6, 5]);
});

test('truk menunggu bila ada pemain di dalam dock', () => {
  const g = ready(), s = g.state; s.sack.mode = 'none'; s.dock.phase = 'waiting'; s.dock.t = 0.1; put(g, 'p1', 6.5, 5.5);
  run(g, 3); assert.equal(s.dock.phase, 'waiting'); assert.equal(s.dock.open, true);
  put(g, 'p1', 4, 6); run(g, 0.2); assert.equal(s.dock.phase, 'arriving');
});

test('peti kosong menolak ambil; stage tanpa dock tidak berubah', () => {
  const g = ready(), s = g.state, dough = s.stations.find(x => x.id === 'dough'); dough.stock = 0;
  const p = put(g, 'p1', 1.0, 2.0); p.facingX = 0; p.facingY = -1; const ev = act(g, 'p1');
  assert.ok(ev.some(e => e.code === 'crate_empty')); assert.equal(p.held, null);
  const g2 = createGame({ seed: 1, players: ['p1'], config: S.get(2).config }); g2.start(); assert.equal(g2.state.sack, null); assert.equal(g2.state.dock, null);
});
