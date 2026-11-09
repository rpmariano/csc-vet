import os
import subprocess

os.makedirs("scripts/voice_cues_fx", exist_ok=True)

cues = [f for f in os.listdir("scripts/voice_cues") if f.endswith(".mp3")]

fx = (
    "[0:a]asplit=2[v_dry][v_wet];"
    "[v_wet]rubberband=pitch=0.92,adelay=12|12,volume=0.55[low];"
    "[v_dry][low]amix=inputs=2:weights=1.0 0.5,aecho=0.85:0.7:35|70:0.35|0.2[echo];"
    "[echo]equalizer=f=3000:t=q:w=1.0:g=3.5,acompressor=threshold=-12dB:ratio=4:attack=5:release=40[out]"
)

for c in sorted(cues):
    in_path = os.path.join("scripts/voice_cues", c)
    out_path = os.path.join("scripts/voice_cues_fx", c)
    cmd = ["ffmpeg", "-y", "-i", in_path, "-filter_complex", fx, "-map", "[out]", out_path]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("Enhanced:", c)

print("All cues enhanced with hype stadium vocals!")
