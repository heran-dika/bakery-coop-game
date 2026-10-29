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

test('host putus di lobi: host dipindah, slot ditahan 60 detik, lalu dilepas', async () => {
  const env = await boot();
  const L = await lobbyOf(env, 2);
  L.cs[0].sock.close();
  assert.ok(await until(() => L.cs[1].last('room:state').players.some(p => !p.connected)));
  const st = L.cs[1].last('room:state');
  assert.equal(st.players.length, 2, 'slot yang putus masih ditahan');
  assert.equal(st.players.find(p => p.id === 'p2').host, true, 'host pindah ke pemain terhubung');
  env.srv.advance(L.code, 30); await sleep(30);
  assert.equal(L.room.members.size, 2, 'belum 60 detik');
  env.srv.advance(L.code, 31);
  assert.ok(await until(() => L.cs[1].last('room:state').players.length === 1), 'dilepas setelah 60 detik');
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

test('lobi berjalan: room:state memuat posisi; lobby:pos diteruskan ke pemain lain, dijepit, input rusak diabaikan', async () => {
  const env = await boot();
  const L = await lobbyOf(env, 2);
  const [A, B] = L.cs;
  const st = A.last('room:state');
  assert.ok(st.players.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), 'posisi awal ada');
  A.sock.emit('lobby:pos', { x: 4.25, y: 3.3 });
  assert.ok(await until(() => B.last('lobby:pos')));
  assert.deepEqual(B.last('lobby:pos'), { id: 'p1', x: 4.25, y: 3.3 });
  assert.equal(A.all('lobby:pos').length, 0, 'tidak dikirim balik ke pengirim');
  A.sock.emit('lobby:pos', { x: 999, y: -999 });
  assert.ok(await until(() => B.last('lobby:pos').x === 7.4));
  assert.equal(B.last('lobby:pos').y, 0.6);
  const n = B.all('lobby:pos').length;
  for (const bad of [{ x: 'a', y: 1 }, { x: NaN, y: 1 }, null, 5, [1, 2], { x: 1 }]) A.sock.emit('lobby:pos', bad);
  await sleep(60);
  assert.equal(B.all('lobby:pos').length, n, 'payload rusak tidak diteruskan');
  assert.equal(L.room.members.get(A.sock.id).x, 7.4);
  await env.stop();
});

test('chat: disiarkan ke seluruh room (termasuk pengirim), dibersihkan, dibatasi panjang dan laju, tidak bocor ke room lain', async () => {
  const env = await boot();
  const L = await lobbyOf(env, 2);
  const other = await lobbyOf(env, 1, 'Orang lain');
  const [A, B] = L.cs;
  A.sock.emit('chat:send', { text: '  Halo <script>alert(1)</script>\n\tteman  ' });
  assert.ok(await until(() => A.last('chat:message') && B.last('chat:message')));
  const m = B.last('chat:message');
  assert.equal(m.id, 'p1'); assert.equal(m.name, 'Rina');
  assert.doesNotMatch(m.text, /[<>\n\t]/); assert.equal(m.text, 'Halo scriptalert(1)/script teman');
  A.sock.emit('chat:send', { text: 'x'.repeat(500) });
  assert.ok(await until(() => A.all('chat:message').length === 2));
  assert.equal(A.last('chat:message').text.length, 80);
  for (const bad of ['', '   ', 5, null, { text: 5 }, { text: '<>' }]) A.sock.emit('chat:send', bad);
  await sleep(60);
  assert.equal(A.all('chat:message').length, 2, 'kosong dan non-string ditolak');
  for (let i = 0; i < 50; i++) B.sock.emit('chat:send', { text: 'spam ' + i });
  await sleep(120);
  assert.ok(B.all('chat:message').length <= 2 + 5 + 1, 'batas laju: ' + B.all('chat:message').length);
  assert.equal(other.cs[0].all('chat:message').length, 0, 'room lain tidak menerima');
  const lone = await env.client(); lone.sock.emit('chat:send', { text: 'halo' }); await sleep(50);
  assert.equal(lone.all('chat:message').length, 0, 'di luar room diabaikan');
  await env.stop();
});

test('snapshot memuat targets per pemain dari targetOf', async () => {
  const env = await boot();
  const L = await startRound(env, 2);
  place(L.room, 'p1', 'oven'); place(L.room, 'p2', 'dough');
  env.srv.advance(L.code, 0.2); await sleep(60);
  const sn = L.cs[0].last('world:snapshot').snapshot;
  assert.equal(sn.targets.p1, 'oven'); assert.equal(sn.targets.p2, 'dough');
  assert.deepEqual(sn.targets, L.cs[1].last('world:snapshot').snapshot.targets);
  await env.stop();
});

test('rematch mengembalikan posisi lobi ke titik awal', async () => {
  const env = await boot();
  const L = await startRound(env, 1);
  env.srv.advance(L.code, 241);
  assert.ok(await until(() => L.cs[0].last('round:ended')));
  L.cs[0].sock.emit('room:rematch');
  assert.ok(await until(() => L.room.phase === 'lobby'));
  const m = L.room.members.get(L.cs[0].sock.id);
  assert.deepEqual([m.x, m.y], [3.4, 6.15]);
  await env.stop();
});

const tokenOf = c => c.last('room:state').token;

test('rejoin di lobi: socket baru dengan token mengambil slot yang sama; host dan posisi terjaga', async () => {
  const env = await boot();
  const L = await lobbyOf(env, 2);
  const [A, B] = L.cs;
  assert.ok(tokenOf(A) && tokenOf(B) && tokenOf(A) !== tokenOf(B), 'tiap pemain punya token sendiri');
  assert.equal(A.last('room:state').players.every(p => p.token === undefined), true, 'token tidak bocor ke pemain lain');
  B.sock.emit('lobby:pos', { x: 5.5, y: 2.5 }); await sleep(40);
  const tok = tokenOf(B), code = L.code;
  B.sock.close();
  assert.ok(await until(() => A.last('room:state').players.find(p => p.id === 'p2').connected === false));
  const B2 = await env.client(); B2.sock.emit('room:rejoin', { code, token: tok });
  assert.ok(await until(() => B2.last('room:state')));
  const s2 = B2.last('room:state');
  assert.equal(s2.you, 'p2'); assert.equal(s2.token, tok);
  const me = s2.players.find(p => p.id === 'p2'); assert.deepEqual([me.x, me.y], [5.5, 2.5], 'posisi lobi terjaga');
  assert.ok(await until(() => A.last('room:state').players.find(p => p.id === 'p2').connected === true));
  assert.equal(A.last('room:state').players.find(p => p.id === 'p1').host, true, 'host tidak berubah');
  assert.equal(L.room.members.size, 2);
  await env.stop();
});

test('rejoin ditolak: token salah, kode salah, token pemain yang keluar sengaja, token room lain', async () => {
  const env = await boot();
  const L = await lobbyOf(env, 2); const O = await lobbyOf(env, 1, 'Orang lain');
  const [A, B] = L.cs; const tokB = tokenOf(B);
  const tryJoin = async (code, token) => { const c = await env.client(); c.sock.emit('room:rejoin', { code, token }); await until(() => c.last('error:msg') || c.last('room:state'), 300); return c; };
  for (const [code, tok] of [[L.code, 'salah'], ['ZZZZ', tokB], [O.code, tokB], [L.code, 123], [L.code, 'x'.repeat(100)], [L.code, undefined]]) {
    const c = await tryJoin(code, tok); assert.equal(c.last('error:msg') && c.last('error:msg').code, 'rejoin_failed', `${code}/${String(tok).slice(0, 5)}`); assert.equal(c.last('room:state'), null);
  }
  B.sock.emit('room:leave'); await until(() => L.room.members.size === 1);
  const c = await tryJoin(L.code, tokB); assert.equal(c.last('error:msg').code, 'rejoin_failed', 'keluar sengaja tidak bisa dibatalkan');
  assert.equal(L.room.members.size, 1);
  await env.stop();
});

test('rejoin saat sesi lama belum ketahuan putus: sesi lama dilepas, slot tidak dobel', async () => {
  const env = await boot();
  const L = await lobbyOf(env, 2); const [A, B] = L.cs; const tok = tokenOf(B);
  const B2 = await env.client(); B2.sock.emit('room:rejoin', { code: L.code, token: tok });
  assert.ok(await until(() => B2.last('room:state')));
  assert.ok(await until(() => B.last('error:msg') && B.last('error:msg').code === 'session_replaced'));
  assert.equal(L.room.members.size, 2); assert.equal(B2.last('room:state').you, 'p2');
  B.sock.emit('chat:send', { text: 'dari sesi lama' }); await sleep(60);
  assert.equal(A.all('chat:message').length, 0, 'sesi lama tidak lagi menjadi anggota room');
  B.sock.close(); await sleep(60);
  assert.equal(L.room.members.get(B2.sock.id).connected, true, 'putusnya sesi lama tidak menjatuhkan sesi baru');
  await env.stop();
});

test('rejoin di tengah ronde: karakter diam saat putus, ronde dilanjutkan dengan snapshot, aksi bekerja lagi', async () => {
  const env = await boot();
  const L = await startRound(env, 2); const [A, B] = L.cs; const tok = tokenOf(B), code = L.code;
  B.sock.emit('player:input', { sx: 1, sy: 0 }); await sleep(40); env.srv.advance(code, 0.3);
  B.sock.close();
  assert.ok(await until(() => A.last('room:state').players.find(p => p.id === 'p2').connected === false));
  const p2 = L.room.game.state.players[1]; const x0 = p2.x, y0 = p2.y;
  env.srv.advance(code, 3); await sleep(30);
  assert.ok(Math.abs(p2.x - x0) < 1e-9 && Math.abs(p2.y - y0) < 1e-9, 'karakter yang putus tidak bergerak sendiri');
  assert.ok(L.room.game.state.elapsed > 3, 'ronde tetap jalan untuk pemain lain');
  const B2 = await env.client(); B2.sock.emit('room:rejoin', { code, token: tok });
  assert.ok(await until(() => B2.last('round:started') && B2.last('world:snapshot')));
  assert.equal(B2.last('round:started').resumed, true); assert.deepEqual(B2.last('round:started').players, ['p1', 'p2']);
  assert.equal(B2.last('round:started').seed, A.last('round:started').seed);
  assert.equal(A.all('round:started').length, 1, 'pemain lain tidak menerima round:started ulang');
  assert.equal(B2.last('world:snapshot').snapshot.targets.p2 !== undefined, true);
  env.srv.advance(code, 0.5); await sleep(30);
  assert.ok(Math.abs(p2.x - x0) < 1e-9, 'tidak ada input tertinggal setelah rejoin');
  place(L.room, 'p2', 'dough'); B2.sock.emit('station:interact', { requestId: 'r1' }); await sleep(30); env.srv.advance(code, 0.2); await sleep(30);
  assert.equal(p2.held && p2.held.type, 'dough', 'B bisa beraksi lagi');
  await env.stop();
});

test('semua putus saat ronde: simulasi dijeda, room dihapus setelah 120 detik; kembali tepat waktu melanjutkan', async () => {
  const env = await boot();
  const L = await startRound(env, 1); const A = L.cs[0], tok = tokenOf(A), code = L.code;
  env.srv.advance(code, 5); const e0 = L.room.game.state.elapsed;
  A.sock.close(); assert.ok(await until(() => L.room.members.values().next().value.connected === false));
  env.srv.advance(code, 100); await sleep(20);
  assert.ok(Math.abs(L.room.game.state.elapsed - e0) < 0.1, 'jam ronde berhenti saat tidak ada pemain terhubung');
  const A2 = await env.client(); A2.sock.emit('room:rejoin', { code, token: tok });
  assert.ok(await until(() => A2.last('round:started')));
  env.srv.advance(code, 1); await sleep(20);
  assert.ok(L.room.game.state.elapsed > e0 + 0.9, 'ronde lanjut setelah kembali');
  A2.sock.close(); assert.ok(await until(() => !L.room.members.values().next().value.connected));
  env.srv.advance(code, 119); assert.equal(env.srv.rooms.size, 1);
  env.srv.advance(code, 2); assert.equal(env.srv.rooms.size, 0, 'room dihapus setelah 120 detik tanpa pemain');
  await env.stop();
});

test('rejoin setelah ronde selesai menerima hasil; countdown dibatalkan bila ada yang putus', async () => {
  const env = await boot();
  const L = await startRound(env, 2); const [A, B] = L.cs; const tok = tokenOf(B), code = L.code;
  B.sock.close(); assert.ok(await until(() => A.last('room:state').players.find(p => p.id === 'p2').connected === false));
  env.srv.advance(code, 241); assert.ok(await until(() => A.last('round:ended')));
  const B2 = await env.client(); B2.sock.emit('room:rejoin', { code, token: tok });
  assert.ok(await until(() => B2.last('round:ended') && B2.last('room:state')));
  assert.equal(B2.last('round:ended').score, A.last('round:ended').score); assert.equal(B2.last('room:state').phase, 'ended');
  await env.stop();
  const env2 = await boot({ minPlayers: 2 });
  const M = await lobbyOf(env2, 2);
  for (const c of M.cs) c.sock.emit('lobby:ready', { ready: true });
  assert.ok(await until(() => M.room.phase === 'countdown'));
  M.cs[1].sock.close();
  assert.ok(await until(() => M.room.phase === 'lobby'), 'countdown batal');
  assert.equal(M.room.members.size, 2, 'slot yang putus tetap ditahan');
  await env2.stop();
});

test('host yang putus lalu rejoin mendapatkan kembali hak host; host yang keluar sengaja tidak', async () => {
  const env = await boot();
  const L = await lobbyOf(env, 2); const [A, B] = L.cs; const tok = tokenOf(A);
  A.sock.close();
  assert.ok(await until(() => B.last('room:state').players.find(p => p.id === 'p2').host === true));
  const A2 = await env.client(); A2.sock.emit('room:rejoin', { code: L.code, token: tok });
  assert.ok(await until(() => A2.last('room:state')));
  assert.ok(await until(() => B.last('room:state').players.find(p => p.id === 'p1').host === true), 'host kembali ke pemilik asli');
  assert.equal(B.last('room:state').players.filter(p => p.host).length, 1, 'tetap satu host');
  A2.sock.emit('room:leave');
  assert.ok(await until(() => B.last('room:state').players.length === 1));
  assert.equal(B.last('room:state').players[0].host, true);
  await env.stop();
});

test('mulai ronde menunggu pemain yang putus: 3 pemain, 1 putus, 2 siap -> tidak mulai; kembali dan siap -> mulai', async () => {
  const env = await boot();
  const L = await lobbyOf(env, 3); const [A, B, C] = L.cs, tokC = tokenOf(C);
  C.sock.close(); assert.ok(await until(() => A.last('room:state').players.find(p => p.id === 'p3').connected === false));
  A.sock.emit('lobby:ready', { ready: true }); B.sock.emit('lobby:ready', { ready: true });
  assert.ok(await until(() => A.last('room:state').players.filter(p => p.ready).length === 2));
  env.srv.advance(L.code, 10); await sleep(60);
  assert.equal(L.room.phase, 'lobby', 'tidak mulai selama slot yang putus masih ditahan');
  const C2 = await env.client(); C2.sock.emit('room:rejoin', { code: L.code, token: tokC });
  assert.ok(await until(() => C2.last('room:state')));
  assert.equal(C2.last('room:state').players.find(p => p.id === 'p3').ready, false, 'yang kembali belum siap');
  env.srv.advance(L.code, 3); await sleep(40); assert.equal(L.room.phase, 'lobby', 'masih menunggu dia siap');
  C2.sock.emit('lobby:ready', { ready: true });
  assert.ok(await until(() => L.room.phase === 'countdown'));
  env.srv.advance(L.code, 1.2);
  assert.ok(await until(() => A.last('round:started') && C2.last('round:started')));
  assert.deepEqual(A.last('round:started').players, ['p1', 'p2', 'p3']);
  await env.stop();
});

test('slot putus yang kedaluwarsa dilepas: pemain tersisa yang sudah siap langsung mulai tanpa dia', async () => {
  const env = await boot();
  const L = await lobbyOf(env, 3); const [A, B, C] = L.cs;
  C.sock.close(); assert.ok(await until(() => A.last('room:state').players.find(p => p.id === 'p3').connected === false));
  A.sock.emit('lobby:ready', { ready: true }); B.sock.emit('lobby:ready', { ready: true });
  assert.ok(await until(() => A.last('room:state').players.filter(p => p.ready).length === 2));
  env.srv.advance(L.code, 59); await sleep(30); assert.equal(L.room.phase, 'lobby');
  env.srv.advance(L.code, 2);
  assert.ok(await until(() => L.room.phase === 'countdown'), 'setelah 60 detik slot dilepas dan countdown jalan');
  env.srv.advance(L.code, 1.2);
  assert.ok(await until(() => A.last('round:started')));
  assert.deepEqual(A.last('round:started').players, ['p1', 'p2'], 'ronde hanya untuk pemain yang ada');
  await env.stop();
});

test('pemain yang putus kehilangan status siap; keluar sengaja oleh pemain belum-siap memulai countdown sisanya', async () => {
  const env = await boot();
  const L = await lobbyOf(env, 2); const [A, B] = L.cs;
  A.sock.emit('lobby:ready', { ready: true });
  assert.ok(await until(() => A.last('room:state').players.find(p => p.id === 'p1').ready));
  A.sock.close(); assert.ok(await until(() => B.last('room:state').players.find(p => p.id === 'p1').connected === false));
  assert.equal(B.last('room:state').players.find(p => p.id === 'p1').ready, false, 'siap hilang saat putus');
  await env.stop();
  const env2 = await boot();
  const M = await lobbyOf(env2, 3); const [X, Y, Z] = M.cs;
  X.sock.emit('lobby:ready', { ready: true }); Y.sock.emit('lobby:ready', { ready: true }); await sleep(60);
  assert.equal(M.room.phase, 'lobby');
  Z.sock.emit('room:leave');
  assert.ok(await until(() => M.room.phase === 'countdown'), 'sisa pemain yang sudah siap mulai setelah yang belum siap keluar');
  await env2.stop();
});

test('rejoin dari penyimpanan lokal (takeover:false) ditolak selama sesi lama masih hidup, diterima setelah putus', async () => {
  const env = await boot();
  const L = await lobbyOf(env, 2); const [A, B] = L.cs, tok = tokenOf(B);
  const T = await env.client(); T.sock.emit('room:rejoin', { code: L.code, token: tok, takeover: false });
  assert.ok(await until(() => T.last('error:msg')));
  assert.equal(T.last('error:msg').code, 'rejoin_busy'); assert.equal(T.last('room:state'), null);
  assert.equal(L.room.members.get(B.sock.id).connected, true, 'sesi lama tidak terganggu');
  B.sock.close(); assert.ok(await until(() => A.last('room:state').players.find(p => p.id === 'p2').connected === false));
  const T2 = await env.client(); T2.sock.emit('room:rejoin', { code: L.code, token: tok, takeover: false });
  assert.ok(await until(() => T2.last('room:state'))); assert.equal(T2.last('room:state').you, 'p2');
  await env.stop();
});

test('kick: hanya host, hanya di lobi; yang di-kick keluar, tidak bisa rejoin/gabung lagi; sisa yang siap langsung mulai', async () => {
  const env = await boot();
  const L = await lobbyOf(env, 3); const [A, B, C] = L.cs, tokC = tokenOf(C);
  const J = async (c, code, cid) => { c.sock.emit('room:join', { code, name: 'x', cid }); await sleep(60); };
  B.sock.emit('room:kick', { slot: 'p3' });
  assert.ok(await until(() => B.last('error:msg') && B.last('error:msg').code === 'not_host'));
  assert.equal(L.room.members.size, 3, 'non-host tidak bisa kick');
  A.sock.emit('room:kick', { slot: 'p1' }); A.sock.emit('room:kick', { slot: 'zz' }); A.sock.emit('room:kick', {}); A.sock.emit('room:kick', { slot: 5 }); await sleep(60);
  assert.equal(L.room.members.size, 3, 'tidak bisa kick diri sendiri / slot tidak ada / payload rusak');
  A.sock.emit('lobby:ready', { ready: true }); B.sock.emit('lobby:ready', { ready: true }); await sleep(60);
  A.sock.emit('room:kick', { slot: 'p3' });
  assert.ok(await until(() => C.last('room:kicked')), 'yang di-kick menerima room:kicked');
  assert.equal(L.room.members.size, 2); assert.ok(await until(() => L.room.phase === 'countdown'), 'dua pemain tersisa sudah siap -> countdown');
  const C2 = await env.client(); C2.sock.emit('room:rejoin', { code: L.code, token: tokC });
  assert.ok(await until(() => C2.last('error:msg'))); assert.equal(C2.last('error:msg').code, 'rejoin_failed', 'token lama tidak berlaku');
  await env.stop();
});

test('kick memblokir id perangkat: tidak bisa gabung lagi (kode atau quick join), perangkat lain tetap bisa; kick pemain yang putus; tidak saat ronde', async () => {
  const env = await boot();
  const a = await env.client(); a.sock.emit('room:create', { name: 'Host', cid: 'host1' }); assert.ok(await until(() => a.last('room:state')));
  const code = a.last('room:state').code;
  const b = await env.client(); b.sock.emit('room:join', { code, name: 'Bad', cid: 'bad-device' }); assert.ok(await until(() => b.last('room:state')));
  a.sock.emit('room:kick', { slot: 'p2' }); assert.ok(await until(() => b.last('room:kicked')));
  const b2 = await env.client(); b2.sock.emit('room:join', { code, name: 'Bad', cid: 'bad-device' });
  assert.ok(await until(() => b2.last('error:msg'))); assert.equal(b2.last('error:msg').code, 'kicked');
  const b3 = await env.client(); b3.sock.emit('room:join', { name: 'Bad', cid: 'bad-device' });
  assert.ok(await until(() => b3.last('error:msg'))); assert.equal(b3.last('error:msg').code, 'room_not_found', 'quick join melewati room yang memblokirnya');
  const g = await env.client(); g.sock.emit('room:join', { code, name: 'Baik', cid: 'other' }); assert.ok(await until(() => g.last('room:state')));
  g.sock.close(); assert.ok(await until(() => a.last('room:state').players.some(p => !p.connected)));
  a.sock.emit('room:kick', { slot: 'p2' }); assert.ok(await until(() => a.last('room:state').players.length === 1), 'slot yang putus pun bisa di-kick');
  a.sock.emit('lobby:ready', { ready: true }); assert.ok(await until(() => env.srv.rooms.get(code).phase === 'countdown'));
  env.srv.advance(code, 1.2); assert.ok(await until(() => a.last('round:started')));
  const n = env.srv.rooms.get(code).members.size; a.sock.emit('room:kick', { slot: 'p1' }); await sleep(60);
  assert.equal(env.srv.rooms.get(code).members.size, n, 'kick saat ronde tidak diizinkan');
  await env.stop();
});

test('co-op: selalu minimal 2 order aktif (order baru langsung dibuat setelah disajikan atau kedaluwarsa)', async () => {
  const env = await boot();
  const L = await startRound(env, 1); const st = L.room.game.state; let min = 9;
  assert.equal(L.cs[0].last('round:started').config.minOrders, 2);
  for (let i = 0; i < 400; i++) { env.srv.advance(L.code, 0.5); min = Math.min(min, st.orders.length); if (st.mode !== 'running') break; }
  assert.equal(min >= 2, true, 'jumlah order minimum selama ronde: ' + min);
  await env.stop();
  const env2 = await boot(); const L2 = await startRound(env2, 1); const s2 = L2.room.game.state;
  assert.equal(s2.orders.length, 2);
  s2.players[0].held = { id: 99, type: s2.orders[0].type, mods: [] };
  await act(env2, L2, 0, 'serve');
  assert.equal(s2.ordersServed, 1, 'order disajikan'); assert.equal(s2.orders.length >= 2, true, 'order pengganti langsung dibuat: ' + s2.orders.length);
  assert.equal(L2.cs[0].all('game:events').flatMap(e => e.events).some(e => e.type === 'order:spawned' && e.refill === true), true, 'event pengganti ditandai refill');
  await env2.stop();
});

test('telemetri: satu baris JSON per ronde selesai berisi skor, interaksi per stasiun, pesan, kurva skor', async () => {
  const lines = [];
  const env = await boot({ telemetry: l => lines.push(l) });
  const L = await startRound(env, 2);
  await act(env, L, 0, 'dough'); await act(env, L, 0, 'dough');   // picked, lalu hands_full
  await act(env, L, 1, 'trash');
  env.srv.advance(L.code, 241);
  assert.ok(await until(() => L.cs[0].last('round:ended')));
  assert.equal(lines.length, 1, 'tepat satu baris per ronde');
  const r = JSON.parse(lines[0]), end = L.cs[0].last('round:ended');
  assert.equal(r.players, 2); assert.equal(r.room, L.code);
  assert.equal(r.score, end.score); assert.equal(r.expired, end.ordersExpired); assert.equal(r.burnt, end.burntCount);
  assert.equal(r.interactions.p1.dough, 2); assert.equal(r.interactions.p2.trash, 1);
  assert.equal(r.msgs.p1.picked, 1); assert.equal(r.msgs.p1.hands_full, 1);
  assert.equal(r.earnedPer30s.length, 8); assert.equal(r.firstServedAt, null);
  assert.ok(r.perRecipe.plain_bread.exp + r.perRecipe.salt_bread.exp >= 1, 'order kedaluwarsa tercatat per resep');
  env.srv.advance(L.code, 5); await sleep(30);
  assert.equal(lines.length, 1, 'tidak dobel setelah ronde berakhir');
  await env.stop();
});

test('stage: room:state memuat id stage dan spawn lobi mengikuti titik awal stage (bukan baris bawah yang terkurung)', async () => {
  const env = await boot();
  const a = await env.client(); a.sock.emit('room:create', { name: 'Rina', stage: 1 });
  assert.ok(await until(() => a.last('room:state')));
  const st = a.last('room:state'), me = st.players[0];
  assert.equal(st.stage, 1); assert.deepEqual([me.x, me.y], [4.15, 4.2]);
  const b = await env.client(); b.sock.emit('room:join', { code: st.code, name: 'Bima' });
  assert.ok(await until(() => b.last('room:state')));
  assert.equal(b.last('room:state').stage, 1); assert.ok(Math.abs(b.last('room:state').players[1].x - 4.5) < 1e-9);
  const c = await env.client(); c.sock.emit('room:create', { name: 'Tanpa' });
  assert.ok(await until(() => c.last('room:state')));
  assert.equal(c.last('room:state').stage, null); assert.deepEqual([c.last('room:state').players[0].x, c.last('room:state').players[0].y], [3.4, 6.15]);
  await env.stop();
});
