"""Place original browser captures side by side without rescaling them."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
root = Path(__file__).parent
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 18)
for width in [320,390]:
 for theme in ['light','dark']:
  for name in ['progress','task','task-options','project','step','menu']:
   before = Image.open(root/f'before-{name}-{theme}-{width}.png').convert('RGB')
   after = Image.open(root/f'after-{name}-{theme}-{width}.png').convert('RGB')
   assert before.size == after.size
   w,h=before.size
   out=Image.new('RGB',(w*2+8,h+40),'#e3eae5')
   draw=ImageDraw.Draw(out)
   draw.text((w/2,19),'قبل',font=font,fill='#253e36',anchor='mm',direction='rtl')
   draw.text((w*1.5+8,19),'بعد',font=font,fill='#253e36',anchor='mm',direction='rtl')
   out.paste(before,(0,40));out.paste(after,(w+8,40))
   out.save(root/f'compare-{name}-{theme}-{width}.png')
print('24 comparisons created; original screenshots preserved')
