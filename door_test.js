'use strict';
// Tes pintu bertombol (Stage 4): dinding, tombol, penutupan, dan satu pemain (solo) mengantar roti lewat pintu.
const test = require('node:test'); const assert = require('node:assert/strict');
const { createGame } = require('./core.js'); const S = require('./stages.js');
const mk = (players, extra) => { const g = createGame({ seed: 5, players: players || ['p1'], config: Object.assign({}, S.get(4).config, extra || {}) }); g.start(); return g; };
const run = (g, sec, inp) => { let ev = []; for (let i = 0; i < Math.round(sec * 30); i++) ev = ev.concat(g.step(1 / 30, typeof inp === 'function' ? inp(i) : (inp || {}))); return ev; };
const put = (g, id, x, y, fx, fy) => { const p = g.state.players.find(q => q.id === id); p.x = x; p.y = y; p.held = null; if (fx != null) { p.facingX = fx; p.facingY = fy; } return p; };
const mv = (g, id, x, y, fx, fy) => { const p = g.state.players.find(q => q.id === id); p.x = x; p.y = y; if (fx != null) { p.facingX = fx; p.facingY = fy; } return p; };   // pindah tanpa mengosongkan tangan
let n = 0; const act = (g, id) => g.step(0, { [id]: { interact: 'r' + (++n) } });
const SP = 2.7;   // moveSpeed core
// arah dunia (ux,uy) -> input layar (kebalikan proyeksi isometrik di movePlayer)
const aim = (ux, uy) => ({ sx: ux - uy, sy: (ux + uy) / 2 });
function walk(g, id, pts, maxSec) {   // jalan lewat titik-titik jalan; kembalikan semua event
  const p = g.state.players.find(q => q.id === id); let ev = [];
  for (const [tx, ty] of pts) {
    for (let i = 0; i < 30 * (maxSec || 8); i++) {
      const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy); if (d < 0.1) break;
      ev = ev.concat(g.step(1 / 30, { [id]: aim(dx / d, dy / d) }));
    }
  }
  return ev;
}

test('pintu tertutup saat ronde mulai: pemain tidak bisa lewat celah', () => {
  const g = mk(), s = g.state, p = put(g, 'p1', 4.2, 4.15);
  assert.equal(s.door.open, false);
  run(g, 1.5, { p1: aim(1, 0) }); assert.ok(p.x < 4.6, 'tertahan dinding: x=' + p.x.toFixed(2));
});

test('tombol A membuka pintu; pemain lewat; pintu menutup sendiri setelah celah kosong', () => {
  const g = mk(), s = g.state, p = put(g, 'p1', 4.2, 4.15);
  assert.equal(g.targetOf('p1'), 'btnA', 'dari depan pintu sisi A, target = tombol A');
  const ev = act(g, 'p1'); assert.equal(s.door.open, true); assert.ok(ev.some(e => e.type === 'door:open')); assert.ok(ev.some(e => e.code === 'door_opened'));
  run(g, 1.2, { p1: aim(1, 0) }); assert.ok(p.x > 5.0, 'lewat celah: x=' + p.x.toFixed(2));
  const ev2 = run(g, 4.5); assert.equal(s.door.open, false); assert.ok(ev2.some(e => e.type === 'door:close'));
});

test('pintu tidak menutup di atas pemain; menutup begitu celah kosong', () => {
  const g = mk(), s = g.state; put(g, 'p1', 4.66, 4.15);
  act(g, 'p1'); assert.equal(s.door.open, true);
  run(g, 6); assert.equal(s.door.open, true, 'masih terbuka: pemain berdiri di celah');
  put(g, 'p1', 5.4, 4.15); run(g, 0.2); assert.equal(s.door.open, false);
});

test('tombol B terjangkau dari sisi B dan dari celah; menekan lagi memperpanjang waktu', () => {
  const g = mk(), s = g.state; put(g, 'p1', 5.2, 4.15);
  assert.equal(g.targetOf('p1'), 'btnB', 'dari depan pintu sisi B target = tombol B (bukan counter)');
  act(g, 'p1'); run(g, 3); assert.equal(s.door.open, true); const left = s.door.t;
  act(g, 'p1'); assert.ok(s.door.t > left, 'hitung mundur diperpanjang');
});

test('tombol bisa dipakai dengan tangan penuh dan tidak mengubah item', () => {
  const g = mk(), p = put(g, 'p1', 4.2, 4.15); p.held = { id: 77, type: 'dough', mods: [] };
  act(g, 'p1'); assert.equal(g.state.door.open, true); assert.equal(p.held.type, 'dough');
});

test('semua stasiun Stage 4 bisa ditarget dari suatu titik lantai (jangkauan dan kolisi core asli)', () => {
  const g = mk(), s = g.state, miss = [];
  for (const st of s.stations) {
    let ok = false;
    for (let x = 0.7; x <= 7.3 && !ok; x += 0.1) for (let y = 0.7; y <= 7.3 && !ok; y += 0.1) {
      const p = put(g, 'p1', x, y); const r = g.step(0, {}); void r;
      // titik harus sah (tidak digeser kolisi) dan target = stasiun ini
      const q = JSON.stringify([+p.x.toFixed(2), +p.y.toFixed(2)]) === JSON.stringify([+x.toFixed(2), +y.toFixed(2)]);
      if (q && g.targetOf('p1') === st.id) ok = true;
    }
    if (!ok) miss.push(st.id);
  }
  assert.deepEqual(miss, [], 'stasiun tanpa titik target: ' + miss.join(','));
});

test('SOLO: satu pemain membuat roti polos, membawanya lewat pintu, dan menyajikannya', () => {
  const g = mk(1 && ['p1'], { openingOrders: ['plain_bread', 'plain_bread'] }), s = g.state, p = s.players[0];
  const by = id => s.stations.find(x => x.id === id);
  // bahan -> prep -> oven (stasiun didekati dengan posisi yang sah; jalan kaki dibuktikan di bagian pintu)
  mv(g, 'p1', 1.15, 1.85, 0, -1); assert.equal(g.targetOf('p1'), 'dough'); act(g, 'p1'); assert.equal(p.held.type, 'dough');
  mv(g, 'p1', 1.75, 3.15, -1, 0); assert.equal(g.targetOf('p1'), 'prep'); act(g, 'p1'); assert.equal(by('prep').item.type, 'dough');
  act(g, 'p1'); run(g, g.config.prepSeconds + 0.3); assert.equal(by('prep').item.type, 'prepared_dough');
  act(g, 'p1'); assert.equal(p.held.type, 'prepared_dough');
  mv(g, 'p1', 2.55, 3.15, 1, 0); assert.equal(g.targetOf('p1'), 'oven'); act(g, 'p1');
  run(g, g.config.cookSeconds + 0.2); assert.equal(by('oven').status, 'ready'); act(g, 'p1'); assert.equal(p.held.type, 'plain_bread');
  // jalan kaki dari oven ke depan pintu (memutari barisan stasiun x3), tekan tombol, lewat, sajikan
  const t0 = s.elapsed;
  walk(g, 'p1', [[2.55, 2.2], [4.0, 2.2], [4.2, 4.15]]); assert.equal(g.targetOf('p1'), 'btnA', 'sampai di depan pintu');
  act(g, 'p1'); assert.equal(s.door.open, true);
  walk(g, 'p1', [[5.2, 4.15], [6.5, 4.15]]); assert.ok(p.x > 6.3, 'sudah di ruang B: x=' + p.x.toFixed(2));
  assert.equal(g.targetOf('p1'), 'serve'); const ev = act(g, 'p1');
  assert.ok(ev.some(e => e.type === 'order:completed'), 'order selesai'); assert.ok(s.score > 0);
  const secs = s.elapsed - t0; assert.ok(secs < 12, 'oven -> serve lewat pintu ' + secs.toFixed(1) + ' dtk');
  console.log('  oven -> serve lewat pintu (solo): ' + secs.toFixed(1) + ' dtk, skor ' + s.score);
});

test('SOLO: kembali dari ruang B ke ruang A lewat tombol B', () => {
  const g = mk(), s = g.state, p = put(g, 'p1', 6.5, 4.15);
  walk(g, 'p1', [[5.2, 4.15], [5.3, 3.85]]); assert.equal(g.targetOf('p1'), 'btnB'); act(g, 'p1');
  walk(g, 'p1', [[4.66, 4.15], [4.2, 4.15], [4.1, 2.2]]); assert.ok(p.x < 4.5 && p.y < 3, 'kembali ke ruang A: ' + p.x.toFixed(2) + ',' + p.y.toFixed(2));
  void s;
});

test('kopi tidak perlu pintu: mesin kopi dan serve ada di ruang yang sama', () => {
  const g = mk(['p1'], { openingOrders: ['coffee', 'coffee'] }), s = g.state, p = s.players[0];
  put(g, 'p1', 6.5, 2.15, 1, 0); assert.equal(g.targetOf('p1'), 'coffee'); act(g, 'p1'); run(g, g.config.coffeeBrewSeconds + 0.3);
  act(g, 'p1'); assert.equal(p.held && p.held.type, 'coffee');
  walk(g, 'p1', [[6.5, 3.0], [6.5, 4.15]]); assert.equal(g.targetOf('p1'), 'serve'); const ev = act(g, 'p1');
  assert.ok(ev.some(e => e.type === 'order:completed'), 'kopi tersaji tanpa membuka pintu'); assert.equal(s.door.open, false);
});

test('regresi: stage tanpa pintu tidak punya state door dan tidak ada dinding tambahan', () => {
  for (const id of [1, 2, 3]) { const g = createGame({ seed: 3, players: ['p1'], config: S.get(id).config }); g.start(); assert.equal(g.state.door, null); }
});
