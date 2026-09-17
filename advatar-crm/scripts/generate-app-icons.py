#!/usr/bin/env python3
"""Builds the home-screen and browser-tab icons from the Advatar "A" mark.

    pip install Pillow
    python3 scripts/generate-app-icons.py

Run it again after replacing public/logo-mark-dark.png; the outputs are
committed so a deploy never depends on this having been run.

Two things drive the design:

  * The source marks are flat-backed, not transparent cut-outs (see the
    note in components/Logo.tsx). So the glyph is isolated by
    differencing against the corner pixel rather than by an alpha
    channel, then re-composited onto a square of the brand's dark ink.

  * iOS does not swap an app icon by theme, so one look has to work on
    any wallpaper. The dark backdrop is the safer of the two: a white
    tile disappears into a light home screen, and the mark's metallic
    fill was drawn for a dark ground anyway.

Android's maskable icons are crops of whatever shape the launcher
prefers — circle, squircle, teardrop — and only the middle 80% of the
image is guaranteed to survive. Those get their own, smaller, glyph.
"""

import pathlib
import sys

try:
    from PIL import Image, ImageChops
except ImportError:  # pragma: no cover - a developer aid, not app code
    sys.exit("Pillow is needed: pip install Pillow")

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "public" / "logo-mark-dark.png"

# The brand's dark ink — the same value the dark-theme logo files were
# backed with, so the mark sits on the ground it was drawn for.
INK = (24, 24, 24)

# Fraction of the tile's width the glyph spans. 0.62 is the usual
# feel for an iOS icon; the maskable one pulls in well inside the 80%
# safe zone so a circular crop never clips the A's feet.
STANDARD_SCALE = 0.62
MASKABLE_SCALE = 0.50

STANDARD_SIZES = [180, 192, 256, 384, 512]
MASKABLE_SIZES = [192, 512]


def isolate_glyph(path: pathlib.Path) -> Image.Image:
    """The mark, cropped to its ink and carrying an alpha channel."""
    im = Image.open(path).convert("RGB")
    backdrop = Image.new("RGB", im.size, im.getpixel((0, 0)))

    # Anything meaningfully different from the flat backdrop is glyph.
    # The threshold is low because the backdrop really is flat; it only
    # exists to absorb PNG quantisation noise.
    mask = ImageChops.difference(im, backdrop).convert("L").point(lambda p: 255 if p > 12 else 0)

    box = mask.getbbox()
    if box is None:
        sys.exit(f"{path.name}: could not find the mark against its backdrop")

    glyph = im.convert("RGBA")
    glyph.putalpha(mask)
    return glyph.crop(box)


def render(glyph: Image.Image, size: int, scale: float) -> Image.Image:
    tile = Image.new("RGBA", (size, size), INK + (255,))

    target = round(size * scale)
    ratio = min(target / glyph.width, target / glyph.height)
    drawn = glyph.resize(
        (max(1, round(glyph.width * ratio)), max(1, round(glyph.height * ratio))),
        Image.LANCZOS,
    )

    tile.alpha_composite(drawn, ((size - drawn.width) // 2, (size - drawn.height) // 2))
    return tile


def main() -> None:
    glyph = isolate_glyph(SOURCE)

    icons = ROOT / "public" / "icons"
    icons.mkdir(parents=True, exist_ok=True)

    written = []

    for size in STANDARD_SIZES:
        out = icons / f"icon-{size}.png"
        render(glyph, size, STANDARD_SCALE).save(out)
        written.append(out)

    for size in MASKABLE_SIZES:
        out = icons / f"maskable-{size}.png"
        render(glyph, size, MASKABLE_SCALE).save(out)
        written.append(out)

    # Next.js picks these up by filename: app/icon.png becomes the tab
    # icon, app/apple-icon.png the iOS home-screen icon, both with the
    # right <link> tags emitted for us.
    render(glyph, 512, STANDARD_SCALE).save(ROOT / "app" / "icon.png")
    render(glyph, 180, STANDARD_SCALE).save(ROOT / "app" / "apple-icon.png")
    written += [ROOT / "app" / "icon.png", ROOT / "app" / "apple-icon.png"]

    for path in written:
        print(f"{path.relative_to(ROOT)}  {path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
