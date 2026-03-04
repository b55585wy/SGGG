"""
Batch-generate all Kenney Modular Character layers as full-canvas PNGs.
Each layer is the same canvas size (460x600) so they stack directly in the frontend.

Output structure:
  avatar/
    skin/    tint1.png ... tint8.png          (8)
    face/    face1.png ... face4.png          (4)
    hair/    {color}_{gender}{n}.png          (~32)
    shirt/   {color}.png                      (8)
    pants/   {color}.png                      (12)
    shoes/   {color}.png                      (7)
"""
from PIL import Image
import os, glob, re

SRC = "C:/Users/a1396/AppData/Local/Temp/kenney-modular/PNG"
OUT = "C:/Users/a1396/Documents/GitHub/SGGG/frontend/public/avatar"

CANVAS_W, CANVAS_H = 460, 600
CX = CANVAS_W // 2

def open_part(path):
    return Image.open(path).convert("RGBA")

def paste_centered(canvas, path, cx, cy):
    p = open_part(path)
    canvas.paste(p, (cx - p.width // 2, cy - p.height // 2), p)

def paste_at(canvas, path, x, y):
    p = open_part(path)
    canvas.paste(p, (x, y), p)

def paste_flipped(canvas, path, x, y):
    p = open_part(path).transpose(Image.FLIP_LEFT_RIGHT)
    canvas.paste(p, (x, y), p)

def paste_rotated180(canvas, path, x, y):
    p = open_part(path).transpose(Image.ROTATE_180)
    canvas.paste(p, (x, y), p)

def paste_rotated180_flipped(canvas, path, x, y):
    p = open_part(path).transpose(Image.ROTATE_180).transpose(Image.FLIP_LEFT_RIGHT)
    canvas.paste(p, (x, y), p)

def new_canvas():
    return Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))

# ── layout coords ────────────────────────────────────
HEAD_CY     = 95
FACE_CY     = HEAD_CY + 8
HAIR_TOP    = -4           # align top edge of all hair sprites here
NECK_CY     = HEAD_CY + 89
SHIRT_CY    = NECK_CY + 90
ARM_TOP     = SHIRT_CY - 60
HAND_TOP    = ARM_TOP + 115
SHIRT_HALF  = 76
ARM_W       = 170
L_ARM_X     = CX - SHIRT_HALF - ARM_W + 30
R_ARM_X     = CX + SHIRT_HALF - 30
L_HAND_X    = L_ARM_X + 8
R_HAND_X    = R_ARM_X + ARM_W - 69
PANTS_CY    = SHIRT_CY + 100
LEG_TOP     = PANTS_CY + 2
PLEG_W      = 111
L_PLEG_X    = CX - PLEG_W + 5
R_PLEG_X    = CX - 5
LEG_W       = 93
L_LEG_X     = CX - LEG_W + 2
R_LEG_X     = CX - 2
SHOE_TOP    = LEG_TOP + 145
SHOE_W      = 94
L_SHOE_X    = CX - SHOE_W + 5
R_SHOE_X    = CX - 5
L_SLEEVE_X  = L_ARM_X
R_SLEEVE_X  = R_ARM_X

def makedirs(*paths):
    for p in paths:
        os.makedirs(p, exist_ok=True)

# ── 1. SKIN bases ────────────────────────────────────
def gen_skins():
    out = f"{OUT}/skin"
    makedirs(out)
    for t in range(1, 9):
        c = new_canvas()
        d = f"{SRC}/Skin/Tint {t}"
        p = f"tint{t}"
        paste_centered(c, f"{d}/{p}_head.png", CX, HEAD_CY)
        paste_centered(c, f"{d}/{p}_neck.png", CX, NECK_CY)
        paste_flipped(c, f"{d}/{p}_arm.png", L_ARM_X, ARM_TOP)
        paste_at(c, f"{d}/{p}_arm.png", R_ARM_X, ARM_TOP)
        paste_flipped(c, f"{d}/{p}_hand.png", L_HAND_X, HAND_TOP)
        paste_at(c, f"{d}/{p}_hand.png", R_HAND_X, HAND_TOP)
        paste_at(c, f"{d}/{p}_leg.png", L_LEG_X, LEG_TOP)
        paste_flipped(c, f"{d}/{p}_leg.png", R_LEG_X, LEG_TOP)
        c.save(f"{out}/tint{t}.png")
    print(f"  skin: 8 files")

# ── 2. FACE expressions ─────────────────────────────
def gen_faces():
    out = f"{OUT}/face"
    makedirs(out)
    for i in range(1, 5):
        c = new_canvas()
        paste_centered(c, f"{SRC}/Face/Completes/face{i}.png", CX, FACE_CY)
        c.save(f"{out}/face{i}.png")
    print(f"  face: 4 files")

# ── 3. HAIR styles ───────────────────────────────────
def gen_hairs():
    out = f"{OUT}/hair"
    makedirs(out)
    count = 0
    hair_dirs = sorted(os.listdir(f"{SRC}/Hair"))
    for color_dir in hair_dirs:
        full = f"{SRC}/Hair/{color_dir}"
        if not os.path.isdir(full):
            continue
        files = sorted(os.listdir(full))
        # pick up to 2 man + 2 woman styles per color
        men = [f for f in files if "Man" in f or "man" in f][:2]
        women = [f for f in files if "Woman" in f or "woman" in f][:2]
        for f in men + women:
            c = new_canvas()
            p = open_part(f"{full}/{f}")
            # align hair by top edge, centered horizontally
            c.paste(p, (CX - p.width // 2, HAIR_TOP), p)
            slug = color_dir.lower().replace(" ", "_")
            name = f.replace(".png", "").lower()
            c.save(f"{out}/{slug}_{name}.png")
            count += 1
    print(f"  hair: {count} files")

# ── 4. SHIRTS ────────────────────────────────────────
def gen_shirts():
    out = f"{OUT}/shirt"
    makedirs(out)
    count = 0
    for color_dir in sorted(os.listdir(f"{SRC}/Shirts")):
        full = f"{SRC}/Shirts/{color_dir}"
        if not os.path.isdir(full):
            continue
        # find first body shirt + long arm
        files = sorted(os.listdir(full))
        body = next((f for f in files if "shirt" in f.lower() and "arm" not in f.lower()), None)
        arm = next((f for f in files if "arm" in f.lower() and "long" in f.lower()), None)
        if not body or not arm:
            continue
        c = new_canvas()
        paste_centered(c, f"{full}/{body}", CX, SHIRT_CY)
        paste_flipped(c, f"{full}/{arm}", L_SLEEVE_X, ARM_TOP)
        paste_at(c, f"{full}/{arm}", R_SLEEVE_X, ARM_TOP)
        slug = color_dir.lower().replace(" ", "_")
        c.save(f"{out}/{slug}.png")
        count += 1
    print(f"  shirt: {count} files")

# ── 5. PANTS ─────────────────────────────────────────
def gen_pants():
    out = f"{OUT}/pants"
    makedirs(out)
    count = 0
    for color_dir in sorted(os.listdir(f"{SRC}/Pants")):
        full = f"{SRC}/Pants/{color_dir}"
        if not os.path.isdir(full):
            continue
        files = sorted(os.listdir(full))
        # first waist piece + long leg piece
        waist = next((f for f in files if not ("long" in f.lower() or "short" in f.lower())), None)
        leg = next((f for f in files if "long" in f.lower()), None)
        if not waist or not leg:
            continue
        c = new_canvas()
        paste_centered(c, f"{full}/{waist}", CX, PANTS_CY)
        paste_rotated180(c, f"{full}/{leg}", L_PLEG_X, LEG_TOP)
        paste_rotated180_flipped(c, f"{full}/{leg}", R_PLEG_X, LEG_TOP)
        slug = color_dir.lower().replace(" ", "_")
        c.save(f"{out}/{slug}.png")
        count += 1
    print(f"  pants: {count} files")

# ── 6. SHOES ─────────────────────────────────────────
def gen_shoes():
    out = f"{OUT}/shoes"
    makedirs(out)
    count = 0
    for color_dir in sorted(os.listdir(f"{SRC}/Shoes")):
        full = f"{SRC}/Shoes/{color_dir}"
        if not os.path.isdir(full):
            continue
        files = sorted(os.listdir(full))
        shoe = files[0] if files else None
        if not shoe:
            continue
        c = new_canvas()
        paste_at(c, f"{full}/{shoe}", L_SHOE_X, SHOE_TOP)
        paste_flipped(c, f"{full}/{shoe}", R_SHOE_X, SHOE_TOP)
        slug = color_dir.lower().replace(" ", "_")
        c.save(f"{out}/{slug}.png")
        count += 1
    print(f"  shoes: {count} files")

# ── 7. Test composite ────────────────────────────────
def gen_test():
    """Compose one full character for visual verification"""
    skin = Image.open(f"{OUT}/skin/tint1.png").convert("RGBA")
    face = Image.open(f"{OUT}/face/face1.png").convert("RGBA")
    # find first hair
    hairs = sorted(os.listdir(f"{OUT}/hair"))
    hair = Image.open(f"{OUT}/hair/{hairs[0]}").convert("RGBA") if hairs else new_canvas()
    shirts = sorted(os.listdir(f"{OUT}/shirt"))
    shirt = Image.open(f"{OUT}/shirt/{shirts[0]}").convert("RGBA") if shirts else new_canvas()
    pantsl = sorted(os.listdir(f"{OUT}/pants"))
    pants = Image.open(f"{OUT}/pants/{pantsl[0]}").convert("RGBA") if pantsl else new_canvas()
    shoesl = sorted(os.listdir(f"{OUT}/shoes"))
    shoes = Image.open(f"{OUT}/shoes/{shoesl[0]}").convert("RGBA") if shoesl else new_canvas()

    result = new_canvas()
    for layer in [skin, shoes, pants, shirt, face, hair]:
        result = Image.alpha_composite(result, layer)
    result.save(f"{OUT}/test_character.png")
    print(f"  test: saved composite")


if __name__ == "__main__":
    print("Generating Kenney avatar layers...")
    gen_skins()
    gen_faces()
    gen_hairs()
    gen_shirts()
    gen_pants()
    gen_shoes()
    gen_test()
    print("Done!")
