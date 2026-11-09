import os
import subprocess

# Cue timestamps in milliseconds
CUES = [
    ("cue_00_intro.mp3", 800),
    ("cue_01_convocados.mp3", 4800),
    ("player_01_rocha.mp3", 7000),
    ("player_02_pp.mp3", 8600),
    ("player_03_duarte.mp3", 10200),
    ("player_04_mariano.mp3", 11800),
    ("player_05_matuto.mp3", 13400),
    ("player_06_talisson.mp3", 15000),
    ("player_07_chaveiro.mp3", 16600),
    ("player_08_jcosta.mp3", 18200),
    ("player_09_natalino.mp3", 19800),
    ("player_10_marinho.mp3", 21400),
    ("player_11_argolo.mp3", 23000),
    ("player_12_albano.mp3", 24600),
    ("player_13_rios.mp3", 26200),
    ("player_14_chris.mp3", 27800),
    ("player_15_marcelo.mp3", 29400),
    ("player_16_gui.mp3", 31000),
    ("player_17_borges.mp3", 32600),
    ("cue_18_plantel.mp3", 34600),
    ("cue_19_outro.mp3", 40500),
]

# We construct an ffmpeg filter complex:
# Input 0: scripts/tiktok_audio.mp3 (the music backing track)
# Inputs 1..21: each voice cue
inputs = ["-i", "scripts/tiktok_audio.mp3"]
for fn, _ in CUES:
    inputs.extend(["-i", os.path.join("scripts/voice_cues", fn)])

filter_parts = []
# 0: music backing track with slight volume leveling:
filter_parts.append("[0:a]volume=0.85[music]")

# Process each voice cue with delay and slight boost
delayed_labels = []
for i, (_, delay_ms) in enumerate(CUES):
    idx = i + 1
    out_lbl = f"v{i}"
    delayed_labels.append(f"[{out_lbl}]")
    # adelay for stereo: delay_ms|delay_ms, plus volume boost and slight EQ for stadium hype
    filter_parts.append(
        f"[{idx}:a]adelay={delay_ms}|{delay_ms},volume=1.45,acompressor=threshold=-12dB:ratio=4:attack=5:release=50[{out_lbl}]"
    )

# Mix all voice cues together
voices_in = "".join(delayed_labels)
num_voices = len(CUES)
filter_parts.append(f"{voices_in}amix=inputs={num_voices}:dropout_transition=0:normalize=0[all_voices]")

# Add subtle stadium reverb/presence to mixed voices
filter_parts.append("[all_voices]aecho=0.8:0.7:45|90:0.3|0.15[hype_voices]")

# Final mix: music + hype_voices
filter_parts.append("[music][hype_voices]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[outa]")

filter_complex = ";".join(filter_parts)

out_audio = "scripts/custom_cascais_soundtrack.mp3"
out_wav = "scripts/custom_cascais_soundtrack.wav"

cmd = [
    "ffmpeg", "-y",
    *inputs,
    "-filter_complex", filter_complex,
    "-map", "[outa]",
    "-c:a", "libmp3lame",
    "-b:a", "256k",
    out_audio
]

print("Executing FFmpeg audio mixing...")
res = subprocess.run(cmd, capture_output=True, text=True)
if res.returncode != 0:
    print("Error mixing audio:", res.stderr)
else:
    print("Successfully mixed audio track!")
    # also convert to wav
    subprocess.run(["ffmpeg", "-y", "-i", out_audio, out_wav], check=True)
    print(f"Created {out_audio} and {out_wav}")
