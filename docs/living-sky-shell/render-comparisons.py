"""Arrange real browser captures; retain all original full-page PNGs."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).parent
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 16)
pages = [('home','الرئيسية'),('projects','المشاريع'),('tasks','المهام'),('ideas','الأفكار'),('progress','التقدم')]
for width in [320,390]:
    for theme in ['light','dark']:
        w, h, gap, label = 234, round(844*234/width), 14, 38
        sheet = Image.new('RGB',(5*w+6*gap,h+label+2*gap),'#e9eeeb')
        draw = ImageDraw.Draw(sheet)
        for i,(route,name) in enumerate(pages):
            source = Image.open(root/f'after-{route}-{theme}-{width}.png').convert('RGB')
            source = source.crop((0,0,width,844)).resize((w,h),Image.Resampling.LANCZOS)
            x = gap+i*(w+gap)
            draw.text((x+w,gap+10),name,font=font,fill='#253e36',anchor='ra',direction='rtl',language='ar')
            sheet.paste(source,(x,gap+label))
        sheet.save(root/f'overview-{theme}-{width}.png')
        strip_h = 250
        comparison = Image.new('RGB',(2*width+3*gap,strip_h+label+2*gap),'#e9eeeb')
        draw = ImageDraw.Draw(comparison)
        for i,stage in enumerate(['before','after']):
            source=Image.open(root/f'{stage}-home-{theme}-{width}.png').convert('RGB')
            source=source.crop((0,844-strip_h,width,844))
            x=gap+i*(width+gap)
            draw.text((x+width,gap+10),'قبل' if stage=='before' else 'بعد',font=font,fill='#253e36',anchor='ra',direction='rtl',language='ar')
            comparison.paste(source,(x,gap+label))
        comparison.save(root/f'fab-before-after-{theme}-{width}.png')
print('Saved four 5-page overview sheets and four FAB comparisons from real PNGs.')
