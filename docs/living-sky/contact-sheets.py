"""Contact sheets of real browser screenshots. Only crop/scale for comparison;
full, unmodified page captures remain next to these sheets.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, features
root=Path(__file__).parent
scenes=[('dawn','الفجر','06:00'),('morning','الصباح','09:00'),('noon','الظهيرة','13:00'),('sunset','الغروب','17:00'),('night','الليل','23:00')]
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',15)
rtl=features.check('raqm')
width,height,gap,label=234,506,14,38
for blur in [0,12,30]:
    canvas=Image.new('RGB',(5*width+6*gap,2*(height+label)+3*gap),'#e9eeeb')
    draw=ImageDraw.Draw(canvas)
    for row,theme in enumerate(['light','dark']):
        for col,(name,arabic,time) in enumerate(scenes):
            source=Image.open(root/f'{name}-{theme}-blur-{blur}-390.png').convert('RGB')
            thumb=source.crop((0,0,390,844)).resize((width,height),Image.Resampling.LANCZOS)
            x=gap+col*(width+gap); y=gap+row*(height+label+gap)
            if rtl:
                text=f'{arabic} {time} | {"فاتح" if theme=="light" else "داكن"} | {blur}'
                draw.text((x+width,y+8),text,font=font,fill='#253e36',anchor='ra',direction='rtl',language='ar')
            else:
                draw.text((x,y+8),f'{name} {time} / {theme} / {blur}',font=font,fill='#253e36')
            canvas.paste(thumb,(x,y+label))
    canvas.save(root/f'overview-blur-{blur}.png')
print('Created three contact sheets from 30 genuine browser captures; originals unchanged.')
