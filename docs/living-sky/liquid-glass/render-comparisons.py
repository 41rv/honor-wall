"""Comparison sheets made only from real, unmodified Chromium captures.
Original full-page screenshots remain alongside the sheets.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).parent
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 17)
labels = [('day', 'النهار — 13:00'), ('sunset', 'الغروب — 17:00'), ('night', 'الليل — 23:00')]
for scene, title in labels:
    width, height, gap, header = 312, 675, 16, 42
    canvas = Image.new('RGB', (4 * width + 5 * gap, height + header + 2 * gap), '#e9eeeb')
    draw = ImageDraw.Draw(canvas)
    for i, (theme, stage) in enumerate([('light', 'before'), ('light', 'after'), ('dark', 'before'), ('dark', 'after')]):
        source = Image.open(root / f'{stage}-{scene}-{theme}-390.png').convert('RGB')
        thumb = source.crop((0, 0, 390, 844)).resize((width, height), Image.Resampling.LANCZOS)
        x = gap + i * (width + gap)
        text = f'{"قبل" if stage == "before" else "بعد"} | {"فاتح" if theme == "light" else "داكن"} | {title}'
        draw.text((x + width, gap + 11), text, font=font, fill='#253e36', anchor='ra', direction='rtl', language='ar')
        canvas.paste(thumb, (x, gap + header))
    canvas.save(root / f'comparison-{scene}.png')

width, height, gap, header = 354, 227, 16, 36
canvas = Image.new('RGB', (2 * width + 3 * gap, 6 * (height + header + gap) + gap), '#e9eeeb')
draw = ImageDraw.Draw(canvas)
for row, (scene, title, theme) in enumerate((scene, title, theme) for scene, title in labels for theme in ['light', 'dark']):
    for col, stage in enumerate(['before', 'after']):
        source = Image.open(root / f'{stage}-{scene}-{theme}-card.png').convert('RGB')
        x, y = gap + col * (width + gap), gap + row * (height + header + gap)
        text = f'{"قبل" if stage == "before" else "بعد"} | {"فاتح" if theme == "light" else "داكن"} | {title}'
        draw.text((x + width, y + 10), text, font=font, fill='#253e36', anchor='ra', direction='rtl', language='ar')
        canvas.paste(source, (x, y + header))
canvas.save(root / 'comparison-cards.png')
print('Created 3 viewport sheets and 1 card detail sheet; source screenshots unchanged.')
