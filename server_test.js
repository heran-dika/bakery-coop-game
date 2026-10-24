'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connectClient } = require('socket.io-client');
const { createGameServer } = require('./server.js');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const AT = { dough: [1, 1.9], prep: [3, 1.9], oven: [5, 1.9], serve: [7, 1.9], butter: [1, 5.9], salt: [3, 5.9], trash: [7, 5.9], counter1: [2, 3.9] };

async function boot(opts) {
  const srv = createGameServer(Object.assign({ autoTick: false, countdownSeconds: 1, origins: ['*'] }, opts));
  await new Promise(r => srv.listen(0, r));
  const port = srv.httpServer.address().port;
  const clients = [];
  const client = async () => {
    const sock = connectClient(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true });
    const got = []; sock.onAny((ev, p) => got.push([ev, p]));
    await new Promise((res, rej) => { sock.on('connect', res); sock.on('connect_error', rej); });
    const c = { sock, got,
      all: ev => got.filter(g => g[0] === ev).map(g => g[1]),
      last: ev => { const a = got.filter(g => g[0] === ev); return a.length ? a[a.length - 1][1] : null; } };
    clients.push(c); return c;
  };
  const stop = async () => { for (const c of clients) c.sock.close(); await srv.close(); };
  return { srv, port, client, stop };
}
async function until(fn, ms = 1500) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(5); } return false; }
async function lobbyOf(env, n, name = 'Rina') {            // n klien dalam satu room, belum ready
  const cs = []; for (let i = 0; i < n; i++) cs.push(await env.client());
  cs[0].sock.emit('room:create', { name });
  assert.ok(await until(() => cs[0].last('room:state')), 'room:state untuk pembuat');
  const code = cs[0].last('room:state').code;
  for (let i = 1; i < n; i++) { cs[i].sock.emit('room:join', { code, name: 'Bima' + i }); assert.ok(await until(() => cs[i].last('room:state'))); }
  return { cs, code, room: env.srv.rooms.get(code) };
}
async function startRound(env, n) {
  const L = await lobbyOf(env, n);
  for (const c of L.cs) c.sock.emit('lobby:ready', { ready: true });
  assert.ok(await until(() => L.room.phase === 'countdown'), 'masuk countdown');
  env.srv.advance(L.code, 1.2);
  assert.ok(await until(() => L.cs.every(c => c.last('round:started'))), 'round:started diterima semua');
  return L;
}
const place = (room, slot, where) => { const p = room.game.state.players.find(x => x.id === slot); [p.x, p.y] = AT[where]; p.facingX = 0; p.facingY = -1; };
let rid = 0;
async function act(env, L, who, where, requestId = ++rid) {            // teleport lalu kirim intent interaksi lewat socket
  place(L.room, L.cs[who].last('room:state').you, where);
  L.cs[who].sock.emit('station:interact', { requestId });
  await sleep(25); env.srv.advance(L.code, 2 / 30); await sleep(25);
}

test('GET /health menjawab dan melaporkan jumlah room', async () => {
  const env = await boot();
  const r = await fetch(`http://localhost:${env.port}/health`).then(x => x.json());
  assert.equal(r.ok, true); assert.equal(r.rooms, 0);
  await env.stop();
});

test('lobby: buat room, gabung dengan kode, host dan slot benar; nama dibersihkan', async () => {
  const env = await boot();
  const a = await env.client();
  a.sock.emit('room:create', { name: '<b>Rina</b>"&' });
  assert.ok(await until(() => a.last('room:state')));
  const code = a.last('room:state').code;
  assert.match(code, /^[A-Z2-9]{4}$/);
  assert.equal(a.last('room:state').you, 'p1');
  assert.doesNotMatch(a.last('room:state').players[0].name, /[<>"&']/);
  const b = await env.client();
  b.sock.emit('room:join', { code: code.toLowerCase(), name: 'Bima' });
  assert.ok(await until(() => b.last('room:state')));
  assert.equal(b.last('room:state').you, 'p2');
  assert.ok(await until(() => a.last('room:state').players.length === 2));
  assert.equal(a.last('room:state').players.filter(p => p.host).length, 1);
  await env.stop();
});

test('lobby: kode salah, room penuh, dan bergabung setelah ronde mulai ditolak', async () => {
  const env = await boot();
  const x = await env.client();
  x.sock.emit('room:join', { code: 'ZZZZ', name: 'x' });
  assert.ok(await until(() => x.last('error:msg')));
  assert.equal(x.last('error:msg').code, 'room_not_found');
  const L = await lobbyOf(env, 4);
  const late = await env.client();
  late.sock.emit('room:join', { code: L.code, name: 'telat' });
  assert.ok(await until(() => late.last('error:msg')));
  assert.equal(late.last('error:msg').code, 'room_full');
  await env.stop();
  const env2 = await boot();
  const S = await startRound(env2, 1);
  const c = await env2.client();
  c.sock.emit('room:join', { code: S.code, name: 'telat' });
  assert.ok(await until(() => c.last('error:msg')));
  assert.equal(c.last('error:msg').code, 'room_started');
  await env2.stop();
});

test('ronde baru hanya mulai saat semua pemain ready, dengan seed yang sama untuk semua', async () => {
  const env = await boot({ minPlayers: 2 });
  const L = await lobbyOf(env, 2);
  L.cs[0].sock.emit('lobby:ready', { ready: true });
  await sleep(40); env.srv.advance(L.code, 2);
  assert.equal(L.room.phase, 'lobby');
  L.cs[1].sock.emit('lobby:ready', { ready: true });
  assert.ok(await until(() => L.room.phase === 'countdown'));
  env.srv.advance(L.code, 1.2);
  assert.ok(await until(() => L.cs.every(c => c.last('round:started'))));
  assert.equal(L.cs[0].last('round:started').seed, L.cs[1].last('round:started').seed);
  assert.deepEqual(L.cs[0].last('round:started').players, ['p1', 'p2']);
  assert.equal(L.room.phase, 'running');
  await env.stop();
});

test('co-op: dua pemain berbagi satu dapur; skor dan state identik di kedua client', async () => {
  const env = await boot();
  const L = await startRound(env, 2);
  const [A, B] = L.cs;
  await act(env, L, 0, 'dough');            // A ambil adonan
  await act(env, L, 0, 'prep');             // A taruh di prep
  await act(env, L, 1, 'prep');             // B mulai uleni
  env.srv.advance(L.code, 2.5);
  await act(env, L, 1, 'prep');             // B ambil adonan siap
  await act(env, L, 1, 'oven');             // B masukkan ke oven
  env.srv.advance(L.code, 6.1);
  await act(env, L, 1, 'oven');             // B ambil roti
  await act(env, L, 1, 'counter1');         // B taruh di counter
  await act(env, L, 0, 'counter1');         // A ambil dari counter
  await act(env, L, 0, 'serve');            // A sajikan
  await sleep(40);
  const sa = A.last('world:snapshot').snapshot, sb = B.last('world:snapshot').snapshot;
  assert.equal(sa.score, 125); assert.equal(sb.score, 125);
  assert.equal(sa.ordersServed, 1);
  assert.deepEqual(sa.orders, sb.orders);
  const done = A.all('game:events').flatMap(e => e.events).filter(e => e.type === 'order:completed');
  assert.equal(done.length, 1); assert.equal(done[0].player, 'p1');
  assert.deepEqual(A.all('game:events').map(e => e.tick), B.all('game:events').map(e => e.tick));
  await env.stop();
});

test('request_id yang sama tidak diproses dua kali; id baru diproses', async () => {
  const env = await boot();
  const L = await startRound(env, 1);
  place(L.room, 'p1', 'dough');
  L.cs[0].sock.emit('station:interact', { requestId: 'x1' });
  L.cs[0].sock.emit('station:interact', { requestId: 'x1' });
  await sleep(40); env.srv.advance(L.code, 0.2); await sleep(40);
  const codes = () => L.cs[0].all('game:events').flatMap(e => e.events).filter(e => e.type === 'msg').map(e => e.code);
  assert.deepEqual(codes(), ['picked']);
  L.cs[0].sock.emit('station:interact', { requestId: 'x2' });
  await sleep(40); env.srv.advance(L.code, 0.2); await sleep(40);
  assert.deepEqual(codes(), ['picked', 'hands_full']);
  await env.stop();
});

test('payload rusak, pengirim di luar room, dan banjir input tidak menjatuhkan server', async () => {
  const env = await boot();
  const lone = await env.client();
  for (const ev of ['room:create', 'room:join', 'lobby:ready', 'player:input', 'station:interact', 'room:rematch']) {
    lone.sock.emit(ev, 12345); lone.sock.emit(ev, 'x'); lone.sock.emit(ev, null); lone.sock.emit(ev, [1, 2]); lone.sock.emit(ev, { sx: 'a', requestId: {} });
  }
  await sleep(60);
  const S = await startRound(env, 1);
  for (let i = 0; i < 500; i++) S.cs[0].sock.emit('player:input', { sx: i % 2 ? 99 : NaN, sy: 'zig' });
  S.cs[0].sock.emit('player:input', { sx: 5, sy: -5 });
  await sleep(120);
  const inp = S.room.inputs.p1;
  assert.ok(!inp || (Math.abs(inp.sx) <= 1 && Math.abs(inp.sy) <= 1 && Number.isFinite(inp.sx) && Number.isFinite(inp.sy)));
  env.srv.advance(S.code, 1);
  const r = await fetch(`http://localhost:${env.port}/health`).then(x => x.json());
  assert.equal(r.ok, true);
  const outsider = await env.client();
  outsider.sock.emit('player:input', { sx: 1, sy: 0 }); outsider.sock.emit('station:interact', { requestId: 'zz' });
  await sleep(40);
  assert.equal(S.room.members.size, 1);
  await env.stop();
});

test('gerak lewat input: karakter bergeser di server dan terlihat di snapshot client', async () => {
  const env = await boot();
  const L = await startRound(env, 1);
  const x0 = L.room.game.state.players[0].x;
  L.cs[0].sock.emit('player:input', { sx: 1, sy: 0 });
  await sleep(40); env.srv.advance(L.code, 1); await sleep(40);
  const p = L.cs[0].last('world:snapshot').snapshot.players[0];
  assert.ok(Math.abs(p.x - x0) > 0.5, 'posisi berubah');
  await env.stop();
});

test('disconnect di tengah ronde: ronde jalan terus sampai selesai; rematch kembali ke lobby; room hilang saat kosong', async () => {
  const env = await boot();
  const L = await startRound(env, 2);
  const [A, B] = L.cs;
  B.sock.close();
  assert.ok(await until(() => A.last('room:state').players.some(p => !p.connected)));
  env.srv.advance(L.code, 241);
  assert.ok(await until(() => A.last('round:ended')));
  assert.equal(L.room.phase, 'ended');
  const before = A.all('world:snapshot').length;
  env.srv.advance(L.code, 5); await sleep(30);
  assert.equal(A.all('world:snapshot').length, before, 'tidak ada snapshot sesudah ronde berakhir');
  A.sock.emit('room:rematch');
  assert.ok(await until(() => L.room.phase === 'lobby'));
  assert.equal(L.room.members.size, 1);
  A.sock.emit('room:leave');
  assert.ok(await until(() => env.srv.rooms.size === 0));
  await env.stop();
});

test('host keluar di lobby: host dipindah ke pemain lain', async () => {
  const env = await boot();
  const L = await lobbyOf(env, 2);
  L.cs[0].sock.close();
  assert.ok(await until(() => L.cs[1].last('room:state').players.length === 1));
  assert.equal(L.cs[1].last('room:state').players[0].host, true);
  await env.stop();
});

test('waktu nyata (autoTick): countdown berjalan sendiri, tick sekitar 30 per detik, snapshot sekitar 15 per detik', async () => {
  const env = await boot({ autoTick: true, countdownSeconds: 0.3 });
  const L = await lobbyOf(env, 1);
  L.cs[0].sock.emit('lobby:ready', { ready: true });
  assert.ok(await until(() => L.cs[0].last('round:started'), 2000), 'ronde mulai sendiri setelah countdown');
  const t0 = L.room.tick, n0 = L.cs[0].all('world:snapshot').length;
  await sleep(1000);
  const ticks = L.room.tick - t0, snaps = L.cs[0].all('world:snapshot').length - n0;
  assert.ok(ticks >= 24 && ticks <= 36, `tick/detik = ${ticks}`);
  assert.ok(snaps >= 10 && snaps <= 18, `snapshot/detik = ${snaps}`);
  await env.stop();
});

test('quick join: kode kosong masuk ke room lobi terbuka; tanpa room error; room yang sudah jalan dilewati', async () => {
  const env = await boot();
  const lone = await env.client();
  lone.sock.emit('room:join', { name: 'x' });
  assert.ok(await until(() => lone.last('error:msg')));
  assert.equal(lone.last('error:msg').code, 'room_not_found');
  const a = await env.client();
  a.sock.emit('room:create', { name: 'Rina' });
  assert.ok(await until(() => a.last('room:state')));
  const code = a.last('room:state').code;
  const b = await env.client();
  b.sock.emit('room:join', { name: 'Bima' });
  assert.ok(await until(() => b.last('room:state')));
  assert.equal(b.last('room:state').code, code);
  assert.equal(b.last('room:state').you, 'p2');
  a.sock.emit('lobby:ready', { ready: true }); b.sock.emit('lobby:ready', { ready: true });
  assert.ok(await until(() => env.srv.rooms.get(code).phase === 'countdown'));
  const c = await env.client();
  c.sock.emit('room:join', { name: 'telat' });
  assert.ok(await until(() => c.last('error:msg')));
  assert.equal(c.last('error:msg').code, 'room_not_found');
  await env.stop();
});

test('net:ping dijawab dengan ack (untuk RTT)', async () => {
  const env = await boot();
  const a = await env.client();
  const ok = await new Promise(res => a.sock.timeout(1000).emit('net:ping', err => res(!err)));
  assert.equal(ok, true);
  await env.stop();
});
