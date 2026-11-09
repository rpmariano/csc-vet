import numpy as np
import scipy.io.wavfile as wavfile

sr, data = wavfile.read("scripts/tiktok_audio.wav")
data = data.astype(np.float32) / 32768.0

# Mid-side analysis: in many tracks, vocals are strictly in the center (Mid = L+R), while instruments have stereo width (Side = L-R)
# If mono wav: let's check original stereo mp3
import subprocess
subprocess.run(["ffmpeg", "-y", "-i", "scripts/tiktok_audio.mp3", "-ar", "44100", "scripts/tt_stereo.wav"], check=True)

sr, stereo = wavfile.read("scripts/tt_stereo.wav")
stereo = stereo.astype(np.float32) / 32768.0
l = stereo[:, 0]
r = stereo[:, 1]
mid = (l + r) / 2.0
side = (l - r) / 2.0

mid_energy = np.mean(mid**2)
side_energy = np.mean(side**2)
print("Mid energy:", mid_energy, "Side energy:", side_energy)
print("Ratio:", mid_energy / (side_energy + 1e-6))
