import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy.ndimage import binary_dilation

img = Image.open('beam_check_coords.jpg')
arr = np.array(img, dtype=np.float32)

# Beam mask on beam_check_coords:
# Beam top line: (20, 114) to (250, 8)
# Beam bot line: (20, 142) to (250, 36)
h, w, _ = arr.shape
y_coords, x_coords = np.ogrid[:h, :w]

# Top line and bottom line covering the full beam
y_top = 122 - 0.4608 * x_coords
y_bot = 156 - 0.4608 * x_coords

in_beam = (x_coords >= 5) & (x_coords <= 255) & (y_coords >= y_top) & (y_coords <= y_bot)

# Dark text pixels of "TOPO NORTE":
# In the beam, concrete is gray/tan (brightness > 100), letters are dark (brightness < 75)
brightness = arr.mean(axis=-1)
is_text = in_beam & (brightness < 78)

# Dilate text mask slightly so we cover antialiasing fringes
is_text_dilated = binary_dilation(is_text, iterations=2)

# Now inpaint: replace dilated text pixels by nearest non-text concrete pixels
# Simple and effective: smooth blur of non-text concrete
concrete_only = arr.copy()
# set text to NaN or average concrete
mean_concrete = arr[in_beam & ~is_text_dilated].mean(axis=0)

for ch in range(3):
    channel = arr[:, :, ch].copy()
    channel[is_text_dilated] = mean_concrete[ch]
    # Gaussian blur the channel
    blurred = Image.fromarray(channel.astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))
    arr_b = np.array(blurred)
    # where is text dilated, take from blurred
    arr[is_text_dilated, ch] = arr_b[is_text_dilated]

# Add tiny concrete grain to inpainted area
noise = (np.random.rand(*arr[is_text_dilated].shape) - 0.5) * 8.0
arr[is_text_dilated] = np.clip(arr[is_text_dilated] + noise, 0, 255)

clean_img = Image.fromarray(arr.astype(np.uint8))
clean_img.save('test_beam_inpainted.jpg')
print('Inpainted beam saved!')
