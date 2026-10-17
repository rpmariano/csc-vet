import numpy as np
from PIL import Image, ImageDraw, ImageFont

clean_img = Image.open('test_beam_clean.jpg')
w, h = clean_img.size

# The beam center line:
# at x=25, y = 100
# at x=245, y = 30
# angle is about -17.8 degrees
font_path = r'C:\Windows\Fonts\impact.ttf'
font = ImageFont.truetype(font_path, 27)

txt_img = Image.new('RGBA', (360, 60), (0, 0, 0, 0))
tdraw = ImageDraw.Draw(txt_img)

cur_x = 10
for ch in "BANCADA CENTRAL":
    tdraw.text((cur_x, 10), ch, font=font, fill=(28, 30, 28, 240))
    cur_x += 18 if ch != ' ' else 12

txt_rot = txt_img.rotate(-17.8, resample=Image.Resampling.BICUBIC, expand=True)

clean_rgba = clean_img.convert('RGBA')
# Paste so that text is centered on the beam
clean_rgba.alpha_composite(txt_rot, (22, 12))

clean_rgba.convert('RGB').save('test_beam_with_bancada.jpg')
print('Saved test_beam_with_bancada.jpg!')
