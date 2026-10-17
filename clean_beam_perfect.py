import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy.ndimage import binary_dilation

img = Image.open('beam_check_coords.jpg')
arr = np.array(img, dtype=np.float32)
h, w, _ = arr.shape
y_coords, x_coords = np.ogrid[:h, :w]

y_top = 65 - 0.2857 * (x_coords - 10)
y_bot = 135 - 0.3469 * (x_coords - 10)
in_beam = (x_coords >= 10) & (x_coords <= 255) & (y_coords >= y_top) & (y_coords <= y_bot)

bright = arr.mean(axis=-1)
is_letter = in_beam & (bright < 85)
is_letter_dilated = binary_dilation(is_letter, iterations=3)

# For each dilated letter pixel, replace it with smooth concrete
mean_concrete = arr[in_beam & ~is_letter_dilated].mean(axis=0)

for ch in range(3):
    channel = arr[:, :, ch].copy()
    channel[is_letter_dilated] = mean_concrete[ch]
    blurred = Image.fromarray(channel.astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))
    arr_b = np.array(blurred)
    arr[is_letter_dilated, ch] = arr_b[is_letter_dilated]

# Add concrete grain
noise = (np.random.rand(*arr[is_letter_dilated].shape) - 0.5) * 6.0
arr[is_letter_dilated] = np.clip(arr[is_letter_dilated] + noise, 0, 255)

clean_img = Image.fromarray(arr.astype(np.uint8))
clean_img.save('test_beam_clean.jpg')
print('Saved test_beam_clean.jpg!')
