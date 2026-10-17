import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# 1. Load original reference photograph
orig = Image.open(r'C:\Users\rpmar\.gemini\antigravity\brain\541f1c1a-f766-4502-8ea0-2d77b7034eff\.user_uploaded\media_1792188746960_f29af357.jpg')
w, h = orig.size
arr = np.array(orig, dtype=np.float32) / 255.0

# 2. RGB to HSV color shift
maxc = arr.max(axis=-1)
minc = arr.min(axis=-1)
delta = maxc - minc
s = np.zeros_like(maxc)
mask_d = delta != 0
s[mask_d] = delta[mask_d] / (maxc[mask_d] + 1e-7)

rc = (maxc - arr[..., 0]) / (delta + 1e-7)
gc = (maxc - arr[..., 1]) / (delta + 1e-7)
bc = (maxc - arr[..., 2]) / (delta + 1e-7)

hsv_h = np.zeros_like(maxc)
mask_r = mask_d & (arr[..., 0] == maxc)
mask_g = mask_d & (arr[..., 1] == maxc) & ~mask_r
mask_b = mask_d & (arr[..., 2] == maxc) & ~mask_r & ~mask_g

hsv_h[mask_r] = (bc - gc)[mask_r]
hsv_h[mask_g] = 2.0 + (rc - bc)[mask_g]
hsv_h[mask_b] = 4.0 + (gc - rc)[mask_b]
hsv_h = (hsv_h / 6.0) % 1.0

# Red mask (smoke, flares, flags, banners)
is_red = (s > 0.16) & ((hsv_h < 0.09) | (hsv_h > 0.90))

# Preserve Torre crest box in the matchup section (y: 170..410, x: 390..630)
y_idx, x_idx = np.ogrid[:h, :w]
torre_box = (x_idx >= 390) & (x_idx <= 630) & (y_idx >= 170) & (y_idx <= 410)
is_red[torre_box] = False

# Preserve Cascais crest area in orig
cascais_box = (x_idx >= 100) & (x_idx <= 300) & (y_idx >= 180) & (y_idx <= 410)
is_red[cascais_box] = False

# Target hue: Cascais Emerald Green (#009662, hue ~ 155/360)
target_h = np.full_like(hsv_h, 155.0 / 360.0)

# Golden accents for bright flare smoke cores (warm sunset / gold flares)
flare_bright = is_red & (maxc > 0.80)
target_h[flare_bright] = 46.0 / 360.0 # warm gold

hsv_h[is_red] = target_h[is_red]
s[is_red] = np.clip(s[is_red] * 1.25, 0, 1)

# Convert back to RGB
i = (hsv_h * 6.0).astype(int) % 6
f = (hsv_h * 6.0) - np.floor(hsv_h * 6.0)
v = maxc
p = v * (1.0 - s)
q = v * (1.0 - s * f)
t = v * (1.0 - s * (1.0 - f))

out = np.zeros_like(arr)
m0 = i == 0; out[m0] = np.stack([v[m0], t[m0], p[m0]], axis=-1)
m1 = i == 1; out[m1] = np.stack([q[m1], v[m1], p[m1]], axis=-1)
m2 = i == 2; out[m2] = np.stack([p[m2], v[m2], t[m2]], axis=-1)
m3 = i == 3; out[m3] = np.stack([p[m3], q[m3], v[m3]], axis=-1)
m4 = i == 4; out[m4] = np.stack([t[m4], p[m4], v[m4]], axis=-1)
m5 = i == 5; out[m5] = np.stack([v[m5], p[m5], q[m5]], axis=-1)
out[~is_red] = arr[~is_red]

base = Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))

# 3. Clean concrete beam and paint "BANCADA CENTRAL"
beam_crop = base.crop((370, 480, 640, 560)).copy()
bw, bh = beam_crop.size
barr = np.array(beam_crop, dtype=np.float32)

for x in range(25, 235):
    t_val = (x - 25) / (235 - 25)
    y_top = int(22 - t_val * 6)
    y_bot = int(62 - t_val * 8)
    c_top = barr[max(0, y_top-4):y_top, x].mean(axis=0) if y_top > 4 else barr[y_top, x]
    c_bot = barr[y_bot:min(bh, y_bot+4), x].mean(axis=0) if y_bot+4 < bh else barr[y_bot, x]
    for y in range(y_top, y_bot):
        ty = (y - y_top) / max(1, (y_bot - y_top))
        col = c_top * (1.0 - ty) + c_bot * ty
        noise = (np.random.rand(3) - 0.5) * 5.0
        barr[y, x] = np.clip(col + noise, 0, 255)

clean_beam = Image.fromarray(barr.astype(np.uint8))

# Render BANCADA CENTRAL onto beam with exact stadium perspective
font_path = r'C:\Windows\Fonts\impact.ttf'
try:
    font_beam = ImageFont.truetype(font_path, 26)
except:
    font_beam = ImageFont.load_default()

text_strip = Image.new('RGBA', (320, 60), (0, 0, 0, 0))
tdraw = ImageDraw.Draw(text_strip)
# Letter spacing
cur_x = 10
for ch in "BANCADA CENTRAL":
    tdraw.text((cur_x, 12), ch, font=font_beam, fill=(26, 32, 28, 245))
    cur_x += 18 if ch != ' ' else 12

text_strip_rot = text_strip.rotate(-3.6, resample=Image.Resampling.BILINEAR, expand=True)

clean_beam_rgba = clean_beam.convert('RGBA')
clean_beam_rgba.alpha_composite(text_strip_rot, (22, 10))
base.paste(clean_beam_rgba.convert('RGB'), (370, 480))

# 4. REPLACE ALL "404" FLAGS WITH "1915"
# Load athletic font
font_flag_big = ImageFont.truetype(font_path, 32)
font_flag_mid = ImageFont.truetype(font_path, 21)
font_flag_small = ImageFont.truetype(font_path, 15)

base_rgba = base.convert('RGBA')

# Flag 1: Rightmost large flag (around x: 610, y: 655, angle: -8 deg)
# First cover the old "404" by painting the green/white flag fabric
def replace_404_with_1915(img, center_x, center_y, font, angle, size=(120, 50), bg_color=(0, 125, 78)):
    w_box, h_box = size
    # create patch
    patch = Image.new('RGBA', (w_box, h_box), (0, 0, 0, 0))
    pdraw = ImageDraw.Draw(patch)
    # rounded flag banner fill
    pdraw.rectangle([0, 0, w_box, h_box], fill=(*bg_color, 250))
    # text 1915
    bbox = pdraw.textbbox((0, 0), "1915", font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (w_box - tw) // 2
    ty = (h_box - th) // 2 - 2
    # shadow
    pdraw.text((tx + 2, ty + 2), "1915", font=font, fill=(0, 0, 0, 220))
    # white text
    pdraw.text((tx, ty), "1915", font=font, fill=(255, 255, 255, 255))
    
    # rotate patch
    patch_rot = patch.rotate(angle, resample=Image.Resampling.BILINEAR, expand=True)
    rw, rh = patch_rot.size
    img.alpha_composite(patch_rot, (center_x - rw // 2, center_y - rh // 2))

# Replace Flag 1 (638, 672)
replace_404_with_1915(base_rgba, 642, 672, font_flag_big, -8, size=(90, 42), bg_color=(0, 115, 72))

# Replace Flag 2 (536, 584)
replace_404_with_1915(base_rgba, 538, 584, font_flag_mid, -6, size=(65, 30), bg_color=(0, 115, 72))

# Replace Flag 3 (438, 624)
replace_404_with_1915(base_rgba, 438, 624, font_flag_small, -6, size=(48, 22), bg_color=(0, 110, 68))

# Replace Flag 4 (470, 615)
replace_404_with_1915(base_rgba, 470, 616, font_flag_small, -2, size=(40, 18), bg_color=(0, 110, 68))

# 5. Place Cascais Crest onto the flags on the left & center
crest = Image.open('cartazes/crest_cascais.png')

# Left big flag (195, 570)
c1 = crest.resize((84, 137), Image.Resampling.LANCZOS).rotate(7, expand=True)
base_rgba.alpha_composite(c1, (155, 500))

# Mid-left flag (395, 550)
c2 = crest.resize((48, 78), Image.Resampling.LANCZOS).rotate(-6, expand=True)
base_rgba.alpha_composite(c2, (378, 515))

# Mid-low flag (440, 680)
c3 = crest.resize((42, 68), Image.Resampling.LANCZOS).rotate(10, expand=True)
base_rgba.alpha_composite(c3, (425, 650))

base = base_rgba.convert('RGB')

# 6. Clean bottom text zone (from y=725 to 1024) with crowd silhouettes and dark green ambient fog
crowd_texture = base.crop((0, 680, w, 730)).resize((w, h - 725))
crowd_arr = np.array(crowd_texture, dtype=np.float32)
y_ramp = np.linspace(0.85, 0.1, h - 725)[:, None, None]
dark_smoke = np.array([8, 22, 14], dtype=np.float32)
blend_arr = crowd_arr * y_ramp + dark_smoke * (1.0 - y_ramp)
blend_img = Image.fromarray(np.clip(blend_arr, 0, 255).astype(np.uint8))

mask = Image.new('L', (w, h), 0)
draw = ImageDraw.Draw(mask)
for y in range(720, 755):
    val = int((y - 720) / 35.0 * 255)
    draw.line([(0, y), (w, y)], fill=val)
draw.rectangle([(0, 755), (w, h)], fill=255)

clean_base = base.copy()
clean_base.paste(blend_img, (0, 725))
final_bg = Image.composite(clean_base, base, mask)

# 7. Upscale to 2x (1364 x 2048) for ultra high resolution
bg_2x = final_bg.resize((1364, 2048), Image.Resampling.LANCZOS)

# 8. ADD MAXIMUM PROMINENCE (DESTAQUE) TO CASCAIS EMBLEM
# Radiant Golden & Emerald Aura behind the Cascais crest
aura_size = 650
aura = Image.new('RGBA', (aura_size, aura_size), (0, 0, 0, 0))
aura_draw = ImageDraw.Draw(aura)
aura_cx, aura_cy = aura_size // 2, aura_size // 2

for r in range(aura_size // 2, 0, -3):
    t_val = r / (aura_size / 2)
    if t_val < 0.35: # intense gold core
        alpha = int((1.0 - t_val / 0.35) * 170 + 60)
        col = (227, 192, 77, min(255, alpha))
    elif t_val < 0.70: # emerald green mid
        rel = (t_val - 0.35) / 0.35
        alpha = int((1.0 - rel) * 120)
        col = (0, 150, 98, min(255, alpha))
    else: # outer soft emerald dispersion
        rel = (t_val - 0.70) / 0.30
        alpha = int((1.0 - rel) * 50)
        col = (22, 79, 22, min(255, alpha))
    aura_draw.ellipse([aura_cx - r, aura_cy - r, aura_cx + r, aura_cy + r], fill=col)

aura = aura.filter(ImageFilter.GaussianBlur(15))

# Large Cascais Crest (DESTAQUE: 320px width, 520px height)
crest_large = crest.resize((320, 520), Image.Resampling.LANCZOS)

# Outer 3D drop-shadow
crest_shadow = Image.new('RGBA', (360, 560), (0, 0, 0, 0))
crest_alpha = crest_large.split()[3]
shadow_mask = crest_alpha.filter(ImageFilter.GaussianBlur(14))
crest_shadow.paste((0, 0, 0, 230), (18, 20), shadow_mask)

bg_2x_rgba = bg_2x.convert('RGBA')
# Center at x: 410, y: 590
bg_2x_rgba.alpha_composite(aura, (410 - aura_cx, 590 - aura_cy))
bg_2x_rgba.alpha_composite(crest_shadow, (410 - 160 - 8, 590 - 260 - 5))
bg_2x_rgba.alpha_composite(crest_large, (410 - 160, 590 - 260))

final_output = bg_2x_rgba.convert('RGB')
final_output.save('stadium_photoreal_master.jpg', quality=98)
print('Successfully generated stadium_photoreal_master.jpg!')
