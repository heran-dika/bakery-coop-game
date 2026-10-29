'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createGame, DEFAULT_CONFIG } = require('./core.js');

const AT = {   // titik berdiri dekat stasiun (hasil teleport, bukan hasil berjalan)
  dough: [1, 1.9], prep: [3, 1.9], oven: [5, 1.9], serve: [7, 1.9],
  butter: [1, 5.9], salt: [3, 5.9], trash: [7, 5.9]
};
let rid = 0;
function at(game, pid, where) {
  const p = game.state.players.find(q => q.id === pid);
  p.x = AT[where][0]; p.y = AT[where][1]; p.facingX = 0; p.facingY = -1;
  return p;
}
function act(game, pid, where) {
  at(game, pid, where);
  return game.step(0, { [pid]: { interact: ++rid } });
}
const codes = ev => ev.filter(e => e.type === 'msg').map(e => e.code);
const held = (game, pid = 'p1') => game.state.players.find(q => q.id === pid).held;

// Pembuat resep: kembalikan event serve terakhir.
function makeBread(game, pid, salty) {
  act(game, pid, 'dough');
  act(game, pid, 'prep');                 // taruh
  act(game, pid, 'prep');                 // mulai uleni
  game.step(DEFAULT_CONFIG.prepSeconds + 0.1, {});
  if (salty) {
    act(game, pid, 'butter'); act(game, pid, 'prep');
    act(game, pid, 'salt');   act(game, pid, 'prep');
  }
  act(game, pid, 'prep');                 // ambil adonan siap panggang
  act(game, pid, 'oven');                 // masukkan
  game.step(DEFAULT_CONFIG.cookSeconds + 0.1, {});
  act(game, pid, 'oven');                 // ambil roti matang
}

test('core.js tidak menyentuh DOM, waktu sistem, atau Math.random', () => {
  const src = fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//, '');
  for (const bad of ['document', 'window', 'Math.random', 'Date.now', 'performance.now', 'localStorage']) {
    assert.equal(src.includes(bad), false, `core.js mengandung ${bad}`);
  }
});

test('seed sama + input sama => state identik; seed beda => beda', () => {
  const script = g => {
    g.start();
    for (let i = 0; i < 2400; i++) g.step(0.1, { p1: { sx: Math.sin(i / 7), sy: Math.cos(i / 11) } });
    return JSON.stringify(g.snapshot());
  };
  const a = script(createGame({ seed: 42 }));
  const b = script(createGame({ seed: 42 }));
  const c = script(createGame({ seed: 43 }));
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('hasil tidak bergantung pada ukuran tick (dt dipecah per maxStep)', () => {
  const run = dt => {
    const g = createGame({ seed: 7 }); g.start();
    const n = Math.round(60 / dt);
    for (let i = 0; i < n; i++) g.step(dt, { p1: { sx: 0.6, sy: -0.3 } });
    const s = g.snapshot();
    return [s.orders.map(o => o.type + o.id).join(), s.hazards.length];
  };
  assert.deepEqual(run(0.05), run(0.025));
});

test('shokupan: adonan -> prep -> uleni -> oven -> sajikan (+125), dan salt bread dengan combo (+135)', () => {
  const g = createGame({ seed: 1 }); g.start();
  makeBread(g, 'p1', false);
  assert.equal(held(g).type, 'plain_bread');
  const ev1 = act(g, 'p1', 'serve');
  const done1 = ev1.find(e => e.type === 'order:completed');
  assert.ok(done1); assert.equal(done1.earned, 125); assert.equal(g.state.score, 125);

  makeBread(g, 'p1', true);
  assert.equal(held(g).type, 'salt_bread');
  const done2 = act(g, 'p1', 'serve').find(e => e.type === 'order:completed');
  assert.equal(done2.combo, 10); assert.equal(done2.earned, 135);
  assert.equal(g.state.score, 260); assert.equal(g.state.ordersServed, 2);
});

test('hanya satu tambahan (mentega saja) => roti gagal, bukan salt bread', () => {
  const g = createGame({ seed: 1 }); g.start();
  act(g, 'p1', 'dough'); act(g, 'p1', 'prep'); act(g, 'p1', 'prep');
  g.step(3, {});
  act(g, 'p1', 'butter'); act(g, 'p1', 'prep');
  act(g, 'p1', 'prep'); act(g, 'p1', 'oven');
  g.step(DEFAULT_CONFIG.cookSeconds + 0.1, {});
  act(g, 'p1', 'oven');
  assert.equal(held(g).type, 'failed_bread');
});

test('oven: matang di detik 6, gosong di detik 14', () => {
  const g = createGame({ seed: 1 }); g.start();
  act(g, 'p1', 'dough'); act(g, 'p1', 'prep'); act(g, 'p1', 'prep');
  g.step(3, {}); act(g, 'p1', 'prep'); act(g, 'p1', 'oven');
  const oven = g.state.stations.find(s => s.id === 'oven');
  g.step(5.9, {}); assert.equal(oven.status, 'cooking');
  g.step(0.2, {}); assert.equal(oven.status, 'ready');
  g.step(7.7, {}); assert.equal(oven.status, 'ready');
  const ev = g.step(0.3, {});
  assert.equal(oven.status, 'burnt'); assert.equal(g.state.burntCount, 1);
  assert.ok(ev.some(e => e.type === 'oven:burnt'));
});

test('order kedaluwarsa memberi penalti dan memutus combo', () => {
  const g = createGame({ seed: 1, config: { hazard: { enabled: false } } }); g.start();
  const ev = g.step(45.5, {});
  assert.ok(ev.filter(e => e.type === 'order:expired').length >= 2);
  assert.ok(g.state.score <= -100);
  assert.equal(g.state.streak, 0);
});

test('request_id yang sama tidak diproses dua kali (idempoten)', () => {
  const g = createGame({ seed: 1 }); g.start();
  at(g, 'p1', 'dough');
  const first = g.step(0, { p1: { interact: 'req-1' } });
  const again = g.step(0, { p1: { interact: 'req-1' } });
  assert.deepEqual(codes(first), ['picked']);
  assert.deepEqual(codes(again), []);
  const second = g.step(0, { p1: { interact: 'req-2' } });
  assert.deepEqual(codes(second), ['hands_full']);
});

test('dua pemain: tangan terpisah, skor dan combo bersama', () => {
  const g = createGame({ seed: 1, players: ['a', 'b'] }); g.start();
  act(g, 'a', 'dough');
  assert.equal(held(g, 'a').type, 'dough');
  assert.equal(held(g, 'b'), null);
  act(g, 'b', 'butter');
  assert.equal(held(g, 'b').type, 'butter');
  assert.equal(held(g, 'a').type, 'dough');
  makeBread(g, 'b', false);   // b menumpuk di stasiun yang sama; a masih memegang adonan
  assert.equal(held(g, 'a').type, 'dough');
});

test('trash: penalti, combo reset, tangan kosong', () => {
  const g = createGame({ seed: 1 }); g.start();
  act(g, 'p1', 'dough');
  const ev = act(g, 'p1', 'trash');
  assert.deepEqual(codes(ev), ['trashed']);
  assert.ok(ev.some(e => e.type === 'item:trashed' && e.penalty === DEFAULT_CONFIG.trashPenalty));
  assert.equal(g.state.score, -DEFAULT_CONFIG.trashPenalty);
  assert.equal(held(g), null);
});

test('ronde berakhir tepat sekali di 240 detik dan setelah itu step tidak melakukan apa-apa', () => {
  const g = createGame({ seed: 3 }); g.start();
  let ended = 0;
  for (let i = 0; i < 2600; i++) ended += g.step(0.1, {}).filter(e => e.type === 'round:ended').length;
  assert.equal(ended, 1);
  assert.equal(g.state.mode, 'ended');
  assert.equal(g.step(1, {}).length, 0);
});

test('kolisi: tidak menembus jejak kubus, tidak keluar batas, dan tidak nyangkut di ujung meja', () => {
  const C = DEFAULT_CONFIG.collision;
  const g = createGame({ seed: 1, config: { hazard: { enabled: false } } }); g.start();
  const p = g.state.players[0];
  const dirs = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [-1, 0], [1, 0], [0, 1]];
  for (const [sx, sy] of dirs) {
    for (let i = 0; i < 300; i++) {
      g.step(0.05, { p1: { sx, sy } });
      assert.ok(p.x >= C.reachMin - 1e-9 && p.x <= C.reachMaxX + 1e-9 && p.y >= C.reachMin - 1e-9 && p.y <= C.reachMaxY + 1e-9, 'keluar batas');
      for (const st of g.state.stations) {
        const cx = st.x + C.footOffset, cy = st.y + C.footOffset, h = C.footHalf;
        const qx = Math.max(cx - h, Math.min(p.x, cx + h)), qy = Math.max(cy - h, Math.min(p.y, cy + h));
        assert.ok(Math.hypot(p.x - qx, p.y - qy) >= C.bodyR - 1e-6, `menembus ${st.id}`);
      }
    }
  }
});

test('kolisi: bergerak menyamping di sisi meja tetap meluncur (tidak nyangkut)', () => {
  const g = createGame({ seed: 1, config: { hazard: { enabled: false } } }); g.start();
  const p = g.state.players[0];
  p.x = 3.0; p.y = 2.2;                                   // tepat di bawah meja prep (3,1), badan menyentuh jejak
  const y0 = p.y;
  for (let i = 0; i < 20; i++) g.step(0.05, { p1: { sx: 1, sy: 1 } });   // arah layar kanan-bawah = +x di grid
  assert.ok(p.x > 3.5, `nyangkut di x=${p.x.toFixed(2)}`);
  assert.ok(p.y >= y0 - 0.5);
});

test('hanya satu meja serve dan sembilan stasiun', () => {
  const g = createGame({ seed: 1 }); g.start();
  assert.equal(g.state.stations.length, 9);
  assert.equal(g.state.stations.filter(s => s.type === 'serve').length, 1);
});

test('snapshot adalah salinan polos dan bisa di-JSON-kan', () => {
  const g = createGame({ seed: 1 }); g.start();
  const snap = g.snapshot();
  snap.score = 999; snap.players[0].x = -5;
  assert.equal(g.state.score, 0);
  assert.notEqual(g.state.players[0].x, -5);
  assert.equal(JSON.stringify(snap).includes('seen'), false);
});

test('reset(): state idle tanpa order; step tidak melakukan apa-apa; start() sesudahnya jalan normal', () => {
  const g = createGame({ seed: 5 });
  g.reset();
  assert.equal(g.state.mode, 'idle');
  assert.equal(g.state.orders.length, 0);
  assert.equal(g.step(1, {}).length, 0);
  assert.equal(g.state.elapsed, 0);
  g.start();
  assert.equal(g.state.mode, 'running');
  assert.equal(g.state.orders.length, 2);
});

test('event order membawa index slot antrean (dipakai render untuk menggeser kotak)', () => {
  const g = createGame({ seed: 1 }); g.start();
  makeBread(g, 'p1', true);                                    // salt_bread = order ke-2 (index 1)
  const done = act(g, 'p1', 'serve').find(e => e.type === 'order:completed');
  assert.equal(done.index, 1);
  const g2 = createGame({ seed: 1, config: { hazard: { enabled: false } } }); g2.start();
  const exp = g2.step(45.5, {}).filter(e => e.type === 'order:expired');
  assert.deepEqual(exp.map(e => e.index).slice(0, 2), [1, 0]);  // dihapus dari belakang ke depan
});

test('addStation: stasiun baru bisa dipakai saat ronde berjalan, ikut snapshot, menghalangi gerak, hilang saat reset', () => {
  const g = createGame({ seed: 1, config: { stations: [{ id: 'dough', type: 'crate', gives: 'dough', x: 1, y: 1 }, { id: 'prep', type: 'prep', x: 3, y: 1 }] } });
  g.start();
  at(g, 'p1', 'oven'); assert.deepEqual(codes(g.step(0, { p1: { interact: ++rid } })), ['too_far'], 'belum ada oven');
  const o = g.addStation({ id: 'oven', type: 'oven', x: 5, y: 1 });
  assert.equal(o.status, 'empty'); assert.equal(g.addStation({ id: 'oven', type: 'oven', x: 5, y: 1 }), o, 'id yang sama tidak dobel');
  assert.ok(g.snapshot().stations.some(s => s.id === 'oven'), 'ikut snapshot');
  at(g, 'p1', 'oven'); assert.deepEqual(codes(g.step(0, { p1: { interact: ++rid } })), ['oven_needs_prepared'], 'oven baru bisa ditargetkan');
  const p = g.state.players[0]; p.x = 5.15; p.y = 1.15; g.step(0.2, { p1: { sx: 0, sy: 0 } });
  p.x = 5.15; p.y = 2.4; for (let i = 0; i < 20; i++) g.step(0.05, { p1: { sx: -1, sy: -1 } });   // dorong ke arah oven: kolisi berlaku
  assert.ok(Math.hypot(p.x - 5.15, p.y - 1.15) > 0.3, 'badan tidak menembus oven baru');
  g.reset(); assert.ok(!g.state.stations.some(s => s.id === 'oven'), 'reset kembali ke daftar awal');
});
