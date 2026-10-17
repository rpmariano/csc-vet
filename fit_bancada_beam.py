import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy.ndimage import binary_dilation

crop = Image.open('exact_orig_beam.jpg')
w, h = crop.size
arr = np.array(crop, dtype=np.float32)

y_coords, x_coords = np.ogrid[:h, :w]
y_top = 72.0 - 0.277 * x_coords
y_bot = 126.0 - 0.277 * x_coords

in_beam = (y_coords >= y_top) & (y_coords <= y_bot) & (x_coords <= 270)

bright = arr.mean(axis=-1)
is_letter = in_beam & (bright < 80)
is_letter_dil = binary_dilation(is_letter, iterations=3)

mean_concrete = arr[in_beam & ~is_letter_dil].mean(axis=0)

for ch in range(3):
    channel = arr[:, :, ch].copy()
    channel[is_letter_dil] = mean_concrete[ch]
    blurred = Image.fromarray(channel.astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))
    arr[is_letter_dil, ch] = np.array(blurred)[is_letter_dil]

noise = (np.random.rand(*arr[is_letter_dil].shape) - 0.5) * 6.0
arr[is_letter_dil] = np.clip(arr[is_letter_dil] + noise, 0, 255)

clean_beam = Image.fromarray(arr.astype(np.uint8))

font_path = r'C:\Windows\Fonts\impact.ttf'
font = ImageFont.truetype(font_path, 21)

txt_img = Image.new('RGBA', (320, 45), (0, 0, 0, 0))
tdraw = ImageDraw.Draw(txt_img)
cur_x = 10
for ch in "BANCADA CENTRAL":
    tdraw.text((cur_x, 6), ch, font=font, fill=(28, 30, 28, 240))
    cur_x += 14 if ch != ' ' else 9

txt_rot = txt_img.rotate(-15.2, resample=Image.Resampling.BICUBIC, expand=True)

clean_rgba = clean_beam.convert('RGBA')
rw, rh = txt_rot.size
# Center at x: 145, y: 64
clean_rgba.alpha_composite(txt_rot, (145 - rw // 2, 64 - rh // 2))

clean_rgba.convert('RGB').save('perfect_bancada_beam.jpg')
print('Saved perfect_bancada_beam.jpg!')
