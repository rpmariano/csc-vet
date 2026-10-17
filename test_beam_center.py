import numpy as np
from PIL import Image, ImageDraw, ImageFont

clean_img = Image.open('test_beam_clean.jpg')
font_path = r'C:\Windows\Fonts\impact.ttf'
font1 = ImageFont.truetype(font_path, 25)
font2 = ImageFont.truetype(font_path, 22)

# Word 1: "BANCADA"
t1 = Image.new('RGBA', (180, 45), (0, 0, 0, 0))
d1 = ImageDraw.Draw(t1)
d1.text((10, 8), "BANCADA", font=font1, fill=(28, 30, 28, 235))
t1_rot = t1.rotate(-16.0, resample=Image.Resampling.BICUBIC, expand=True)

# Word 2: "CENTRAL"
t2 = Image.new('RGBA', (180, 45), (0, 0, 0, 0))
d2 = ImageDraw.Draw(t2)
d2.text((10, 8), "CENTRAL", font=font2, fill=(28, 30, 28, 235))
t2_rot = t2.rotate(-16.0, resample=Image.Resampling.BICUBIC, expand=True)

clean_rgba = clean_img.convert('RGBA')
# Paste Word 1: center at (90, 75)
w1, h1 = t1_rot.size
clean_rgba.alpha_composite(t1_rot, (90 - w1 // 2, 75 - h1 // 2))

# Paste Word 2: center at (182, 48)
w2, h2 = t2_rot.size
clean_rgba.alpha_composite(t2_rot, (182 - w2 // 2, 48 - h2 // 2))

clean_rgba.convert('RGB').save('test_beam_centered.jpg')
print('Saved test_beam_centered.jpg!')
