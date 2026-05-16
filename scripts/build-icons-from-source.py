#!/usr/bin/env python3
"""Build packaged PWA / iOS icons from a high-res master image.

Place raster artwork at icons/icon-source-1024.png (any dimensions; it is
center-cropped to a square). Then run:

  python3 scripts/build-icons-from-source.py

Writes: icon-1024.png, icon-512.png, icon-192.png, apple-touch-icon.png,
favicon-32.png, maskable-512.png
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "icons" / "icon-source-1024.png"
OUT = ROOT / "icons"
MASTER_SIDE = 1024
MASK_PAD_RATIO = 0.14


def center_square(im: Image.Image) -> Image.Image:
    w, h = im.size
    side = min(w, h)
    x0 = (w - side) // 2
    y0 = (h - side) // 2
    return im.crop((x0, y0, x0 + side, y0 + side))


def scale_square(im: Image.Image, side: int) -> Image.Image:
    return im.resize((side, side), Image.Resampling.LANCZOS)


def main() -> None:
    if not SRC.is_file():
        raise SystemExit(f"Missing source icon: {SRC}")

    base = Image.open(SRC).convert("RGB")
    sq = center_square(base)
    master = scale_square(sq, MASTER_SIDE)
    master.save(OUT / "icon-1024.png", "PNG", optimize=True)

    scale_square(sq, 512).save(OUT / "icon-512.png", "PNG", optimize=True)
    scale_square(sq, 192).save(OUT / "icon-192.png", "PNG", optimize=True)
    scale_square(sq, 180).save(OUT / "apple-touch-icon.png", "PNG", optimize=True)
    scale_square(sq, 32).save(OUT / "favicon-32.png", "PNG", optimize=True)

    s = 512
    inner = max(1, int(round(s * (1 - 2 * MASK_PAD_RATIO))))
    fg = scale_square(sq, inner)
    pad_color = master.getpixel((12, 12))
    canvas = Image.new("RGB", (s, s), pad_color)
    off = (s - inner) // 2
    canvas.paste(fg, (off, off))
    canvas.save(OUT / "maskable-512.png", "PNG", optimize=True)

    print("Wrote icons from", SRC)


if __name__ == "__main__":
    main()
