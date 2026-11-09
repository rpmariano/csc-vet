import os, sys, json, subprocess

print("Preparing video compilation script...")
meta = json.load(open("scripts/slides_meta.json"))

clips = []
os.makedirs("scripts/temp_clips", exist_ok=True)

# Generate individual clips with subtle Ken Burns zoom
for i, item in enumerate(meta):
    src = item["path"]
    dur = item["duration"]
    fps = 30
    total_frames = int(dur * fps)
    clip_path = f"scripts/temp_clips/clip_{i:02d}.mp4"
    clips.append(clip_path)

    # Alternate zoom in and subtle zoom out
    if i % 2 == 0:
        # Zoom slowly in from 1.0 to 1.05
        z_expr = "min(zoom+0.0005,1.05)"
    else:
        # Zoom slowly out from 1.05 to 1.0
        z_expr = "max(1.05-0.0005*on,1.0)"

    cmd = [
        "ffmpeg", "-y",
        "-loop", "1",
        "-t", str(dur),
        "-i", src,
        "-vf", f"scale=1080:1920,zoompan=z='{z_expr}':d={total_frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps={fps}",
        "-c:v", "libx264",
        "-preset", "fast",
        "-pix_fmt", "yuv420p",
        "-r", str(fps),
        clip_path
    ]
    print(f"Building clip {i+1}/{len(meta)}: {clip_path} ({dur}s)...")
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"✓ Created {clip_path}")

# Write concat list
concat_file = "scripts/temp_clips/concat_list.txt"
with open(concat_file, "w") as f:
    for c in clips:
        f.write(f"file '{os.path.abspath(c)}'\n")

# Output final video with audio
out_video = "public/proximo_jogo_amora_vs_cascais.mp4"
audio_file = "scripts/soundtrack_trailer.wav"

print("Concatenating clips and muxing high-energy audio track...")
final_cmd = [
    "ffmpeg", "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concat_file,
    "-i", audio_file,
    "-c:v", "libx264",
    "-profile:v", "high",
    "-level", "4.2",
    "-preset", "medium",
    "-crf", "18",
    "-c:a", "aac",
    "-b:a", "256k",
    "-shortest",
    "-movflags", "+faststart",
    "-pix_fmt", "yuv420p",
    out_video
]

subprocess.run(final_cmd, check=True)
print(f"✓ Video successfully generated: {out_video}")
