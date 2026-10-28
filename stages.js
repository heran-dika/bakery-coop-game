/* Bakery Co-op — data stage. Hanya data: tidak ada logika game.
 * Dimuat client (<script src>, global BakeryStages) dan server (require). Satu sumber untuk layout tiap stage.
 * config = override untuk createGame() di core.js (stations, spawn, hazard, dst.); yang tidak ditulis memakai DEFAULT_CONFIG.
 * Stasiun: prep/oven boleh lebih dari satu (id bebas, tipe menentukan perilaku); counter/trash juga.
 * Koordinat grid 7x6 seperti core; jangan menaruh stasiun di luar x 1..7, y 1..6.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BakeryStages = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const crate = (id, x, y) => ({ id, type: 'crate', gives: id, x, y });
  const st = (id, type, x, y) => ({ id, type, x, y });

  const STAGES = {
    // Stage 1 (paling gampang): dua jalur prep+oven. Baris atas dan bawah: counter, counter, prep, counter, oven, counter, trash.
    // Bahan (adonan, mentega, garam) dan serve di baris tengah dipakai bersama. Spawn di lorong tengah-bawah karena
    // baris bawah menutup lorong di belakangnya. Hazard dimatikan [Usulan, belum diputuskan pemilik].
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
    }
  };

  function get(id) { const k = String(id); return Object.prototype.hasOwnProperty.call(STAGES, k) ? STAGES[k] : null; }
  function list() { return Object.keys(STAGES).map(k => STAGES[k]); }
  return { get, list };
});
