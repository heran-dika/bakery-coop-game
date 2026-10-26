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
  const BREADS = ['plain_bread', 'salt_bread'];

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

    function blankState() {
      const stations = cfg.stations.map(def => {
        const st = { id: def.id, type: def.type, x: def.x, y: def.y };
        if (def.gives) st.gives = def.gives;
        if (def.type === 'prep') Object.assign(st, { item: null, processing: false, timer: 0 });
        if (def.type === 'oven') Object.assign(st, { item: null, status: 'empty', timer: 0, readyTimer: 0 });
        if (def.type === 'counter') st.item = null;
        return st;
      });
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
        stations, players
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

    function spawnOrder(ev) {
      s.nextOrderAt = s.elapsed + cfg.spawnMinSeconds + rng() * (cfg.spawnMaxSeconds - cfg.spawnMinSeconds);
      if (s.orders.length >= cfg.maxOrders) return;
      pushOrder(rng() < 0.5 ? 'plain_bread' : 'salt_bread', ev);
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
    function resolveStations(x, y) {
      const c = cfg.collision, R = c.bodyR, G = c.reachMin + 2 * R, h = c.footHalf;
      for (let pass = 0; pass < 2; pass++) for (const st of s.stations) {
        const cx = st.x + c.footOffset, cy = st.y + c.footOffset;
        // celah antara kubus dan dinding yang lebih sempit dari badan dianggap padat
        const x0 = cx - h < G ? -9 : cx - h, x1 = cx + h > c.reachMaxX - 2 * R ? 9 : cx + h;
        const y0 = cy - h < G ? -9 : cy - h, y1 = cy + h > c.reachMaxY - 2 * R ? 9 : cy + h;
        const qx = Math.max(x0, Math.min(x, x1)), qy = Math.max(y0, Math.min(y, y1));
        const dx = x - qx, dy = y - qy, d = Math.hypot(dx, dy);
        if (d >= R) continue;
        if (d > 1e-6) { x = qx + dx / d * R; y = qy + dy / d * R; }
        else {   // pusat sudah di dalam persegi: keluar lewat sisi terdekat
          const l = x - x0, r = x1 - x, tp = y - y0, b = y1 - y, mn = Math.min(l, r, tp, b);
          if (mn === l) x = x0 - R; else if (mn === r) x = x1 + R; else if (mn === tp) y = y0 - R; else y = y1 + R;
        }
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

    // ---------- interaksi ----------
    function interact(p, requestId, ev) {
      if (s.mode !== 'running') return;
      if (requestId != null) {            // idempoten: request_id yang sama tidak diproses dua kali (§10.5)
        if (p.seen.includes(requestId)) return;
        p.seen.push(requestId); if (p.seen.length > 64) p.seen.shift();
      }
      const msg = (code, data) => ev.push(Object.assign({ type: 'msg', player: p.id, code }, data));
      const st = targetStation(p);
      if (!st) return msg('too_far');
      const held = p.held;

      if (st.type === 'crate') {
        if (held) return msg('hands_full');
        p.held = makeItem(st.gives);
        return msg('picked', { item: p.held.type });
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

      if (st.type === 'serve') {
        if (!held || !BREADS.includes(held.type)) return msg('serve_need_bread');
        const idx = s.orders.findIndex(o => o.type === held.type && s.elapsed < o.deadlineAt);
        if (idx < 0) return msg('serve_no_order', { recipe: held.type });
        const order = s.orders[idx];
        const patienceLeft = Math.max(0, order.deadlineAt - s.elapsed) / order.patience;
        let earned = cfg.scorePerOrder;
        if (patienceLeft > 0.5) earned += cfg.fastBonus;
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
      while (s.orders.length < cfg.minOrders && s.orders.length < cfg.maxOrders) pushOrder(rng() < 0.5 ? 'plain_bread' : 'salt_bread', ev, { refill: true });
      const prep = byId.prep;
      if (prep && prep.processing) {
        prep.timer -= dt;
        if (prep.timer <= 0) {
          prep.processing = false; prep.timer = 0;
          if (prep.item && prep.item.type === 'dough') { prep.item.type = 'prepared_dough'; prep.item.mods = []; ev.push({ type: 'dough:prepared' }); }
        }
      }
      const oven = byId.oven;
      if (oven && oven.status === 'cooking') {
        oven.timer -= dt;
        if (oven.timer <= 0) {
          oven.timer = 0; oven.status = 'ready'; oven.readyTimer = cfg.readyBeforeBurnSeconds;
          if (oven.item) {
            const m = oven.item.mods;
            oven.item.type = m.includes('butter') && m.includes('salt') ? 'salt_bread' : m.length === 0 ? 'plain_bread' : 'failed_bread';
          }
          ev.push({ type: 'oven:ready', item: oven.item && oven.item.type });
        }
      } else if (oven && oven.status === 'ready') {
        oven.readyTimer -= dt;
        if (oven.readyTimer <= 0) {
          oven.status = 'burnt'; oven.readyTimer = 0;
          if (oven.item) oven.item.type = 'burnt_bread';
          s.burntCount++;
          ev.push({ type: 'oven:burnt' });
        }
      }
      for (const p of s.players) movePlayer(p, inputs[p.id], dt, ev);
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

    function snapshot() {
      const copy = JSON.parse(JSON.stringify(s));
      for (const p of copy.players) delete p.seen;
      return copy;
    }

    function targetOf(playerId) {
      const p = s.players.find(q => q.id === playerId);
      const st = p && targetStation(p);
      return st ? st.id : null;
    }

    const game = {
      config: cfg,
      reset, start, step, snapshot, targetOf,
      get state() { return s; },
      get seed() { return seed; }
    };
    s = blankState();
    return game;
  }

  return { createGame, DEFAULT_CONFIG, mulberry32 };
});
