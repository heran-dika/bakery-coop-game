// ===== BEGIN audio.js (semua bunyi game, dibuat dari kode WebAudio tanpa file; draf dengar: audio_mockup.html) =====
(function (root) {
  'use strict';
  let ctx = null, master = null, noiseBuf = null;
  let volume = 0.6, off = false;
  try {
    const v = localStorage.getItem('sbc_vol'); if (v !== null && v !== '' && Number.isFinite(+v)) volume = Math.min(1, Math.max(0, +v));
    off = localStorage.getItem('sbc_sound') === '0';
  } catch (e) {}
  const forced = (() => { try { return new URLSearchParams(location.search).get('mute') === '1'; } catch (e) { return false; } })();   // ?mute=1
  const isMuted = () => forced || off;
  function applyVol() { if (master) master.gain.value = isMuted() ? 0 : volume * volume; }

  function ensure() {
    try {
      if (!ctx) {
        const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return null;
        ctx = new AC();
        const comp = ctx.createDynamicsCompressor();          // mencegah pecah saat bunyi bertumpuk
        master = ctx.createGain(); master.connect(comp); comp.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        applyVol();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (e) { ctx = null; return null; }
  }
  function envelope(g, t, attack, dur, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
  }
  function tone(t, f, dur, o) {
    o = o || {};
    const type = o.type || 'sine', vol = o.vol === undefined ? 0.25 : o.vol, attack = o.attack || 0.006;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + attack + dur);
    envelope(g, t, attack, dur, vol);
    osc.connect(g); g.connect(master); osc.start(t); osc.stop(t + attack + dur + 0.05);
  }
  function noise(t, dur, o) {
    o = o || {};
    const type = o.type || 'bandpass', vol = o.vol === undefined ? 0.15 : o.vol, attack = o.attack || 0.004;
    const src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; flt.type = type; flt.Q.value = o.q || 1;
    flt.frequency.setValueAtTime(o.f || 1500, t);
    if (o.to) flt.frequency.exponentialRampToValueAtTime(o.to, t + attack + dur);
    envelope(g, t, attack, dur, vol);
    src.connect(flt); flt.connect(g); g.connect(master); src.start(t); src.stop(t + attack + dur + 0.05);
  }
  // Dentingan logam: bagian nada tidak harmonis (1 : 2,76 : 5,4), nada tinggi lebih cepat hilang, plus klik pukulan.
  function bell(t, f) {
    [[1, 1, 1.3], [2.76, .55, .55], [5.4, .3, .26]].forEach(r => tone(t, f * r[0], r[2], { vol: .22 * r[1], attack: 0.002 }));
    noise(t, .03, { vol: .05, type: 'highpass', f: 5000, q: .7, attack: .001 });
  }

  const SND = {
    ovenReady: t => bell(t, 2093),
    ovenWarn: t => { [0, .2, .4].forEach(d => tone(t + d, 988, .1, { type: 'triangle', vol: .2 })); },
    ovenBurnt: t => { tone(t, 230, .7, { type: 'sawtooth', vol: .14, to: 70 }); noise(t, .6, { vol: .14, f: 900, to: 300, q: .8 }); },
    orderWarn: t => { tone(t, 660, .09, { type: 'triangle', vol: .1 }); tone(t + .2, 660, .09, { type: 'triangle', vol: .1 }); },
    orderDone: (t, lvl) => { const k = Math.pow(2, ((lvl || 1) - 1) * 2 / 12); [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(t + i * .075, f * k, .28, { type: 'triangle', vol: .22 })); tone(t + .32, 2093 * k, .3, { vol: .07 }); },
    orderExpired: t => { tone(t, 392, .2, { type: 'square', vol: .09 }); tone(t + .2, 311, .4, { type: 'square', vol: .09, to: 277 }); },
    orderNew: t => { tone(t, 784, .09, { type: 'triangle', vol: .14 }); tone(t + .1, 1047, .14, { type: 'triangle', vol: .14 }); },
    pick: t => { tone(t, 520, .08, { vol: .2, to: 900 }); },
    place: t => { tone(t, 300, .1, { vol: .26, to: 170 }); noise(t, .05, { vol: .12, type: 'lowpass', f: 700 }); },
    trash: t => { noise(t, .28, { vol: .2, f: 2600, to: 350, q: .9 }); tone(t, 210, .22, { vol: .1, to: 90 }); },
    knead: t => { [0, .22, .44, .66].forEach(d => { tone(t + d, 150, .1, { vol: .28, to: 85 }); noise(t + d, .06, { vol: .1, type: 'lowpass', f: 380 }); }); },
    kneadDone: t => { tone(t, 659, .12, { type: 'triangle', vol: .2 }); tone(t + .12, 880, .2, { type: 'triangle', vol: .2 }); tone(t + .12, 1760, .15, { vol: .05 }); },
    fail: t => { tone(t, 170, .16, { type: 'square', vol: .1, to: 130 }); tone(t + .1, 150, .18, { type: 'square', vol: .09, to: 110 }); },
    spill: t => { noise(t, .35, { vol: .2, f: 1900, to: 600, q: .7 }); tone(t + .3, 1250, .09, { vol: .12, to: 520 }); },
    slip: t => { tone(t, 950, .4, { vol: .18, to: 220 }); tone(t + .42, 180, .2, { type: 'square', vol: .1, to: 380 }); noise(t + .42, .08, { vol: .08, type: 'lowpass', f: 600 }); },
    beep: t => { tone(t, 523, .16, { type: 'triangle', vol: .24 }); },                                   // satu bip hitung mundur (3, 2, 1)
    go: t => { tone(t, 1047, .55, { type: 'triangle', vol: .26 }); tone(t, 1319, .55, { vol: .12 }); },   // nada mulai ronde
    roundEnd: t => { [523, 659, 784].forEach(f => tone(t, f, 1.3, { vol: .14 })); tone(t + .05, 1568, .9, { vol: .08 }); tone(t + .5, 1047, .8, { type: 'triangle', vol: .12 }); },
    click: t => { tone(t, 1180, .04, { vol: .12 }); },
    join: t => { tone(t, 698, .12, { vol: .18 }); tone(t + .12, 880, .2, { vol: .18 }); }
  };
  // Jeda minimum per jenis bunyi (detik) supaya 4 pemain tidak menumpuk bunyi yang sama.
  const COOL = { ovenReady: .25, ovenWarn: .8, ovenBurnt: .5, orderWarn: .5, orderDone: .15, orderExpired: .3, orderNew: .4, pick: .06, place: .06, trash: .12, knead: .6, kneadDone: .4, fail: .3, spill: .5, slip: .5, beep: .3, go: .5, roundEnd: 1, click: .05, join: .3 };
  const last = {}, recent = [];
  function play(name, arg) {
    if (isMuted()) return;
    const f = SND[name]; if (!f) return;
    const c = ensure(); if (!c || c.state !== 'running') return;     // belum ada sentuhan pemain: diam
    const now = c.currentTime;
    if (last[name] !== undefined && now - last[name] < (COOL[name] || .1)) return;
    while (recent.length && now - recent[0] > .25) recent.shift();
    if (recent.length >= 8) return;                                   // pengaman: maksimum 8 bunyi per seperempat detik
    last[name] = now; recent.push(now);
    try { f(now + 0.02, arg); } catch (e) {}
  }
  function setMuted(v) { off = !!v; try { localStorage.setItem('sbc_sound', off ? '0' : '1'); } catch (e) {} applyVol(); }
  const unlock = () => { ensure(); };
  ['pointerdown', 'touchend', 'keydown', 'click'].forEach(ev => document.addEventListener(ev, unlock, { passive: true }));
  root.BakeryAudio = { ensure, play, setMuted, isMuted };
})(window);
// ===== END audio.js =====
