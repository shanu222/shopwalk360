"""Ten more original ambient tracks for ShopWalk 360 (pure synthesis)."""
import sys, os
import numpy as np
import compose as C
from compose import Mix, mtof, pad_voice, epiano, bell, pluck, bass, shaker, soft_kick, write_mp3


def T(chords, k):
    return [[n + k for n in ch] for ch in chords]


MAJ = [[48, 55, 59, 64, 67], [45, 52, 55, 60, 64], [41, 48, 52, 57, 64], [43, 50, 55, 59, 62]]   # I  vi  IV  V
MIN = [[45, 52, 55, 60, 64], [41, 48, 52, 57, 60], [43, 50, 55, 59, 62], [40, 47, 50, 55, 59]]   # i  VI VII v (aeolian)
DOR = [[50, 57, 60, 64, 65], [43, 53, 57, 59, 64], [48, 55, 59, 62, 64], [45, 55, 59, 61, 64]]   # ii-V-I-VI
DREAM = [[48, 55, 62, 67, 71], [53, 60, 64, 69, 72], [50, 57, 62, 66, 69], [52, 59, 64, 67, 71]]
SOUL = [[46, 53, 57, 60, 65], [51, 55, 58, 62, 65], [44, 51, 55, 60, 63], [43, 50, 53, 58, 62]]


def groove(seed, seconds, bpm, prog, keys='ep', beat_style=None, bells=False, arp=False, pad=0.28, bass_on=True, rev=3.0, sparse=False):
    C.rng = np.random.default_rng(seed)
    rng = C.rng
    beat = 60 / bpm
    bar = beat * 4
    m = Mix(seconds)
    bars = int(seconds / bar)
    voice = {'ep': epiano, 'pl': pluck}[keys]
    for b in range(bars):
        ch = prog[b % len(prog)]
        t0 = b * bar
        intro, outro = b < 2, b >= bars - 2
        for k, nt in enumerate(ch[1:]):
            m.add(pad_voice(mtof(nt), bar * 1.05, 0.3), t0, pan=-0.5 + k * 0.33, gain=pad, send=0.65)
        if not intro or sparse:
            hits = [0, 2.5] if not sparse else [0]
            for h in hits:
                for k, nt in enumerate(ch[1:]):
                    m.add(voice(mtof(nt), beat * (2.2 if h == 0 else 1.2), 0.42), t0 + h * beat + k * 0.01, pan=-0.25 + k * 0.17, gain=0.48, send=0.4)
        if bass_on and b >= 1 and not outro:
            m.add(bass(mtof(ch[0] - 12), beat * 1.8), t0, gain=0.8, send=0.05)
            m.add(bass(mtof(ch[0] - 5), beat * 0.9, 0.5), t0 + beat * 2.5, gain=0.65, send=0.05)
        if beat_style and 3 <= b < bars - 2:
            for i in (0, 2):
                m.add(soft_kick(0.5, 0.5), t0 + i * beat, gain=0.75, send=0.0)
            if beat_style == 'swing':
                for i in range(8):
                    m.add(shaker(0.12, 0.10 if i % 2 else 0.15), t0 + i * beat / 2 + (0.06 * beat if i % 2 else 0), pan=0.35, gain=0.8, send=0.15)
            else:
                for i in range(8):
                    m.add(shaker(0.1, 0.12), t0 + i * beat / 2, pan=-0.3, gain=0.7, send=0.1)
        if arp and b >= 4 and not outro:
            pat = [ch[2] + 12, ch[3] + 12, ch[4] + 12, ch[3] + 12, ch[1] + 24, ch[3] + 12, ch[4] + 12, ch[2] + 24]
            for i, nt in enumerate(pat):
                if rng.random() < 0.8:
                    m.add(pluck(mtof(nt), beat * 1.4, 0.4), t0 + i * beat / 2, pan=rng.uniform(-0.5, 0.5), gain=0.5, send=0.5)
        if bells and 4 <= b < bars - 3 and rng.random() < 0.75:
            for j in range(2):
                nt = rng.choice([ch[4] + 12, ch[3] + 12, ch[2] + 24, ch[4] + 24])
                m.add(bell(mtof(nt), bar * 0.9, 0.35), t0 + beat * (1 + j * 2) + rng.normal(0, 0.01), pan=rng.uniform(-0.6, 0.6), gain=0.5, send=0.75)
        if sparse and 3 <= b < bars - 2:
            for j in range(rng.integers(1, 4)):
                nt = rng.choice([ch[2] + 12, ch[3] + 12, ch[4] + 12, ch[4] + 14])
                m.add(pluck(mtof(nt), beat * 3, 0.45), t0 + beat * rng.choice([0.5, 1, 1.5, 2, 3]), pan=0.2, gain=0.6, send=0.6)
    return m.render(rev, 0.9)


def ambient(seed, seconds, prog, seg=11.0):
    C.rng = np.random.default_rng(seed)
    rng = C.rng
    m = Mix(seconds)
    for i in range(int(seconds / seg) + 1):
        ch = prog[i % len(prog)]
        for k, nt in enumerate(ch):
            m.add(pad_voice(mtof(nt), seg * 1.45, 0.25), i * seg, pan=-0.6 + k * 0.3, gain=0.3, send=0.8)
    t = 7.0
    scale = sorted({n + 12 for ch in prog for n in ch[2:]})
    while t < seconds - 8:
        m.add(bell(mtof(rng.choice(scale)), 6, 0.3 + 0.25 * rng.random()), t, pan=rng.uniform(-0.8, 0.8), gain=0.5, send=0.85)
        t += rng.choice([1.6, 2.4, 3.2, 4.0])
    return m.render(5.5, 1.0)


TRACKS = [
    ('silk-breeze.mp3', 'Silk Breeze', lambda: groove(11, 150, 66, T(DOR, 2), keys='pl', arp=True, pad=0.3)),
    ('lantern-light.mp3', 'Lantern Light', lambda: groove(12, 150, 62, T(MAJ, -3), bells=True, pad=0.32, rev=3.6)),
    ('window-shopping.mp3', 'Window Shopping', lambda: groove(13, 145, 88, T(MAJ, 5), keys='pl', beat_style='swing', rev=2.4)),
    ('marble-hall.mp3', 'Marble Hall', lambda: groove(14, 155, 58, T(MAJ, 3), keys='pl', sparse=True, bass_on=False, rev=4.5)),
    ('citrus-morning.mp3', 'Citrus Morning', lambda: groove(15, 145, 96, T(MAJ, 7), keys='pl', arp=True, beat_style='straight', rev=2.4)),
    ('quiet-boutique.mp3', 'Quiet Boutique', lambda: groove(16, 150, 60, T(MIN, -1), keys='pl', sparse=True, pad=0.24, rev=4.0)),
    ('rooftop-garden.mp3', 'Rooftop Garden', lambda: groove(17, 145, 90, T(DOR, -2), beat_style='straight', bells=True, rev=2.8)),
    ('afterglow.mp3', 'Afterglow', lambda: groove(18, 150, 76, T(SOUL, 0), beat_style='swing', rev=3.0)),
    ('cloud-atrium.mp3', 'Cloud Atrium', lambda: ambient(19, 160, T(DREAM, 6))),
    ('evening-promenade.mp3', 'Evening Promenade', lambda: groove(20, 145, 80, T(MIN, 3), keys='ep', beat_style='swing', bells=True, rev=3.0)),
]

if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for fn, title, f in TRACKS:
        print('composing', title, flush=True)
        write_mp3(f(), os.path.join(out, fn), title)
    print('done')
