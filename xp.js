/* Bakery Co-op — XP, level, dan hadiah kosmetik (PRD §9). Logika murni, tanpa DOM; dipakai client, server (daftar putih), dan tes.
 * Model kumulatif: level L tercapai bila total XP >= need(L). Angka di CFG adalah [Usulan awal] dan bisa disetel.
 * XP hanya kosmetik dan disimpan lokal per perangkat (tidak tepercaya, PRD §9.2): jangan dipakai untuk apa pun yang memengaruhi gameplay. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BakeryXP = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CFG = { base: 200, exp: 1.35, maxLevel: 50, order: 50, fast: 20, tutorial: 100, scorePerOrder: 100 };
  // Hadiah per level. Tiap kategori punya satu pilihan bawaan (level 1) yang dipakai bila id tidak dikenal.
  const HEADWEAR = [   // 'hw'
    { id: 'koki', name: 'Topi koki', level: 1 },
    { id: 'bandana', name: 'Bandana', level: 4 },
    { id: 'topi', name: 'Topi', level: 7 },
    { id: 'mahkota', name: 'Mahkota koki', level: 10 }
  ];
  const APRON = [   // 'ap': lapisan celemek (ap_<id>_dr_<frame>); 'biasa' = tanpa lapisan, ikut warna slot
    { id: 'biasa', name: 'Celemek biasa', level: 1 },
    { id: 'emas', name: 'Celemek emas', level: 10 },
    { id: 'garis', name: 'Celemek garis', level: 15 },
    { id: 'polkadot', name: 'Celemek polkadot', level: 15 },
    { id: 'kotak', name: 'Celemek kotak', level: 15 }
  ];
  const NAMECOLOR = [   // 'nc': warna nama di atas karakter dan di scoreboard; 'biasa' = warna bawaan UI
    { id: 'biasa', name: 'Warna nama biasa', level: 1, color: null },
    { id: 'merah', name: 'Nama merah', level: 13, color: '#c34f5a' },
    { id: 'biru', name: 'Nama biru', level: 13, color: '#3e6387' },
    { id: 'hijau', name: 'Nama hijau', level: 13, color: '#4f8f6b' },
    { id: 'ungu', name: 'Nama ungu', level: 13, color: '#7a4a8a' },
    { id: 'emas', name: 'Nama emas', level: 13, color: '#c9962a' }
  ];
  const BADGE = [   // 'bd': ikon di samping nama (badge_<id>.svg)
    { id: 'tanpa', name: 'Tanpa lencana', level: 1 },
    { id: 'bintang', name: 'Lencana bintang', level: 17 },
    { id: 'roti', name: 'Lencana roti', level: 17 },
    { id: 'api', name: 'Lencana api', level: 17 }
  ];
  const REWARDS = { hw: HEADWEAR, ap: APRON, nc: NAMECOLOR, bd: BADGE };
  const DEFAULTS = { hw: 'koki', ap: 'biasa', nc: 'biasa', bd: 'tanpa' };

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
  // pakaian kepala (API lama, tetap)
  const unlockedAt = level => HEADWEAR.filter(h => h.level <= level);
  const unlockedBetween = (from, to) => HEADWEAR.filter(h => h.level > from && h.level <= to);
  const isUnlocked = (id, level) => HEADWEAR.some(h => h.id === id && h.level <= level);
  const cleanHeadwear = (id, level) => (isUnlocked(id, level == null ? CFG.maxLevel : level) ? id : 'koki');
  // semua kategori hadiah: kind = 'hw' | 'ap' | 'nc' | 'bd'
  const isKnown = (kind, id) => !!REWARDS[kind] && REWARDS[kind].some(x => x.id === id);   // dipakai server: hanya daftar putih, tanpa level
  const cleanReward = (kind, id, level) => {
    const list = REWARDS[kind]; if (!list) return null;
    return list.some(x => x.id === id && x.level <= (level == null ? CFG.maxLevel : level)) ? id : DEFAULTS[kind];
  };
  const unlockedBetweenAll = (from, to) => Object.keys(REWARDS).flatMap(kind => REWARDS[kind].filter(x => x.level > from && x.level <= to).map(x => Object.assign({ kind }, x)));   // untuk catatan "Terbuka: ..." saat naik level
  const nameColor = id => { const x = NAMECOLOR.find(c => c.id === id); return x ? x.color : null; };
  return { CFG, HEADWEAR, APRON, NAMECOLOR, BADGE, REWARDS, DEFAULTS, need, levelOf, info, orderXp, unlockedAt, unlockedBetween, isUnlocked, cleanHeadwear, isKnown, cleanReward, unlockedBetweenAll, nameColor };
});
