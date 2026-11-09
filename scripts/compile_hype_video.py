import os
import sys
import json
import subprocess

print("Preparing Hype Squad Video Compilation...")
meta = json.load(open("scripts/individual_slides_meta.json"))

os.makedirs("scripts/temp_hype_clips", exist_ok=True)
clips = []

for i, item in enumerate(meta):
    src = item["path"]
    dur = item["duration"]
    clip_path = f"scripts/temp_hype_clips/clip_{i:02d}.mp4"
    clips.append(clip_path)

    cmd = [
        "ffmpeg", "-y",
        "-loop", "1",
        "-t", str(dur),
        "-i", src,
        "-vf", "format=yuv420p",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-tune", "stillimage",
        "-r", "30",
        "-pix_fmt", "yuv420p",
        clip_path
    ]
    name_info = item.get("playerName") or os.path.basename(src)
    print(f"Encoding [{i+1}/{len(meta)}] {name_info} ({dur}s)...")
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"Error encoding {clip_path}:", res.stderr)
        sys.exit(1)

concat_file = "scripts/temp_hype_clips/concat_list.txt"
with open(concat_file, "w") as f:
    for c in clips:
        f.write(f"file '{os.path.abspath(c)}'\n")

out_video = "public/proximo_jogo_amora_vs_cascais.mp4"
audio_file = "scripts/custom_cascais_soundtrack.mp3"

print("Muxing video with custom Cascais player callouts soundtrack...")
final_cmd = [
    "ffmpeg", "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concat_file,
    "-i", audio_file,
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "256k",
    "-shortest",
    "-movflags", "+faststart",
    out_video
]

res = subprocess.run(final_cmd, capture_output=True, text=True)
if res.returncode != 0:
    print("Mux copy failed, re-encoding video stream...")
    final_cmd_reencode = [
        "ffmpeg", "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", concat_file,
        "-i", audio_file,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "18",
        "-c:a", "aac",
        "-b:a", "256k",
        "-shortest",
        "-movflags", "+faststart",
        "-pix_fmt", "yuv420p",
        out_video
    ]
    subprocess.run(final_cmd_reencode, check=True)

size = os.path.getsize(out_video)
print(f"Video generated successfully at: {out_video} ({size / (1024*1024):.2f} MB)")
