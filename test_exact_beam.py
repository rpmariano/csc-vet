import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy.ndimage import binary_dilation

crop = Image.open('exact_orig_beam.jpg')
w, h = crop.size
arr = np.array(crop, dtype=np.float32)

y_coords, x_coords = np.ogrid[:h, :w]
# Top and bottom line of beam face in exact_orig_beam:
y_top = 65 - 0.3789 * (x_coords - 38)
y_bot = 125 - 0.3789 * (x_coords - 38)

in_beam = (x_coords >= 20) & (x_coords <= 250) & (y_coords >= y_top) & (y_coords <= y_bot)

bright = arr.mean(axis=-1)
is_letter = in_beam & (bright < 85)
is_letter_dil = binary_dilation(is_letter, iterations=3)

mean_concrete = arr[in_beam & ~is_letter_dil].mean(axis=0)

for ch in range(3):
    channel = arr[:, :, ch].copy()
    channel[is_letter_dil] = mean_concrete[ch]
    blurred = Image.fromarray(channel.astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))
    arr[is_letter_dil, ch] = np.array(blurred)[is_letter_dil]

# Add texture noise
noise = (np.random.rand(*arr[is_letter_dil].shape) - 0.5) * 6.0
arr[is_letter_dil] = np.clip(arr[is_letter_dil] + noise, 0, 255)

clean_beam = Image.fromarray(arr.astype(np.uint8))

# Now render "BANCADA CENTRAL" on this beam at -20.75 degrees!
font_path = r'C:\Windows\Fonts\impact.ttf'
font = ImageFont.truetype(font_path, 24)

txt_img = Image.new('RGBA', (320, 50), (0, 0, 0, 0))
tdraw = ImageDraw.Draw(txt_img)
cur_x = 10
for ch in "BANCADA CENTRAL":
    tdraw.text((cur_x, 8), ch, font=font, fill=(28, 30, 28, 240))
    cur_x += 16 if ch != ' ' else 10

txt_rot = txt_img.rotate(-20.75, resample=Image.Resampling.BICUBIC, expand=True)

clean_rgba = clean_beam.convert('RGBA')
# Center of "TOPO NORTE" was at x: 133, y: 58
rw, rh = txt_rot.size
clean_rgba.alpha_composite(txt_rot, (133 - rw // 2, 58 - rh // 2))

clean_rgba.convert('RGB').save('exact_beam_replaced.jpg')
print('Saved exact_beam_replaced.jpg!')
