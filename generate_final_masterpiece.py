import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy.ndimage import binary_dilation

print("Building final photographic masterpiece poster...")

# 1. Load original reference photograph
orig = Image.open(r'C:\Users\rpmar\.gemini\antigravity\brain\541f1c1a-f766-4502-8ea0-2d77b7034eff\.user_uploaded\media_1792188746960_f29af357.jpg')
w, h = orig.size
font_impact = r'C:\Windows\Fonts\impact.ttf'

base = orig.copy()

# =========================================================================
# STEP 1: CLEAN BEAM COMPLETELY AND RENDER "BANCADA CENTRAL"
# =========================================================================
beam_crop = base.crop((340, 470, 660, 610))
cw, ch = beam_crop.size
barr = np.array(beam_crop, dtype=np.float32)

y_coords, x_coords = np.ogrid[:ch, :cw]
# Entire lower beam face covering TOPO NORTE:
y_top = 68.0 - 0.277 * x_coords
y_bot = 142.0 - 0.277 * x_coords

in_beam = (x_coords >= 15) & (x_coords <= 280) & (y_coords >= y_top) & (y_coords <= y_bot)

bright = barr.mean(axis=-1)
is_letter = in_beam & (bright < 80)
is_letter_dil = binary_dilation(is_letter, iterations=3)

mean_concrete = barr[in_beam & ~is_letter_dil].mean(axis=0)

for c in range(3):
    chn = barr[:, :, c].copy()
    chn[is_letter_dil] = mean_concrete[c]
    blurred = Image.fromarray(chn.astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))
    barr[is_letter_dil, c] = np.array(blurred)[is_letter_dil]

noise = (np.random.rand(*barr[is_letter_dil].shape) - 0.5) * 6.0
barr[is_letter_dil] = np.clip(barr[is_letter_dil] + noise, 0, 255)

clean_beam = Image.fromarray(barr.astype(np.uint8))

font_beam = ImageFont.truetype(font_impact, 22)
txt_img = Image.new('RGBA', (320, 50), (0, 0, 0, 0))
tdraw = ImageDraw.Draw(txt_img)
cur_x = 10
for letter in "BANCADA CENTRAL":
    tdraw.text((cur_x, 8), letter, font=font_beam, fill=(28, 30, 28, 240))
    cur_x += 15 if letter != ' ' else 10

txt_rot = txt_img.rotate(-15.5, resample=Image.Resampling.BICUBIC, expand=True)

clean_rgba = clean_beam.convert('RGBA')
rw, rh = txt_rot.size
clean_rgba.alpha_composite(txt_rot, (148 - rw // 2, 60 - rh // 2))

base.paste(clean_rgba.convert('RGB'), (340, 470))
print("Beam converted to BANCADA CENTRAL.")

# =========================================================================
# STEP 2: INPAINT ALL "404" FLAGS AND DRAW "1915" ON REAL FABRIC
# =========================================================================
def inpaint_and_draw_1915(crop_box, font_size, angle, pos_offset=(0, 0)):
    crop_img = base.crop(crop_box)
    cw_box, ch_box = crop_img.size
    carr = np.array(crop_img, dtype=np.float32)
    
    # White text pixels of "404"
    is_txt = (carr[:, :, 0] > 160) & (carr[:, :, 1] > 130) & (carr[:, :, 2] > 120)
    is_txt_dil = binary_dilation(is_txt, iterations=3)
    
    red_fab = carr[~is_txt_dil & (carr[:, :, 0] > 130)]
    mean_red = red_fab.mean(axis=0) if len(red_fab) > 0 else np.array([160, 25, 25])
    
    for c in range(3):
        chn = carr[:, :, c].copy()
        chn[is_txt_dil] = mean_red[c]
        blr = Image.fromarray(chn.astype(np.uint8)).filter(ImageFilter.GaussianBlur(4))
        carr[is_txt_dil, c] = np.array(blr)[is_txt_dil]
    
    clean_box = Image.fromarray(carr.astype(np.uint8))
    
    font_f = ImageFont.truetype(font_impact, font_size)
    txt_im = Image.new('RGBA', (cw_box + 40, ch_box + 40), (0, 0, 0, 0))
    td = ImageDraw.Draw(txt_im)
    bbox = td.textbbox((0, 0), "1915", font=font_f)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (txt_im.width - tw) // 2 + pos_offset[0]
    ty = (txt_im.height - th) // 2 + pos_offset[1]
    td.text((tx + 2, ty + 2), "1915", font=font_f, fill=(0, 0, 0, 180))
    td.text((tx, ty), "1915", font=font_f, fill=(255, 255, 255, 255))
    
    txt_rot = txt_im.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    rw_b, rh_b = txt_rot.size
    
    res_rgba = clean_box.convert('RGBA')
    res_rgba.alpha_composite(txt_rot, ((cw_box - rw_b) // 2, (ch_box - rh_b) // 2))
    base.paste(res_rgba.convert('RGB'), (crop_box[0], crop_box[1]))

# Rightmost giant flag (x: 580..682, y: 620..720)
inpaint_and_draw_1915((580, 620, 682, 720), font_size=34, angle=-18.0, pos_offset=(-4, -2))

# Upper right flag below beam (x: 495, y: 550, w: 85, h: 65)
inpaint_and_draw_1915((495, 550, 580, 615), font_size=20, angle=-15.0, pos_offset=(-2, 0))

# Mid lower flag (x: 410, y: 595, w: 60, h: 55)
inpaint_and_draw_1915((410, 595, 470, 650), font_size=15, angle=-8.0, pos_offset=(0, 0))

# Banner on stand (x: 445, y: 600, w: 55, h: 35)
inpaint_and_draw_1915((445, 600, 500, 635), font_size=12, angle=0.0, pos_offset=(0, 0))

# Banner on stand (x: 520, y: 615, w: 55, h: 35)
inpaint_and_draw_1915((520, 615, 575, 650), font_size=12, angle=0.0, pos_offset=(0, 0))

print("All 404 flags replaced with 1915 on authentic fabric.")

# =========================================================================
# STEP 3: REPLACE TORRE CRESTS ON FLAGS WITH GDS CASCAIS CRESTS
# =========================================================================
crest_cascais = Image.open('cartazes/crest_cascais.png')
base_rgba = base.convert('RGBA')

# Big flag on left (centered around 185, 570)
c1 = crest_cascais.resize((82, 133), Image.Resampling.LANCZOS).rotate(7, expand=True)
base_rgba.alpha_composite(c1, (145, 505))

# Mid-left flag (centered around 395, 550)
c2 = crest_cascais.resize((46, 75), Image.Resampling.LANCZOS).rotate(-6, expand=True)
base_rgba.alpha_composite(c2, (372, 512))

# Mid-lower flag (centered around 440, 680)
c3 = crest_cascais.resize((40, 65), Image.Resampling.LANCZOS).rotate(10, expand=True)
base_rgba.alpha_composite(c3, (420, 650))

base = base_rgba.convert('RGB')
print("Torre crests on flags replaced with Cascais crests.")

# =========================================================================
# STEP 4: HUE SHIFT RED PIXELS TO CASCAIS EMERALD GREEN & SUNSET GOLD
# =========================================================================
arr = np.array(base, dtype=np.float32) / 255.0

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

# Red mask
is_red = (s > 0.16) & ((hsv_h < 0.09) | (hsv_h > 0.90))

# Preserve Torre crest in matchup (y: 160..420, x: 390..630)
y_idx, x_idx = np.ogrid[:h, :w]
torre_box = (x_idx >= 390) & (x_idx <= 630) & (y_idx >= 160) & (y_idx <= 420)
is_red[torre_box] = False

# Preserve Cascais crest castle/cross in orig
cascais_box = (x_idx >= 100) & (x_idx <= 300) & (y_idx >= 170) & (y_idx <= 420)
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
print("Hue shifted to Cascais Emerald Green and Sunset Gold.")

# =========================================================================
# STEP 5: CLEAN BOTTOM TEXT ZONE (y=725..1024)
# =========================================================================
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

# Upscale to 2x (1364 x 2048)
bg_2x = final_bg.resize((1364, 2048), Image.Resampling.LANCZOS)
bg_2x_rgba = bg_2x.convert('RGBA')

# =========================================================================
# STEP 6: DESTAQUE AO SÍMBOLO DO CASCAIS (ENLARGED + GLOWING GOLD/EMERALD AURA)
# =========================================================================
aura_size = 650
aura = Image.new('RGBA', (aura_size, aura_size), (0, 0, 0, 0))
aura_draw = ImageDraw.Draw(aura)
aura_cx, aura_cy = aura_size // 2, aura_size // 2

for r in range(aura_size // 2, 0, -3):
    t_val = r / (aura_size / 2)
    if t_val < 0.35:
        alpha = int((1.0 - t_val / 0.35) * 170 + 60)
        col = (227, 192, 77, min(255, alpha))
    elif t_val < 0.70:
        rel = (t_val - 0.35) / 0.35
        alpha = int((1.0 - rel) * 120)
        col = (0, 150, 98, min(255, alpha))
    else:
        rel = (t_val - 0.70) / 0.30
        alpha = int((1.0 - rel) * 50)
        col = (22, 79, 22, min(255, alpha))
    aura_draw.ellipse([aura_cx - r, aura_cy - r, aura_cx + r, aura_cy + r], fill=col)

aura = aura.filter(ImageFilter.GaussianBlur(15))

# Large Cascais Crest (DESTAQUE: 320px width, 520px height)
crest_large = crest_cascais.resize((320, 520), Image.Resampling.LANCZOS)

crest_shadow = Image.new('RGBA', (360, 560), (0, 0, 0, 0))
crest_alpha = crest_large.split()[3]
shadow_mask = crest_alpha.filter(ImageFilter.GaussianBlur(14))
crest_shadow.paste((0, 0, 0, 230), (18, 20), shadow_mask)

# Center at x: 410, y: 590
bg_2x_rgba.alpha_composite(aura, (410 - aura_cx, 590 - aura_cy))
bg_2x_rgba.alpha_composite(crest_shadow, (410 - 160 - 8, 590 - 260 - 5))
bg_2x_rgba.alpha_composite(crest_large, (410 - 160, 590 - 260))

# Gold historic badge under Cascais crest: "★ FUNDADO EM 1915 ★"
badge_1915 = Image.new('RGBA', (320, 54), (0, 0, 0, 0))
bdraw = ImageDraw.Draw(badge_1915)
bdraw.rectangle([0, 0, 320, 54], fill=(227, 192, 77, 245))
bdraw.rectangle([3, 3, 317, 51], outline=(255, 255, 255, 200), width=2)
font_badge = ImageFont.truetype(font_impact, 30)
bbox_b = bdraw.textbbox((0, 0), "★ FUNDADO EM 1915 ★", font=font_badge)
bw_txt = bbox_b[2] - bbox_b[0]
bh_txt = bbox_b[3] - bbox_b[1]
bdraw.text(((320 - bw_txt) // 2, (54 - bh_txt) // 2 - 2), "★ FUNDADO EM 1915 ★", font=font_badge, fill=(22, 79, 22, 255))
bg_2x_rgba.alpha_composite(badge_1915, (410 - 160, 890))

# =========================================================================
# STEP 7: PROMINENT BADGE AT TOP: "★ ESCALÃO DE VETERANOS ★"
# =========================================================================
vet_badge = Image.new('RGBA', (650, 70), (0, 0, 0, 0))
vdraw = ImageDraw.Draw(vet_badge)
vdraw.rectangle([0, 0, 650, 70], fill=(0, 150, 98, 250))
vdraw.rectangle([4, 4, 646, 66], outline=(227, 192, 77, 255), width=3)
font_vet = ImageFont.truetype(font_impact, 38)
bbox_v = vdraw.textbbox((0, 0), "★ ESCALÃO DE VETERANOS ★", font=font_vet)
vw_txt = bbox_v[2] - bbox_v[0]
vh_txt = bbox_v[3] - bbox_v[1]
vdraw.text(((650 - vw_txt) // 2, (70 - vh_txt) // 2 - 2), "★ ESCALÃO DE VETERANOS ★", font=font_vet, fill=(255, 255, 255, 255))

vet_rot = vet_badge.rotate(-2.0, resample=Image.Resampling.BICUBIC, expand=True)
bg_2x_rgba.alpha_composite(vet_rot, (682 - vet_rot.width // 2, 345))

# Save the master base image
master_base = bg_2x_rgba.convert('RGB')
master_base.save('stadium_masterpiece_base.jpg', quality=98)
print("Saved stadium_masterpiece_base.jpg successfully!")
