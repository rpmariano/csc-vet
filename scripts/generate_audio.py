import numpy as np
import scipy.io.wavfile as wavfile
import math

SR = 44100
DURATION = 30.5  # seconds
TOTAL_SAMPLES = int(SR * DURATION)
BPM = 124.0
BEAT_LEN = 60.0 / BPM
BEAT_SAMPLES = int(SR * BEAT_LEN)

print(f"Generating sports trailer audio track ({DURATION}s, {BPM} BPM)...")

t = np.linspace(0, DURATION, TOTAL_SAMPLES, endpoint=False)
left = np.zeros(TOTAL_SAMPLES, dtype=np.float32)
right = np.zeros(TOTAL_SAMPLES, dtype=np.float32)

# 1. KICK DRUM
def make_kick(duration=0.35):
    n = int(SR * duration)
    k_t = np.linspace(0, duration, n, endpoint=False)
    # Pitch drop from 160Hz down to 42Hz
    freq = 42.0 + 120.0 * np.exp(-k_t * 28.0)
    phase = 2.0 * np.pi * np.cumsum(freq) / SR
    amp = np.exp(-k_t * 11.0)
    kick = np.sin(phase) * amp
    # Click transient
    click = np.random.uniform(-0.3, 0.3, n) * np.exp(-k_t * 80.0)
    return np.clip(kick + click, -1.0, 1.0)

# 2. SNARE / CLAP
def make_snare(duration=0.3):
    n = int(SR * duration)
    s_t = np.linspace(0, duration, n, endpoint=False)
    # Tonal body
    tone = np.sin(2.0 * np.pi * 185.0 * s_t) * np.exp(-s_t * 18.0)
    # Noise snap
    noise = np.random.uniform(-1.0, 1.0, n) * np.exp(-s_t * 14.0)
    return 0.35 * tone + 0.65 * noise

# 3. HI-HAT
def make_hihat(duration=0.06):
    n = int(SR * duration)
    h_t = np.linspace(0, duration, n, endpoint=False)
    noise = np.random.uniform(-1.0, 1.0, n)
    # High-pass filter simulation (diff)
    hp_noise = np.diff(noise, prepend=0)
    return hp_noise * np.exp(-h_t * 45.0)

# 4. SUB BASS PULSE
def add_bass_note(track, start_sample, duration, freq):
    n = int(SR * duration)
    if start_sample + n > len(track):
        n = len(track) - start_sample
    b_t = np.linspace(0, duration, n, endpoint=False)
    # Sine + slight saturation
    sine = np.sin(2.0 * np.pi * freq * b_t)
    env = (1.0 - np.exp(-b_t * 50.0)) * np.exp(-b_t * (3.0 / duration))
    pulse = np.tanh(sine * 1.5) * env
    track[start_sample:start_sample+n] += pulse * 0.45

# 5. RISER WHOOSH
def make_riser(duration=2.0):
    n = int(SR * duration)
    r_t = np.linspace(0, duration, n, endpoint=False)
    noise = np.random.uniform(-0.5, 0.5, n)
    freq = 200.0 + 1200.0 * (r_t / duration) ** 2
    phase = 2.0 * np.pi * np.cumsum(freq) / SR
    synth = np.sin(phase) * 0.4 + noise * 0.6
    env = (r_t / duration) ** 2
    return synth * env * 0.35

# Synthesize instruments
kick = make_kick() * 0.95
snare = make_snare() * 0.75
hihat = make_hihat() * 0.4

total_beats = int(DURATION / BEAT_LEN)

# Beat pattern: 4/4 rhythm
for b in range(total_beats):
    start = int(b * BEAT_SAMPLES)
    if start >= TOTAL_SAMPLES:
        break

    beat_in_bar = b % 4
    # Kick on beat 0 and 2 (or 0, 1.5, 2, 3)
    if beat_in_bar in (0, 2):
        k_len = min(len(kick), TOTAL_SAMPLES - start)
        left[start:start+k_len] += kick[:k_len]
        right[start:start+k_len] += kick[:k_len]
    
    # Extra punchy syncopated kicks starting after intro (beat 8+)
    if b >= 6 and beat_in_bar == 3 and (b // 4) % 2 == 1:
        off = start + int(BEAT_SAMPLES * 0.5)
        if off + len(kick) < TOTAL_SAMPLES:
            k_len = len(kick)
            left[off:off+k_len] += kick * 0.8
            right[off:off+k_len] += kick * 0.8

    # Snare on beat 1 and 3 (i.e. 2nd and 4th quarter beats)
    if beat_in_bar in (1, 3):
        s_len = min(len(snare), TOTAL_SAMPLES - start)
        left[start:start+s_len] += snare[:s_len]
        right[start:start+s_len] += snare[:s_len]

    # Hi-hat on every 8th note
    for sub in (0.0, 0.5):
        h_start = start + int(sub * BEAT_SAMPLES)
        if h_start < TOTAL_SAMPLES:
            h_len = min(len(hihat), TOTAL_SAMPLES - h_start)
            # slight panning
            left[h_start:h_start+h_len] += hihat[:h_len] * 0.85
            right[h_start:h_start+h_len] += hihat[:h_len] * 1.15

    # Bass progression (D minor root 73.4Hz -> F 87.3Hz -> G 98Hz -> A 110Hz)
    bar = b // 4
    root = 73.4 if (bar % 4 in (0, 1)) else 65.4 if (bar % 4 == 2) else 82.4
    if beat_in_bar in (0, 2):
        add_bass_note(left, start, BEAT_LEN * 0.9, root)
        add_bass_note(right, start, BEAT_LEN * 0.9, root)

# Add risers before big scene shifts (approx every 3.5s)
riser = make_riser(1.8)
for cue in [2.5, 6.0, 13.0, 22.0, 26.5]:
    r_start = int(cue * SR)
    r_len = min(len(riser), TOTAL_SAMPLES - r_start)
    if r_start >= 0 and r_len > 0:
        left[r_start:r_start+r_len] += riser[:r_len] * 0.5
        right[r_start:r_start+r_len] += riser[:r_len] * 0.7

# Atmospheric dark drone in background
drone_f = 55.0  # A1
drone = np.sin(2.0 * np.pi * drone_f * t) * 0.12 + np.sin(2.0 * np.pi * drone_f * 1.5 * t) * 0.06
left += drone
right += drone

# Fade in and fade out
fade_in_len = int(0.5 * SR)
left[:fade_in_len] *= np.linspace(0, 1, fade_in_len)
right[:fade_in_len] *= np.linspace(0, 1, fade_in_len)

fade_out_len = int(1.5 * SR)
left[-fade_out_len:] *= np.linspace(1, 0, fade_out_len)
right[-fade_out_len:] *= np.linspace(1, 0, fade_out_len)

# Master limiter / normalizer
peak = max(np.max(np.abs(left)), np.max(np.abs(right)))
if peak > 0:
    left = (left / peak) * 0.92
    right = (right / peak) * 0.92

stereo = np.column_stack((
    (left * 32767).astype(np.int16),
    (right * 32767).astype(np.int16)
))

out_path = 'scripts/soundtrack_trailer.wav'
wavfile.write(out_path, SR, stereo)
print(f"✓ Saved high-energy soundtrack to {out_path}")
