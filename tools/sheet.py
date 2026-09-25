# Contact sheet: python3 tools/sheet.py out.png cols img1 img2 ...
import sys
from PIL import Image, ImageDraw
out, cols, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
ims = [Image.open(f).convert('RGB') for f in files]
w, h = ims[0].size
tw = 640; th = int(h * tw / w)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw, rows * th), (0, 0, 0))
for i, (im, f) in enumerate(zip(ims, files)):
    im = im.resize((tw, th), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    d.text((8, 6), f.split('/')[-1], fill=(255, 255, 255))
    sheet.paste(im, ((i % cols) * tw, (i // cols) * th))
sheet.save(out)
