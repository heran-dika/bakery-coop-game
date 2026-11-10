/* Bakery Co-op — core game (S1).
 * Logika murni: tanpa DOM, tanpa Math.random/Date. Dipakai client (browser) dan server/bot (Node).
 * Diport dari index.html (P0 solo). Aturan, angka, dan urutan update sengaja dipertahankan.
 * Yang TIDAK ada di sini (tetap di client): render, HUD, toast teks, efek, petunjuk langkah berikutnya.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BakeryCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_CONFIG = {
    roundSeconds: 240,
    maxOrders: 3,
    minOrders: 0,             // >0: order baru langsung dibuat bila order aktif kurang dari ini (dipakai server co-op; solo tetap 0)
    patienceSeconds: 45,
    openingOrders: ['plain_bread', 'salt_bread'],
    openingNextOrderAt: 13,
    spawnMinSeconds: 13,
    spawnMaxSeconds: 18,
    prepSeconds: 2.4,
    cookSeconds: 6,
    readyBeforeBurnSeconds: 8,
    scorePerOrder: 100,
    orderMix: null,
    scoreByRecipe: {},
    coffeeBrewSeconds: 4.5,
    fire: { enabled: false, afterBurntSeconds: 6, extinguishSeconds: 2, penalty: 30 },   // api: roti gosong yang dibiarkan > afterBurntSeconds membakar oven
    fastBonus: 25,
    expiredPenalty: 50,
    trashPenalty: 10,
    comboBonusPerOrder: 10,
    maxComboBonus: 50,
    oneStar: 300,
    twoStars: 600,
    threeStars: 900,
    reach: 1.28,
    moveSpeed: 2.7,
    isoRatio: 0.5,            // tileH / tileW
    heavyCarrySlow: 0.94,
    dock: null,               // stage karung berat: lihat DOCK_DEFAULTS; null = tanpa dock/karung
    door: null,               // stage pintu bertombol: lihat DOOR_DEFAULTS; null = tanpa pintu
    maxStep: 0.05,            // dt dipecah per langkah ini supaya hasil sama di tick berapa pun
    // Kolisi: lingkaran badan vs persegi jejak alas kubus (sama dengan resolveStations di index.html 2026-10-23).
    // Semua angka [Menebak], disetel di HP: bodyR, footOffset, footHalf, reach*.
    collision: { bodyR: 0.16, reachMin: 0.63, reachMaxX: 7.37, reachMaxY: 6.37, footOffset: 0.15, footHalf: 0.41 },
    spawn: { x: 4.15, y: 6.15, facingX: 0, facingY: -1, spreadX: 0.35 },
    hazard: {
      enabled: true, firstAt: 24, intervalMin: 26, intervalMax: 36, warnSeconds: 2.5, activeSeconds: 7.5,
      slowFactor: 0.62, slipSeconds: 0.45, slipFactor: 0.48, radius: 0.48, maxActive: 2, msgEvery: 2.2,
      spots: [{ x: 3.9, y: 3.25 }, { x: 5.1, y: 4.0 }, { x: 2.4, y: 3.8 }]
    },
    stations: [
      { id: 'dough', type: 'crate', gives: 'dough', x: 1, y: 1 },
      { id: 'prep', type: 'prep', x: 3, y: 1 },
      { id: 'oven', type: 'oven', x: 5, y: 1 },
      { id: 'serve', type: 'serve', x: 7, y: 1 },
      { id: 'butter', type: 'crate', gives: 'butter', x: 1, y: 5 },
      { id: 'salt', type: 'crate', gives: 'salt', x: 3, y: 5 },
      { id: 'counter1', type: 'counter', x: 2, y: 3 },
      { id: 'counter2', type: 'counter', x: 6, y: 3 },
      { id: 'trash', type: 'trash', x: 7, y: 5 }
    ]
  };

  const HEAVY = ['dough', 'butter', 'salt', 'prepared_dough'];
  // Dock + karung berat (stage 3). Semua angka [Menebak], disetel dari playtest.
  const DOCK_DEFAULTS = {
    restock: { crate: 'dough', x: 1, y: 2, r: 0.8 },   // karung yang masuk radius ini otomatis memenuhi stok peti
    drop: { x: 6, y: 5 },                               // sel tempat truk menurunkan karung
    x0: 5.6, y0: 4.6,                                   // sudut kiri-atas dinding dock (dinding kiri menutup selama truk di dalam, dinding atas tetap)
    soloSlow: 0.25, span: 1.9, gripReach: 1.35,         // sendirian menyeret = 1/4 kecepatan; berdua searah = normal
    arriveSeconds: 1.6, unloadSeconds: 1.0, leaveSeconds: 1.4, truckDelay: 2.5
  };
  // Pintu bertombol (stage 4): dinding vertikal di x (koordinat dunia, sama dengan dinding dock) dengan celah y0..y1 yang terbuka
  // openSeconds detik setelah tombol (stasiun bertipe 'button') ditekan. Pintu menunggu selama masih ada pemain di celah. Semua angka [Menebak].
  const DOOR_DEFAULTS = { x: 4.6, t: 0.12, gapY0: 3.6, gapY1: 4.7, openSeconds: 4 };
  const SERVABLE = ['plain_bread', 'salt_bread', 'coffee'];

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function mergeConfig(base, over) {
    over = over || {};
    return Object.assign({}, base, over, {
      collision: Object.assign({}, base.collision, over.collision),
      spawn: Object.assign({}, base.spawn, over.spawn),
      hazard: Object.assign({}, base.hazard, over.hazard),
      scoreByRecipe: Object.assign({}, base.scoreByRecipe, over.scoreByRecipe),
      fire: Object.assign({}, base.fire, over.fire),
      orderMix: over.orderMix !== undefined ? over.orderMix : base.orderMix,
      stations: over.stations || base.stations,
      openingOrders: over.openingOrders || base.openingOrders
    });
  }

  /**
   * createGame({ config?, seed?, players? })
   *   game.reset(seed?)                 -> state idle (menu), belum berjalan
   *   game.start(seed?)                 -> reset + mulai ronde (dua order pembuka)
   *   game.step(dt, inputs)             -> events[]
   *       inputs = { [playerId]: { sx, sy, interact: requestId } }   sx/sy = sumbu layar [-1..1]
   *   game.snapshot()                   -> salinan state polos (JSON-able)
   *   game.targetOf(playerId)           -> id stasiun target atau null
   *   game.addStation(def)              -> tambah stasiun saat ronde berjalan (tutorial); id yang sudah ada dikembalikan apa adanya
   *   game.state                        -> state hidup (read-only untuk client; dipakai test/server)
   */
  function createGame(opts) {
    opts = opts || {};
    const cfg = mergeConfig(DEFAULT_CONFIG, opts.config);
    const playerIds = opts.players && opts.players.length ? opts.players.slice() : ['p1'];
    let seed = opts.seed == null ? 1 : opts.seed;
    let rng = mulberry32(seed);
    let s = null;
    let byId = {};
    const DK = cfg.dock ? Object.assign({}, DOCK_DEFAULTS, cfg.dock, {
      restock: Object.assign({}, DOCK_DEFAULTS.restock, cfg.dock.restock), drop: Object.assign({}, DOCK_DEFAULTS.drop, cfg.dock.drop)
    }) : null;

    const DR = cfg.door ? Object.assign({}, DOOR_DEFAULTS, cfg.door) : null;

    function makeStation(def) {
      const st = { id: def.id, type: def.type, x: def.x, y: def.y };
      if (def.gives) st.gives = def.gives;
      if (def.stock != null) { st.stock = def.stock; st.stockMax = def.stock; }   // peti dengan stok terbatas (restok lewat karung)
      if (def.type === 'prep') Object.assign(st, { item: null, processing: false, timer: 0 });
      if (def.type === 'oven') Object.assign(st, { item: null, status: 'empty', timer: 0, readyTimer: 0 });
      if (def.type === 'counter') st.item = null;
      if (def.type === 'coffee') Object.assign(st, { status: 'idle', timer: 0 });
      return st;
    }

    function blankState() {
      const stations = cfg.stations.map(makeStation);
      byId = Object.fromEntries(stations.map(st => [st.id, st]));
      const players = playerIds.map((id, i) => ({
        id, x: cfg.spawn.x + i * cfg.spawn.spreadX, y: cfg.spawn.y,
        facingX: cfg.spawn.facingX, facingY: cfg.spawn.facingY,
        held: null, moving: false, slipUntil: 0, lastHazardMsgAt: -99, seen: []
      }));
      return {
        mode: 'idle', elapsed: 0, roundLeft: cfg.roundSeconds, nextOrderAt: cfg.openingNextOrderAt,
        score: 0, ordersServed: 0, ordersExpired: 0, burntCount: 0, streak: 0,
        orders: [], orderSerial: 1, itemSerial: 1,
        hazards: [], nextHazardAt: cfg.hazard.firstAt, nextHazardId: 1,
        stations, players,
        sack: DK ? { mode: 'none', x: 0, y: 0, carrier: null, grip: [], side: [], axis: null } : null,
        dock: DK ? { phase: 'idle', t: 0, open: false } : null,
        door: DR ? { open: false, t: 0, x: DR.x, t0: DR.t, y0: DR.gapY0, y1: DR.gapY1, hold: DR.openSeconds } : null   // geometri ikut state supaya client (dan kartu stage) tidak perlu membaca config
      };
    }

    function reset(newSeed) {          // kembali ke state idle (menu): belum ada order, belum berjalan
      if (newSeed != null) seed = newSeed;
      rng = mulberry32(seed);
      s = blankState();
      return game;
    }

    function start(newSeed) {
      reset(newSeed);
      s.mode = 'running';
      if (DK) { s.dock.phase = 'arriving'; s.dock.t = DK.arriveSeconds; s.dock.open = false; }
      for (const type of cfg.openingOrders) pushOrder(type, []);
      s.nextOrderAt = cfg.openingNextOrderAt;
      return game;
    }

    const makeItem = (type, mods) => ({ id: s.itemSerial++, type, mods: (mods || []).slice() });

    function pushOrder(type, ev, extra) {
      if (s.orders.length >= cfg.maxOrders) return null;
      const o = { id: s.orderSerial++, type, createdAt: s.elapsed, deadlineAt: s.elapsed + cfg.patienceSeconds, patience: cfg.patienceSeconds };
      s.orders.push(o);
      ev.push(Object.assign({ type: 'order:spawned', order: o.id, recipe: type }, extra));
      return o;
    }

    function pickRecipe() {
      const mix = cfg.orderMix;
      if (!mix) return rng() < 0.5 ? 'plain_bread' : 'salt_bread';
      const keys = Object.keys(mix).filter(k => mix[k] > 0), total = keys.reduce((a, k) => a + mix[k], 0);
      let r = rng() * total;
      for (const k of keys) { r -= mix[k]; if (r < 0) return k; }
      return keys[keys.length - 1];
    }

    function spawnOrder(ev) {
      s.nextOrderAt = s.elapsed + cfg.spawnMinSeconds + rng() * (cfg.spawnMaxSeconds - cfg.spawnMinSeconds);
      if (s.orders.length >= cfg.maxOrders) return;
      pushOrder(pickRecipe(), ev);
    }

    function finishRound(ev) {
      if (s.mode !== 'running') return;
      s.mode = 'ended';
      const stars = s.score >= cfg.threeStars ? 3 : s.score >= cfg.twoStars ? 2 : s.score >= cfg.oneStar ? 1 : 0;
      ev.push({ type: 'round:ended', score: s.score, stars, ordersServed: s.ordersServed, ordersExpired: s.ordersExpired, burntCount: s.burntCount });
    }

    // ---------- gerak ----------
    function clampWorld(x, y) {
      const c = cfg.collision;
      return [Math.max(c.reachMin, Math.min(c.reachMaxX, x)), Math.max(c.reachMin, Math.min(c.reachMaxY, y))];
    }

    // Tanpa tolak per-sumbu: karakter didorong keluar dari persegi jejak kubus, jadi bisa memutari sudut tanpa nyangkut.
    const footRect = (x, y) => { const c = cfg.collision, cx = x + c.footOffset, cy = y + c.footOffset; return [cx - c.footHalf, cy - c.footHalf, cx + c.footHalf, cy + c.footHalf]; };
    const overlap = (a, b) => a[0] < b[2] - 1e-6 && a[2] > b[0] + 1e-6 && a[1] < b[3] - 1e-6 && a[3] > b[1] + 1e-6;
    function wallRects() {   // dinding dock: atas selalu ada, kiri hanya selama pintu tertutup; dinding pintu stage 4: utuh bila tertutup, bercelah bila terbuka
      const r = [];
      if (DK) {
        const t = 0.12; r.push([DK.x0, DK.y0, DK.x0 + 9, DK.y0 + t]);
        if (!s.dock.open) r.push([DK.x0, DK.y0, DK.x0 + t, DK.y0 + 9]);
      }
      if (DR) {
        const d = s.door, x1 = d.x + d.t0;
        if (d.open) { r.push([d.x, -1, x1, d.y0]); r.push([d.x, d.y1, x1, 12]); } else r.push([d.x, -1, x1, 12]);
      }
      return r;
    }
    function resolveStations(x, y, ignoreSack) {
      const c = cfg.collision, R = c.bodyR, G = c.reachMin + 2 * R, h = c.footHalf;
      const extra = wallRects();
      if (!ignoreSack && s.sack && (s.sack.mode === 'floor' || s.sack.mode === 'drag')) extra.push(footRect(s.sack.x, s.sack.y));
      const out = q => {   // dorong titik keluar dari persegi q = [x0,y0,x1,y1] sejauh bodyR
        const qx = Math.max(q[0], Math.min(x, q[2])), qy = Math.max(q[1], Math.min(y, q[3]));
        const dx = x - qx, dy = y - qy, d = Math.hypot(dx, dy);
        if (d >= R) return;
        if (d > 1e-6) { x = qx + dx / d * R; y = qy + dy / d * R; }
        else {   // pusat sudah di dalam persegi: keluar lewat sisi terdekat
          const l = x - q[0], r = q[2] - x, tp = y - q[1], b = q[3] - y, mn = Math.min(l, r, tp, b);
          if (mn === l) x = q[0] - R; else if (mn === r) x = q[2] + R; else if (mn === tp) y = q[1] - R; else y = q[3] + R;
        }
      };
      for (let pass = 0; pass < 2; pass++) {
        for (const st of s.stations) {
          const cx = st.x + c.footOffset, cy = st.y + c.footOffset;
          // celah antara kubus dan dinding yang lebih sempit dari badan dianggap padat
          out([cx - h < G ? -9 : cx - h, cy - h < G ? -9 : cy - h, cx + h > c.reachMaxX - 2 * R ? 9 : cx + h, cy + h > c.reachMaxY - 2 * R ? 9 : cy + h]);
        }
        for (const q of extra) out(q);   // dinding dock dan karung: persegi biasa tanpa aturan celah-dinding
      }
      return clampWorld(x, y);
    }

    function movePlayer(p, inp, dt, ev) {
      p.moving = false;
      let sx = inp && inp.sx || 0, sy = inp && inp.sy || 0;
      const len = Math.hypot(sx, sy);
      if (len > 1) { sx /= len; sy /= len; }
      if (Math.abs(sx) + Math.abs(sy) < 0.01) return;
      // Proyeksi isometrik terbalik: kontrol bergerak di arah layar, bukan diagonal grid.
      const dx = sx * cfg.moveSpeed * cfg.isoRatio + sy * cfg.moveSpeed;
      const dy = sy * cfg.moveSpeed - sx * cfg.moveSpeed * cfg.isoRatio;
      const hz = cfg.hazard;
      let factor = p.held && HEAVY.includes(p.held.type) ? cfg.heavyCarrySlow : 1;
      if (s.elapsed < p.slipUntil) factor *= hz.slipFactor;
      for (const h of s.hazards) {
        if (h.state === 'active' && Math.hypot(p.x - h.x, p.y - h.y) < h.radius) {
          factor *= hz.slowFactor;
          if (s.elapsed - p.lastHazardMsgAt > hz.msgEvery) { ev.push({ type: 'msg', player: p.id, code: 'hazard_slow' }); p.lastHazardMsgAt = s.elapsed; }
        }
      }
      const oldX = p.x, oldY = p.y;
      const nx = p.x + dx * dt * factor, ny = p.y + dy * dt * factor;
      const r = resolveStations.apply(null, clampWorld(nx, ny));
      p.x = r[0]; p.y = r[1];
      p.facingX = sx; p.facingY = sy; p.moving = true;
      for (const h of s.hazards) {
        if (h.state === 'active' && Math.hypot(p.x - h.x, p.y - h.y) < h.radius && Math.hypot(oldX - h.x, oldY - h.y) >= h.radius) {
          p.slipUntil = s.elapsed + hz.slipSeconds;
          ev.push({ type: 'hazard:slip', player: p.id, x: p.x, y: p.y });
        }
      }
    }

    function stationDistance(p, st) { return Math.hypot(st.x - p.x, st.y - p.y); }

    function targetStation(p) {
      const valid = s.stations.filter(st => stationDistance(p, st) <= cfg.reach);
      if (!valid.length) return null;
      const rank = st => {
        const dx = (st.x - p.x) - (st.y - p.y);
        const dy = ((st.x - p.x) + (st.y - p.y)) * 0.5;
        const dot = dx * p.facingX + dy * p.facingY;
        return stationDistance(p, st) - (dot > 0 ? 0.12 : 0);
      };
      valid.sort((a, b) => rank(a) - rank(b));
      return valid[0];
    }

    // ---------- hazard ----------
    function updateHazards(dt, ev) {
      const hz = cfg.hazard;
      if (!hz.enabled) return;
      if (s.elapsed >= s.nextHazardAt && s.hazards.length < hz.maxActive) {
        const spot = hz.spots[Math.floor(rng() * hz.spots.length)];
        const h = { id: s.nextHazardId++, x: spot.x, y: spot.y, radius: hz.radius, state: 'warning', timer: hz.warnSeconds };
        s.hazards.push(h);
        s.nextHazardAt = s.elapsed + hz.intervalMin + rng() * (hz.intervalMax - hz.intervalMin);
        ev.push({ type: 'hazard:spawned', hazard: h.id, x: h.x, y: h.y });
      }
      for (let i = s.hazards.length - 1; i >= 0; i--) {
        const h = s.hazards[i];
        h.timer -= dt;
        if (h.timer <= 0) {
          if (h.state === 'warning') { h.state = 'active'; h.timer = hz.activeSeconds; }
          else s.hazards.splice(i, 1);
        }
      }
    }

    // ---------- dock + karung ----------
    // Karung tidak pernah diangkat. Pemain memegang dari satu sisi (Aksi) lalu menyeret/mendorong sepanjang satu sumbu (x atau y):
    // sendirian = 1/4 kecepatan; berdua di sisi berseberangan = kecepatan normal bila keduanya searah, diam bila berlawanan.
    // mode: 'none' (belum ada), 'floor' (di lantai, penghalang), 'drag' (ada 1-2 pemegang: sk.grip, sk.side, sk.axis).
    const rowsMax = () => Math.round(cfg.collision.reachMaxY - 0.37);
    const sackDist = p => Math.hypot(s.sack.x - p.x, s.sack.y - p.y);
    function sackFits(x, y) {
      if (x < 1 - 1e-6 || y < 1 - 1e-6 || x > cfg.collision.reachMaxX - 0.37 + 1e-6 || y > rowsMax() + 1e-6) return false;
      const f = footRect(x, y);
      for (const st of s.stations) if (overlap(f, footRect(st.x, st.y))) return false;
      for (const w of wallRects()) if (overlap(f, w)) return false;
      return true;
    }
    function playerFits(x, y) { const r = resolveStations(x, y, true); return Math.abs(r[0] - x) < 1e-3 && Math.abs(r[1] - y) < 1e-3; }
    const inDock = p => p.x > DK.x0 + 0.05 && p.y > DK.y0 + 0.05;
    function sackWins(p) {   // karung dalam jangkauan dan lebih dekat daripada stasiun mana pun
      const st = targetStation(p), d = sackDist(p);
      return d <= DK.gripReach && (!st || d < stationDistance(p, st));
    }
    function gripSide(p) {   // di sisi mana karung pemain ini berdiri -> {axis, side} atau null
      const sk = s.sack, dx = p.x - sk.x, dy = p.y - sk.y, axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      const along = axis === 'x' ? dx : dy, cross = axis === 'x' ? dy : dx;
      return Math.abs(cross) > 0.75 ? null : { axis, side: along >= 0 ? 1 : -1 };
    }
    const gripPos = (sk, axis, side, cx, cy) => axis === 'x' ? [cx + side * DK.span / 2, cy] : [cx, cy + side * DK.span / 2];
    function sackTarget(p) {   // untuk targetOf: apakah tombol Aksi pemain ini sekarang berarti "urus karung"
      const sk = s.sack;
      if (!DK || !sk || sk.mode === 'none') return false;
      if (sk.grip.includes(p.id)) return true;
      return !p.held && sackWins(p);
    }
    function releaseGrip(p, ev) {
      const sk = s.sack, i = sk.grip.indexOf(p.id);
      sk.grip.splice(i, 1); sk.side.splice(i, 1);
      if (!sk.grip.length) {   // tidak ada yang memegang: karung diam di lantai, dirapikan ke sel terdekat bila muat
        const v = Math.round(sk[sk.axis]), pos = sk.axis === 'x' ? [v, sk.y] : [sk.x, v];
        if (sackFits(pos[0], pos[1])) { sk.x = pos[0]; sk.y = pos[1]; }
        sk.mode = 'floor'; sk.axis = null;
      }
      ev.push({ type: 'msg', player: p.id, code: 'sack_released' });
    }
    function tryGrip(p, ev) {
      const sk = s.sack, g = gripSide(p), msg = code => ev.push({ type: 'msg', player: p.id, code });
      if (!g) return msg('sack_align');
      if (sk.grip.length >= 2) return msg('sack_full');
      if (sk.grip.length === 1 && (sk.axis !== g.axis || sk.side[0] === g.side)) return msg('sack_align');   // pegang dari sisi seberang, segaris
      const pos = gripPos(sk, g.axis, g.side, sk.x, sk.y);
      if (!playerFits(pos[0], pos[1])) return msg('sack_no_space');
      p.x = pos[0]; p.y = pos[1]; p.held = null;
      sk.mode = 'drag'; sk.axis = g.axis; sk.grip.push(p.id); sk.side.push(g.side);
      msg('sack_gripped');
    }
    function interactSack(p, ev) {   // true bila aksi ini diurus karung (jangan lanjut ke stasiun)
      const sk = s.sack;
      if (!DK || !sk || sk.mode === 'none') return false;
      if (sk.grip.includes(p.id)) { releaseGrip(p, ev); return true; }
      if (p.held || !sackWins(p)) return false;
      tryGrip(p, ev); return true;
    }
    function updateDrag(inputs, dt) {   // satu langkah tick: pegangan 1-2 pemain menggerakkan karung sepanjang sumbunya
      const sk = s.sack, S = cfg.moveSpeed;
      const ps = sk.grip.map(id => s.players.find(q => q.id === id));
      if (ps.some(q => !q)) { for (const id of sk.grip.slice()) { const i = sk.grip.indexOf(id); if (!s.players.find(q => q.id === id)) { sk.grip.splice(i, 1); sk.side.splice(i, 1); } } if (!sk.grip.length) { sk.mode = 'floor'; sk.axis = null; } return; }
      const u = sk.axis === 'x' ? [1, 0] : [0, 1];
      const vel = ps.map(q => {
        const inp = inputs[q.id]; let sx = inp && inp.sx || 0, sy = inp && inp.sy || 0;
        const l = Math.hypot(sx, sy); if (l > 1) { sx /= l; sy /= l; }
        if (Math.abs(sx) + Math.abs(sy) < 0.01) return 0;
        q.facingX = sx; q.facingY = sy;
        return (sx * S * cfg.isoRatio + sy * S) * u[0] + (sy * S - sx * S * cfg.isoRatio) * u[1];
      });
      ps.forEach(q => { q.moving = false; });
      let v = 0;
      if (ps.length === 1) v = vel[0] * DK.soloSlow;
      else if (vel[0] * vel[1] < 0) v = 0;                                                  // berlawanan arah: berhenti
      else if (vel[0] !== 0 && vel[1] !== 0) v = Math.sign(vel[0]) * Math.min(Math.abs(vel[0]), Math.abs(vel[1]));   // berdua searah: normal
      else v = (vel[0] || vel[1]) * DK.soloSlow;                                            // satu menarik, satu hanya memegang: pelan
      if (!v) return;
      const key = sk.axis;
      for (const f of [1, 0.5, 0.25]) {
        const nv = sk[key] + v * f * dt, nx = key === 'x' ? nv : sk.x, ny = key === 'y' ? nv : sk.y;
        const pos = ps.map((q, i) => gripPos(sk, sk.axis, sk.side[i], nx, ny));
        if (!sackFits(nx, ny) || !pos.every(q => playerFits(q[0], q[1]))) continue;
        sk.x = nx; sk.y = ny; ps.forEach((q, i) => { q.x = pos[i][0]; q.y = pos[i][1]; q.moving = vel[i] !== 0; });
        return;
      }
    }
    function dockOccupied() { return s.players.some(inDock); }
    function updateDock(dt, ev) {
      const d = s.dock, sk = s.sack;
      if (d.phase === 'arriving') { d.t -= dt; if (d.t <= 0) { d.phase = 'unloading'; d.t = DK.unloadSeconds; Object.assign(sk, { mode: 'floor', x: DK.drop.x, y: DK.drop.y, grip: [], side: [], axis: null }); } }
      else if (d.phase === 'unloading') { d.t -= dt; if (d.t <= 0) { d.phase = 'leaving'; d.t = DK.leaveSeconds; } }
      else if (d.phase === 'leaving') { d.t -= dt; if (d.t <= 0) { d.phase = 'away'; d.t = 0; d.open = true; ev.push({ type: 'dock:door' }); } }
      else if (d.phase === 'waiting') {
        d.t -= dt;
        if (d.t <= 0 && !dockOccupied()) { d.open = false; d.phase = 'arriving'; d.t = DK.arriveSeconds; ev.push({ type: 'dock:truck' }); }
      }
      if (sk.mode === 'none') return;
      const rz = DK.restock;
      if (Math.hypot(sk.x - rz.x, sk.y - rz.y) <= rz.r) {   // karung masuk ke peti adonan: stok penuh, truk berikutnya dipanggil
        Object.assign(sk, { mode: 'none', grip: [], side: [], axis: null });
        const cr = byId[rz.crate]; if (cr && cr.stockMax != null) cr.stock = cr.stockMax;
        d.phase = 'waiting'; d.t = DK.truckDelay;
        ev.push({ type: 'dock:restock', crate: rz.crate });
      }
    }

    // ---------- pintu bertombol (stage 4) ----------
    const inDoor = p => { const d = s.door; return p.x > d.x - 0.14 && p.x < d.x + d.t0 + 0.14 && p.y > d.y0 - 0.2 && p.y < d.y1 + 0.2; };
    function updateDoor(dt, ev) {   // terbuka sampai hitung mundur habis dan celah kosong (pintu tidak menutup di atas pemain)
      const d = s.door; if (!d.open) return;
      d.t = Math.max(0, d.t - dt);
      if (d.t <= 0 && !s.players.some(inDoor)) { d.open = false; ev.push({ type: 'door:close' }); }
    }

    // ---------- interaksi ----------
    function interact(p, requestId, ev) {
      if (s.mode !== 'running') return;
      if (requestId != null) {            // idempoten: request_id yang sama tidak diproses dua kali (§10.5)
        if (p.seen.includes(requestId)) return;
        p.seen.push(requestId); if (p.seen.length > 64) p.seen.shift();
      }
      const msg = (code, data) => ev.push(Object.assign({ type: 'msg', player: p.id, code }, data));
      if (DK && interactSack(p, ev)) return;
      const st = targetStation(p);
      if (!st) return msg('too_far');
      const held = p.held;

      if (st.type === 'button') {   // tombol pintu: buka (atau perpanjang) selama openSeconds; boleh dengan tangan penuh
        if (!DR) return;
        const d = s.door, was = d.open; d.open = true; d.t = DR.openSeconds;
        if (!was) ev.push({ type: 'door:open' });
        return msg('door_opened', { seconds: DR.openSeconds });
      }

      if (st.type === 'crate') {
        if (held) return msg('hands_full');
        if (st.stock != null) { if (st.stock <= 0) return msg('crate_empty', { crate: st.id }); st.stock--; }
        p.held = makeItem(st.gives);
        return msg('picked', { item: p.held.type, left: st.stock });
      }

      if (st.type === 'prep') {
        if (st.processing) return msg('prep_busy');
        if (!st.item) {
          if (held && held.type === 'dough') { st.item = held; p.held = null; return msg('prep_placed'); }
          return msg('need_dough');
        }
        if (st.item.type === 'dough') {
          if (!held) { st.processing = true; st.timer = cfg.prepSeconds; return msg('kneading_started'); }
          return msg('empty_hands_to_knead');
        }
        if (st.item.type === 'prepared_dough') {
          if (held && (held.type === 'butter' || held.type === 'salt')) {
            const mod = held.type;
            if (st.item.mods.includes(mod)) return msg('mod_present', { mod });
            st.item.mods.push(mod); p.held = null;
            return msg('mod_added', { mod });
          }
          if (!held) { p.held = st.item; st.item = null; return msg('prep_took'); }
          return msg('prep_in_use');
        }
        return;
      }

      if (st.type === 'oven') {
        if (st.status === 'fire') {
          if (held && held.type === 'extinguisher') {
            p.held = null; st.status = 'extinguishing'; st.timer = cfg.fire.extinguishSeconds;
            ev.push({ type: 'oven:extinguishing', player: p.id });
            return msg('fire_extinguishing', { seconds: cfg.fire.extinguishSeconds });
          }
          return msg('oven_on_fire');
        }
        if (st.status === 'extinguishing') return msg('oven_extinguishing');
        if (st.status === 'empty') {
          if (held && held.type === 'prepared_dough') {
            st.item = held; p.held = null; st.status = 'cooking'; st.timer = cfg.cookSeconds; st.readyTimer = 0;
            ev.push({ type: 'oven:started', player: p.id });
            return msg('oven_started', { seconds: cfg.cookSeconds });
          }
          return msg('oven_needs_prepared');
        }
        if (st.status === 'cooking') return msg('oven_cooking');
        if (held) return msg('oven_empty_hands');
        const wasBurnt = st.status === 'burnt' || (st.item && st.item.type === 'burnt_bread');
        p.held = st.item; st.item = null; st.status = 'empty'; st.timer = 0; st.readyTimer = 0;
        return msg('oven_took', { burnt: !!wasBurnt, item: p.held && p.held.type });
      }

      if (st.type === 'counter') {
        if (st.item && !held) { p.held = st.item; st.item = null; return msg('counter_took', { item: p.held.type }); }
        if (!st.item && held) { st.item = held; p.held = null; return msg('counter_placed'); }
        if (st.item) return msg('counter_both_full');
        return msg('counter_empty');
      }

      if (st.type === 'coffee') {
        if (st.status === 'idle') {
          st.status = 'brewing'; st.timer = cfg.coffeeBrewSeconds;
          ev.push({ type: 'coffee:started', player: p.id });
          return msg('coffee_started', { seconds: cfg.coffeeBrewSeconds });
        }
        if (st.status === 'brewing') return msg('coffee_brewing');
        if (held) return msg('coffee_hands_full');
        p.held = makeItem('coffee'); st.status = 'idle'; st.timer = 0;
        return msg('coffee_took', { item: 'coffee' });
      }

      if (st.type === 'serve') {
        if (!held || !SERVABLE.includes(held.type)) return msg('serve_need_bread');
        const idx = s.orders.findIndex(o => o.type === held.type && s.elapsed < o.deadlineAt);
        if (idx < 0) return msg('serve_no_order', { recipe: held.type });
        const order = s.orders[idx];
        const patienceLeft = Math.max(0, order.deadlineAt - s.elapsed) / order.patience;
        const base = cfg.scoreByRecipe[order.type] != null ? cfg.scoreByRecipe[order.type] : cfg.scorePerOrder;
        let earned = base;
        if (patienceLeft > 0.5) earned += Math.round(cfg.fastBonus * base / cfg.scorePerOrder);
        s.streak++;
        const combo = s.streak >= 2 ? Math.min((s.streak - 1) * cfg.comboBonusPerOrder, cfg.maxComboBonus) : 0;
        earned += combo; s.score += earned; s.ordersServed++;
        s.orders.splice(idx, 1); p.held = null;
        ev.push({ type: 'order:completed', player: p.id, order: order.id, index: idx, recipe: order.type, earned, combo, score: s.score, x: p.x, y: p.y });
        return;
      }

      if (st.type === 'trash') {
        if (!held) return msg('trash_empty_hands');
        s.score -= cfg.trashPenalty;
        const wasBurnt = held.type === 'burnt_bread';
        p.held = null; s.streak = 0;
        ev.push({ type: 'item:trashed', player: p.id, penalty: cfg.trashPenalty, burnt: wasBurnt, score: s.score });
        return msg('trashed', { penalty: cfg.trashPenalty, burnt: wasBurnt });
      }
    }

    // ---------- tick ----------
    function tick(dt, inputs, ev) {
      s.elapsed += dt;
      s.roundLeft = Math.max(0, cfg.roundSeconds - s.elapsed);
      if (s.elapsed >= s.nextOrderAt) spawnOrder(ev);
      updateHazards(dt, ev);
      for (let i = s.orders.length - 1; i >= 0; i--) {
        const o = s.orders[i];
        if (s.elapsed >= o.deadlineAt) {
          s.orders.splice(i, 1); s.ordersExpired++; s.score -= cfg.expiredPenalty; s.streak = 0;
          ev.push({ type: 'order:expired', order: o.id, index: i, recipe: o.type, penalty: cfg.expiredPenalty, score: s.score });
        }
      }
      while (s.orders.length < cfg.minOrders && s.orders.length < cfg.maxOrders) pushOrder(pickRecipe(), ev, { refill: true });
      // Semua stasiun bertipe prep/oven diproses (stage boleh punya lebih dari satu); urutan = urutan di config.
      for (const prep of s.stations) {
        if (prep.type !== 'prep' || !prep.processing) continue;
        prep.timer -= dt;
        if (prep.timer <= 0) {
          prep.processing = false; prep.timer = 0;
          if (prep.item && prep.item.type === 'dough') { prep.item.type = 'prepared_dough'; prep.item.mods = []; ev.push({ type: 'dough:prepared' }); }
        }
      }
      for (const oven of s.stations) {
        if (oven.type !== 'oven') continue;
        if (oven.status === 'cooking') {
          oven.timer -= dt;
          if (oven.timer <= 0) {
            oven.timer = 0; oven.status = 'ready'; oven.readyTimer = cfg.readyBeforeBurnSeconds;
            if (oven.item) {
              const m = oven.item.mods;
              oven.item.type = m.includes('butter') && m.includes('salt') ? 'salt_bread' : m.length === 0 ? 'plain_bread' : 'failed_bread';
            }
            ev.push({ type: 'oven:ready', item: oven.item && oven.item.type });
          }
        } else if (oven.status === 'ready') {
          oven.readyTimer -= dt;
          if (oven.readyTimer <= 0) {
            oven.status = 'burnt'; oven.readyTimer = 0;
            if (oven.item) oven.item.type = 'burnt_bread';
            s.burntCount++;
            ev.push({ type: 'oven:burnt' });
          }
        } else if (oven.status === 'burnt' && cfg.fire.enabled) {   // readyTimer dipakai ulang sebagai hitung mundur api (tidak menambah field state)
          oven.readyTimer += dt;
          if (oven.readyTimer >= cfg.fire.afterBurntSeconds) {
            oven.status = 'fire'; oven.item = null; oven.readyTimer = 0; oven.timer = 0;
            s.score -= cfg.fire.penalty; s.fireCount = (s.fireCount || 0) + 1;
            ev.push({ type: 'oven:fire', penalty: cfg.fire.penalty, score: s.score });
          }
        } else if (oven.status === 'extinguishing') {
          oven.timer -= dt;
          if (oven.timer <= 0) { oven.timer = 0; oven.status = 'empty'; ev.push({ type: 'oven:fireOut' }); }
        }
      }
      for (const cm of s.stations) {
        if (cm.type !== 'coffee' || cm.status !== 'brewing') continue;
        cm.timer -= dt;
        if (cm.timer <= 0) { cm.timer = 0; cm.status = 'ready'; ev.push({ type: 'coffee:ready' }); }
      }
      if (DK && s.sack.mode === 'drag') updateDrag(inputs, dt);
      for (const p of s.players) { if (DK && s.sack.mode === 'drag' && s.sack.grip.includes(p.id)) continue; movePlayer(p, inputs[p.id], dt, ev); }
      if (DK) updateDock(dt, ev);
      if (DR) updateDoor(dt, ev);
      if (s.roundLeft <= 0) finishRound(ev);
    }

    function step(dt, inputs) {
      const ev = [];
      if (!s || s.mode !== 'running') return ev;
      inputs = inputs || {};
      for (const p of s.players) {
        const inp = inputs[p.id];
        if (inp && inp.interact != null) interact(p, inp.interact, ev);
      }
      let left = dt;
      while (left > 1e-9 && s.mode === 'running') {
        const d = Math.min(left, cfg.maxStep);
        tick(d, inputs, ev);
        left -= d;
      }
      return ev;
    }

    // Tambah stasiun ke ronde yang sedang berjalan (dipakai tutorial: stasiun muncul bertahap). reset()/start() kembali ke cfg.stations.
    function addStation(def) {
      if (byId[def.id]) return byId[def.id];
      const st = makeStation(def); s.stations.push(st); byId[st.id] = st;
      return st;
    }

    function snapshot() {
      const copy = JSON.parse(JSON.stringify(s));
      for (const p of copy.players) delete p.seen;
      return copy;
    }

    function targetOf(playerId) {
      const p = s.players.find(q => q.id === playerId);
      if (p && DK && sackTarget(p)) return 'sack';
      const st = p && targetStation(p);
      return st ? st.id : null;
    }

    const game = {
      config: cfg,
      reset, start, step, snapshot, targetOf, addStation,
      get state() { return s; },
      get seed() { return seed; }
    };
    s = blankState();
    return game;
  }

  return { createGame, DEFAULT_CONFIG, DOOR_DEFAULTS, mulberry32 };
});
