import os, sys, json, subprocess

print("Starting fast video build...")
meta = json.load(open("scripts/slides_meta.json"))

os.makedirs("scripts/temp_clips", exist_ok=True)
clips = []

for i, item in enumerate(meta):
    src = item["path"]
    dur = item["duration"]
    clip_path = f"scripts/temp_clips/fast_clip_{i:02d}.mp4"
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
    print(f"Encoding slide {i+1}/{len(meta)} ({dur}s)...")
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"Error encoding {clip_path}:", res.stderr)
        sys.exit(1)

concat_file = "scripts/temp_clips/fast_concat.txt"
with open(concat_file, "w") as f:
    for c in clips:
        f.write(f"file '{os.path.abspath(c)}'\n")

out_video = "public/proximo_jogo_amora_vs_cascais.mp4"
audio_file = "scripts/soundtrack_trailer.wav"

print("Muxing video with soundtrack...")
final_cmd = [
    "ffmpeg", "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concat_file,
    "-i", audio_file,
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    "-movflags", "+faststart",
    out_video
]

res = subprocess.run(final_cmd, capture_output=True, text=True)
if res.returncode != 0:
    print("Mux error:", res.stderr)
    # If copy fails across containers, re-encode fast:
    final_cmd_reencode = [
        "ffmpeg", "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", concat_file,
        "-i", audio_file,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        "-movflags", "+faststart",
        "-pix_fmt", "yuv420p",
        out_video
    ]
    subprocess.run(final_cmd_reencode, check=True)

print(f"SUCCESS: Video generated at {out_video}")
size = os.path.getsize(out_video)
print(f"Final file size: {size / (1024*1024):.2f} MB")
