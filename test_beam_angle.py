import numpy as np
from PIL import Image, ImageDraw, ImageFont

clean_img = Image.open('test_beam_clean.jpg')

font_path = r'C:\Windows\Fonts\impact.ttf'
font = ImageFont.truetype(font_path, 25)

txt_img = Image.new('RGBA', (360, 50), (0, 0, 0, 0))
tdraw = ImageDraw.Draw(txt_img)

cur_x = 10
for ch in "BANCADA CENTRAL":
    tdraw.text((cur_x, 8), ch, font=font, fill=(26, 28, 26, 240))
    cur_x += 16 if ch != ' ' else 10

txt_rot = txt_img.rotate(-23.2, resample=Image.Resampling.BICUBIC, expand=True)

clean_rgba = clean_img.convert('RGBA')
clean_rgba.alpha_composite(txt_rot, (20, 2))

clean_rgba.convert('RGB').save('test_beam_perfect_rot.jpg')
print('Saved test_beam_perfect_rot.jpg!')
