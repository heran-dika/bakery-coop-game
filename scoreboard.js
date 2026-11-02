/* Bakery Co-op — scoreboard lokal (top 3 per stage per jumlah pemain).
 * Logika murni: storage disuntik, tanpa DOM. Browser: window.BakeryScores. Node: require().
 * Papan hanya menampilkan entri dengan configVersion aktif; naikkan angkanya bila balancing berubah.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BakeryScores = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const KEY = 'sbc_scores';

  const cleanName = (v, fallback) =>
    (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>&"']/g, '').replace(/\s+/g, ' ').trim().slice(0, 12) : '') || fallback || 'Baker';

  function createScoreboard(opts) {
    const o = Object.assign({ storage: null, configVersion: 1, size: 3, now: () => Date.now() }, opts);
    let seq = 0;

    function load() {
      try {
        const d = JSON.parse(o.storage.getItem(KEY) || 'null');
        return d && Array.isArray(d.entries) ? d.entries.filter(e => e && Number.isFinite(e.score) && typeof e.id === 'string') : [];
      } catch (e) { return []; }
    }
    function save(entries) { try { o.storage.setItem(KEY, JSON.stringify({ entries })); return true; } catch (e) { return false; } }

    const same = (e, levelId, pc) => e.cv === o.configVersion && e.levelId === levelId && e.pc === pc;
    // urut skor turun; seri: entri lebih lama (sort stabil, entri disimpan urut waktu) tetap di atas
    const board = (entries, levelId, pc) => entries.filter(e => same(e, levelId, pc)).sort((a, b) => b.score - a.score || a.at - b.at);

    return {
      /** top(levelId, playerCount) -> array maks `size` entri */
      top(levelId, pc) { return board(load(), levelId, pc).slice(0, o.size); },

      /** Juara tertinggi dari semua jumlah pemain, untuk kartu stage. null bila belum ada. */
      champion(levelId) {
        const all = load().filter(e => e.cv === o.configVersion && e.levelId === levelId);
        all.sort((a, b) => b.score - a.score || a.at - b.at);
        return all[0] || null;
      },

      /**
       * add({levelId, playerCount, score, name, playerNames}) -> { id, rank } atau null bila tidak masuk
       * rank = 1..size. Skor <= 0 tidak dicatat [Menebak: perlu setuju].
       */
      add(r) {
        const score = Math.round(Number(r && r.score));
        const pc = Math.floor(Number(r && r.playerCount));
        if (!r || !Number.isFinite(score) || score <= 0 || !(pc >= 1 && pc <= 4) || typeof r.levelId !== 'string') return null;
        const all = load();
        const cur = board(all, r.levelId, pc);
        if (cur.length >= o.size && score <= cur[o.size - 1].score) return null;
        const names = Array.isArray(r.playerNames) ? r.playerNames.slice(0, 4).map(n => cleanName(n)) : [];
        const e = {
          id: o.now() + '-' + (++seq), at: o.now(), cv: o.configVersion, levelId: r.levelId, pc, score,
          name: cleanName(r.name, names.join(' & ').slice(0, 12) || 'Baker'), names
        };
        // buang yang tersingkir; entri versi/papan lain tidak disentuh
        const keep = new Set(board(all.concat(e), r.levelId, pc).slice(0, o.size).map(x => x.id));
        const next = all.filter(x => !same(x, r.levelId, pc) || keep.has(x.id)).concat(e);
        if (!save(next)) return null;
        return { id: e.id, rank: board(next, r.levelId, pc).findIndex(x => x.id === e.id) + 1 };
      },

      /** Ganti nama entri yang baru disimpan. true bila ketemu. */
      rename(id, name) {
        const all = load(), e = all.find(x => x.id === id);
        if (!e) return false;
        e.name = cleanName(name, e.name);
        return save(all);
      },

      /** Hapus semua entri (semua versi). */
      clear() { try { o.storage.removeItem(KEY); return true; } catch (e) { return false; } }
    };
  }

  return { createScoreboard, cleanName, KEY };
});
