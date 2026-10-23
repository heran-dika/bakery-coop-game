// Salin core.js ke dalam index.html di antara penanda BEGIN/END, supaya satu file tetap berdiri sendiri.
// Pakai:  node sync-core.js [index.html]   (jalankan setelah mengubah core.js)
const fs = require('node:fs');
const file = process.argv[2] || 'index.html';
const core = fs.readFileSync(__dirname + '/core.js', 'utf8').trimEnd();
const html = fs.readFileSync(file, 'utf8');
const B = '// ===== BEGIN core.js', E = '// ===== END core.js =====';
const a = html.indexOf(B), b = html.indexOf(E);
if (a < 0 || b < a) { console.error('Penanda BEGIN/END core.js tidak ditemukan di ' + file); process.exit(1); }
const head = html.slice(a, html.indexOf('\n', a) + 1);        // pertahankan baris BEGIN apa adanya
const out = html.slice(0, a) + head + core + '\n' + html.slice(b);
if (out === html) console.log(file + ': sudah sinkron dengan core.js'); else { fs.writeFileSync(file, out); console.log(file + ': core.js disalin ulang'); }
