import os
import subprocess

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
    ("player_09_natalino.mp3", 19800), # Beat drop hits at 20.0s!
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

# Input 0: clean instrumental (no Portugal team vocals)
inputs = ["-i", "scripts/clean_instrumental.wav"]
for fn, _ in CUES:
    inputs.extend(["-i", os.path.join("scripts/voice_cues_fx", fn)])

filter_parts = []
# Background instrumental track: keep beat punchy
filter_parts.append("[0:a]volume=0.82[music]")

delayed_labels = []
for i, (_, delay_ms) in enumerate(CUES):
    idx = i + 1
    out_lbl = f"v{i}"
    delayed_labels.append(f"[{out_lbl}]")
    # Generous volume boost for Cascais player vocals so they dominate the audio
    filter_parts.append(
        f"[{idx}:a]adelay={delay_ms}|{delay_ms},"
        f"volume=2.4,"
        f"acompressor=threshold=-12dB:ratio=4:attack=5:release=40[{out_lbl}]"
    )

weights = "1.0 " + " ".join(["1.8"] * len(CUES))
labels_joined = "".join(delayed_labels)
mix_str = f"[music]{labels_joined}amix=inputs={len(CUES) + 1}:duration=first:dropout_transition=2:weights={weights}[mix_out]"
filter_parts.append(mix_str)
filter_parts.append("[mix_out]alimiter=limit=0.96[final]")

# Save to both mp3 and wav
cmd_mp3 = ["ffmpeg", "-y"] + inputs + ["-filter_complex", ";".join(filter_parts), "-map", "[final]", "-b:a", "192k", "scripts/custom_cascais_soundtrack.mp3"]
cmd_wav = ["ffmpeg", "-y"] + inputs + ["-filter_complex", ";".join(filter_parts), "-map", "[final]", "scripts/custom_cascais_soundtrack.wav"]

print("Mixing custom soundtrack with clean instrumental and hype Cascais vocals...")
subprocess.run(cmd_mp3, check=True)
subprocess.run(cmd_wav, check=True)
print("Soundtrack ready!")
