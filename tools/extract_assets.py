#!/usr/bin/env python3
"""
Cuts the supplied reference sheets into transparent PNG cutouts used by the
WebAR invitation.

Run:  python3 tools/extract_assets.py --src /path/to/uploads --out assets

Nothing here redraws or restyles the artwork. It only crops, keys out the flat
cream paper background, drops the tiny decorative accent dashes, and resizes.
If you replace a reference sheet, re-run this script (or just drop your own
transparent PNGs into assets/ using the same filenames).
"""

import argparse
import os

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

# ---------------------------------------------------------------- keying ----


def _bg_mask(rgb, seeds, tol):
    """Pixels connected to the image border whose colour matches a seed."""
    h, w, _ = rgb.shape
    close = np.zeros((h, w), bool)
    for seed in seeds:
        d = np.abs(rgb.astype(np.int16) - np.array(seed, np.int16)).sum(axis=2)
        close |= d < tol
    lab, n = ndimage.label(close)
    if n == 0:
        return close
    border = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    border.discard(0)
    return np.isin(lab, list(border))


def _drop_specks(alpha, keep_ratio):
    """Remove small floating bits (the red/orange accent dashes, stray marks)."""
    solid = alpha > 120
    lab, n = ndimage.label(solid)
    if n <= 1:
        return alpha
    sizes = ndimage.sum(solid, lab, range(1, n + 1))
    biggest = sizes.max()
    keep = [i + 1 for i, s in enumerate(sizes) if s >= biggest * keep_ratio]
    mask = np.isin(lab, keep)
    mask = ndimage.binary_dilation(mask, iterations=3)
    return np.where(mask, alpha, 0).astype(np.uint8)


def cutout(img, seeds=((243, 239, 230),), tol=60, keep_ratio=0.02,
           extra_keys=(), feather=1.2, pad=6):
    """Key the flat background out of a crop and trim to the artwork."""
    src_a = None
    if img.mode == "RGBA":
        src_a = np.asarray(img.getchannel("A"))
        if src_a.min() < 250:            # already partly transparent: keep it
            flat = Image.new("RGB", img.size, (243, 239, 230))
            flat.paste(img, (0, 0), img)
            img = flat
        else:
            src_a = None
    img = img.convert("RGB")
    rgb = np.asarray(img)
    bg = _bg_mask(rgb, seeds, tol)

    # Flat colour fields that are part of the backdrop rather than the art
    # (e.g. the yellow halo disc behind the casual portraits).
    for colour, ctol in extra_keys:
        d = np.abs(rgb.astype(np.int16) - np.array(colour, np.int16)).sum(axis=2)
        bg |= d < ctol

    padded = np.pad(bg, 3, constant_values=True)
    bg = ndimage.binary_closing(padded, np.ones((3, 3)))[3:-3, 3:-3]
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    if src_a is not None:
        alpha = np.minimum(alpha, src_a)
    alpha = _drop_specks(alpha, keep_ratio)

    out = Image.fromarray(np.dstack([rgb, alpha]), "RGBA")
    if feather:
        a = out.getchannel("A").filter(ImageFilter.GaussianBlur(feather))
        # push the edge back in slightly so no cream halo survives
        a = a.point(lambda v: 0 if v < 110 else min(255, int((v - 110) * 2.2)))
        out.putalpha(a)

    box = out.getchannel("A").getbbox()
    if box:
        x0, y0, x1, y1 = box
        out = out.crop((max(0, x0 - pad), max(0, y0 - pad),
                        min(out.width, x1 + pad), min(out.height, y1 + pad)))
    return out


def fit(img, max_side):
    if max(img.size) <= max_side:
        return img
    s = max_side / max(img.size)
    return img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))),
                      Image.LANCZOS)


def save(img, path, max_side):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fit(img, max_side).save(path, optimize=True)
    print(f"  {os.path.relpath(path):<44} {fit(img, max_side).size}")


def cell(sheet, cols, rows, c, r, inset=0.03):
    w, h = sheet.width / cols, sheet.height / rows
    dx, dy = w * inset, h * inset
    return sheet.crop((int(c * w + dx), int(r * h + dy),
                       int((c + 1) * w - dx), int((r + 1) * h - dy)))


# ------------------------------------------------------------------ main ----

CREAM = [(243, 239, 230), (238, 233, 222), (249, 246, 239), (232, 226, 214)]
WHITE = [(255, 255, 255), (250, 250, 250)]
HALO = [((242, 183, 63), 48), ((247, 199, 92), 44), ((236, 172, 44), 44)]  # yellow halo disc

ICONS = {  # (col, row): (filename, keep_ratio)
    (0, 0): ("flowers", 0.05), (1, 0): ("butterflies", 0.06),
    (2, 0): ("chai", 0.05), (3, 0): ("food", 0.04),
    (0, 1): ("phones", 0.10), (1, 1): ("airplane", 0.02),
    (2, 1): ("suitcases", 0.04), (3, 1): ("france_flag", 0.06),
    (0, 2): ("eiffel", 0.12), (1, 2): ("louvre", 0.02),
    (2, 2): ("seine", 0.02), (3, 2): ("ring", 0.12),
    (0, 3): ("sparkle", 0.02), (1, 3): ("college", 0.02),
    (2, 3): ("road", 0.09), (3, 3): ("airport", 0.02),
}

# Icons whose neighbour bleeds across the grid line get their own box.
CUSTOM_ICONS = {"eiffel": (0.012, 0.515, 0.213, 0.748)}

RAHUL_POSES = {  # (col, row): filename   -- cream sherwani sheet, 6x3
    (0, 0): "rahul_wed_idle", (2, 0): "rahul_wed_arms",
    (1, 1): "rahul_wed_walk", (5, 1): "rahul_wed_turban",
    (2, 2): "rahul_wed_dance", (1, 2): "rahul_wed_phone",
}

# Poses whose raised arms cross a grid line need their own box (0-1 of sheet).
RAHUL_CUSTOM = {"rahul_wed_cheer": (0.395, 0.340, 0.565, 0.618)}

ARYA_POSES = {  # 5x1 bridal sheet
    0: "arya_wed_wave", 1: "arya_wed_namaste", 2: "arya_wed_shy",
    3: "arya_wed_point", 4: "arya_wed_blush",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="/mnt/user-data/uploads")
    ap.add_argument("--out", default="assets")
    a = ap.parse_args()
    S, O = a.src, a.out
    p = lambda *x: os.path.join(S, *x)

    print("icons")
    sheet = Image.open(p("ChatGPT_Image_Sep_11__2026__02_28_02_PM.png"))
    for (c, r), (name, kr) in ICONS.items():
        if name in CUSTOM_ICONS:
            x0, y0, x1, y1 = CUSTOM_ICONS[name]
            w, h = sheet.size
            crop = sheet.crop((int(w * x0), int(h * y0), int(w * x1), int(h * y1)))
        else:
            crop = cell(sheet, 4, 4, c, r)
        save(cutout(crop, CREAM, tol=70, keep_ratio=kr),
             os.path.join(O, "icons", f"{name}.png"), 460)

    print("casual characters")
    for src, name in ((p("image_72.png"), "rahul_casual"),
                      (p("image_73.png"), "arya_casual")):
        img = cutout(Image.open(src), CREAM, tol=72, keep_ratio=0.25,
                     extra_keys=HALO)
        save(img, os.path.join(O, "characters", f"{name}.png"), 1000)

    print("wedding poses")
    sheet = Image.open(p("image_75.png"))
    for (c, r), name in RAHUL_POSES.items():
        img = cutout(cell(sheet, 6, 3, c, r), CREAM, tol=64, keep_ratio=0.06)
        save(img, os.path.join(O, "characters", f"{name}.png"), 900)

    for name, (x0, y0, x1, y1) in RAHUL_CUSTOM.items():
        w, h = sheet.size
        crop = sheet.crop((int(w * x0), int(h * y0), int(w * x1), int(h * y1)))
        save(cutout(crop, CREAM, tol=64, keep_ratio=0.15),
             os.path.join(O, "characters", f"{name}.png"), 900)

    sheet = Image.open(p("81.png"))
    for c, name in ARYA_POSES.items():
        img = cutout(cell(sheet, 5, 1, c, 0), CREAM, tol=64, keep_ratio=0.08)
        save(img, os.path.join(O, "characters", f"{name}.png"), 900)

    print("couples")
    # navy sherwani + ivory lehenga -> sangeet night
    save(cutout(Image.open(p("image_92.png")), CREAM + WHITE, tol=70,
                keep_ratio=0.3, extra_keys=HALO),
         os.path.join(O, "characters", "couple_sangeet.png"), 1100)
    # tux + blush lehenga -> reception
    save(cutout(Image.open(p("image_93.png")), CREAM + WHITE, tol=70,
                keep_ratio=0.3),
         os.path.join(O, "characters", "couple_reception.png"), 1100)

    # The two painted stage references cannot be keyed automatically (their
    # backgrounds are illustrated, not flat). They are copied out as reference
    # crops only - see README if you want to hand-cut them in Photopea.
    for src, name, box in (
        ("image_90.png", "ref_sangeet_stage", (.02, .05, .99, .97)),
        ("image_91.png", "ref_reception_stage", (.16, .04, .92, .99)),
    ):
        im = Image.open(p(src)).convert("RGBA")
        w, h = im.size
        save(im.crop((int(w * box[0]), int(h * box[1]),
                      int(w * box[2]), int(h * box[3]))),
             os.path.join(O, "reference", f"{name}.png"), 1200)

    print("done")


if __name__ == "__main__":
    main()
