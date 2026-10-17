import numpy as np
from PIL import Image, ImageDraw, ImageFont

img = Image.open('beam_check_coords.jpg')
w, h = img.size
arr = np.array(img, dtype=np.float32)

# Beam top line: from (15, 110) to (255, 6)
# Beam bot line: from (15, 144) to (255, 40)
# Angle: ~ -23.4 degrees
# Let's clean the beam along this quadrilateral
# For each x in [15, 255]:
for x in range(15, 256):
    t = (x - 15) / (255 - 15)
    y_top = int(108 - t * 102)
    y_bot = int(144 - t * 104)
    # sample concrete texture above the text or from the edges
    c_sample = [150 - t * 30, 145 - t * 30, 140 - t * 30] # concrete tone
    for y in range(y_top, y_bot):
        # subtle noise
        noise = (np.random.rand(3) - 0.5) * 8.0
        arr[y, x] = np.clip(c_sample + noise, 0, 255)

clean_beam = Image.fromarray(arr.astype(np.uint8))

# Now render "BANCADA CENTRAL" on this beam at -23.4 degrees!
font_path = r'C:\Windows\Fonts\impact.ttf'
font = ImageFont.truetype(font_path, 22)

# Text strip
txt_img = Image.new('RGBA', (320, 50), (0, 0, 0, 0))
tdraw = ImageDraw.Draw(txt_img)
cur_x = 10
for ch in "BANCADA CENTRAL":
    tdraw.text((cur_x, 10), ch, font=font, fill=(28, 30, 28, 235))
    cur_x += 16 if ch != ' ' else 10

# Rotate -23.4 deg
txt_rot = txt_img.rotate(-23.4, resample=Image.Resampling.BICUBIC, expand=True)

# Paste onto beam
clean_rgba = clean_beam.convert('RGBA')
# Position so it aligns with beam center
clean_rgba.alpha_composite(txt_rot, (22, 10))

clean_rgba.convert('RGB').save('test_beam_replaced.jpg')
print('Saved test_beam_replaced.jpg!')
