/* Bakery Co-op — XP, level, dan pakaian kepala (PRD §9). Logika murni, tanpa DOM; dipakai client dan tes.
 * Model kumulatif: level L tercapai bila total XP >= need(L). Angka di CFG adalah [Usulan awal] dan bisa disetel.
 * XP hanya kosmetik dan disimpan lokal per perangkat (tidak tepercaya, PRD §9.2): jangan dipakai untuk apa pun yang memengaruhi gameplay. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BakeryXP = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CFG = { base: 200, exp: 1.35, maxLevel: 50, order: 50, fast: 20, tutorial: 100, scorePerOrder: 100 };
  // Hadiah per level. koki = bawaan. Apron emas dan mahkota (PRD §9.4 level 10) menunggu sprite.
  const HEADWEAR = [
    { id: 'koki', name: 'Topi koki', level: 1 },
    { id: 'bandana', name: 'Bandana', level: 4 },
    { id: 'topi', name: 'Topi', level: 7 }
  ];
  const need = L => (L <= 1 ? 0 : Math.round(CFG.base * Math.pow(L - 1, CFG.exp)));   // total XP untuk mencapai level L
  function levelOf(xp) {
    xp = Math.max(0, Math.floor(Number(xp) || 0));
    let L = 1; while (L < CFG.maxLevel && xp >= need(L + 1)) L++;
    return L;
  }
  function info(xp) {
    xp = Math.max(0, Math.floor(Number(xp) || 0));
    const level = levelOf(xp), lo = need(level), hi = level >= CFG.maxLevel ? lo : need(level + 1);
    return { level, xp, lo, hi, into: xp - lo, span: hi - lo, frac: hi > lo ? (xp - lo) / (hi - lo) : 1, max: level >= CFG.maxLevel };
  }
  // XP dari satu event order:completed (event dari core). Bonus cepat = skor yang didapat melebihi skor dasar sebelum combo.
  function orderXp(e) {
    if (!e || e.type !== 'order:completed') return 0;
    return CFG.order + ((Number(e.earned) || 0) - (Number(e.combo) || 0) > CFG.scorePerOrder ? CFG.fast : 0);
  }
  const unlockedAt = level => HEADWEAR.filter(h => h.level <= level);
  const unlockedBetween = (from, to) => HEADWEAR.filter(h => h.level > from && h.level <= to);
  const isUnlocked = (id, level) => HEADWEAR.some(h => h.id === id && h.level <= level);
  const cleanHeadwear = (id, level) => (isUnlocked(id, level == null ? CFG.maxLevel : level) ? id : 'koki');
  return { CFG, HEADWEAR, need, levelOf, info, orderXp, unlockedAt, unlockedBetween, isUnlocked, cleanHeadwear };
});
