"""Controle de qualidade técnico de um edit renderizado.

Uso: python3 -I qc.py <edit.wav> <cues.txt> <saida_dir> [beat_sec]
Mede: loudness (LUFS integrado / curto prazo), true peak, clipping, cliques nos cortes,
quedas de sinal, correlação estéreo e balanço espectral por seção. Gera qc.json e qc.png.
"""
import json
import os
import sys

import numpy as np
import soundfile as sf
import pyloudnorm as pyln
from scipy import signal
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


def parse_cues(p):
    cues = []
    for line in open(p):
        parts = line.strip().split("\t")
        m, s = parts[0].split(":")
        cues.append((int(m) * 60 + float(s), parts[-1]))
    return cues


def main():
    wav, cues_p, outdir = sys.argv[1:4]
    os.makedirs(outdir, exist_ok=True)
    x, sr = sf.read(wav, always_2d=True)
    x = x.astype(np.float64)
    cues = parse_cues(cues_p)
    dur = len(x) / sr
    meter = pyln.Meter(sr)
    integ = meter.integrated_loudness(x)
    # curto prazo (3 s, passo 0,5 s)
    st = []
    w, h = int(3 * sr), int(0.5 * sr)
    for i in range(0, max(1, len(x) - w), h):
        try:
            st.append((i / sr, meter.integrated_loudness(x[i:i + w])))
        except Exception:
            pass
    up = signal.resample_poly(x, 4, 1, axis=0)
    tp = 20 * np.log10(np.max(np.abs(up)) + 1e-12)
    sp = 20 * np.log10(np.max(np.abs(x)) + 1e-12)
    clips = int(np.sum(np.abs(x) >= 0.9999))

    # cliques: energia anormal no 2º diferencial em altas frequências, comparada à vizinhança
    mono = x.mean(axis=1)
    hp = signal.sosfilt(signal.butter(4, 8000, "highpass", fs=sr, output="sos"), mono)
    env = np.abs(hp)
    win = int(0.002 * sr)
    e_short = np.convolve(env, np.ones(win) / win, mode="same")
    e_ctx = signal.medfilt(e_short[::win], 51)
    e_ctx = np.repeat(e_ctx, win)[:len(e_short)]
    ratio = e_short / (e_ctx + 1e-6)
    bar = float(sys.argv[4]) * 4 if len(sys.argv) > 4 else None  # duração do compasso (s)
    def peak_ratio(t):
        i0, i1 = int(max(0, t - 0.015) * sr), int(min(dur, t + 0.015) * sr)
        return float(ratio[i0:i1].max()) if i1 > i0 else 0.0
    cut_times = [c[0] for c in cues]
    ref = []
    if bar:
        k = 0
        while k * bar < dur - 3.5:
            tk = k * bar
            if min(abs(tk - c) for c in cut_times) > 0.1:
                ref.append(peak_ratio(tk))
            k += 1
    ref_med = float(np.median(ref)) if ref else None
    ref_p90 = float(np.percentile(ref, 90)) if ref else None
    typical = float(np.percentile(np.abs(np.diff(mono)), 99.9))
    cut_report = []
    for t, name in cues:
        i0, i1 = int(max(0, t - 0.03) * sr), int(min(dur, t + 0.03) * sr)
        r = peak_ratio(t)
        jump = float(np.max(np.abs(np.diff(mono[i0:i1])))) if i1 > i0 + 1 else 0.0
        cut_report.append({"t": round(t, 3), "cue": name, "hf_ratio": round(r, 2),
                           "hf_ratio_vs_downbeats_median": round(r / ref_med, 2) if ref_med else None,
                           "downbeats_p90": round(ref_p90 / ref_med, 2) if ref_med else None,
                           "max_jump": round(jump, 4), "typ_jump_p99.9": round(typical, 4)})

    # quedas de sinal (janelas de 50 ms abaixo de -45 dBFS)
    wl = int(0.05 * sr)
    rms = np.sqrt(np.convolve(mono ** 2, np.ones(wl) / wl, mode="valid")[::wl])
    rms_db = 20 * np.log10(rms + 1e-9)
    drops = [round(i * 0.05, 2) for i, v in enumerate(rms_db) if v < -45 and i * 0.05 < dur - 3.5]

    # correlação estéreo por seção e balanço espectral
    sections = []
    bounds = [c[0] for c in cues] + [dur]
    for k, (t, name) in enumerate(cues):
        a, b = int(t * sr), int(bounds[k + 1] * sr)
        if b - a < sr * 0.5:
            continue
        seg = x[a:b]
        L, R = seg[:, 0], seg[:, 1]
        corr = float(np.corrcoef(L, R)[0, 1]) if np.std(L) > 0 and np.std(R) > 0 else 1.0
        f, P = signal.welch(seg.mean(axis=1), sr, nperseg=8192)
        def band(lo, hi):
            return float(10 * np.log10(np.sum(P[(f >= lo) & (f < hi)]) + 1e-15))
        tot = band(20, 20000)
        try:
            lu = meter.integrated_loudness(seg) if len(seg) > sr * 0.5 else None
        except Exception:
            lu = None
        sections.append({"cue": name, "start": round(t, 2), "end": round(bounds[k + 1], 2),
                         "lufs": None if lu is None or not np.isfinite(lu) else round(float(lu), 1),
                         "lr_corr": round(corr, 3),
                         "sub_20_60": round(band(20, 60) - tot, 1), "low_60_250": round(band(60, 250) - tot, 1),
                         "mid_250_2k": round(band(250, 2000) - tot, 1), "hi_2k_8k": round(band(2000, 8000) - tot, 1),
                         "air_8k_20k": round(band(8000, 20000) - tot, 1)})

    rep = {"file": os.path.basename(wav), "duration_sec": round(dur, 3), "sr": sr,
           "lufs_integrated": round(float(integ), 2),
           "lufs_short_max": round(float(max(v for _, v in st)), 2) if st else None,
           "true_peak_dbtp": round(float(tp), 2), "sample_peak_dbfs": round(float(sp), 2), "clipped_samples": clips,
           "cuts": cut_report, "dropouts_50ms": drops[:50], "sections": sections}
    json.dump(rep, open(os.path.join(outdir, "qc.json"), "w"), indent=1)

    fig, ax = plt.subplots(3, 1, figsize=(20, 11), sharex=True, gridspec_kw={"height_ratios": [1, 2, 1]})
    t = np.arange(len(mono)) / sr
    ax[0].plot(t[::20], x[::20, 0], lw=0.3, color="#2a6")
    ax[0].plot(t[::20], -np.abs(x[::20, 1]), lw=0.3, color="#26a")
    ax[0].set_ylim(-1, 1)
    f, tt, Z = signal.spectrogram(mono, sr, nperseg=4096, noverlap=3072)
    ax[1].pcolormesh(tt, f, 10 * np.log10(Z + 1e-12), shading="auto", cmap="magma", vmin=-120, vmax=-30)
    ax[1].set_yscale("symlog", linthresh=200)
    ax[1].set_ylim(30, 20000)
    if st:
        ax[2].plot([a + 1.5 for a, _ in st], [v for _, v in st], "k-")
        ax[2].axhline(integ, color="r", ls="--", lw=0.8)
        ax[2].set_ylabel("LUFS curto prazo")
    for a in ax:
        for c, name in cues:
            a.axvline(c, color="cyan", lw=1)
    for c, name in cues:
        ax[0].text(c + 0.2, 0.85, name, fontsize=9)
    ax[0].set_title(f"{rep['file']}: {dur:.2f}s | {integ:.1f} LUFS | TP {tp:.2f} dBTP")
    plt.tight_layout()
    plt.savefig(os.path.join(outdir, "qc.png"), dpi=80)
    print(json.dumps({k: v for k, v in rep.items() if k not in ("sections", "cuts")}, indent=1))
    for c in cut_report:
        print("corte", c)
    for s in sections:
        print("seção", s)


if __name__ == "__main__":
    main()
