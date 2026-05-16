#!/usr/bin/env python3
"""
Generate PWA / iOS app icons (procedural fallback): three plane silhouettes on a
dark blue gradient. For real 3D artwork, use icons/icon-source-1024.png and run:
  python3 scripts/build-icons-from-source.py
"""
from __future__ import annotations

import math
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "icons"
MASTER = 1024

# Dark blue gradient (top → bottom), liquid-glass friendly
TOP = (10, 28, 62)
BOTTOM = (4, 14, 42)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def draw_gradient_bg(im: Image.Image, draw: ImageDraw.ImageDraw) -> None:
    w, h = im.size
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(lerp(TOP[0], BOTTOM[0], t))
        g = int(lerp(TOP[1], BOTTOM[1], t))
        b = int(lerp(TOP[2], BOTTOM[2], t))
        draw.line([(0, y), (w, y)], fill=(r, g, b, 255))


def draw_glass_arc(im: Image.Image) -> None:
    """Subtle frosted highlight — survives iOS icon treatment."""
    w, h = im.size
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    # Soft oval highlight top-left
    gdraw.ellipse(
        (-w * 0.15, -h * 0.2, w * 0.75, h * 0.55),
        fill=(255, 255, 255, 38),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=max(w, h) // 40))
    im.alpha_composite(glow)


def plane_polygon(cx: float, cy: float, scale: float) -> list[tuple[float, float]]:
    """Minimal side-view jet (normalized coords × scale). Nose points right."""
    pts = [
        (0.52, 0.0),
        (0.14, -0.12),
        (-0.06, -0.14),
        (-0.20, -0.26),
        (-0.36, -0.10),
        (-0.48, -0.05),
        (-0.54, 0.0),
        (-0.48, 0.09),
        (-0.36, 0.13),
        (-0.20, 0.17),
        (-0.06, 0.15),
        (0.14, 0.11),
    ]
    return [(cx + x * scale, cy + y * scale) for x, y in pts]


def draw_planes_layer(size: int, *, safe_inset: float = 0.08) -> Image.Image:
    w = h = size
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    draw_gradient_bg(im, draw)
    draw_glass_arc(im)

    inset = int(size * safe_inset)
    usable = size - 2 * inset
    cy = size * 0.52
    base_scale = size * 0.22  # silhouette size — readable at 32px favicon
    # Three planes, different opacity (depth / glass stack)
    configs = [
        (inset + usable * 0.22, 0.36, base_scale * 0.88),
        (inset + usable * 0.50, 0.62, base_scale * 1.0),
        (inset + usable * 0.78, 0.95, base_scale * 1.12),
    ]

    glass_base = (218, 236, 255)
    for cx, opacity, sc in configs:
        poly = plane_polygon(cx, cy, sc)
        alpha = int(255 * opacity)
        fill = (*glass_base, alpha)
        draw.polygon(poly, fill=fill)

        rim = tuple(min(255, c + 22) for c in glass_base)
        wline = max(1, min(4, size // 180))
        draw.polygon(poly, outline=(*rim, min(alpha + 55, 255)), width=wline)

    # Subtle vignette for depth
    v = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    vd = ImageDraw.Draw(v)
    vd.ellipse(
        (-size * 0.2, -size * 0.2, size * 1.2, size * 1.2),
        outline=(0, 20, 45, 90),
        width=size // 6,
    )
    v = v.filter(ImageFilter.GaussianBlur(radius=size // 20))
    im.alpha_composite(v)

    return im


def resize(img: Image.Image, s: int) -> Image.Image:
    return img.resize((s, s), Image.Resampling.LANCZOS)


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    master = draw_planes_layer(MASTER, safe_inset=0.06)
    # Maskable: extra inset so squircle masks don’t clip wings
    mask_master = draw_planes_layer(MASTER, safe_inset=0.14)

    out = [
        ("icon-512.png", resize(master, 512)),
        ("icon-192.png", resize(master, 192)),
        ("apple-touch-icon.png", resize(master, 180)),
        ("favicon-32.png", resize(master, 32)),
        ("maskable-512.png", resize(mask_master, 512)),
    ]
    for name, im in out:
        path = ICONS / name
        im.save(path, "PNG", optimize=True)
        print("Wrote", path)


if __name__ == "__main__":
    main()
