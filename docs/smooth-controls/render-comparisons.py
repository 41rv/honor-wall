"""Arrange original Chromium screenshots; never regenerate UI images."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).parent
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 17)
for width in [320, 390, 768, 1366]:
    for theme in ['light', 'dark']:
        for detail in [False, True]:
            top = 630 if detail and width < 761 else (580 if detail else 0)
            height = 844 - top
            sheet = Image.new('RGB', (width * 2 + 42, height + 64), '#e9eeeb')
            draw = ImageDraw.Draw(sheet)
            for i, stage in enumerate(['before', 'after']):
                source = Image.open(root / f'{stage}-{theme}-{width}.png').convert('RGB')
                source = source.crop((0, top, width, 844))
                x = 14 + i * (width + 14)
                draw.text((x + width, 20), 'قبل' if stage == 'before' else 'بعد',
                          font=font, fill='#253e36', anchor='ra', direction='rtl', language='ar')
                sheet.paste(source, (x, 50))
            name = 'controls' if detail else 'page'
            sheet.save(root / f'compare-{name}-{theme}-{width}.png')
print('Saved 16 comparison sheets. Originals unchanged.')
