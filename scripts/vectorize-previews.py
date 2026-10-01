"""Trace actual README screenshots into self-contained SVG color-region paths.

Requires Pillow 12.3.0. Run from any directory: python scripts/vectorize-previews.py
The source JPEGs are retained so the conversion remains reproducible.
"""

from collections import defaultdict
from hashlib import sha256
from pathlib import Path
from xml.sax.saxutils import escape
import json

from PIL import Image, __version__ as pillow_version


PROJECT = Path(__file__).resolve().parents[1]
CHANNEL_BITS = 6
PREVIEWS = {
    "preview-launch": "火箭发射控制实际游戏截图",
    "preview-module-listen": "结构探索与模块讲解实际游戏截图",
    "preview-assembly": "火箭组装工坊实际游戏截图",
}


def color_regions(image):
    """Merge equal-color horizontal runs vertically without moving boundaries."""
    width, height = image.size
    pixels = list(image.get_flattened_data())
    regions = defaultdict(list)
    active = {}
    for y in range(height):
        row = pixels[y * width : (y + 1) * width]
        current = {}
        x = 0
        while x < width:
            left = x
            color = row[x]
            x += 1
            while x < width and row[x] == color:
                x += 1
            key = (left, x, color)
            previous = active.pop(key, None)
            current[key] = (previous[0], previous[1] + 1) if previous else (y, 1)
        for (left, right, color), (top, rect_height) in active.items():
            regions[color].append((left, top, right - left, rect_height))
        active = current
    for (left, right, color), (top, rect_height) in active.items():
        regions[color].append((left, top, right - left, rect_height))
    return regions


def region_path(rectangles):
    """Closed vector subpaths; relative moves reduce bytes without losing detail."""
    chunks = []
    previous_x = previous_y = 0
    for x, y, width, height in sorted(rectangles, key=lambda rect: (rect[1], rect[0])):
        absolute = f"M{x} {y}"
        relative = f"m{x - previous_x} {y - previous_y}"
        move = min((absolute, relative), key=len) if chunks else absolute
        chunks.append(f"{move}h{width}v{height}h{-width}z")
        previous_x, previous_y = x, y
    return "".join(chunks)


def vectorize(name, title):
    source = PROJECT / "docs" / f"{name}.jpg"
    target = source.with_suffix(".svg")
    with Image.open(source) as raw:
        original = raw.convert("RGB")
    width, height = original.size
    levels = (1 << CHANNEL_BITS) - 1
    # Round each RGB channel to its nearest level. At 6 bits the maximum
    # difference is 2/255; preserve text and geometry at the source pixel grid.
    lut = [
        ((value * levels + 127) // 255 * 255 + levels // 2) // levels
        for value in range(256)
    ]
    regions = color_regions(original.point(lut * 3))
    metadata = {
        "source": source.relative_to(PROJECT).as_posix(),
        "source_sha256": sha256(source.read_bytes()).hexdigest(),
        "generator": "scripts/vectorize-previews.py",
        "pillow_version": pillow_version,
        "method": "6-bit RGB region tracing; merged runs; vector paths only",
        "channel_bits": CHANNEL_BITS,
        "max_channel_error": max(abs(i - value) for i, value in enumerate(lut)),
        "source_width": width,
        "source_height": height,
    }
    description = (
        f"由 {source.name} 的实际浏览器截图直接矢量化。"
        "按颜色区域合并生成路径，保留原截图构图、界面和字形，"
        "不嵌入位图、不依赖字体；细节精度受原截图分辨率限制。"
    )
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" shape-rendering="crispEdges" '
        'role="img" aria-labelledby="title desc">',
        f'<title id="title">{escape(title)}（矢量化）</title>',
        f'<desc id="desc">{escape(description)}</desc>',
        f"<metadata>{escape(json.dumps(metadata, ensure_ascii=False, sort_keys=True))}</metadata>",
    ]
    for color, rectangles in sorted(regions.items()):
        fill = "#%02x%02x%02x" % color
        lines.append(f'<path fill="{fill}" d="{region_path(rectangles)}"/>')
    lines.append("</svg>")
    target.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({
        "file": target.relative_to(PROJECT).as_posix(),
        "dimensions": [width, height],
        "bytes": target.stat().st_size,
        "paths": len(regions),
        "source_sha256": metadata["source_sha256"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    for preview_name, preview_title in PREVIEWS.items():
        vectorize(preview_name, preview_title)
