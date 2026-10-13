# Draw the Forte app icon (standing waves over a keyboard) as PNGs.
# Usage: python3 tools/make-icons.py      → icons/*.png   (needs numpy)

import numpy as np, zlib, struct, pathlib

ACCENTS = ['#5aa9ff', '#f0b35a', '#ef5a4a', '#ff8a3d', '#b18cff']
rgb = lambda h: np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float) / 255

def icon(N, ss=3):
    M = N * ss
    y, x = np.mgrid[0:M, 0:M] / M                      # 0..1, y down
    img = np.zeros((M, M, 3)) + rgb('#0b0b0e')
    glow = np.exp(-((x - 0.5) ** 2 + (y - 0.38) ** 2) / 0.18)
    img += 0.10 * glow[..., None] * rgb('#f0b35a')
    # keyboard: bottom 30 %
    top = 0.70
    keys = y > top
    white = keys & ((x * 7 % 1) > 0.035)
    img[keys] = rgb('#16161c')
    img[white] = rgb('#ece9e3')
    for i in range(7):                                  # black keys after C, D, F, G, A
        if i in (2, 6): continue
        bx = (i + 1) / 7
        blk = (y > top) & (y < top + 0.17) & (abs(x - bx) < 0.045)
        img[blk] = rgb('#16161c')
    # standing waves: modes 1–5 of a string spanning the icon
    for n, col in enumerate(ACCENTS, start=1):
        amp = 0.17 / n ** 0.7
        yc = 0.38 + amp * np.sin(np.pi * n * x) * (1 if n % 2 else -1) * 0.95
        d = np.abs(y - yc) / np.sqrt(1 + (amp * np.pi * n * np.cos(np.pi * n * x)) ** 2)
        a = np.clip(1 - (d - 0.006) / 0.006, 0, 1) * (y < top - 0.02)
        img = img * (1 - 0.95 * a[..., None]) + 0.95 * a[..., None] * rgb(col)
    img = img.reshape(N, ss, N, ss, 3).mean(axis=(1, 3))
    return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)

def png(path, a):
    h, w, _ = a.shape
    raw = b''.join(b'\x00' + a[i].tobytes() for i in range(h))
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

out = pathlib.Path(__file__).resolve().parent.parent / 'icons'
out.mkdir(exist_ok=True)
for name, n in [('icon-512.png', 512), ('icon-192.png', 192), ('apple-touch-icon.png', 180), ('favicon-32.png', 32)]:
    png(out / name, icon(n))
    print(f'icons/{name}')
