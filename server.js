'use strict';
/* Bakery Co-op — server spike (S2). Node + Socket.IO.
 * Server memegang satu instance core.js per room; client hanya mengirim intent (gerak, interaksi).
 * Spike: tanpa akun, tanpa penyimpanan, tanpa chat. Room hilang saat kosong.
 *
 * Jalankan:  npm install && npm start      (PORT, ALLOWED_ORIGINS lewat environment variable)
 * Cek hidup: GET /health
 *
 * Client -> server:  room:create {name} | room:join {code,name} | lobby:ready {ready} | room:leave
 *                    player:input {sx,sy} | station:interact {requestId} | room:rematch (host)
 *                    room:rejoin {code,token} | lobby:pos {x,y} | chat:send {text}
 *                    net:ping (dengan ack; untuk mengukur RTT)
 * room:join tanpa code = masuk room lobi terbuka tertua.
 * Server -> client:  room:state | lobby:pos | chat:message | round:countdown | round:started | world:snapshot | game:events | round:ended | error:msg
 */
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { Server } = require('socket.io');
const { createGame } = require('./core.js');

const PROTOCOL = 1;
const TICK_HZ = 30;          // [Usulan awal]
const SNAPSHOT_EVERY = 2;    // tick -> 15 snapshot per detik (§10.3)
const SLOTS = ['p1', 'p2', 'p3', 'p4'];
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LIMITS = { input: 80, interact: 12, lobby: 10, pos: 20, chat: 5 };   // maksimum event per detik per socket
const QUEUE_MAX = 8;
const GRACE = { lobby: 60, empty: 120 };   // detik: slot lobi yang putus ditahan; room tanpa pemain terhubung dihapus setelah ini [Usulan awal]
const LOBBY = { min: 0.6, maxX: 7.4, maxY: 6.4 };   // batas lantai lobi (sama dengan batas jangkau core); posisi lobi hanya kosmetik
const lobbySpawn = slot => ({ x: 3.4 + Math.max(0, SLOTS.indexOf(slot)) * 0.8, y: 6.15 });
const cleanChat = v => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) : '');
const coord = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null);

const cleanName = v => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>&"']/g, '').trim().slice(0, 16) : '') || 'Baker';
const cleanCode = v => (typeof v === 'string' ? v.trim().toUpperCase().slice(0, 4) : '');
const axis = v => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
const asRequestId = v => ((typeof v === 'string' || typeof v === 'number') && String(v).length <= 40 ? v : null);
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

function createGameServer(opts) {
  const o = Object.assign({
    origins: ['https://168-110-203-54.sslip.io'],
    countdownSeconds: 3,       // §3.1
    minPlayers: 1,             // 1 = boleh uji sendiri; co-op sebenarnya 2–4 (§2.2)
    maxRooms: 50,
    autoTick: true,            // false di tes: waktu dimajukan manual lewat advance()
    log: () => {}
  }, opts);

  const httpServer = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, protocol: PROTOCOL, rooms: rooms.size }));
    } else { res.writeHead(404); res.end(); }
  });
  const io = new Server(httpServer, { cors: { origin: o.origins }, maxHttpBufferSize: 4096, pingInterval: 10000, pingTimeout: 8000 });
  const rooms = new Map();

  // ---------- util ----------
  const members = room => [...room.members.values()];
  const connected = room => members(room).filter(m => m.connected);
  const emitRoom = (room, ev, payload) => io.to(room.code).emit(ev, payload);
  function newCode() {
    for (;;) {
      let c = ''; for (let i = 0; i < 4; i++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      if (!rooms.has(c)) return c;
    }
  }
  function allow(sock, kind) {
    const r = sock.data.rate || (sock.data.rate = {});
    const now = Date.now(), w = r[kind] || (r[kind] = { t: now, n: 0 });
    if (now - w.t >= 1000) { w.t = now; w.n = 0; }
    return ++w.n <= LIMITS[kind];
  }
  const fail = (sock, code) => sock.emit('error:msg', { code });
  const roomOf = sock => (sock.data.room ? rooms.get(sock.data.room) : null);
  const memberOf = (room, sock) => (room ? room.members.get(sock.id) : null);

  function stateFor(room, m) {
    return {
      protocol: PROTOCOL, code: room.code, phase: room.phase, you: m.slot, token: m.token || null,   // token rejoin: hanya dikirim ke pemilik slot
      countdown: room.phase === 'countdown' ? Math.ceil(room.countdownLeft) : null,
      players: members(room).map(x => ({ id: x.slot, name: x.name, ready: x.ready, host: x.sid === room.hostId, connected: x.connected, x: x.x, y: x.y }))
    };
  }
  function broadcastState(room) { for (const m of connected(room)) io.to(m.sid).emit('room:state', stateFor(room, m)); }

  // ---------- lobby ----------
  function joinRoom(sock, room, name) {
    const slot = SLOTS.find(s => !members(room).some(m => m.slot === s));
    room.members.set(sock.id, Object.assign({ sid: sock.id, slot, name: cleanName(name), ready: false, connected: true, token: randomUUID(), dropLeft: 0 }, lobbySpawn(slot)));
    sock.join(room.code); sock.data.room = room.code;
    broadcastState(room);
  }
  function backToLobby(room) {
    room.phase = 'lobby'; room.game = null; room.inputs = {}; room.queues = {};
    for (const m of room.members.values()) { m.ready = false; Object.assign(m, lobbySpawn(m.slot)); }
  }
  function leave(sock, explicit) {
    const room = roomOf(sock); sock.data.room = null;
    if (!room) return;
    sock.leave(room.code);
    const m = room.members.get(sock.id); if (!m) return;
    const hold = room.phase === 'running' || room.phase === 'ended';   // slot tetap ada sampai ronde selesai (§10.6)
    if (explicit) { m.token = null; if (hold) m.connected = false; else room.members.delete(sock.id); }   // keluar sengaja = tidak bisa masuk lagi
    else { m.connected = false; m.dropLeft = GRACE.lobby; if (!hold) m.ready = false; }   // putus: slot ditahan, bisa rejoin dengan token; di lobi harus berdiri di area siap lagi
    room.inputs[m.slot] = { sx: 0, sy: 0 }; if (room.queues[m.slot]) room.queues[m.slot].length = 0;   // karakter diam, tanpa aksi tertinggal
    if (room.phase === 'countdown') backToLobby(room);
    if (!members(room).length) { rooms.delete(room.code); return; }
    const c = connected(room);
    if (room.hostId === sock.id && c.length) { room.hostId = c[0].sid; m.dropHost = !explicit; }   // host sementara pindah; kembali ke pemilik asli bila ia rejoin
    maybeStartCountdown(room);   // pemain keluar sengaja bisa membuat sisanya sudah siap semua
    broadcastState(room);
  }
  function rejoin(sock, p) {
    if (sock.data.room) return fail(sock, 'already_in_room');
    const room = rooms.get(cleanCode(p.code)), token = typeof p.token === 'string' && p.token.length <= 64 ? p.token : null;
    const m = room && token && members(room).find(x => x.token === token);
    if (!m) return fail(sock, 'rejoin_failed');
    if (p.takeover === false && m.connected) return fail(sock, 'rejoin_busy');   // pemulihan dari penyimpanan lokal tidak boleh merebut sesi yang masih hidup (mis. tab kedua di perangkat yang sama)
    const oldSid = m.sid, old = io.sockets.sockets.get(oldSid);
    if (old && old.id !== sock.id) { old.data.room = null; old.leave(room.code); old.emit('error:msg', { code: 'session_replaced' }); }   // sesi lama (belum ketahuan putus) dilepas
    room.members.delete(oldSid); m.sid = sock.id; m.connected = true; m.dropLeft = 0; room.members.set(sock.id, m);
    room.inputs[m.slot] = { sx: 0, sy: 0 };
    if (room.hostId === oldSid || m.dropHost || !members(room).some(x => x.sid === room.hostId && x.connected)) room.hostId = sock.id;
    m.dropHost = false;
    sock.join(room.code); sock.data.room = room.code;
    broadcastState(room);
    if (room.phase === 'running') {   // lanjutkan ronde: info ronde + snapshot terbaru hanya ke pemain ini
      sock.emit('round:started', { protocol: PROTOCOL, seed: room.seed, tickHz: TICK_HZ, players: room.slots, config: room.game.config, resumed: true });
      sock.emit('world:snapshot', { tick: room.tick, snapshot: snap(room) });
    } else if (room.phase === 'ended' && room.result) sock.emit('round:ended', room.result);
  }
  function maybeStartCountdown(room) {
    const all = members(room);   // slot putus yang ditahan ikut dihitung: ronde menunggu dia kembali dan siap, atau slotnya dilepas
    if (room.phase === 'lobby' && all.length >= o.minPlayers && all.every(m => m.connected && m.ready)) {
      room.phase = 'countdown'; room.countdownLeft = o.countdownSeconds; room.lastCountdownShown = null;
      broadcastState(room);
    }
  }

  // ---------- ronde ----------
  function startRound(room) {
    const seed = (Math.random() * 4294967296) >>> 0;
    const slots = members(room).map(m => m.slot);
    room.seed = seed; room.slots = slots; room.result = null;
    room.game = createGame({ seed, players: slots }); room.game.start();
    room.phase = 'running'; room.tick = 0; room.inputs = {}; room.queues = {};
    emitRoom(room, 'round:started', { protocol: PROTOCOL, seed, tickHz: TICK_HZ, players: slots, config: room.game.config });
    emitRoom(room, 'world:snapshot', { tick: 0, snapshot: snap(room) });
    broadcastState(room);
  }
  function snap(room) {   // snapshot + stasiun target tiap pemain (untuk highlight dan ikon Aksi di client)
    const s = room.game.snapshot(); s.targets = {};
    for (const m of members(room)) s.targets[m.slot] = room.game.targetOf(m.slot);
    return s;
  }
  function stepRoom(room, dt) {
    if (!connected(room).length) {   // semua putus: simulasi dijeda; room dihapus bila tak ada yang kembali
      room.emptyLeft = (room.emptyLeft == null ? GRACE.empty : room.emptyLeft) - dt;
      if (room.emptyLeft <= 0) rooms.delete(room.code);
      return;
    }
    room.emptyLeft = GRACE.empty;
    if (room.phase === 'lobby' || room.phase === 'countdown') {   // slot lobi yang putus terlalu lama dilepas
      let changed = false;
      for (const m of members(room)) if (!m.connected && (m.dropLeft -= dt) <= 0) { room.members.delete(m.sid); changed = true; }
      if (changed) { maybeStartCountdown(room); broadcastState(room); }
    }
    if (room.phase === 'countdown') {
      room.countdownLeft -= dt;
      const shown = Math.ceil(room.countdownLeft);
      if (shown !== room.lastCountdownShown && room.countdownLeft > 0) { room.lastCountdownShown = shown; emitRoom(room, 'round:countdown', { seconds: shown }); }
      if (room.countdownLeft <= 0) startRound(room);
      return;
    }
    if (room.phase !== 'running') return;
    const inputs = {};
    for (const m of connected(room)) {
      const inp = room.inputs[m.slot] || { sx: 0, sy: 0 }, q = room.queues[m.slot];
      inputs[m.slot] = { sx: inp.sx, sy: inp.sy, interact: q && q.length ? q.shift() : undefined };
    }
    const events = room.game.step(dt, inputs);
    room.tick++;
    const ended = events.find(e => e.type === 'round:ended');
    if (events.length) emitRoom(room, 'game:events', { tick: room.tick, events });
    if (ended || room.tick % SNAPSHOT_EVERY === 0) emitRoom(room, 'world:snapshot', { tick: room.tick, snapshot: snap(room) });
    if (ended) { room.phase = 'ended'; room.result = ended; emitRoom(room, 'round:ended', ended); broadcastState(room); }
  }

  // ---------- socket ----------
  io.on('connection', sock => {
    const guard = (kind, fn) => (payload) => {
      try { if (!allow(sock, kind)) return; fn(isObj(payload) ? payload : {}); } catch (e) { o.log('handler error', e && e.message); }
    };
    sock.on('room:create', guard('lobby', p => {
      if (sock.data.room) return fail(sock, 'already_in_room');
      if (rooms.size >= o.maxRooms) return fail(sock, 'server_full');
      const room = { code: newCode(), hostId: sock.id, phase: 'lobby', members: new Map(), game: null, inputs: {}, queues: {}, tick: 0, countdownLeft: 0 };
      rooms.set(room.code, room); joinRoom(sock, room, p.name);
    }));
    sock.on('room:join', guard('lobby', p => {
      if (sock.data.room) return fail(sock, 'already_in_room');
      const code = cleanCode(p.code);   // kode kosong = masuk room lobi terbuka tertua (quick join)
      const room = code ? rooms.get(code) : [...rooms.values()].find(r => r.phase === 'lobby' && members(r).length < SLOTS.length && connected(r).length > 0);
      if (!room) return fail(sock, 'room_not_found');
      if (room.phase !== 'lobby') return fail(sock, 'room_started');
      if (members(room).length >= SLOTS.length) return fail(sock, 'room_full');
      joinRoom(sock, room, p.name);
    }));
    sock.on('lobby:ready', guard('lobby', p => {
      const room = roomOf(sock), m = memberOf(room, sock);
      if (!m || room.phase !== 'lobby') return;
      m.ready = p.ready === true; broadcastState(room); maybeStartCountdown(room);
    }));
    sock.on('room:rematch', guard('lobby', () => {
      const room = roomOf(sock);
      if (!room || room.phase !== 'ended' || room.hostId !== sock.id) return;
      for (const m of [...room.members.values()]) if (!m.connected) room.members.delete(m.sid);
      backToLobby(room); broadcastState(room);
    }));
    sock.on('room:leave', guard('lobby', () => leave(sock, true)));
    sock.on('room:rejoin', guard('lobby', p => rejoin(sock, p)));
    sock.on('lobby:pos', guard('pos', p => {   // posisi berjalan di lobi: kosmetik, diteruskan ke pemain lain
      const room = roomOf(sock), m = memberOf(room, sock);
      if (!m || (room.phase !== 'lobby' && room.phase !== 'countdown')) return;
      const x = coord(p.x, LOBBY.min, LOBBY.maxX), y = coord(p.y, LOBBY.min, LOBBY.maxY);
      if (x === null || y === null) return;
      m.x = x; m.y = y; sock.to(room.code).emit('lobby:pos', { id: m.slot, x, y });
    }));
    sock.on('chat:send', guard('chat', p => {
      const room = roomOf(sock), m = memberOf(room, sock), text = cleanChat(p.text);
      if (!m || !text) return;
      emitRoom(room, 'chat:message', { id: m.slot, name: m.name, text });
    }));
    sock.on('player:input', guard('input', p => {
      const room = roomOf(sock), m = memberOf(room, sock);
      if (!m || room.phase !== 'running') return;
      room.inputs[m.slot] = { sx: axis(p.sx), sy: axis(p.sy) };
    }));
    sock.on('station:interact', guard('interact', p => {
      const room = roomOf(sock), m = memberOf(room, sock);
      if (!m || room.phase !== 'running') return;
      const q = room.queues[m.slot] || (room.queues[m.slot] = []);
      if (q.length >= QUEUE_MAX) return;
      q.push(asRequestId(p.requestId) ?? `${m.slot}-srv-${room.tick}-${q.length}`);
    }));
    sock.on('net:ping', (...a) => { const ack = a[a.length - 1]; if (typeof ack === 'function' && allow(sock, 'lobby')) ack(); });   // ukur RTT dari client
    sock.on('disconnect', () => { try { leave(sock); } catch (e) { o.log('leave error', e && e.message); } });
  });

  // ---------- waktu ----------
  const stepMs = 1000 / TICK_HZ;
  let last = Date.now(), acc = 0;
  const timer = o.autoTick ? setInterval(() => {
    const now = Date.now(); acc += Math.min(now - last, 250); last = now;
    for (let n = 0; acc >= stepMs && n < 8; n++, acc -= stepMs) for (const r of rooms.values()) stepRoom(r, 1 / TICK_HZ);
  }, Math.floor(stepMs / 2)) : null;

  return {
    io, httpServer, rooms,
    advance(code, seconds) { const r = rooms.get(code); for (let i = 0, n = Math.round(seconds * TICK_HZ); r && i < n; i++) stepRoom(r, 1 / TICK_HZ); },
    listen(port, cb) { httpServer.listen(port, cb); return httpServer; },
    close() { if (timer) clearInterval(timer); return new Promise(res => { io.close(() => res()); }); }
  };
}

module.exports = { createGameServer, PROTOCOL, TICK_HZ };

if (require.main === module) {
  const port = Number(process.env.PORT || 3001);
  const origins = (process.env.ALLOWED_ORIGINS || 'https://168-110-203-54.sslip.io').split(',').map(s => s.trim()).filter(Boolean);
  const srv = createGameServer({ origins, log: (...a) => console.log('[server]', ...a) });
  srv.listen(port, () => console.log(`[server] Bakery Co-op siap di port ${port} (protocol ${PROTOCOL}, origin: ${origins.join(', ')})`));
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => srv.close().then(() => process.exit(0)));
}
