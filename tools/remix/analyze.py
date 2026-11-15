"""Analisa uma faixa: BPM, grade de compassos, energia por compasso, estrutura.

Uso: python3 -I analyze.py <audio> <saida_dir> [--bpm 146]
Saídas: analysis.json (compassos com tempo e features) e analysis.png (mapa visual).
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf
import librosa
import librosa.display
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

SR = 44100


def decode(path):
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", path, "-ar", str(SR), "-ac", "2",
                    "-c:a", "pcm_f32le", tmp], check=True)
    y, sr = sf.read(tmp, dtype="float32", always_2d=True)
    os.unlink(tmp)
    return y.T, sr  # (2, n)


def fit_grid(onset_env, hop, sr, bpm_guess):
    """Ajusta grade de tempo constante (período + fase) maximizando o onset nas batidas."""
    fps = sr / hop
    best = None
    for bpm in np.arange(bpm_guess - 3, bpm_guess + 3, 0.005):
        period = fps * 60.0 / bpm
        n = int((len(onset_env) - 1) / period)
        if n < 16:
            continue
        idx_base = np.arange(n) * period
        for phase in np.linspace(0, period, 48, endpoint=False):
            idx = np.round(idx_base + phase).astype(int)
            idx = idx[idx < len(onset_env)]
            score = onset_env[idx].mean()
            if best is None or score > best[0]:
                best = (score, bpm, phase)
    # refino fino da fase
    score, bpm, phase = best
    period = fps * 60.0 / bpm
    for ph in np.linspace(phase - period / 48, phase + period / 48, 41):
        idx = np.round(np.arange(int((len(onset_env) - 1 - ph) / period)) * period + ph).astype(int)
        s = onset_env[idx].mean()
        if s > score:
            score, phase = s, ph
    return bpm, phase / fps  # bpm, tempo da primeira batida (s)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("outdir")
    ap.add_argument("--bpm", type=float, default=146.0)
    a = ap.parse_args()
    os.makedirs(a.outdir, exist_ok=True)

    y2, sr = decode(a.audio)
    y = y2.mean(axis=0)
    dur = len(y) / sr
    hop = 256

    # onset geral e de graves (bumbo) para achar o tempo forte
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    onset = librosa.onset.onset_strength(S=librosa.amplitude_to_db(S, ref=np.max), sr=sr, hop_length=hop)
    low = S[freqs < 150].sum(axis=0)
    low_on = np.maximum(0, np.diff(low, prepend=low[0]))
    low_on /= low_on.max() + 1e-9

    bpm_lib = float(np.atleast_1d(librosa.feature.tempo(onset_envelope=onset, sr=sr, hop_length=hop,
                                                        start_bpm=a.bpm))[0])
    bpm, t0 = fit_grid(onset / (onset.max() + 1e-9), hop, sr, a.bpm)
    beat = 60.0 / bpm
    # correção fina: alinha a grade ao ataque real dos transientes (resolução ~1,5 ms)
    on_t = librosa.onset.onset_detect(y=y, sr=sr, hop_length=64, units="time", backtrack=True)
    k = np.round((on_t - t0) / beat)
    d = on_t - (t0 + k * beat)
    d = d[np.abs(d) < 0.04]
    corr = float(np.median(d)) if len(d) > 20 else 0.0
    t0 += corr
    nbeats = int((dur - t0) / beat)
    beats = t0 + np.arange(nbeats) * beat

    # fase do compasso: qual das 4 posições tem o bumbo mais forte
    fps = sr / hop
    bidx = np.clip(np.round(beats * fps).astype(int), 0, len(low_on) - 1)
    ph_scores = [low_on[bidx[p::4]].mean() for p in range(4)]
    p = int(np.argmax(ph_scores))
    first_down = beats[p]
    # recua até o início da música
    while first_down - 4 * beat > -beat * 0.5:
        first_down -= 4 * beat
    bar_len = 4 * beat
    nbars = int(np.ceil((dur - first_down) / bar_len))

    # features por compasso
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=512)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, hop_length=512)
    cfps = sr / 512
    bars = []
    feats = []
    for i in range(nbars):
        s = first_down + i * bar_len
        e = s + bar_len
        si, ei = max(0, int(s * sr)), min(len(y), int(e * sr))
        if ei - si < sr * 0.3:
            continue
        seg = y[si:ei]
        segS = np.abs(np.fft.rfft(seg * np.hanning(len(seg))))
        f = np.fft.rfftfreq(len(seg), 1 / sr)
        band = lambda lo, hi: float(10 * np.log10(np.sum(segS[(f >= lo) & (f < hi)] ** 2) + 1e-12))
        rms = float(20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-9))
        ci, ce = int(max(0, s) * cfps), int(e * cfps)
        cvec = chroma[:, ci:ce].mean(axis=1) if ce > ci else np.zeros(12)
        mvec = mfcc[:, ci:ce].mean(axis=1) if ce > ci else np.zeros(13)
        feats.append(np.concatenate([cvec / (np.linalg.norm(cvec) + 1e-9), mvec / 100.0]))
        bars.append({
            "bar": i + 1,
            "start": round(s, 4),
            "end": round(e, 4),
            "mmss": f"{int(max(s,0)//60)}:{max(s,0)%60:05.2f}",
            "rms_db": round(rms, 2),
            "sub_db": round(band(20, 80), 2),
            "low_db": round(band(80, 250), 2),
            "mid_db": round(band(250, 2000), 2),
            "pres_db": round(band(2000, 6000), 2),
            "air_db": round(band(6000, 16000), 2),
        })
    F = np.array(feats)
    Fn = (F - F.mean(0)) / (F.std(0) + 1e-9)
    Fn /= np.linalg.norm(Fn, axis=1, keepdims=True) + 1e-9
    ssm = Fn @ Fn.T

    out = {
        "file": os.path.basename(a.audio),
        "duration": round(dur, 3),
        "bpm": round(bpm, 3),
        "bpm_librosa": round(bpm_lib, 2),
        "beat_sec": round(beat, 5),
        "bar_sec": round(bar_len, 5),
        "first_downbeat": round(first_down, 4),
        "grid_correction_ms": round(corr * 1000, 2),
        "downbeat_phase_scores": [round(float(x), 4) for x in ph_scores],
        "bars": bars,
    }
    with open(os.path.join(a.outdir, "analysis.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    np.save(os.path.join(a.outdir, "ssm.npy"), ssm)

    # mapa visual
    fig, ax = plt.subplots(3, 1, figsize=(22, 13), gridspec_kw={"height_ratios": [2, 1, 2]})
    D = librosa.amplitude_to_db(np.abs(librosa.stft(y, n_fft=4096, hop_length=1024)), ref=np.max)
    librosa.display.specshow(D, sr=sr, hop_length=1024, x_axis="time", y_axis="log", ax=ax[0], cmap="magma")
    for b in bars:
        if (b["bar"] - 1) % 4 == 0:
            ax[0].axvline(max(0, b["start"]), color="cyan", lw=0.5 if (b["bar"] - 1) % 8 else 1.2, alpha=0.7)
            if (b["bar"] - 1) % 8 == 0:
                ax[0].text(max(0, b["start"]), 11000, str(b["bar"]), color="white", fontsize=8)
    ax[0].set_title(f"{out['file']} — {bpm:.2f} BPM, compasso {bar_len:.3f}s, 1º tempo forte {first_down:.3f}s")
    xs = [max(0, b["start"]) for b in bars]
    for k, c in [("rms_db", "k"), ("sub_db", "r"), ("mid_db", "g"), ("pres_db", "b"), ("air_db", "m")]:
        v = np.array([b[k] for b in bars])
        ax[1].plot(xs, v - v.max(), c, label=k, drawstyle="steps-post")
    ax[1].legend(loc="lower right", fontsize=8)
    ax[1].set_xlim(0, dur)
    ax[1].grid(alpha=0.3)
    ax[2].imshow(ssm, cmap="viridis", origin="lower", aspect="auto")
    ax[2].set_title("Auto-similaridade por compasso (blocos claros fora da diagonal = seções que se repetem)")
    ax[2].set_xlabel("compasso")
    ax[2].set_ylabel("compasso")
    plt.tight_layout()
    plt.savefig(os.path.join(a.outdir, "analysis.png"), dpi=80)
    print(json.dumps({k: v for k, v in out.items() if k != "bars"}, indent=1))
    print(f"{len(bars)} compassos")


if __name__ == "__main__":
    sys.exit(main())
