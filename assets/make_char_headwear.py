#!/usr/bin/env python3
"""Karakter baker tanpa topi (bare) + sprite pakaian kepala sebagai lapisan terpisah.
Dasar: make_char_baker.py (2026-10-20), viewBox 0 0 40 64, anchor kaki (20,62), arah kanan-bawah (dr).
Hasil (folder OUT):
  char_baker_bare_dr_<state>_<n>.svg   12 frame karakter TANPA topi koki (rambut tipis terlihat)
  hw_<nama>_dr_<state>_<n>.svg         12 frame per pakaian kepala, viewBox sama; gambar di atas frame bare, posisi sama (0,0)
Nama: koki (topi koki bawaan), bandana, topi, mahkota.  Offset naik-turun kepala (bob) per frame sudah dimasukkan ke tiap berkas."""
import os, sys
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
NAVY, CREAM, LINE = '#243b5a', '#fffaf2', '#e6d8c6'
SKIN, HAIR, APRON, SHOE, PANTS, BLUSH = '#f3c9a0', '#6b4a3a', '#c34f5a', '#3a2f2c', '#3e6387', '#e89a8a'
ST = f'stroke="{NAVY}" stroke-width="2" stroke-linejoin="round"'
ST16 = f'stroke="{NAVY}" stroke-width="1.6" stroke-linejoin="round"'
ST13 = f'stroke="{NAVY}" stroke-width="1.3" stroke-linejoin="round"'
HEAD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 64" width="80" height="128">\n'

# ---------- badan (sama dengan make_char_baker.py, tanpa topi koki) ----------
def leg(cx, ang, lift=0, fill=PANTS):
    return f'''  <g transform="translate(0,{-lift}) rotate({ang} {cx} 49)">
    <rect x="{cx-2.5}" y="49" width="5" height="10" rx="1.5" fill="{fill}" {ST}/>
    <ellipse cx="{cx+1.5}" cy="60.5" rx="4.5" ry="2.5" fill="{SHOE}" {ST}/>
  </g>
'''
def arm(cx, ang, dy):
    return f'''  <g transform="translate(0,{dy}) rotate({ang} {cx} 37)">
    <rect x="{cx-2.5}" y="36" width="5" height="9" rx="2.5" fill="{CREAM}" {ST}/>
    <circle cx="{cx}" cy="46" r="2.6" fill="{SKIN}" {ST}/>
  </g>
'''
def upper_bare(dy):
    return f'''  <g transform="translate(0,{dy})">
    <rect x="11" y="33" width="18" height="17" rx="4" fill="{CREAM}" {ST}/>
    <path d="M13,34 L15,34 L15,49 L13,49 Q12,49 12,48 L12,35 Q12,34 13,34 Z" fill="{LINE}"/>
    <rect x="17" y="38" width="10" height="12" rx="2" fill="{APRON}" {ST}/>
    <ellipse cx="11.5" cy="25" rx="2" ry="2.6" fill="{SKIN}" {ST}/>
    <circle cx="20" cy="24" r="9" fill="{SKIN}" {ST}/>
    <ellipse cx="20.5" cy="17.5" rx="8" ry="2.6" fill="{HAIR}"/>
    <circle cx="22.5" cy="25.5" r="1.6" fill="{NAVY}"/>
    <circle cx="27" cy="25" r="1.6" fill="{NAVY}"/>
    <ellipse cx="27" cy="27.8" rx="1.6" ry="1" fill="{BLUSH}"/>
    <path d="M22,30 Q24,31.6 26,30.6" fill="none" stroke="{NAVY}" stroke-width="1.4" stroke-linecap="round"/>
  </g>
'''
def frame(far_leg, near_leg, far_arm, near_arm, bob, far_lift=0, near_lift=0, sep=4):
    return HEAD + arm(27, far_arm, bob) + leg(20-sep, far_leg, far_lift, PANTS) + leg(20+sep, near_leg, near_lift) + upper_bare(bob) + arm(14, near_arm, bob) + '</svg>\n'
CA = 145
FW, BW, A = -22, 22, 25
def frame_carry(far_leg, near_leg, bob, far_lift=0, near_lift=0, sep=4):
    return HEAD + arm(27, -CA, bob) + leg(20-sep, far_leg, far_lift, PANTS) + leg(20+sep, near_leg, near_lift) + upper_bare(bob) + arm(14, CA, bob) + '</svg>\n'
FRAMES = {   # nama: (fungsi frame, bob)
 'idle_0': (frame(0, 0, 2, -2, 0, sep=4), 0),
 'idle_1': (frame(0, 0, 0, 0, -1.8, sep=4), -1.8),
 'walk_0': (frame(BW, FW, A, -A, 0), 0),
 'walk_1': (frame(-16, 4, -10, 10, -1.5, far_lift=4.5), -1.5),
 'walk_2': (frame(FW, BW, -A, A, 0, sep=0.5), 0),
 'walk_3': (frame(4, -16, 10, -10, -1.5, near_lift=4.5), -1.5),
 'carry_idle_0': (frame_carry(0, 0, 0, sep=4), 0),
 'carry_idle_1': (frame_carry(0, 0, -1.8, sep=4), -1.8),
 'carry_walk_0': (frame_carry(BW, FW, 0), 0),
 'carry_walk_1': (frame_carry(-16, 4, -1.5, far_lift=4.5), -1.5),
 'carry_walk_2': (frame_carry(FW, BW, 0, sep=0.5), 0),
 'carry_walk_3': (frame_carry(4, -16, -1.5, near_lift=4.5), -1.5),
}

# ---------- pakaian kepala (koordinat kepala: lingkaran pusat (20,24) r 9; wajah menghadap kanan) ----------
def koki():   # persis topi koki di make_char_baker.py
    return f'''    <circle cx="15.7" cy="10" r="4.5" fill="{CREAM}" {ST}/>
    <circle cx="26.7" cy="10" r="4.5" fill="{CREAM}" {ST}/>
    <circle cx="21.2" cy="8" r="5" fill="{CREAM}" {ST}/>
    <rect x="13.2" y="12" width="15" height="5" rx="1.5" fill="{CREAM}" {ST}/>
'''
def bandana():   # kain kepala merah (warna celemek, jadi ikut tint slot), titik krem, simpul di belakang (kiri)
    return f'''    <path d="M9.6,27 L4.8,31.6 L8.4,32.4 Z" fill="{APRON}" {ST16}/>
    <path d="M10.4,24.6 L3.6,25.4 L6.4,29 Z" fill="{APRON}" {ST16}/>
    <path d="M10.4,23 A9.8,9.8 0 0 1 29.6,23 Q20,20.4 10.4,23 Z" fill="{APRON}" {ST}/>
    <circle cx="10.6" cy="22.6" r="2.4" fill="{APRON}" {ST16}/>
    <path d="M11.6,21.4 Q20,18.9 28.4,21.4" fill="none" stroke="{CREAM}" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="16" cy="16.6" r="1.1" fill="{CREAM}"/><circle cx="22.5" cy="15.6" r="1.1" fill="{CREAM}"/><circle cx="26.2" cy="18.2" r="1" fill="{CREAM}"/><circle cx="19.4" cy="18.6" r="0.9" fill="{CREAM}"/>
'''
def topi():   # topi baseball biru, visor ke arah wajah (kanan-bawah), kancing di atas
    return f'''    <path d="M10.6,22.4 C10.2,12.6 29.8,12.6 29.4,22.4 Q20,19.6 10.6,22.4 Z" fill="#3e6387" {ST}/>
    <path d="M20,14 Q19.2,18 20.4,20.6" fill="none" stroke="{NAVY}" stroke-width="1.2" stroke-linecap="round"/>
    <circle cx="20" cy="13.7" r="1.4" fill="#2b4a6b" {ST13}/>
    <path d="M23,20.4 Q30.4,18.4 34,22 Q33.6,24.4 31.2,23.8 Q27.4,22.6 23.4,23 Z" fill="#2b4a6b" {ST}/>
'''
def mahkota():   # mahkota koki emas (Level 10): lima lancip ala koki, permata tengah ikut warna celemek (tint slot)
    GOLD, GOLD2 = '#e3b341', '#b98a22'
    return f'''    <path d="M13,16.5 L13,7 L17.3,11 L20.8,5 L24.3,11 L28.6,7 L28.6,16.5 Z" fill="{GOLD}" {ST}/>
    <path d="M13.8,13.4 L27.8,13.4" fill="none" stroke="{GOLD2}" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="20.8" cy="10.8" r="1.3" fill="{APRON}"/>
    <circle cx="16.6" cy="15.1" r="0.9" fill="{CREAM}"/><circle cx="25" cy="15.1" r="0.9" fill="{CREAM}"/>
'''
HEADWEAR = {'koki': koki, 'bandana': bandana, 'topi': topi, 'mahkota': mahkota}

def overlay(fn, bob):
    return HEAD + f'  <g transform="translate(0,{bob})">\n{fn()}  </g>\n</svg>\n'

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for k, (svg, bob) in FRAMES.items():
        open(os.path.join(OUT, f'char_baker_bare_dr_{k}.svg'), 'w').write(svg)
        for name, fn in HEADWEAR.items():
            open(os.path.join(OUT, f'hw_{name}_dr_{k}.svg'), 'w').write(overlay(fn, bob))
    print('selesai:', len(os.listdir(OUT)), 'berkas di', OUT)
