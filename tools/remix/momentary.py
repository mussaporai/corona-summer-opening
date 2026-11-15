"""Loudness momentânea (janela 400 ms, passo 100 ms) num trecho. Uso: python3 -I momentary.py <wav> <t0> <t1>"""
import sys, numpy as np, soundfile as sf, pyloudnorm as pyln
x, sr = sf.read(sys.argv[1], always_2d=True); t0, t1 = float(sys.argv[2]), float(sys.argv[3])
m = pyln.Meter(sr, block_size=0.4)
out = []
for t in np.arange(t0, t1, 0.1):
    seg = x[int(t * sr):int((t + 0.4) * sr)]
    try: v = m.integrated_loudness(seg)
    except Exception: v = -70
    out.append((t, max(v, -70)))
for t, v in out:
    print(f"{t:6.1f}s {v:6.1f} LUFS " + "#" * int(max(0, v + 40)))
