#!/usr/bin/env python3
"""Hadiah kosmetik di luar topi: lapisan celemek (ap_<id>_dr_<state>_<n>.svg, 12 frame per gaya) dan ikon lencana (badge_<id>.svg).
Dasar: make_char_headwear.py (satu folder). Lapisan celemek digambar di atas frame bare + di bawah topi, posisi (0,0), bob kepala sudah dimasukkan.
Celemek 'emas' menggambar ulang kotak celemek berwarna emas; 'garis', 'polkadot', 'kotak' hanya menambah motif krem di atas celemek (ikut warna slot).
Pemakaian:  python3 make_char_extras.py [folder_keluaran]"""
import os, sys
from make_char_headwear import HEAD, FRAMES, ST, NAVY, CREAM
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out_extras')
GOLD, GOLD2 = '#e3b341', '#b98a22'

def emas():
    return f'''    <rect x="17" y="38" width="10" height="12" rx="2" fill="{GOLD}" {ST}/>
    <path d="M19,41 L25,41 M19,44 L25,44" fill="none" stroke="{GOLD2}" stroke-width="1.2" stroke-linecap="round"/>
'''
def garis():
    return f'''    <path d="M19.4,39.4 L19.4,48.6 M22,39.4 L22,48.6 M24.6,39.4 L24.6,48.6" fill="none" stroke="{CREAM}" stroke-width="1.2" stroke-linecap="round"/>
'''
def polkadot():
    d = [(19.6, 41.2), (24.4, 41.2), (22, 44.6), (19.6, 47.6), (24.4, 47.6)]
    return ''.join(f'    <circle cx="{x}" cy="{y}" r="1" fill="{CREAM}"/>\n' for x, y in d)
def kotak():
    return f'''    <path d="M19.4,39.4 L19.4,48.6 M24.6,39.4 L24.6,48.6 M18.4,42.6 L25.6,42.6 M18.4,46.4 L25.6,46.4" fill="none" stroke="{CREAM}" stroke-width="1" stroke-linecap="round"/>
'''
APRON = {'emas': emas, 'garis': garis, 'polkadot': polkadot, 'kotak': kotak}

def overlay(fn, bob):
    return HEAD + f'  <g transform="translate(0,{bob})">\n{fn()}  </g>\n</svg>\n'

BADGES = {   # ikon 24x24 untuk di samping nama (HUD/scoreboard)
 'bintang': f'''<circle cx="12" cy="12" r="10.8" fill="{GOLD}" stroke="{NAVY}" stroke-width="1.5"/>
<path d="M12,4.5 L14.3,9.6 L19.8,10.2 L15.7,13.9 L16.8,19.3 L12,16.6 L7.2,19.3 L8.3,13.9 L4.2,10.2 L9.7,9.6 Z" fill="{CREAM}" stroke="{NAVY}" stroke-width="1" stroke-linejoin="round"/>''',
 'roti': f'''<circle cx="12" cy="12" r="10.8" fill="#d9a066" stroke="{NAVY}" stroke-width="1.5"/>
<ellipse cx="12" cy="13" rx="7.5" ry="4.6" fill="{CREAM}" stroke="{NAVY}" stroke-width="1.2"/>
<path d="M8,10.4 L9.6,15.4 M12,9.6 L13.6,16.2 M16,10.4 L17.4,15.4" fill="none" stroke="#d9a066" stroke-width="1" stroke-linecap="round"/>''',
 'api': f'''<circle cx="12" cy="12" r="10.8" fill="#e2763a" stroke="{NAVY}" stroke-width="1.5"/>
<path d="M12,3.6 C9,7.6 6.6,8.8 6.6,12.8 C6.6,16 9,18.4 12,18.4 C15,18.4 17.4,16 17.4,12.8 C17.4,9.6 15.6,9 15,6.4 C14,8 13.2,7 12,3.6 Z" fill="#f2c14e" stroke="{NAVY}" stroke-width="1.2" stroke-linejoin="round"/>''',
}

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for k, (_, bob) in FRAMES.items():
        for name, fn in APRON.items():
            open(os.path.join(OUT, f'ap_{name}_dr_{k}.svg'), 'w').write(overlay(fn, bob))
    for name, body in BADGES.items():
        open(os.path.join(OUT, f'badge_{name}.svg'), 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48">\n{body}\n</svg>\n')
    print('selesai:', len(os.listdir(OUT)), 'berkas di', OUT)
