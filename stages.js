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
    // Stage 1 (paling gampang): dua jalur prep+oven, baris atas menempel dinding belakang dan baris bawah menempel dinding depan (y=6).
    // Tiap jalur dari kiri: trash, counter, prep, counter, oven, KOSONG, counter. Sel kosong di kanan oven sengaja: sprite oven
    // tidak tertutup stasiun di sebelahnya, jadi jendelanya kelihatan. Bahan (adonan, mentega, garam) dan serve di baris tengah dipakai bersama.
    // Spawn di lorong tengah. Hazard dimatikan [Usulan, belum diputuskan pemilik].
    1: {
      id: 1, name: 'Stage 1', unlockAfter: null,
      config: {
        spawn: { x: 4.15, y: 4.2 },
        hazard: { enabled: false },
        stations: [
          st('trash', 'trash', 1, 1), st('counter1', 'counter', 2, 1), st('prep', 'prep', 3, 1), st('counter2', 'counter', 4, 1),
          st('oven', 'oven', 5, 1), st('counter3', 'counter', 7, 1),
          crate('dough', 1, 3), crate('butter', 3, 3), crate('salt', 5, 3), st('serve', 'serve', 7, 3),
          st('trash2', 'trash', 1, 6), st('counter4', 'counter', 2, 6), st('prep2', 'prep', 3, 6), st('counter5', 'counter', 4, 6),
          st('oven2', 'oven', 5, 6), st('counter6', 'counter', 7, 6)
        ]
      }
    }
  };

  function get(id) { const k = String(id); return Object.prototype.hasOwnProperty.call(STAGES, k) ? STAGES[k] : null; }
  function list() { return Object.keys(STAGES).map(k => STAGES[k]); }
  return { get, list };
});
