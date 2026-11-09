import subprocess, json

# Let's see if we can transcribe with ffmpeg whisper or inspect
cmd = ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", "scripts/tiktok_audio.mp3"]
out = subprocess.check_output(cmd)
info = json.loads(out)
print("Duration:", info['format']['duration'])
print("Bitrate:", info['format']['bit_rate'])
