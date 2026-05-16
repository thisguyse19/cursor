#!/usr/bin/env python3
"""Generate PNG icons and iOS splash screens for the Triple PWA (trip-planner theme)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT_ICONS = ROOT / "icons"
OUT_SPLASH = ROOT / "splash"
INTER_PATH = ROOT / "fonts" / "Inter-Regular.ttf"

BLUE = (0, 113, 227)
WHITE = (255, 255, 255)
BG = (236, 238, 242)
INK = (29, 29, 31)
SUB = (81, 81, 84)


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


def inter_font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(INTER_PATH), size)


def _wordmark_font(draw: ImageDraw.ImageDraw, text: str, size: int, max_w: int) -> ImageFont.FreeTypeFont:
    """Shrink font until wordmark fits within max_w."""
    font_size = max(12, min(size, int(size * 0.5)))
    while font_size >= 10:
        font = inter_font(font_size)
        bbox = draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        if tw <= max_w:
            return font
        font_size -= 1
    return inter_font(10)


def draw_app_icon(size: int) -> Image.Image:
    img = trip_mesh_background(size, size)
    draw = ImageDraw.Draw(img)
    text = "triple"
    max_w = int(size * 0.88)
    font = _wordmark_font(draw, text, size, max_w)
    draw.text((size // 2, size // 2), text, font=font, fill=INK, anchor="mm")
    return img


def draw_maskable_512() -> Image.Image:
    s = 512
    img = trip_mesh_background(s, s)
    draw = ImageDraw.Draw(img)
    text = "triple"
    # Keep wordmark inside ~66% circle for maskable safe zone
    max_w = int(s * 0.52)
    font = _wordmark_font(draw, text, s, max_w)
    draw.text((s // 2, s // 2), text, font=font, fill=INK, anchor="mm")
    return img


def draw_splash(w: int, h: int) -> Image.Image:
    img = trip_mesh_background(w, h)
    draw = ImageDraw.Draw(img)
    title = "triple"
    sub = "Trip planner"
    font_title = _wordmark_font(draw, title, min(w, h) // 6, int(w * 0.72))
    font_sub = inter_font(max(14, min(w, h) // 28))
    tb = draw.textbbox((0, 0), title, font=font_title)
    sb = draw.textbbox((0, 0), sub, font=font_sub)
    tx = (w - (tb[2] - tb[0])) // 2
    ty = h // 2 - (tb[3] - tb[1]) - h // 40
    sx = (w - (sb[2] - sb[0])) // 2
    sy = ty + (tb[3] - tb[1]) + h // 60
    pad_x, pad_y = w // 14, h // 50
    draw.rounded_rectangle(
        (
            tx - pad_x,
            ty - pad_y,
            tx + (tb[2] - tb[0]) + pad_x,
            sy + (sb[3] - sb[1]) + pad_y,
        ),
        radius=min(w, h) // 40,
        fill=WHITE,
        outline=(230, 232, 236),
    )
    draw.text((tx, ty), title, font=font_title, fill=INK)
    draw.text((sx, sy), sub, font=font_sub, fill=SUB)
    return img


def main() -> None:
    if not INTER_PATH.is_file():
        raise SystemExit(f"Missing Inter font at {INTER_PATH}")

    OUT_ICONS.mkdir(parents=True, exist_ok=True)
    OUT_SPLASH.mkdir(parents=True, exist_ok=True)

    icon192 = draw_app_icon(192)
    draw_app_icon(180).save(OUT_ICONS / "apple-touch-icon.png", "PNG", optimize=True)
    icon192.save(OUT_ICONS / "icon-192.png", "PNG", optimize=True)
    draw_app_icon(512).save(OUT_ICONS / "icon-512.png", "PNG", optimize=True)
    draw_maskable_512().save(OUT_ICONS / "maskable-512.png", "PNG", optimize=True)
    icon192.resize((32, 32), Image.Resampling.LANCZOS).save(
        OUT_ICONS / "favicon-32.png", "PNG", optimize=True
    )

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
