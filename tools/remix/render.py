"""Renderiza um DJ edit a partir de um arranjo (JSON) sobre a grade de compassos da faixa.

Uso: python3 -I render.py <audio> <analysis.json> <arranjo.json> <saida_prefixo>

Arranjo (tempos de saída em batidas, contados a partir do início do edit):
{
 "segments": [
   {"name": "intro", "src_bar": 1, "src_beat": 0, "beats": 32,
    "preroll_beats": 0, "xfade_ms": 12,
    "fx": [ {"type": "hpf", "from": 20, "to": 800, "start": 24, "end": 32}, ... ]}
 ],
 "layers": [ {"type": "riser", "start": 56, "end": 64, "gain_db": -14}, ... ],
 "ending": {"hit_src_bar": 120, "hit_beats": 1, "tail_sec": 3.0, "gain_db": 0},
 "master": {"ceiling_dbtp": -1.0, "gain_db": 0}
}
FX de segmento: hpf/lpf (varredura), gain (dB), fade_in/fade_out (batidas), stutter, gap, echo_out.
Camadas: riser (ruído subindo), downlifter, reverse_cymbal, impact (golpe + sub).
"""
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf
from scipy import signal

SR = 48000
RNG = np.random.default_rng(7)


def db(x):
    return 10 ** (x / 20.0)


def decode(path):
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", path, "-af",
                    f"aresample={SR}:resampler=soxr:precision=28", "-ac", "2",
                    "-c:a", "pcm_f32le", tmp], check=True)
    y, _ = sf.read(tmp, dtype="float32", always_2d=True)
    os.unlink(tmp)
    return y.T.astype(np.float64)


def eq_fade(n, out=True):
    t = np.linspace(0, 1, n, endpoint=False) if n > 0 else np.zeros(0)
    return np.cos(t * np.pi / 2) if out else np.sin(t * np.pi / 2)


def sweep_filter(x, kind, f_from, f_to, s0, s1, hold_after=True):
    """Filtro Butterworth 2ª ordem com corte variando (log) de s0 a s1 (amostras)."""
    y = x.copy()
    n = x.shape[1]
    s0, s1 = max(0, s0), min(n, s1)
    end = n if hold_after else s1
    blk = 128
    zi = np.zeros((x.shape[0], 1, 2))
    for b in range(s0, end, blk):
        e = min(end, b + blk)
        frac = 1.0 if b >= s1 else (b - s0) / max(1, s1 - s0)
        fc = np.exp(np.log(f_from) + (np.log(f_to) - np.log(f_from)) * frac)
        fc = float(np.clip(fc, 15, SR * 0.45))
        sos = signal.butter(2, fc, btype="highpass" if kind == "hpf" else "lowpass", fs=SR, output="sos")
        for c in range(x.shape[0]):
            y[c, b:e], zi[c] = signal.sosfilt(sos, x[c, b:e], zi=zi[c])
    return y


def synth_ir(sec, sr=SR, predelay=0.012, bright=6000):
    n = int(sec * sr)
    t = np.arange(n) / sr
    env = np.exp(-6.9 * t / sec)  # -60 dB em `sec`
    ir = RNG.standard_normal((2, n)) * env
    sos = signal.butter(2, bright, "lowpass", fs=sr, output="sos")
    ir = signal.sosfilt(sos, ir, axis=1)
    pd = int(predelay * sr)
    ir = np.concatenate([np.zeros((2, pd)), ir], axis=1)
    return ir / np.sqrt(np.sum(ir ** 2, axis=1, keepdims=True))


def reverb(x, sec=2.5, wet=0.35, bright=6000):
    ir = synth_ir(sec, bright=bright)
    w = np.stack([signal.fftconvolve(x[c], ir[c]) for c in range(2)])
    out = np.zeros((2, w.shape[1]))
    out[:, :x.shape[1]] += x * (1 - wet)
    out += w * wet
    return out


def noise_riser(n, gain_db):
    t = np.linspace(0, 1, n)
    x = RNG.standard_normal((2, n))
    # banda passante subindo 300 Hz -> 9 kHz, volume subindo em curva exponencial
    y = np.zeros_like(x)
    blk = 256
    zi = np.zeros((2, 2, 2))
    for b in range(0, n, blk):
        e = min(n, b + blk)
        fc = 300 * (9000 / 300) ** t[b]
        lo, hi = fc / 1.6, min(fc * 1.6, SR * 0.45)
        sos = signal.butter(2, [lo, hi], "bandpass", fs=SR, output="sos")
        for c in range(2):
            y[c, b:e], zi[c] = signal.sosfilt(sos, x[c, b:e], zi=zi[c])
    env = (t ** 2.2)
    y *= env
    y /= np.max(np.abs(y)) + 1e-9
    return y * db(gain_db)


def reverse_cymbal(n, gain_db):
    t = np.linspace(0, 1, n)
    x = RNG.standard_normal((2, n))
    sos = signal.butter(2, 4500, "highpass", fs=SR, output="sos")
    x = signal.sosfilt(sos, x, axis=1)
    x *= np.exp(5.0 * (t - 1))
    x /= np.max(np.abs(x)) + 1e-9
    return x * db(gain_db)


def downlifter(n, gain_db):
    return noise_riser(n, gain_db)[:, ::-1].copy()


def impact(gain_db, sec=3.0):
    n = int(sec * SR)
    t = np.arange(n) / SR
    # sub-drop: seno 70 -> 32 Hz com decaimento
    f = 32 + 38 * np.exp(-t * 3.0)
    ph = 2 * np.pi * np.cumsum(f) / SR
    sub = np.sin(ph) * np.exp(-t * 1.6)
    # golpe: ruído curto filtrado + clique
    burst = RNG.standard_normal(n) * np.exp(-t * 28)
    burst = signal.sosfilt(signal.butter(2, [120, 7000], "bandpass", fs=SR, output="sos"), burst)
    mono = 0.9 * sub + 0.55 * burst / (np.max(np.abs(burst)) + 1e-9)
    st = np.stack([mono, mono])
    st = reverb(st, sec=2.8, wet=0.3, bright=5000)[:, :n]
    st /= np.max(np.abs(st)) + 1e-9
    fade = np.ones(n)
    fade[-int(0.3 * SR):] = np.linspace(1, 0, int(0.3 * SR))
    return st * fade * db(gain_db)


def apply_seg_fx(x, fx, beat_n):
    for f in fx:
        k = f["type"]
        if k in ("hpf", "lpf"):
            x = sweep_filter(x, k, f["from"], f["to"], int(f["start"] * beat_n), int(f["end"] * beat_n),
                             hold_after=f.get("hold", True))
        elif k == "gain":
            s, e = int(f.get("start", 0) * beat_n), int(f.get("end", x.shape[1] / beat_n) * beat_n)
            g0, g1 = db(f.get("from_db", f.get("db", 0))), db(f.get("to_db", f.get("db", 0)))
            x[:, s:e] *= np.linspace(g0, g1, max(0, min(e, x.shape[1]) - s))
            if f.get("hold", True):
                x[:, e:] *= g1
        elif k == "fade_in":
            m = int(f["beats"] * beat_n)
            x[:, :m] *= np.linspace(0, 1, m) ** 2
        elif k == "fade_out":
            m = int(f["beats"] * beat_n)
            x[:, -m:] *= np.linspace(1, 0, m) ** 1.5
        elif k == "stutter":
            # substitui [at, at+len) por repetições de fatias tiradas do início da região
            at = int(f["at"] * beat_n)
            pattern = f["pattern"]  # lista de [tam_fatia_batidas, repeticoes]
            src = x[:, at:].copy()
            pos = at
            for sl, rep in pattern:
                m = int(sl * beat_n)
                piece = src[:, :m].copy()
                xf = min(int(0.003 * SR), m // 4)
                piece[:, :xf] *= np.linspace(0, 1, xf)
                piece[:, -xf:] *= np.linspace(1, 0, xf)
                for _ in range(rep):
                    if pos + m > x.shape[1]:
                        break
                    x[:, pos:pos + m] = piece
                    pos += m
        elif k == "gap":
            # silêncio no fim do segmento (respiro antes do drop), com cauda de reverb do que vinha antes
            m = int(f["beats"] * beat_n)
            pre = x[:, -m - int(beat_n):-m].copy()
            tail = reverb(pre, sec=f.get("tail_sec", 1.2), wet=1.0)[:, pre.shape[1]:pre.shape[1] + m]
            x[:, -m:] = tail * db(f.get("tail_db", -10))
        elif k == "echo_throw":
            # "throw" de delay: corta o seco em `cut` e deixa ecos + reverb do trecho [src_from, cut)
            s0 = int(f["src_from"] * beat_n)
            cut = int(f["cut"] * beat_n)
            d = int(f.get("time_beats", 0.75) * beat_n)
            fb = f.get("feedback", 0.5)
            src = x[:, s0:cut].copy()
            fl = int(0.004 * SR)
            src[:, :fl] *= np.linspace(0, 1, fl)
            src[:, -fl:] *= np.linspace(1, 0, fl)
            src = signal.sosfilt(signal.butter(2, [f.get("hp", 250), f.get("lp", 7000)], "bandpass", fs=SR,
                                               output="sos"), src, axis=1)
            L = x.shape[1] - s0
            wet = np.zeros((2, L + src.shape[1]))
            for i in range(1, f.get("repeats", 6) + 1):
                o = i * d
                if o >= L:
                    break
                g = fb ** (i - 1)
                # ping-pong: alterna o lado do eco
                pan = (1.0, 0.55) if i % 2 else (0.55, 1.0)
                seg_ = src[:, :max(0, min(src.shape[1], L - o))]
                wet[0, o:o + seg_.shape[1]] += seg_[0] * g * pan[0]
                wet[1, o:o + seg_.shape[1]] += seg_[1] * g * pan[1]
            rv = reverb(src, sec=f.get("reverb_sec", 1.8), wet=1.0)
            wet[:, :rv.shape[1]] += rv[:, :wet.shape[1]] * db(f.get("reverb_db", -4))
            fo = int(f.get("cut_fade_ms", 25) * 1e-3 * SR)
            x[:, cut - fo:cut] *= np.linspace(1, 0, fo)
            x[:, cut:] = 0
            x[:, s0:] += wet[:, :L] * db(f.get("gain_db", -3))
        elif k == "echo_out":
            # delay sincronizado nas últimas batidas
            s = int(f["start"] * beat_n)
            d = int(f.get("time_beats", 0.75) * beat_n)
            fb = f.get("feedback", 0.45)
            seg = x[:, s:].copy()
            out = seg.copy()
            tap = seg.copy()
            for _ in range(8):
                tap = np.concatenate([np.zeros((2, d)), tap * fb], axis=1)[:, :seg.shape[1]]
                out += tap
            x[:, s:] = out
    return x


def true_peak_limiter(x, ceiling_db=-1.0, release_ms=80, look_ms=1.5):
    up = signal.resample_poly(x, 4, 1, axis=1)
    pk = np.max(np.abs(up), axis=0).reshape(-1, 4).max(axis=1)[:x.shape[1]]
    if len(pk) < x.shape[1]:
        pk = np.pad(pk, (0, x.shape[1] - len(pk)))
    ceil = db(ceiling_db)
    need = np.minimum(1.0, ceil / (pk + 1e-12))
    look = max(1, int(look_ms * 1e-3 * SR))
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    m = minimum_filter1d(need, size=2 * look + 1)
    g = np.empty_like(m)
    rel = np.exp(-1.0 / (release_ms * 1e-3 * SR))
    cur = 1.0
    for i in range(len(m)):
        cur = m[i] if m[i] < cur else m[i] + (cur - m[i]) * rel
        g[i] = cur
    g = uniform_filter1d(g, size=look)
    y = x * g
    # garantia final (picos residuais)
    up = signal.resample_poly(y, 4, 1, axis=1)
    tp = np.max(np.abs(up))
    if tp > ceil:
        y *= ceil / tp
    true_peak_limiter.last_gain = g
    return y, float(1 - g.min())


def main():
    audio, ana_p, arr_p, out_prefix = sys.argv[1:5]
    ana = json.load(open(ana_p))
    arr = json.load(open(arr_p))
    src = decode(audio)
    beat = ana["beat_sec"]
    beat_n = beat * SR
    fd = ana["first_downbeat"]

    def src_time(bar, beat_off=0.0):
        return fd + ((bar - 1) * 4 + beat_off) * beat

    total_beats = sum(s["beats"] for s in arr["segments"])
    tail_sec = arr.get("ending", {}).get("tail_sec", 0) + 0.5
    N = int(total_beats * beat_n + tail_sec * SR) + SR
    out = np.zeros((2, N))
    pos_beats = 0.0
    cues = []
    for s in arr["segments"]:
        pre = s.get("preroll_beats", 0.0)
        t0 = src_time(s["src_bar"], s.get("src_beat", 0.0)) - pre * beat
        n_body = int(round(s["beats"] * beat_n))
        n_pre = int(round(pre * beat_n))
        xf = int(s.get("xfade_ms", 12) * 1e-3 * SR)
        a = int(round(t0 * SR)) - xf
        lead = 0
        if a < 0:
            lead = -a
            a = 0
        seg = np.zeros((2, n_pre + n_body + 2 * xf))
        take = src[:, a:a + seg.shape[1] - lead]
        seg[:, lead:lead + take.shape[1]] = take
        # fx usam batidas relativas ao início do corpo (após pre-roll)
        body_off = xf + n_pre
        seg_fx = seg[:, body_off:].copy()
        seg_fx = apply_seg_fx(seg_fx, s.get("fx", []), beat_n)
        seg[:, body_off:] = seg_fx
        if n_pre:
            pre_fx = s.get("preroll_gain_db", 0)
            seg[:, xf:body_off] *= db(pre_fx)
        # janelas de crossfade (equal power)
        win = np.ones(seg.shape[1])
        fin_len = xf + (n_pre if s.get("preroll_fade", False) else 0)
        win[:fin_len] = eq_fade(fin_len, out=False)
        body_end = body_off + n_body
        if s.get("tail_beats"):
            body_end = min(seg.shape[1], body_end)
        win[body_end - xf:body_end] = eq_fade(xf, out=True)
        win[body_end:] = 0
        seg *= win
        # posiciona: corpo começa exatamente em pos_beats
        o = int(round(pos_beats * beat_n)) - body_off
        if o < 0:
            seg = seg[:, -o:]
            o = 0
        out[:, o:o + seg.shape[1]] += seg[:, :max(0, min(seg.shape[1], N - o))]
        cues.append((pos_beats, s["name"]))
        pos_beats += s["beats"]

    end_beats = pos_beats
    ending = arr.get("ending")
    if ending:
        hb = ending.get("hit_beats", 1.0)
        t0 = src_time(ending["hit_src_bar"], ending.get("hit_src_beat", 0.0))
        a = int(round(t0 * SR)) - int(0.004 * SR)
        hit = src[:, a:a + int(hb * beat_n)].copy()
        hit[:, :int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))
        hit[:, -int(0.03 * SR):] *= np.linspace(1, 0, int(0.03 * SR))
        hit = reverb(hit, sec=ending.get("tail_sec", 3.0), wet=ending.get("wet", 0.45))
        o = int(round(pos_beats * beat_n)) - int(0.004 * SR)
        L = min(hit.shape[1], N - o)
        f = np.ones(L)
        fl = int(min(L, 0.6 * SR))
        f[-fl:] = np.linspace(1, 0, fl) ** 2
        out[:, o:o + L] += hit[:, :L] * f * db(ending.get("gain_db", 0))
        cues.append((pos_beats, "golpe final"))
        end_sec = pos_beats * beat + ending.get("tail_sec", 3.0)
    else:
        end_sec = pos_beats * beat

    for L_ in arr.get("layers", []):
        k = L_["type"]
        s = int(round(L_.get("start", L_.get("at", 0)) * beat_n))
        if k in ("riser", "reverse_cymbal", "downlifter"):
            e = int(round(L_["end"] * beat_n))
            fn = {"riser": noise_riser, "reverse_cymbal": reverse_cymbal, "downlifter": downlifter}[k]
            lay = fn(e - s, L_.get("gain_db", -14))
            out[:, s:e] += lay
        elif k == "impact":
            lay = impact(L_.get("gain_db", -6), L_.get("sec", 3.0))
            L = min(lay.shape[1], N - s)
            out[:, s:s + L] += lay[:, :L]

    out = out[:, :int(end_sec * SR) + int(0.05 * SR)]
    m = arr.get("master", {})
    out *= db(m.get("gain_db", 0))
    out, gr = true_peak_limiter(out, m.get("ceiling_dbtp", -1.0))
    gcurve = 20 * np.log10(true_peak_limiter.last_gain + 1e-9)
    gr_report = []
    for t0 in np.arange(0, len(gcurve) / SR, 0.5):
        seg = gcurve[int(t0 * SR):int((t0 + 0.5) * SR)]
        if len(seg) and seg.min() < -1.0:
            gr_report.append((round(float(t0), 1), round(float(seg.min()), 1),
                              round(float(np.mean(seg < -1.0) * 100), 1)))
    # micro fade no fim
    fl = int(0.05 * SR)
    out[:, -fl:] *= np.linspace(1, 0, fl)

    os.makedirs(os.path.dirname(out_prefix) or ".", exist_ok=True)
    wav48 = out_prefix + ".wav"
    mp3 = out_prefix + ".mp3"
    sf.write(wav48, out.T, SR, subtype="PCM_24")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", wav48, "-c:a", "libmp3lame", "-b:a", "320k", mp3],
                   check=True)
    with open(out_prefix + "_cues.txt", "w") as fh:
        for b, name in cues:
            t = b * beat
            fh.write(f"{int(t // 60)}:{t % 60:06.3f}\tcompasso {int(b // 4) + 1}\t{name}\n")
        fh.write(f"{int(end_sec // 60)}:{end_sec % 60:06.3f}\tfim\n")
    print(json.dumps({"duration_sec": round(out.shape[1] / SR, 3), "end_beats": end_beats,
                      "limiter_max_gr_db": round(20 * np.log10(1 - gr + 1e-9), 2),
                      "limiter_gr_over_1db": gr_report, "wav": wav48, "mp3": mp3}, indent=1))


if __name__ == "__main__":
    main()
