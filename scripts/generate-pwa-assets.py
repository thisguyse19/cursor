#!/usr/bin/env python3
"""Generate PNG icons and iOS splash screens for the Triple PWA (trip-planner theme)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT_ICONS = ROOT / "icons"
OUT_SPLASH = ROOT / "splash"

BLUE = (0, 113, 227)
WHITE = (255, 255, 255)
BG = (236, 238, 242)


def trip_mesh_background(w: int, h: int) -> Image.Image:
    """Approximate the site mesh: soft grey base + blue / purple / green glows."""
    img = Image.new("RGB", (w, h), BG)
    draw = ImageDraw.Draw(img)
    draw.ellipse(
        (-w // 4, -h // 6, int(w * 0.58), int(h * 0.38)),
        fill=(225, 235, 250),
    )
    draw.ellipse(
        (int(w * 0.42), -h // 8, w + w // 4, int(h * 0.32)),
        fill=(232, 230, 248),
    )
    draw.ellipse(
        (int(w * 0.08), int(h * 0.70), int(w * 0.92), h + h // 3),
        fill=(228, 244, 234),
    )
    return img


def _font(size: int, bold: bool = True) -> ImageFont.ImageFont:
    paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ]
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_app_icon(size: int) -> Image.Image:
    img = trip_mesh_background(size, size)
    draw = ImageDraw.Draw(img)
    pad = max(8, size // 7)
    r = size - 2 * pad
    draw.rounded_rectangle((pad, pad, pad + r, pad + r), radius=max(8, size // 8), fill=WHITE)
    cx, cy = size // 2, size // 2
    rdot = max(12, size // 5)
    draw.ellipse((cx - rdot, cy - rdot, cx + rdot, cy + rdot), fill=BLUE)
    font = _font(max(14, size // 3), bold=True)
    t = "3"
    bbox = draw.textbbox((0, 0), t, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text((cx - tw // 2, cy - th // 2 - size // 60), t, font=font, fill=WHITE)
    return img


def draw_maskable_512() -> Image.Image:
    s = 512
    img = trip_mesh_background(s, s)
    inner = 410
    off = (s - inner) // 2
    tile = draw_app_icon(inner)
    img.paste(tile, (off, off))
    return img


def draw_splash(w: int, h: int) -> Image.Image:
    img = trip_mesh_background(w, h)
    draw = ImageDraw.Draw(img)
    font_title = _font(min(w, h) // 10, bold=True)
    font_sub = _font(min(w, h) // 28, bold=False)
    title = "Triple"
    sub = "Trip planner"
    tb = draw.textbbox((0, 0), title, font=font_title)
    sb = draw.textbbox((0, 0), sub, font=font_sub)
    tx = (w - (tb[2] - tb[0])) // 2
    ty = h // 2 - (tb[3] - tb[1]) - h // 40
    sx = (w - (sb[2] - sb[0])) // 2
    sy = ty + (tb[3] - tb[1]) + h // 60
    # subtle card behind title
    pad_x, pad_y = w // 14, h // 50
    draw.rounded_rectangle(
        (
            tx - pad_x,
            ty - pad_y,
            tx + (tb[2] - tb[0]) + pad_x,
            sy + (sb[3] - sb[1]) + pad_y,
        ),
        radius=min(w, h) // 40,
        fill=(255, 255, 255),
        outline=(230, 232, 236),
    )
    draw.text((tx, ty), title, font=font_title, fill=(29, 29, 31))
    draw.text((sx, sy), sub, font=font_sub, fill=(81, 81, 84))
    return img


def main() -> None:
    OUT_ICONS.mkdir(parents=True, exist_ok=True)
    OUT_SPLASH.mkdir(parents=True, exist_ok=True)

    draw_app_icon(180).save(OUT_ICONS / "apple-touch-icon.png", "PNG", optimize=True)
    draw_app_icon(192).save(OUT_ICONS / "icon-192.png", "PNG", optimize=True)
    draw_app_icon(512).save(OUT_ICONS / "icon-512.png", "PNG", optimize=True)
    draw_maskable_512().save(OUT_ICONS / "maskable-512.png", "PNG", optimize=True)

    splashes = [
        (1170, 2532),
        (1284, 2778),
        (750, 1334),
        (1242, 2688),
        (828, 1792),
        (1125, 2436),
    ]
    for ww, hh in splashes:
        path = OUT_SPLASH / f"apple-splash-{ww}-{hh}.png"
        draw_splash(ww, hh).save(path, "PNG", optimize=True)
        print("Wrote", path.relative_to(ROOT))

    for p in OUT_ICONS.glob("*.png"):
        print("Wrote", p.relative_to(ROOT))


if __name__ == "__main__":
    main()
