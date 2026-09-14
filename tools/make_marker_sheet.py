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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image", help="square-ish artwork for the middle of the marker")
    ap.add_argument("--border", type=float, default=0.25,
                    help="black border as a share of the whole marker (AR.js "
                         "patternRatio 0.5 expects 0.25 — leave this alone "
                         "unless you also change patternRatio in config.js)")
    ap.add_argument("--size", type=int, default=1200)
    a = ap.parse_args()

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
