import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy.ndimage import binary_dilation

crop = Image.open('full_beam_to_610.jpg')
w, h = crop.size
arr = np.array(crop, dtype=np.float32)

y_coords, x_coords = np.ogrid[:h, :w]
# The beam face:
y_top = 68.0 - 0.277 * x_coords
y_bot = 134.0 - 0.277 * x_coords

in_beam = (x_coords >= 20) & (x_coords <= 280) & (y_coords >= y_top) & (y_coords <= y_bot)

bright = arr.mean(axis=-1)
is_letter = in_beam & (bright < 80)
is_letter_dil = binary_dilation(is_letter, iterations=3)

mean_concrete = arr[in_beam & ~is_letter_dil].mean(axis=0)

for c in range(3):
    chn = arr[:, :, c].copy()
    chn[is_letter_dil] = mean_concrete[c]
    blurred = Image.fromarray(chn.astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))
    arr[is_letter_dil, c] = np.array(blurred)[is_letter_dil]

noise = (np.random.rand(*arr[is_letter_dil].shape) - 0.5) * 6.0
arr[is_letter_dil] = np.clip(arr[is_letter_dil] + noise, 0, 255)

clean_beam = Image.fromarray(arr.astype(np.uint8))

font_path = r'C:\Windows\Fonts\impact.ttf'
font = ImageFont.truetype(font_path, 23)

txt_img = Image.new('RGBA', (320, 50), (0, 0, 0, 0))
tdraw = ImageDraw.Draw(txt_img)
cur_x = 10
for ch in "BANCADA CENTRAL":
    tdraw.text((cur_x, 8), ch, font=font, fill=(28, 30, 28, 240))
    cur_x += 15 if ch != ' ' else 10

txt_rot = txt_img.rotate(-15.5, resample=Image.Resampling.BICUBIC, expand=True)

clean_rgba = clean_beam.convert('RGBA')
rw, rh = txt_rot.size
clean_rgba.alpha_composite(txt_rot, (148 - rw // 2, 60 - rh // 2))

clean_rgba.convert('RGB').save('clean_full_beam_test.jpg')
print('Saved clean_full_beam_test.jpg!')
