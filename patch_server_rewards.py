#!/usr/bin/env python3
"""Pasang hadiah kosmetik (ap, nc, bd) ke server.js dan tesnya. Jalankan di folder yang berisi server.js dan server_test.js:
    python3 patch_server_rewards.py
Aman dijalankan ulang (berhenti bila sudah terpasang). Server membaca daftar putih dari xp.js, jadi xp.js baru harus ada di folder yang sama."""
import re, sys
p = 'server.js'
s = open(p, encoding='utf-8').read()
if 'cleanCos' in s:
    print('server.js sudah terpasang, tidak diubah'); sys.exit(0)

def sub1(pattern, repl, text, flags=0):
    new, n = re.subn(pattern, lambda m: repl, text, flags=flags)
    if n != 1: sys.exit(f'GAGAL: pola tidak ditemukan tepat sekali ({n}x): {pattern[:60]}')
    return new

s = sub1(r"const Stages = require\('\./stages\.js'\);\n", "const Stages = require('./stages.js');\nlet XP = null; try { XP = require('./xp.js'); } catch (e) { console.warn('[xp] xp.js tidak ditemukan atau rusak, hadiah kosmetik hanya topi:', e.message); }   # daftar putih hadiah kosmetik (satu sumber dengan client)\n".replace('   # ', '   // '), s)
s = sub1(r"const HEADWEAR = \[[^\n]*\n[^\n]*cleanHw[^\n]*\n",
  "// hadiah kosmetik: server tidak memeriksa level (XP hanya lokal), hanya daftar putih dari xp.js; tidak dikenal -> bawaan\n"
  "const COS_DEF = { hw: 'koki', ap: 'biasa', nc: 'biasa', bd: 'tanpa' }, LEGACY_HW = ['koki', 'bandana', 'topi', 'mahkota'];   // cadangan bila xp.js lama: hanya topi\n"
  "const cleanCos = (kind, v) => (XP && XP.isKnown ? (XP.isKnown(kind, v) ? v : COS_DEF[kind]) : (kind === 'hw' && LEGACY_HW.includes(v) ? v : COS_DEF[kind]));\n"
  "const cleanHw = v => cleanCos('hw', v);\n", s)
s = sub1(r"function joinRoom\(sock, room, name, cid, hw\) \{", "function joinRoom(sock, room, name, cid, hw, cos) {", s)
s = sub1(r"hw: cleanHw\(hw\) \}, lobbySpawn\(slot, room\.stage\)\)\);",
  "hw: cleanHw(hw), ap: cleanCos('ap', cos && cos.ap), nc: cleanCos('nc', cos && cos.nc), bd: cleanCos('bd', cos && cos.bd) }, lobbySpawn(slot, room.stage)));", s)
s = sub1(r"y: x\.y, hw: x\.hw \}\)\)", "y: x.y, hw: x.hw, ap: x.ap, nc: x.nc, bd: x.bd }))", s)
n = s.count("joinRoom(sock, room, p.name, p.cid, p.hw);")
if n != 2: sys.exit(f'GAGAL: joinRoom(...p.hw) diharapkan 2x, ditemukan {n}x')
s = s.replace("joinRoom(sock, room, p.name, p.cid, p.hw);", "joinRoom(sock, room, p.name, p.cid, p.hw, p);")
open(p, 'w', encoding='utf-8').write(s)
print('server.js terpasang')

t = 'server_test.js'
try: ts = open(t, encoding='utf-8').read()
except FileNotFoundError: print('server_test.js tidak ditemukan, tes dilewati'); sys.exit(0)
fixed = ts.replace('[4.15, 4.2]', '[4.15, 5.5]')   # spawn lobi Stage 1 sesudah layout 7x7 (y 5.5); tes lama masih memakai 4.2
if fixed != ts: ts = fixed; open(t, 'w', encoding='utf-8').write(ts); print('server_test.js: spawn lobi disesuaikan ke y 5.5')
if 'hadiah kosmetik: ap, nc, bd' not in ts:
    ts += """
test('hadiah kosmetik: ap, nc, bd dikirim saat buat/gabung, diteruskan ke semua pemain, di luar daftar putih jadi bawaan', async () => {
  const env = await boot();
  const a = await env.client(); a.sock.emit('room:create', { name: 'Rina', hw: 'mahkota', ap: 'emas', nc: 'ungu', bd: 'api' });
  assert.ok(await until(() => a.last('room:state')));
  const code = a.last('room:state').code, me = a.last('room:state').players[0];
  assert.deepEqual([me.hw, me.ap, me.nc, me.bd], ['mahkota', 'emas', 'ungu', 'api']);
  const b = await env.client(); b.sock.emit('room:join', { code, name: 'Bima', ap: '<img src=x>', nc: 5, bd: { x: 1 } });
  assert.ok(await until(() => b.last('room:state') && a.last('room:state').players.length === 2));
  assert.deepEqual(a.last('room:state').players.map(p => [p.hw, p.ap, p.nc, p.bd]), [['mahkota', 'emas', 'ungu', 'api'], ['koki', 'biasa', 'biasa', 'tanpa']]);
  await env.stop();
});
"""
    open(t, 'w', encoding='utf-8').write(ts); print('server_test.js: tes hadiah kosmetik ditambahkan')
