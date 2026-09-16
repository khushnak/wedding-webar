#!/usr/bin/env python3
"""
Turns your invitation artwork into a marker you can train and print.

A pattern marker needs three things: a square image, a thick solid black
border around it, and enough contrast inside. This adds the border at the
ratio AR.js expects and writes a print sheet.

    python3 tools/make_marker_sheet.py card-front.png

Then:
 1. upload assets/marker/invite-marker.png to
    https://ar-js-org.github.io/AR.js/three.js/examples/marker-training/examples/generator.html
 2. download the .patt file, save it as assets/marker/invite.patt
 3. in js/config.js set MARKER.type to 'pattern'
 4. print assets/marker/print-invite-a4.png at 100% scale

Tips for a marker that actually tracks: use bold, asymmetric, high-contrast
artwork. Fine detail, faces, and pale washes track badly. Black text or a
strong monogram on cream works very well.
"""

import argparse
import os

from PIL import Image, ImageDraw, ImageOps

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "marker")


DPI = 150                      # everything below is authored at 150 dpi
MM = DPI / 25.4                # px per millimetre


def hiro_sheet(landscape=False):
    """A printable Hiro sheet, portrait or landscape.

    The page turns; the MARKER DOES NOT. AR.js derives the whole marker
    coordinate system from the four corners of the black Hiro square, so the
    paper around it is invisible to the tracker and the AR's facing direction
    comes from how that square is ROTATED on the page — never from the page's
    shape. Pasting the square at the same rotation on a landscape sheet
    therefore puts the film exactly where it sits on the portrait one, with
    no change to any transform in the app. Rotating the whole existing PNG
    would have turned the square with it and swung the film 90 degrees.
    """
    w_mm, h_mm = (297, 210) if landscape else (210, 297)
    W, H = round(w_mm * MM), round(h_mm * MM)

    # hiro.png carries a white margin around its black square; at 591px the
    # square itself lands at 543px = 92 mm, matching print-hiro-a4.png.
    box = 591
    hiro = Image.open(os.path.join(OUT, "hiro.png")).convert("RGB")
    hiro = hiro.resize((box, box), Image.LANCZOS)        # square in, square out

    sheet = Image.new("RGB", (W, H), "white")
    x = (W - box) // 2
    y = (H - box) // 2 - round(10 * MM)     # a little high, to leave room for type
    sheet.paste(hiro, (x, y))

    d = ImageDraw.Draw(sheet)
    pad = round(8 * MM)
    d.rectangle([x - pad, y - pad, x + box + pad, y + box + pad],
                outline=(200, 200, 200), width=2)
    grey = (90, 90, 90)
    d.text((x - pad, y - pad - 34),
           "Scan me with the invitation page open", fill=grey)
    base = y + box + pad + 26
    d.text((x - pad, base),
           f"Print at 100% scale on {w_mm} x {h_mm} mm "
           f"({'A4 LANDSCAPE' if landscape else 'A4 portrait'}).", fill=grey)
    d.text((x - pad, base + 30),
           "The black square should measure 92 mm across.", fill=grey)
    d.text((x - pad, base + 60),
           "Lay the sheet flat on the table and keep the white margin clear.",
           fill=grey)
    if landscape:
        d.text((x - pad, base + 90),
               "Stand at a LONG edge - the film rises facing you.", fill=grey)

    name = "print-hiro-landscape.png" if landscape else "print-hiro-portrait.png"
    out = os.path.join(OUT, name)
    sheet.save(out, dpi=(DPI, DPI))
    return out, (W, H), (w_mm, h_mm), box


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image", nargs="?",
                    help="square-ish artwork for the middle of the marker")
    ap.add_argument("--hiro", action="store_true",
                    help="write a printable Hiro sheet instead of training a "
                         "pattern marker from artwork")
    ap.add_argument("--landscape", action="store_true",
                    help="with --hiro: 297x210 mm instead of 210x297 mm")
    ap.add_argument("--border", type=float, default=0.25,
                    help="black border as a share of the whole marker (AR.js "
                         "patternRatio 0.5 expects 0.25 — leave this alone "
                         "unless you also change patternRatio in config.js)")
    ap.add_argument("--size", type=int, default=1200)
    a = ap.parse_args()

    if a.hiro:
        out, px, mm, box = hiro_sheet(a.landscape)
        print("sheet  :", os.path.relpath(out))
        print(f"page   : {mm[0]} x {mm[1]} mm  ->  {px[0]} x {px[1]} px at {DPI} dpi")
        print(f"marker : {box} px paste, 543 px black square = 92 mm, unrotated")
        return

    if not a.image:
        ap.error("give artwork to build a pattern marker, or pass --hiro")

    art = Image.open(a.image).convert("RGB")
    art = ImageOps.fit(art, (a.size, a.size), Image.LANCZOS)

    pad = int(a.size * a.border / (1 - 2 * a.border))
    marker = Image.new("RGB", (a.size + pad * 2, a.size + pad * 2), "black")
    marker.paste(art, (pad, pad))

    os.makedirs(OUT, exist_ok=True)
    mpath = os.path.join(OUT, "invite-marker.png")
    marker.save(mpath)

    # A4 print sheet at 150 dpi with a 10 cm marker
    W, H, m = 1240, 1754, 591
    sheet = Image.new("RGB", (W, H), "white")
    sheet.paste(marker.resize((m, m), Image.LANCZOS), ((W - m) // 2, 430))
    d = ImageDraw.Draw(sheet)
    d.rectangle([(W - m) // 2 - 40, 390, (W + m) // 2 + 40, 430 + m + 40],
                outline=(200, 200, 200), width=2)
    d.text((W // 2 - 250, 300), "Scan me with the invitation page open", fill=(90, 90, 90))
    d.text((W // 2 - 250, 430 + m + 80),
           "Print at 100% scale. The black square should measure 10 cm across.",
           fill=(90, 90, 90))
    d.text((W // 2 - 250, 430 + m + 110),
           "Leave the white margin around it clear.", fill=(90, 90, 90))
    spath = os.path.join(OUT, "print-invite-a4.png")
    sheet.save(spath)

    print("marker :", os.path.relpath(mpath))
    print("print  :", os.path.relpath(spath))
    print("next   : train it at the AR.js marker generator, save invite.patt "
          "next to this file, then set MARKER.type = 'pattern'")


if __name__ == "__main__":
    main()
