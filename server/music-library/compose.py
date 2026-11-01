"""Original ambient shopping music for ShopWalk 360 (procedurally composed, no samples)."""
import numpy as np
from scipy.signal import fftconvolve, butter, sosfilt
import subprocess, sys, os

SR = 44100
rng = np.random.default_rng(7)


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def env_adsr(n, a, d, s, r, sr=SR):
    a_n, d_n, r_n = int(a * sr), int(d * sr), int(r * sr)
    s_n = max(0, n - a_n - d_n - r_n)
    e = np.concatenate([
        np.linspace(0, 1, max(a_n, 1), endpoint=False),
        np.linspace(1, s, max(d_n, 1), endpoint=False),
        np.full(s_n, s),
        np.linspace(s, 0, max(r_n, 1)),
    ])
    return e[:n] if len(e) >= n else np.pad(e, (0, n - len(e)))


def lowpass(x, fc, order=2):
    sos = butter(order, fc / (SR / 2), btype='low', output='sos')
    return sosfilt(sos, x)


def highpass(x, fc, order=2):
    sos = butter(order, fc / (SR / 2), btype='high', output='sos')
    return sosfilt(sos, x)


def pad_voice(freq, dur, bright=0.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for det in (-0.006, 0.0, 0.007):
        f = freq * (1 + det)
        ph = rng.uniform(0, 2 * np.pi)
        for h in range(1, 7):
            out += (1 / h ** (1.6 - bright * 0.5)) * np.sin(2 * np.pi * f * h * t + ph * h)
    # slow movement
    out *= 1 + 0.15 * np.sin(2 * np.pi * 0.11 * t + rng.uniform(0, 6))
    return out * env_adsr(n, min(2.5, dur * 0.3), 0.8, 0.85, min(2.5, dur * 0.35)) / 6


def epiano(freq, dur, vel=0.7):
    n = int(dur * SR)
    t = np.arange(n) / SR
    idx = 1.6 * vel * np.exp(-t * 2.2)
    mod = np.sin(2 * np.pi * freq * 1.0 * t)
    car = np.sin(2 * np.pi * freq * t + idx * mod)
    tine = 0.18 * np.sin(2 * np.pi * freq * 4.0 * t) * np.exp(-t * 9)
    amp = np.exp(-t * (1.4 + freq / 900)) * vel
    rel = np.minimum(1, (n - np.arange(n)) / (0.08 * SR))
    return (car + tine) * amp * rel * 0.35


def bell(freq, dur, vel=0.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    idx = 2.2 * np.exp(-t * 1.5)
    s = np.sin(2 * np.pi * freq * t + idx * np.sin(2 * np.pi * freq * 3.5 * t))
    return s * np.exp(-t * 1.1) * vel * 0.22


def pluck(freq, dur, vel=0.6):
    """soft felt-piano like tone"""
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for h, a in [(1, 1), (2, 0.42), (3, 0.18), (4, 0.08), (5, 0.04)]:
        s += a * np.sin(2 * np.pi * freq * h * t * (1 + 0.0004 * h * h)) * np.exp(-t * (1.2 + 0.9 * h))
    att = np.minimum(1, np.arange(n) / (0.006 * SR))
    rel = np.minimum(1, (n - np.arange(n)) / (0.06 * SR))
    return s * att * rel * vel * 0.4


def bass(freq, dur, vel=0.7):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(2 * np.pi * freq * 2 * t)
    return s * env_adsr(n, 0.02, 0.4, 0.6, 0.25) * vel * 0.45


def shaker(dur, vel=0.12):
    n = int(dur * SR)
    noise = rng.standard_normal(n)
    noise = highpass(noise, 5000)
    t = np.arange(n) / SR
    return noise * np.exp(-t * 38) * vel


def soft_kick(dur=0.5, vel=0.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 55 + 70 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * vel


def reverb_ir(seconds=3.0, damp=3000):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir_l = rng.standard_normal(n) * np.exp(-t * 3.2 / seconds * 2.3)
    ir_r = rng.standard_normal(n) * np.exp(-t * 3.2 / seconds * 2.3)
    ir_l, ir_r = lowpass(ir_l, damp), lowpass(ir_r, damp)
    ir_l[: int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR))
    ir_r[: int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR))
    return ir_l / np.sqrt(np.sum(ir_l ** 2)), ir_r / np.sqrt(np.sum(ir_r ** 2))


class Mix:
    def __init__(self, seconds):
        self.n = int(seconds * SR)
        self.dry = np.zeros((2, self.n))
        self.wet = np.zeros((2, self.n))

    def add(self, sig, at, pan=0.0, gain=1.0, send=0.35):
        i = int(at * SR)
        if i >= self.n:
            return
        sig = sig[: self.n - i] * gain
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        self.dry[0, i:i + len(sig)] += sig * l
        self.dry[1, i:i + len(sig)] += sig * r
        self.wet[0, i:i + len(sig)] += sig * l * send
        self.wet[1, i:i + len(sig)] += sig * r * send

    def render(self, ir_seconds=3.2, wet_gain=0.9):
        irl, irr = reverb_ir(ir_seconds)
        wl = fftconvolve(self.wet[0], irl)[: self.n]
        wr = fftconvolve(self.wet[1], irr)[: self.n]
        out = self.dry + wet_gain * np.vstack([wl, wr])
        out = np.vstack([highpass(out[0], 35), highpass(out[1], 35)])
        # gentle glue + loudness
        out = np.tanh(out * 1.4) / 1.4
        out /= np.max(np.abs(out)) + 1e-9
        out *= 0.82
        fade = int(4 * SR)
        out[:, :fade] *= np.linspace(0, 1, fade)
        out[:, -fade:] *= np.linspace(1, 0, fade)
        return out


def write_mp3(out, path, title, artist='ShopWalk 360 Studio'):
    wav = path.replace('.mp3', '.wav')
    pcm = (out.T * 32767).astype(np.int16)
    import wave
    with wave.open(wav, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '160k',
                    '-metadata', f'title={title}', '-metadata', f'artist={artist}', path], check=True)
    os.remove(wav)


# ------------------------------------------------------------------ tracks

def track_golden_hour(seconds=165):
    """warm electric piano over lush pads, 70 bpm"""
    bpm = 70
    beat = 60 / bpm
    bar = beat * 4
    prog = [[48, 55, 59, 64, 67], [45, 52, 55, 60, 64], [41, 48, 52, 57, 64], [43, 50, 55, 59, 62]]  # Cmaj9 Am9 Fmaj9 G6
    m = Mix(seconds)
    bars = int(seconds / bar)
    for b in range(bars):
        ch = prog[b % 4]
        t0 = b * bar
        for k, note in enumerate(ch[1:]):
            m.add(pad_voice(mtof(note), bar * 1.05, 0.4), t0, pan=-0.5 + k * 0.33, gain=0.32, send=0.6)
        if b >= 2:
            m.add(bass(mtof(ch[0] - 12), bar * 0.95), t0, gain=0.8, send=0.1)
            m.add(bass(mtof(ch[0] - 12 + 7), beat * 0.9, 0.5), t0 + beat * 2.5, gain=0.6, send=0.1)
        if b >= 4:
            arp = [ch[2] + 12, ch[3] + 12, ch[4] + 12, ch[3] + 12, ch[1] + 12, ch[3] + 12, ch[4] + 12, ch[2] + 24]
            for i, nt in enumerate(arp):
                if rng.random() < 0.82:
                    m.add(epiano(mtof(nt), beat * 1.6, 0.45 + 0.2 * rng.random()), t0 + i * beat / 2 + rng.normal(0, 0.006), pan=rng.uniform(-0.4, 0.4), gain=0.55, send=0.45)
        if 8 <= b < bars - 4 and b % 2 == 0:
            mel = rng.choice([ch[4] + 12, ch[3] + 12, ch[2] + 24])
            m.add(bell(mtof(mel), bar), t0 + beat * 3, pan=0.3, gain=0.55, send=0.7)
    return m.render(3.6)


def track_gallery_walk(seconds=160):
    """mellow lo-fi: felt piano, soft kick and shaker, 84 bpm"""
    bpm = 84
    beat = 60 / bpm
    bar = beat * 4
    prog = [[50, 57, 60, 64, 65], [43, 53, 57, 59, 64], [48, 55, 59, 62, 64], [45, 55, 59, 61, 64]]  # Dm9 G13 Cmaj9 A7sus-ish
    m = Mix(seconds)
    bars = int(seconds / bar)
    for b in range(bars):
        ch = prog[b % 4]
        t0 = b * bar
        # chord stabs
        for k, nt in enumerate(ch[1:]):
            m.add(pluck(mtof(nt), bar * 0.9, 0.5), t0 + k * 0.012, pan=-0.3 + k * 0.2, gain=0.6, send=0.35)
            m.add(pluck(mtof(nt), beat * 1.8, 0.35), t0 + beat * 2.5 + k * 0.01, pan=-0.3 + k * 0.2, gain=0.5, send=0.35)
        m.add(pad_voice(mtof(ch[2]), bar, 0.2), t0, gain=0.18, send=0.6)
        if b >= 2:
            m.add(bass(mtof(ch[0] - 12), beat * 1.6), t0, gain=0.85, send=0.05)
            m.add(bass(mtof(ch[0] - 12), beat * 0.8, 0.5), t0 + beat * 2.5, gain=0.7, send=0.05)
        if 4 <= b < bars - 2:
            for i in range(4):
                if i in (0, 2):
                    m.add(soft_kick(0.5, 0.55), t0 + i * beat, gain=0.8, send=0.0)
            for i in range(8):
                swing = 0.06 * beat if i % 2 else 0
                m.add(shaker(0.12, 0.10 if i % 2 else 0.16), t0 + i * beat / 2 + swing, pan=0.35, gain=0.8, send=0.15)
        if 6 <= b < bars - 3:
            scale = [62, 64, 65, 67, 69, 72, 74, 76]
            for i in range(3):
                if rng.random() < 0.6:
                    nt = rng.choice(scale)
                    m.add(pluck(mtof(nt + 12), beat * 2, 0.4), t0 + beat * (i * 1.33 + 0.5), pan=0.25, gain=0.55, send=0.5)
    return m.render(2.6, 0.8)


def track_morning_atrium(seconds=170):
    """airy ambient: slow pads, wind-chime bells in pentatonic"""
    m = Mix(seconds)
    chords = [[48, 55, 62, 67, 71], [53, 60, 64, 69, 72], [50, 57, 62, 66, 69], [52, 59, 64, 67, 71]]
    seg = 10.0
    for i in range(int(seconds / seg) + 1):
        ch = chords[i % 4]
        for k, nt in enumerate(ch):
            m.add(pad_voice(mtof(nt), seg * 1.4, 0.3), i * seg, pan=-0.6 + k * 0.3, gain=0.3, send=0.75)
        m.add(pad_voice(mtof(ch[0] - 12), seg * 1.3, 0.1), i * seg, gain=0.25, send=0.3)
    penta = [67, 69, 72, 74, 76, 79, 81, 84]
    t = 6.0
    while t < seconds - 8:
        m.add(bell(mtof(rng.choice(penta)), 5, 0.4 + 0.3 * rng.random()), t, pan=rng.uniform(-0.8, 0.8), gain=0.55, send=0.8)
        t += rng.choice([0.9, 1.4, 2.1, 2.8, 3.5])
    return m.render(5.0, 1.0)


def track_velvet_evening(seconds=165):
    """slow bossa-tinged groove with electric piano, 92 bpm"""
    bpm = 92
    beat = 60 / bpm
    bar = beat * 4
    prog = [[45, 55, 60, 64, 67], [50, 57, 60, 65, 69], [43, 53, 57, 62, 65], [48, 55, 59, 64, 67]]  # Am9 Dm9 G9 Cmaj7
    m = Mix(seconds)
    bars = int(seconds / bar)
    rhythm = [0, 1.5, 3, 4.5, 6]  # in eighths: bossa comp
    for b in range(bars):
        ch = prog[b % 4]
        t0 = b * bar
        m.add(pad_voice(mtof(ch[3]), bar, 0.2), t0, gain=0.14, send=0.6)
        for r in rhythm:
            for k, nt in enumerate(ch[1:]):
                m.add(epiano(mtof(nt), beat * 0.9, 0.38), t0 + r * beat / 2 + k * 0.008, pan=-0.2 + k * 0.13, gain=0.42, send=0.35)
        if b >= 1:
            root, fifth = ch[0] - 12, ch[0] - 5
            m.add(bass(mtof(root), beat * 1.4), t0, gain=0.8, send=0.05)
            m.add(bass(mtof(fifth), beat * 0.9, 0.55), t0 + beat * 1.5, gain=0.7, send=0.05)
            m.add(bass(mtof(fifth), beat * 1.4), t0 + beat * 2, gain=0.75, send=0.05)
            m.add(bass(mtof(root), beat * 0.9, 0.55), t0 + beat * 3.5, gain=0.7, send=0.05)
        if 2 <= b < bars - 2:
            for i in range(8):
                m.add(shaker(0.1, 0.09 + 0.05 * (i % 2 == 0)), t0 + i * beat / 2, pan=-0.3, gain=0.8, send=0.1)
        if 6 <= b < bars - 4:
            mel = [ch[4] + 12, ch[3] + 12, ch[2] + 12]
            for i, nt in enumerate(mel):
                if rng.random() < 0.7:
                    m.add(bell(mtof(nt), beat * 3, 0.35), t0 + beat * (1 + i), pan=0.35, gain=0.5, send=0.6)
    return m.render(2.8, 0.85)


if __name__ == '__main__':
    out_dir = sys.argv[1]
    os.makedirs(out_dir, exist_ok=True)
    tracks = [
        ('golden-hour.mp3', 'Golden Hour', track_golden_hour),
        ('gallery-walk.mp3', 'Gallery Walk', track_gallery_walk),
        ('morning-atrium.mp3', 'Morning Atrium', track_morning_atrium),
        ('velvet-evening.mp3', 'Velvet Evening', track_velvet_evening),
    ]
    for fn, title, f in tracks:
        print('composing', title, flush=True)
        write_mp3(f(), os.path.join(out_dir, fn), title)
    print('done')
