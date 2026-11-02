/* Bakery Co-op — data stage. Hanya data: tidak ada logika game.
 * Dimuat client (<script src>, global BakeryStages) dan server (require). Satu sumber untuk layout tiap stage.
 * config = override untuk createGame() di core.js (stations, spawn, hazard, dst.); yang tidak ditulis memakai DEFAULT_CONFIG.
 * Kunci config dari Stage 2: orderMix (bobot resep), scoreByRecipe, coffeeBrewSeconds, fire { enabled, afterBurntSeconds, extinguishSeconds, penalty }.
 * intro = nama set penjelasan awal di index.html (TUT_SETS), ditampilkan sekali per perangkat saat stage pertama kali dimulai.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BakeryStages = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const crate = (id, x, y) => ({ id, type: 'crate', gives: id, x, y });
  const st = (id, type, x, y) => ({ id, type, x, y });

  const STAGES = {
    // Stage 1 (paling gampang): dua jalur prep dan oven. Baris atas dan bawah: counter, counter, prep, counter, oven, counter, trash.
    1: {
      id: 1, name: 'Stage 1', unlockAfter: null,
      config: {
        spawn: { x: 4.15, y: 4.2 },
        hazard: { enabled: false },
        stations: [
          st('counter1', 'counter', 1, 1), st('counter2', 'counter', 2, 1), st('prep', 'prep', 3, 1), st('counter3', 'counter', 4, 1),
          st('oven', 'oven', 5, 1), st('counter4', 'counter', 6, 1), st('trash', 'trash', 7, 1),
          crate('dough', 1, 3), crate('butter', 3, 3), crate('salt', 5, 3), st('serve', 'serve', 7, 3),
          st('counter5', 'counter', 1, 5), st('counter6', 'counter', 2, 5), st('prep2', 'prep', 3, 5), st('counter7', 'counter', 4, 5),
          st('oven2', 'oven', 5, 5), st('counter8', 'counter', 6, 5), st('trash2', 'trash', 7, 5)
        ]
      }
    },
    // Stage 2: denah "sekat + jendela serve" (serve di tengah, dapat dijangkau dari dua sisi), mesin kopi di kiri bawah,
    // alat pemadam di tengah antara dua oven, api aktif. Angka orderMix/scoreByRecipe/coffeeBrewSeconds/fire adalah tebakan awal.
    2: {
      id: 2, name: 'Stage 2', unlockAfter: 1, intro: 'stage2',
      config: {
        spawn: { x: 3.8, y: 4.2 },
        hazard: { enabled: false },
        orderMix: { plain_bread: 1, salt_bread: 1, coffee: 0.5 },   // kopi ±20% order
        scoreByRecipe: { coffee: 40 },
        coffeeBrewSeconds: 4.5,
        fire: { enabled: true, afterBurntSeconds: 6, extinguishSeconds: 2, penalty: 30 },
        stations: [
          crate('dough', 1, 1), st('prep', 'prep', 3, 1), st('oven', 'oven', 5, 1), st('trash', 'trash', 7, 1),
          crate('butter', 1, 3), st('counter1', 'counter', 2, 3), st('counter2', 'counter', 3, 3), crate('extinguisher', 5, 3),
          st('serve', 'serve', 6, 3), crate('salt', 7, 3),
          st('coffee', 'coffee', 1, 5), st('prep2', 'prep', 3, 5), st('oven2', 'oven', 5, 5), st('counter4', 'counter', 7, 5)
        ]
      }
    }
  };

  function get(id) { const k = String(id); return Object.prototype.hasOwnProperty.call(STAGES, k) ? STAGES[k] : null; }
  function list() { return Object.keys(STAGES).map(k => STAGES[k]); }
  return { get, list };
});
