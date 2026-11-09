import os
import sys
import numpy as np
from scipy.io import wavfile
import onnxruntime as ort
from huggingface_hub import hf_hub_download

print("Downloading HT-Demucs ONNX model...")
model_path = hf_hub_download("Jeremytromp/htdemucs-ft-vocals-onnx", "htdemucs_ft_vocals.onnx")
print("Model path:", model_path)

print("Loading ONNX session...")
session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])

# Read audio
sr, data = wavfile.read("scripts/test_orig.wav")
print(f"Sample rate: {sr}, shape: {data.shape}")

# Convert to float32 stereo [-1, 1]
if data.dtype == np.int16:
    audio = data.astype(np.float32) / 32768.0
elif data.dtype == np.int32:
    audio = data.astype(np.float32) / 2147483648.0
else:
    audio = data.astype(np.float32)

if audio.ndim == 1:
    audio = np.column_stack([audio, audio])

# Audio shape: [samples, 2] -> transpose to [2, samples]
audio = audio.T
total_samples = audio.shape[1]

CHUNK_SIZE = 343980  # ~7.8s
HOP_SIZE = 343980 // 2  # 50% overlap for smooth blending
vocals_out = np.zeros_like(audio)
weights = np.zeros(total_samples, dtype=np.float32)

# Hann window for overlap-add
window = np.hanning(CHUNK_SIZE).astype(np.float32)

print("Running inference in chunks...")
start = 0
chunk_idx = 0
while start < total_samples:
    end = start + CHUNK_SIZE
    chunk = audio[:, start:end]
    actual_len = chunk.shape[1]
    
    # Pad if needed
    if actual_len < CHUNK_SIZE:
        padded = np.zeros((2, CHUNK_SIZE), dtype=np.float32)
        padded[:, :actual_len] = chunk
        chunk = padded
        
    chunk_in = chunk[np.newaxis, :, :].astype(np.float32)
    
    # Run model
    # Output shape: [1, 4, 2, CHUNK_SIZE] -> index 3 is vocals
    out = session.run(None, {"mix": chunk_in})[0]
    chunk_vocals = out[0, 3, :, :]  # [2, CHUNK_SIZE]
    
    # Apply window
    w = window[:actual_len]
    chunk_vocals_windowed = chunk_vocals[:, :actual_len] * w
    
    vocals_out[:, start:start+actual_len] += chunk_vocals_windowed
    weights[start:start+actual_len] += w
    
    chunk_idx += 1
    print(f"Processed chunk {chunk_idx} ({start/sr:.1f}s - {min(end, total_samples)/sr:.1f}s)...")
    start += HOP_SIZE

# Normalize overlap-add
weights = np.maximum(weights, 1e-6)
vocals_out = vocals_out / weights

# Clean instrumental is the mix minus vocals!
instrumental = audio - vocals_out

# Save files
inst_int16 = np.clip(instrumental.T * 32767.0, -32768, 32767).astype(np.int16)
vocals_int16 = np.clip(vocals_out.T * 32767.0, -32768, 32767).astype(np.int16)

wavfile.write("scripts/htdemucs_instrumental.wav", sr, inst_int16)
wavfile.write("scripts/htdemucs_vocals.wav", sr, vocals_int16)

print("SUCCESS: Separated htdemucs_instrumental.wav and htdemucs_vocals.wav!")
