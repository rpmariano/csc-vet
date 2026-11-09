import numpy as np
import scipy.io.wavfile as wavfile
import subprocess, os

# Convert mp3 to wav
subprocess.run(["ffmpeg", "-y", "-i", "scripts/tiktok_audio.mp3", "-ar", "44100", "-ac", "1", "scripts/tiktok_audio.wav"], check=True)

sr, data = wavfile.read("scripts/tiktok_audio.wav")
data = data.astype(np.float32) / 32768.0
duration = len(data) / sr

print(f"Audio duration: {duration:.2f} seconds")

# Energy envelope (RMS in 50ms windows)
window = int(sr * 0.05)
hop = int(sr * 0.02)
rms = []
times = []
for i in range(0, len(data) - window, hop):
    chunk = data[i:i+window]
    rms.append(np.sqrt(np.mean(chunk**2)))
    times.append(i / sr)

rms = np.array(rms)
times = np.array(times)

# Find major peaks (beat drops, major transitions)
# Let's inspect energy over time:
step = 1.0 # 1 sec intervals
print("\nEnergy Profile (every 2s):")
for t in np.arange(0, duration, 2.0):
    mask = (times >= t) & (times < t + 2.0)
    e = np.mean(rms[mask]) if np.any(mask) else 0
    bar = "#" * int(e * 50)
    print(f"{t:4.1f}s - {t+2.0:4.1f}s | {e:.3f} | {bar}")

# Detect notable drops/changes
diffs = np.diff(rms)
# Top 10 sudden increases (beat onsets / drops)
top_onsets = times[1:][np.argsort(diffs)[-15:]]
top_onsets = np.sort(top_onsets)
print("\nTop sudden energy spikes / onsets (seconds):")
for o in top_onsets:
    print(f"  {o:.2f}s")
