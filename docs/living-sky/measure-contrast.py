"""Sample the real rendered background with target text temporarily hidden.
The visible proof screenshots are captured separately and are never altered.
"""
import json, math, sys
from PIL import Image
image=Image.open(sys.argv[1]).convert('RGB')
rows=json.load(open(sys.argv[2]))
def luminance(rgb):
    values=[c/255 for c in rgb]
    values=[c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in values]
    return sum(a*b for a,b in zip(values,[.2126,.7152,.0722]))
for row in rows:
    ink=luminance(row['rgb'])
    x0,y0,x1,y1=row['rect']
    values=[]
    for x in [x0+(x1-x0)*i/8 for i in range(1,8)]:
        for y in [y0+(y1-y0)*i/6 for i in range(1,6)]:
            rgb=image.getpixel((min(image.width-1,round(x)),min(image.height-1,round(y))))
            bg=luminance(rgb)
            values.append((max(ink,bg)+.05)/(min(ink,bg)+.05))
    row['minimum_ratio']=round(min(values),3)
    row['passes']=row['minimum_ratio']>=row['required']
print(json.dumps(rows,ensure_ascii=False))
