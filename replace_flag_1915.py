import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy.ndimage import binary_dilation

img = Image.open('flag_404_1.jpg')
arr = np.array(img, dtype=np.float32)

# White text pixels of "404":
# r > 170, g > 150, b > 140
is_text = (arr[:, :, 0] > 165) & (arr[:, :, 1] > 140) & (arr[:, :, 2] > 130)
# Dilate
is_text_dilated = binary_dilation(is_text, iterations=3)

# Inpaint with local red fabric
red_fabric = arr[~is_text_dilated & (arr[:, :, 0] > 140)].mean(axis=0)

for ch in range(3):
    channel = arr[:, :, ch].copy()
    channel[is_text_dilated] = red_fabric[ch]
    blurred = Image.fromarray(channel.astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))
    arr_b = np.array(blurred)
    arr[is_text_dilated, ch] = arr_b[is_text_dilated]

clean_flag = Image.fromarray(arr.astype(np.uint8))

# Now render "1915" in white athletic font at angle ~ -18 deg
font_path = r'C:\Windows\Fonts\impact.ttf'
font = ImageFont.truetype(font_path, 34)

txt_img = Image.new('RGBA', (140, 60), (0, 0, 0, 0))
tdraw = ImageDraw.Draw(txt_img)
# Draw "1915" with slight dark drop shadow
tdraw.text((12, 10), "1915", font=font, fill=(0, 0, 0, 160))
tdraw.text((10, 8), "1915", font=font, fill=(255, 255, 255, 255))

txt_rot = txt_img.rotate(-18.0, resample=Image.Resampling.BICUBIC, expand=True)

clean_rgba = clean_flag.convert('RGBA')
rw, rh = txt_rot.size
clean_rgba.alpha_composite(txt_rot, (68 - rw // 2, 60 - rh // 2))

clean_rgba.convert('RGB').save('test_flag_1915_1.jpg')
print('Saved test_flag_1915_1.jpg!')
