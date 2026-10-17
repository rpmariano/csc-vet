import math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy.ndimage import binary_dilation, gaussian_filter

print('Building perfected master poster (v2)...')
orig = Image.open(r'C:\Users\rpmar\.gemini\antigravity\brain\541f1c1a-f766-4502-8ea0-2d77b7034eff\.user_uploaded\media_1792188746960_f29af357.jpg')
w, h = orig.size
arr = np.array(orig).copy().astype(np.float32)

y_coords, x_coords = np.ogrid[:h, :w]
slope = -0.280

# -------------------------------------------------------------
# 1. BEAM: Inpaint TOPO NORTE with Laplace diffusion
# -------------------------------------------------------------
y_top = 554.0 + slope * (x_coords - 360.0)
y_bot = 612.0 + slope * (x_coords - 360.0)
in_strip = (x_coords >= 370) & (x_coords <= 612) & (y_coords >= y_top) & (y_coords <= y_bot)
is_letter = in_strip & (arr.mean(axis=-1) < 80)
mask_beam = binary_dilation(is_letter, iterations=3)

arr[mask_beam] = [135.0, 105.0, 98.0]
for _ in range(40):
    up = np.roll(arr, -1, axis=0)
    down = np.roll(arr, 1, axis=0)
    left = np.roll(arr, -1, axis=1)
    right = np.roll(arr, 1, axis=1)
    avg_neighbor = 0.25 * (up + down + left + right)
    arr[mask_beam] = avg_neighbor[mask_beam]

noise = (np.random.rand(*arr[mask_beam].shape) - 0.5) * 6.0
arr[mask_beam] = np.clip(arr[mask_beam] + noise, 0, 255)

base_clean = Image.fromarray(arr.astype(np.uint8))

# -------------------------------------------------------------
# 2. DRAW 'BANCADA CENTRAL' ON BEAM
# -------------------------------------------------------------
txt_w, txt_h = 360, 50
txt_im = Image.new('RGBA', (txt_w, txt_h), (0, 0, 0, 0))
td = ImageDraw.Draw(txt_im)
font_beam = ImageFont.truetype(r'C:\Windows\Fonts\impact.ttf', 24)
text_beam = 'BANCADA CENTRAL'
bbox = td.textbbox((0, 0), text_beam, font=font_beam)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
tx = (txt_w - tw) // 2
ty = (txt_h - th) // 2
td.text((tx + 1, ty + 1), text_beam, font=font_beam, fill=(10, 8, 8, 140))
td.text((tx, ty), text_beam, font=font_beam, fill=(28, 26, 24, 245))

rot_beam = txt_im.rotate(15.6, resample=Image.Resampling.BICUBIC, expand=True)
cx = 492
cy = 536
rw, rh = rot_beam.size
base_rgba = base_clean.convert('RGBA')
base_rgba.alpha_composite(rot_beam, (cx - rw // 2, cy - rh // 2))

# -------------------------------------------------------------
# 3. REPLACE ALL '404' OCCURRENCES WITH '1915'
# -------------------------------------------------------------
def replace_404_exact(base_img, box, font_size, angle, offset=(0,0)):
    x0, y0, x1, y1 = box
    crop = np.array(base_img.crop(box)).astype(np.float32)[:, :, :3]
    ch, cw = crop.shape[:2]
    
    is_txt = (crop[:, :, 0] > 140) & (crop[:, :, 1] > 110) & (crop[:, :, 2] > 100)
    is_txt_dil = binary_dilation(is_txt, iterations=3)
    
    red_fab = crop[~is_txt_dil & (crop[:, :, 0] > 110)]
    mean_red = red_fab.mean(axis=0) if len(red_fab) > 0 else np.array([160.0, 25.0, 25.0])
    
    for c in range(3):
        crop[is_txt_dil, c] = mean_red[c]
    blr = Image.fromarray(crop.astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))
    crop[is_txt_dil] = np.array(blr)[is_txt_dil]
    
    clean_box = Image.fromarray(crop.astype(np.uint8)).convert('RGBA')
    tcanv = Image.new('RGBA', (cw + 40, ch + 40), (0, 0, 0, 0))
    tc_draw = ImageDraw.Draw(tcanv)
    f = ImageFont.truetype(r'C:\Windows\Fonts\impact.ttf', font_size)
    b = tc_draw.textbbox((0, 0), '1915', font=f)
    tw_f, th_f = b[2] - b[0], b[3] - b[1]
    
    px = (tcanv.width - tw_f) // 2 + offset[0]
    py = (tcanv.height - th_f) // 2 + offset[1]
    tc_draw.text((px + 1, py + 1), '1915', font=f, fill=(0, 0, 0, 160))
    tc_draw.text((px, py), '1915', font=f, fill=(255, 255, 255, 255))
    
    if angle != 0:
        tcanv = tcanv.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    
    rw_c, rh_c = tcanv.size
    clean_box.alpha_composite(tcanv, ((cw - rw_c) // 2, (ch - rh_c) // 2))
    base_img.paste(clean_box, (x0, y0))

replace_404_exact(base_rgba, (610, 650, 682, 735), font_size=36, angle=-20, offset=(0, 0))
replace_404_exact(base_rgba, (525, 580, 605, 635), font_size=20, angle=-14, offset=(0, 0))
replace_404_exact(base_rgba, (430, 620, 480, 652), font_size=14, angle=-8, offset=(0, 0))
replace_404_exact(base_rgba, (365, 692, 415, 728), font_size=12, angle=0, offset=(0, 0))
replace_404_exact(base_rgba, (415, 698, 460, 735), font_size=12, angle=0, offset=(0, 0))

# For the big flag on the left, let it wave naturally in authentic Cascais green and gold
# (no awkward rectangular paste)

base_img_mod = base_rgba.convert('RGB')

# -------------------------------------------------------------
# 4. HUE SHIFT RED PIXELS TO CASCAIS EMERALD GREEN AND GOLD
# -------------------------------------------------------------
barr = np.array(base_img_mod, dtype=np.float32) / 255.0

maxc = barr.max(axis=-1)
minc = barr.min(axis=-1)
delta = maxc - minc
s = np.zeros_like(maxc)
mask_d = delta != 0
s[mask_d] = delta[mask_d] / (maxc[mask_d] + 1e-7)

rc = (maxc - barr[..., 0]) / (delta + 1e-7)
gc = (maxc - barr[..., 1]) / (delta + 1e-7)
bc = (maxc - barr[..., 2]) / (delta + 1e-7)

hsv_h = np.zeros_like(maxc)
mask_r = mask_d & (barr[..., 0] == maxc)
mask_g = mask_d & (barr[..., 1] == maxc) & ~mask_r
mask_b = mask_d & (barr[..., 2] == maxc) & ~mask_r & ~mask_g

hsv_h[mask_r] = (bc - gc)[mask_r]
hsv_h[mask_g] = 2.0 + (rc - bc)[mask_g]
hsv_h[mask_b] = 4.0 + (gc - rc)[mask_b]
hsv_h = (hsv_h / 6.0) % 1.0

is_red = (s > 0.16) & ((hsv_h < 0.08) | (hsv_h > 0.91))

torre_box = (x_coords >= 390) & (x_coords <= 630) & (y_coords >= 160) & (y_coords <= 420)
is_red[torre_box] = False
cascais_box = (x_coords >= 90) & (x_coords <= 310) & (y_coords >= 150) & (y_coords <= 420)
is_red[cascais_box] = False

target_h = np.full_like(hsv_h, 155.0 / 360.0) # emerald green
flare_bright = is_red & (maxc > 0.78)
target_h[flare_bright] = 45.0 / 360.0 # warm gold

hsv_h[is_red] = target_h[is_red]
s[is_red] = np.clip(s[is_red] * 1.25, 0, 1)

i = (hsv_h * 6.0).astype(int) % 6
f = (hsv_h * 6.0) - np.floor(hsv_h * 6.0)
v = maxc
p = v * (1.0 - s)
q = v * (1.0 - s * f)
t = v * (1.0 - s * (1.0 - f))

out = np.zeros_like(barr)
m0 = i == 0; out[m0] = np.stack([v[m0], t[m0], p[m0]], axis=-1)
m1 = i == 1; out[m1] = np.stack([q[m1], v[m1], p[m1]], axis=-1)
m2 = i == 2; out[m2] = np.stack([p[m2], v[m2], t[m2]], axis=-1)
m3 = i == 3; out[m3] = np.stack([p[m3], q[m3], v[m3]], axis=-1)
m4 = i == 4; out[m4] = np.stack([t[m4], p[m4], v[m4]], axis=-1)
m5 = i == 5; out[m5] = np.stack([v[m5], p[m5], q[m5]], axis=-1)
out[~is_red] = barr[~is_red]

final_plate = Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))
plate_rgba = final_plate.convert('RGBA')

# -------------------------------------------------------------
# 5. ENHANCE CASCAIS CREST IN MATCHUP (DOMINANT HOME SPOTLIGHT)
# -------------------------------------------------------------
aura_rad = 125
aura_img = Image.new('RGBA', (aura_rad * 2, aura_rad * 2), (0, 0, 0, 0))
adraw = ImageDraw.Draw(aura_img)
for r in range(aura_rad, 0, -2):
    rel = r / aura_rad
    alpha = int((1.0 - rel) * 125)
    adraw.ellipse([aura_rad - r, aura_rad - r, aura_rad + r, aura_rad + r], fill=(227, 192, 77, alpha))
aura_img = aura_img.filter(ImageFilter.GaussianBlur(12))

plate_rgba.alpha_composite(aura_img, (200 - aura_rad, 248 - aura_rad))

crest_cascais = Image.open('cartazes/crest_cascais.png')
crest_hd = crest_cascais.resize((148, 242), Image.Resampling.LANCZOS)
sh = Image.new('RGBA', (158, 252), (0, 0, 0, 0))
sh.paste((0, 0, 0, 190), (5, 5), crest_hd.split()[3].filter(ImageFilter.GaussianBlur(6)))
plate_rgba.alpha_composite(sh, (200 - 74, 248 - 121))
plate_rgba.alpha_composite(crest_hd, (200 - 74, 248 - 121))

# Golden historic pill under GDS CASCAIS
font_pill = ImageFont.truetype(r'C:\Windows\Fonts\impact.ttf', 11)
pill_im = Image.new('RGBA', (136, 18), (0, 0, 0, 0))
pdraw = ImageDraw.Draw(pill_im)
pdraw.rounded_rectangle([0, 0, 136, 18], radius=9, fill=(227, 192, 77, 245), outline=(255, 255, 255, 200), width=1)
b_p = pdraw.textbbox((0, 0), '- FUNDADO EM 1915 -', font=font_pill)
tw_p = b_p[2] - b_p[0]
pdraw.text(((136 - tw_p) // 2, 2), '- FUNDADO EM 1915 -', font=font_pill, fill=(22, 79, 22, 255))
plate_rgba.alpha_composite(pill_im, (200 - 68, 404))

# -------------------------------------------------------------
# 6. TOP CATEGORY BADGE: '- ESCALÃO DE VETERANOS -'
# -------------------------------------------------------------
font_vet = ImageFont.truetype(r'C:\Windows\Fonts\impact.ttf', 18)
vet_pill = Image.new('RGBA', (290, 32), (0, 0, 0, 0))
vdraw = ImageDraw.Draw(vet_pill)
vdraw.rounded_rectangle([0, 0, 290, 32], radius=16, fill=(0, 150, 98, 245), outline=(227, 192, 77, 255), width=2)
b_v = vdraw.textbbox((0, 0), '- ESCALÃO DE VETERANOS -', font=font_vet)
tw_v = b_v[2] - b_v[0]
vdraw.text(((290 - tw_v) // 2, 4), '- ESCALÃO DE VETERANOS -', font=font_vet, fill=(255, 255, 255, 255))
plate_rgba.alpha_composite(vet_pill, ((w - 290) // 2, 175))

# -------------------------------------------------------------
# 7. CLEAN BOTTOM BANNERS SEAMLESSLY
# -------------------------------------------------------------
b_arr = np.array(plate_rgba).astype(np.float32)
y_c, x_c = np.ogrid[:h, :w]
slope_ban = -0.088

# White banner (y: ~840..935, x: ~145..645)
y_tw = 840.0 + slope_ban * (x_c - 145.0)
y_bw = 935.0 + slope_ban * (x_c - 145.0)
in_wb = (x_c >= 145) & (x_c <= 645) & (y_c >= y_tw) & (y_c <= y_bw)
is_btxt = in_wb & (b_arr[:, :, :3].mean(axis=-1) < 85)
is_btxt_dil = binary_dilation(is_btxt, iterations=3)
b_arr[is_btxt_dil, :3] = 248.0
b_arr[is_btxt_dil, 3] = 255.0

# Gold banner (y: ~935..990, x: ~160..595)
y_tg = 935.0 + slope_ban * (x_c - 160.0)
y_bg = 990.0 + slope_ban * (x_c - 160.0)
in_gb = (x_c >= 165) & (x_c <= 595) & (y_c >= y_tg) & (y_c <= y_bg)
is_wtxt = in_gb & (b_arr[:, :, :3].mean(axis=-1) > 190)
is_wtxt_dil = binary_dilation(is_wtxt, iterations=3)
for c in range(3):
    b_arr[is_wtxt_dil, c] = [227.0, 192.0, 77.0][c]
b_arr[is_wtxt_dil, 3] = 255.0

# ORGANIC GRUNGE BRUSH SPLATTER OVER 'A TORRE'
# Instead of hard rectangle, create an authentic athletic dry-brush splash
splash_canvas = Image.new('L', (w, h), 0)
sdraw = ImageDraw.Draw(splash_canvas)
for cx_s in range(125, 640, 20):
    cy_s = int(765.0 - 0.088 * (cx_s - 125.0))
    rx = np.random.randint(50, 75)
    ry = np.random.randint(35, 52)
    sdraw.ellipse([cx_s - rx, cy_s - ry, cx_s + rx, cy_s + ry], fill=255)

# Add splatter noise and blur edges
splash_mask = np.array(splash_canvas).astype(np.float32) / 255.0
splash_mask = gaussian_filter(splash_mask, sigma=3.0)
noise_splat = (np.random.rand(h, w) - 0.5) * 0.12
splash_mask = np.clip(splash_mask + noise_splat, 0.0, 1.0)

# Apply dark crowd/ink splatter
dark_ink = np.array([10.0, 22.0, 14.0], dtype=np.float32)
for c in range(3):
    b_arr[:, :, c] = b_arr[:, :, c] * (1.0 - splash_mask * 0.95) + dark_ink[c] * (splash_mask * 0.95)

plate_rgba = Image.fromarray(b_arr.astype(np.uint8))

# -------------------------------------------------------------
# 8. RENDER MOTIVATIONAL TYPOGRAPHY FOR CASCAIS
# -------------------------------------------------------------
# Line 1: 'O CASCAIS' (huge vibrant athletic dry-brush in Cascais colors)
font_hero = ImageFont.truetype('fonts/PermanentMarker.ttf', 72)
c_hero = Image.new('RGBA', (w, 130), (0, 0, 0, 0))
hd = ImageDraw.Draw(c_hero)
h_txt = 'O CASCAIS'
bh = hd.textbbox((0, 0), h_txt, font=font_hero)
hw, hh = bh[2] - bh[0], bh[3] - bh[1]
hx = (w - hw) // 2 + 10
hy = 15

# Deep 3D drop shadow
for dx in range(-4, 5):
    for dy in range(-4, 5):
        if dx*dx + dy*dy <= 18:
            hd.text((hx + dx, hy + dy), h_txt, font=font_hero, fill=(0, 0, 0, 255))

# Emerald green core (#00A86B)
hd.text((hx, hy), h_txt, font=font_hero, fill=(0, 168, 107, 255))
# Warm golden highlight (#FFD700)
hd.text((hx + 1, hy - 1), h_txt, font=font_hero, fill=(255, 215, 0, 190))

rot_hero = c_hero.rotate(5.0, resample=Image.Resampling.BICUBIC, expand=True)
plate_rgba.alpha_composite(rot_hero, ((w - rot_hero.width) // 2, 712))

# Line 2: 'NA BANCADA CENTRAL!' (Centered inside white banner)
font_ban = ImageFont.truetype('fonts/PermanentMarker.ttf', 38)
c_ban = Image.new('RGBA', (w, 90), (0, 0, 0, 0))
bd = ImageDraw.Draw(c_ban)
b_txt = 'NA BANCADA CENTRAL!'
bb = bd.textbbox((0, 0), b_txt, font=font_ban)
bw_b, bh_b = bb[2] - bb[0], bb[3] - bb[1]
bx = (w - bw_b) // 2 + 38
by = 18

bd.text((bx + 2, by + 2), b_txt, font=font_ban, fill=(0, 0, 0, 140))
bd.text((bx, by), b_txt, font=font_ban, fill=(18, 18, 18, 255))

rot_ban = c_ban.rotate(5.0, resample=Image.Resampling.BICUBIC, expand=True)
plate_rgba.alpha_composite(rot_ban, ((w - rot_ban.width) // 2, 804))

# Line 3: 'VEM APOIAR O DRAMÁTICO! - 1915' (Centered inside gold ribbon)
font_gold = ImageFont.truetype('fonts/PermanentMarker.ttf', 20)
c_gold = Image.new('RGBA', (w, 60), (0, 0, 0, 0))
gd = ImageDraw.Draw(c_gold)
g_txt = 'VEM APOIAR O DRAMÁTICO! - 1915'
bg = gd.textbbox((0, 0), g_txt, font=font_gold)
gw, gh = bg[2] - bg[0], bg[3] - bg[1]
gx = (w - gw) // 2 + 25
gy = 10

gd.text((gx + 1, gy + 1), g_txt, font=font_gold, fill=(80, 55, 5, 220))
gd.text((gx, gy), g_txt, font=font_gold, fill=(255, 255, 255, 255))

rot_gold = c_gold.rotate(5.0, resample=Image.Resampling.BICUBIC, expand=True)
plate_rgba.alpha_composite(rot_gold, ((w - rot_gold.width) // 2, 902))

# Save master poster
master_file = 'cartaz_cascais_veteranos_master.jpg'
plate_rgba.convert('RGB').save(master_file, quality=98)
print('Master poster saved to', master_file)
