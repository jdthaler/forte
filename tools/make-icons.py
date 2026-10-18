# Draw the Forte app icon (standing waves over a keyboard) as PNGs for the site, and the
# standalone apps' icons: the Forte app's, and each instrument's with its waves in its own colour
# (FORTE_ACCENT in native/instruments/<slug>/<slug>-info.cmake), as .icns (macOS) and .ico
# (Windows). forte_add_plugin() and forte_add_suite() (native/cmake/forte.cmake) build them in.
# Usage: python3 tools/make-icons.py      → icons/*.png, native/icons/*.icns|ico
#                                            (needs numpy and Pillow; run it again for a new port)

import io, numpy as np, zlib, struct, pathlib, re

ACCENTS = ['#5aa9ff', '#f0b35a', '#ef5a4a', '#ff8a3d', '#b18cff']
rgb = lambda h: np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float) / 255

def icon(N, ss=3, accents=ACCENTS, glowing='#f0b35a'):
    M = N * ss
    y, x = np.mgrid[0:M, 0:M] / M                      # 0..1, y down
    img = np.zeros((M, M, 3)) + rgb('#0b0b0e')
    glow = np.exp(-((x - 0.5) ** 2 + (y - 0.38) ** 2) / 0.18)
    img += 0.10 * glow[..., None] * rgb(glowing)
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
    for n, col in enumerate(accents, start=1):
        amp = 0.17 / n ** 0.7
        yc = 0.38 + amp * np.sin(np.pi * n * x) * (1 if n % 2 else -1) * 0.95
        d = np.abs(y - yc) / np.sqrt(1 + (amp * np.pi * n * np.cos(np.pi * n * x)) ** 2)
        a = np.clip(1 - (d - 0.006) / 0.006, 0, 1) * (y < top - 0.02)
        img = img * (1 - 0.95 * a[..., None]) + 0.95 * a[..., None] * (rgb(col) if isinstance(col, str) else col)
    img = img.reshape(N, ss, N, ss, 3).mean(axis=(1, 3))
    return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)

def png(path, a):
    h, w, _ = a.shape
    raw = b''.join(b'\x00' + a[i].tobytes() for i in range(h))
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

# An instrument's waves: its colour, from lighter for the low modes to itself for the high ones
def shades(accent):
    c = rgb(accent)
    return [c + (1 - c) * t for t in (0.55, 0.38, 0.22, 0.1, 0)]

# A small PNG (a palette of 256 colours) for the apps' icon files
def small_png(a):
    from PIL import Image
    b = io.BytesIO()
    Image.fromarray(a).quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(b, 'PNG', optimize=True)
    return b.getvalue()

def app_icons(path, draw):
    p = {n: small_png(draw(n)) for n in (16, 32, 48, 64, 128, 256, 512)}
    # .icns: each size as a PNG, under the type macOS reads it as (the @2x ones reuse a size)
    kinds = [(b'icp4', 16), (b'icp5', 32), (b'icp6', 64), (b'ic07', 128), (b'ic08', 256), (b'ic09', 512),
             (b'ic11', 32), (b'ic12', 64), (b'ic13', 256), (b'ic14', 512)]
    body = b''.join(k + struct.pack('>I', 8 + len(p[n])) + p[n] for k, n in kinds)
    path.with_suffix('.icns').write_bytes(b'icns' + struct.pack('>I', 8 + len(body)) + body)
    # .ico: PNGs too (Windows Vista on), 16 to 256 pixels
    sizes = (16, 32, 48, 256)
    head = struct.pack('<HHH', 0, 1, len(sizes))
    at, dirs, data = 6 + 16 * len(sizes), b'', b''
    for n in sizes:
        dirs += struct.pack('<BBBBHHII', n % 256, n % 256, 0, 0, 1, 32, len(p[n]), at + len(data))
        data += p[n]
    path.with_suffix('.ico').write_bytes(head + dirs + data)

root = pathlib.Path(__file__).resolve().parent.parent
out = root / 'icons'
out.mkdir(exist_ok=True)
for name, n in [('icon-512.png', 512), ('icon-192.png', 192), ('apple-touch-icon.png', 180), ('favicon-32.png', 32)]:
    png(out / name, icon(n))
    print(f'icons/{name}')

apps = root / 'native' / 'icons'
apps.mkdir(exist_ok=True)
app_icons(apps / 'forte', icon)
print('native/icons/forte.icns, .ico')
for info in sorted((root / 'native' / 'instruments').glob('*/*-info.cmake')):
    slug = info.parent.name
    accent = re.search(r'set\(FORTE_ACCENT "(#[0-9a-fA-F]{6})"\)', info.read_text()).group(1)
    app_icons(apps / slug, lambda n: icon(n, accents=shades(accent), glowing=accent))
    print(f'native/icons/{slug}.icns, .ico')
