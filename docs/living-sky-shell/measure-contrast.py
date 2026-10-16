"""Contrast against the real painted background; include inherited opacity.
The diagnostic capture hides only measured ink, never proof screenshots.
"""
import json, sys
from PIL import Image

image = Image.open(sys.argv[1]).convert('RGB')
rows = json.load(open(sys.argv[2]))
def luminance(rgb):
    channels = [c / 255 for c in rgb]
    channels = [c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in channels]
    return sum(a * b for a, b in zip(channels, [.2126, .7152, .0722]))
measured = []
for row in rows:
    x0, y0, x1, y1 = row['rect']
    ratios = []
    for x in [x0 + (x1 - x0) * i / 8 for i in range(1, 8)]:
        for y in [y0 + (y1 - y0) * i / 6 for i in range(1, 6)]:
            # Ink covered by a floating button/toast is not visible text.
            # Its reachability is independently tested by scrolling/focus.
            if any(a <= x <= c and b <= y <= d for a,b,c,d in row.get('occluded', [])):
                continue
            bg = image.getpixel((min(image.width - 1, round(x)), min(image.height - 1, round(y))))
            ink = [a * row['alpha'] + b * (1 - row['alpha']) for a, b in zip(row['rgb'], bg)]
            a, b = luminance(ink), luminance(bg)
            ratios.append((max(a, b) + .05) / (min(a, b) + .05))
    if not ratios:
        continue
    row['sampled_points'] = len(ratios)
    row['minimum_ratio'] = round(min(ratios), 3)
    row['passes'] = row['minimum_ratio'] >= row['required']
    measured.append(row)
print(json.dumps(measured, ensure_ascii=False))
