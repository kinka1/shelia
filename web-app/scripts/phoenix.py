"""Source of public/phoenix.svg (run: python3 scripts/phoenix.py <out-dir>). Phoenix v5: a rising phoenix built from flame tongues, detailed, transparent background.

Anatomy: head in profile (hooked beak, eye with stripe, crest plumes), S-neck with hackles,
scaled breast; each wing = arm band + primaries fanned from the wrist + secondaries along the
arm + primary/greater/lesser coverts; long tail streamers that sweep out and curl like flames.
Fire colouring: hot gold at the body, orange, red, crimson at the tips.
"""
import math, sys

X0 = 515          # wing / tail mirror axis
PTS = []          # every outline point, for the auto-fit viewBox

def r(v): return f"{v:.0f}"

def spline(pts):
    """Catmull-Rom through pts as cubic Béziers (no leading M)."""
    out, n = [], len(pts)
    for i in range(n - 1):
        p0 = pts[i - 1] if i > 0 else pts[i]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[i + 2] if i + 2 < n else pts[i + 1]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        out.append(f"C{r(c1[0])} {r(c1[1])} {r(c2[0])} {r(c2[1])} {r(p2[0])} {r(p2[1])}")
    return " ".join(out)

def closed(pts):
    PTS.extend(pts)
    n = len(pts)
    seg = [f"M{r(pts[0][0])} {r(pts[0][1])}"]
    for i in range(n):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        seg.append(f"C{r(c1[0])} {r(c1[1])} {r(c2[0])} {r(c2[1])} {r(p2[0])} {r(p2[1])}")
    return " ".join(seg) + "Z"

def turtle(root, ang, length, bend, curl, n):
    """Centreline: gentle bend along the length, curl packed into the tip (radians)."""
    a = math.radians(ang); x, y = root; ds = length / n
    pts, angs = [(x, y)], [a]
    for i in range(n):
        t = (i + 0.5) / n
        a += (bend + curl * 4 * t ** 3) / n
        x += math.cos(a) * ds; y += math.sin(a) * ds
        pts.append((x, y)); angs.append(a)
    return pts, angs

def prof(t, p=0.9, q=2.6):
    m = max((1 - s / 100) ** p * (1 + q * s / 100) for s in range(101))
    return (1 - t) ** p * (1 + q * t) / m

def tongue(root, ang, length, w, bend=0.0, curl=0.0, asym=0.0, n=14, p=0.9, q=2.6):
    """A flame tongue / feather: round base, swell near a third, sharp curling tip."""
    pts, angs = turtle(root, ang, length, bend, curl, n)
    L, R = [], []
    for i, ((x, y), a) in enumerate(zip(pts, angs)):
        t = i / n
        ww = w * prof(t, p, q)
        nx, ny = -math.sin(a), math.cos(a)
        k = asym * math.sin(math.pi * t)
        L.append((x + nx * ww * (1 + k), y + ny * ww * (1 + k)))
        R.append((x - nx * ww * (1 - k), y - ny * ww * (1 - k)))
    PTS.extend(L + R)
    a0 = angs[0]; dx, dy = math.cos(a0) * w * 0.9, math.sin(a0) * w * 0.9
    l0, r0 = L[0], R[0]
    cap = f"C{r(r0[0] - dx)} {r(r0[1] - dy)} {r(l0[0] - dx)} {r(l0[1] - dy)} {r(l0[0])} {r(l0[1])}"
    d = f"M{r(l0[0])} {r(l0[1])} " + spline(L) + " " + spline(R[::-1]) + " " + cap + "Z"
    shaft = pts[1:int(n * 0.72)]
    return d, shaft

def mir_pt(p): return (2 * X0 - p[0], p[1])
def mir(spec):
    """Mirror a tongue spec (root, ang, length, w, bend, curl, ...) across the axis."""
    root, ang, length, w, bend, curl, *rest = spec
    return (mir_pt(root), 180 - ang, length, w, -bend, -curl, *rest)

# ------------------------------------------------------------------ layers (back to front)
LAYERS = []   # (fill, stroke, [path d], shafts)

def add(fill, specs, stroke='#7A0B22', sw=3, shafts=False, asym=0.0, n=14, p=0.9, q=2.6):
    ds, sh = [], []
    for s in specs:
        d, shaft = tongue(*s, asym=asym, n=n, p=p, q=q) if len(s) == 6 else tongue(*s, n=n, p=p, q=q)
        ds.append(d)
        if shafts: sh.append(shaft)
    LAYERS.append((fill, stroke, sw, ds, sh))

def both(specs): return specs + [mir(s) for s in specs]

# ---- tail: streamers sweep out from the tail base, then curl up like flames
TAIL_BACK = [
    ((505, 596), 104, 400, 34, 0.55, -1.25),
    ((498, 592), 124, 345, 30, 0.60, -1.20),
    ((492, 588), 146, 275, 25, 0.55, -1.05),
]
TAIL_BACK = TAIL_BACK + [mir(t) for t in TAIL_BACK] + [((515, 600), 90, 440, 36, 0.45, -1.3)]
TAIL_MID = [((508, 596), 97, 330, 22, 0.45, -1.1), ((500, 592), 114, 285, 20, 0.5, -1.05),
            ((494, 588), 134, 230, 18, 0.5, -1.0)]
TAIL_MID = TAIL_MID + [mir(t) for t in TAIL_MID]
TAIL_FRONT = [((515, 588), 90, 215, 26, 0.35, -0.95), ((503, 584), 110, 180, 22, 0.4, -0.9),
              ((527, 584), 70, 180, 22, -0.4, 0.9)]

# ---- wings (left defined, right mirrored)
PRIMARIES = [  # fanned from the hand: nearly straight up to straight out; tips flick upward
    ((300, 228), -92, 340, 32, -0.35, 1.3),
    ((287, 224), -107, 375, 34, -0.35, 1.3),
    ((275, 222), -122, 390, 35, -0.35, 1.3),
    ((265, 224), -138, 375, 34, -0.32, 1.2),
    ((257, 229), -154, 345, 32, -0.30, 1.1),
    ((252, 237), -170, 305, 29, -0.26, 1.0),
    ((252, 247), 175, 255, 26, -0.22, 0.9),
]
SECONDARIES = [  # along the arm's trailing edge, pointing down-out, tips flick up-out
    ((290, 262), 168, 235, 30, 0.10, 0.75),
    ((318, 290), 158, 230, 30, 0.12, 0.70),
    ((346, 318), 148, 220, 30, 0.14, 0.65),
    ((374, 346), 138, 205, 29, 0.16, 0.60),
    ((402, 372), 128, 190, 28, 0.18, 0.55),
    ((430, 398), 118, 170, 27, 0.20, 0.50),
]
PRIMARY_COVERTS = [
    ((300, 238), -100, 150, 24, -0.2, 0.5),
    ((288, 236), -122, 160, 24, -0.2, 0.5),
    ((278, 238), -144, 150, 23, -0.2, 0.5),
    ((272, 246), -166, 135, 22, -0.2, 0.45),
    ((272, 256), 172, 115, 20, -0.15, 0.4),
]
GREATER_COVERTS = [
    ((300, 262), 160, 125, 24, 0.1, 0.5),
    ((326, 286), 150, 120, 24, 0.1, 0.5),
    ((352, 310), 140, 115, 23, 0.1, 0.45),
    ((378, 334), 130, 108, 23, 0.1, 0.45),
    ((404, 358), 120, 100, 22, 0.1, 0.4),
    ((430, 382), 110, 92, 21, 0.1, 0.4),
]
LESSER_COVERTS = [
    ((318, 258), 150, 70, 19, 0.0, 0.3),
    ((342, 280), 140, 68, 19, 0.0, 0.3),
    ((366, 302), 130, 66, 18, 0.0, 0.3),
    ((390, 324), 120, 62, 18, 0.0, 0.3),
    ((414, 346), 112, 58, 17, 0.0, 0.3),
    ((438, 368), 104, 54, 16, 0.0, 0.3),
]
def edge_pts():
    """Wing leading edge, wrist -> shoulder."""
    return [(250, 196), (290, 206), (338, 238), (388, 284), (432, 334), (470, 386)]

def covert_band(mirror=False):
    E = edge_pts()
    # resample the leading edge, then hang scalloped feather tips below it
    dense = []
    for i in range(len(E) - 1):
        for k in range(8):
            t = k / 8
            dense.append((E[i][0] + (E[i + 1][0] - E[i][0]) * t, E[i][1] + (E[i + 1][1] - E[i][1]) * t))
    dense.append(E[-1])
    n = len(dense) - 1
    lower = []
    tips = 7
    for j in range(tips * 2 + 1):
        u = j / (tips * 2)
        i = min(int(u * n), n - 1)
        (x1, y1), (x2, y2) = dense[i], dense[i + 1]
        l = math.hypot(x2 - x1, y2 - y1) or 1
        nx, ny = -(y2 - y1) / l, (x2 - x1) / l     # left normal of wrist->shoulder = toward the trailing edge
        if ny < 0: nx, ny = -nx, -ny
        h = 34 + 46 * u
        h *= 1.35 if j % 2 else 0.8                   # odd: feather tip, even: notch between tips
        sx = -0.35 * h if j % 2 else 0                 # tips lean toward the wrist, like real coverts
        lower.append((dense[i][0] + nx * h + sx, dense[i][1] + ny * h))
    pts = dense[::4] + lower[::-1]
    pts = [mir_pt(p) for p in pts] if mirror else pts
    PTS.extend(pts)
    up = pts[:len(dense[::4])]; lo = pts[len(dense[::4]):]
    d = f"M{r(up[0][0])} {r(up[0][1])} " + spline(up)
    for a, b in zip(lo, lo[1:]):
        d += f" Q{r((a[0] + b[0]) / 2 + 4)} {r((a[1] + b[1]) / 2 + 4)} {r(b[0])} {r(b[1])}"
    return d + "Z"

def band_mirror(): return covert_band(mirror=True)

MARGINAL = [((300 + 24 * i, 228 + 22 * i), 150 - 7 * i, 44, 13, 0.0, 0.3) for i in range(7)]
ARM = [(470, 380), (420, 318), (370, 268), (318, 222), (270, 196), (248, 200), (262, 228),
       (310, 262), (360, 300), (410, 344), (458, 396), (480, 410)]

# ---- head, neck, body (facing right)
BODY = [(548, 196), (586, 194), (612, 210), (618, 240), (606, 272), (596, 302), (610, 346),
        (622, 404), (614, 470), (588, 540), (550, 598), (515, 626), (488, 600), (458, 544),
        (438, 476), (436, 410), (454, 352), (494, 316), (520, 284), (526, 240)]
BEAK_UP = [(606, 206), (634, 206), (660, 216), (678, 234), (680, 254), (670, 242), (652, 236),
           (628, 236), (608, 234)]
BEAK_LO = [(612, 236), (636, 238), (654, 244), (640, 254), (620, 254), (608, 248)]
CREST = [  # plumes sweep back from the crown, then curl up and over
    ((560, 206), -150, 210, 22, -0.45, 1.9),
    ((548, 214), -165, 240, 22, -0.40, 1.8),
    ((540, 224), -178, 200, 20, -0.35, 1.7),
    ((572, 200), -128, 150, 18, -0.40, 1.6),
]
BREAST_FLAMES = [  # flames rising from the belly into the gold chest: the body burns
    ((515, 640), -90, 300, 30, 0.25, -0.9), ((470, 610), -84, 220, 24, -0.2, 0.8),
    ((560, 615), -96, 240, 24, 0.2, -0.8), ((440, 560), -78, 150, 18, -0.2, 0.7),
    ((600, 560), -100, 170, 18, 0.2, -0.7),
]
HACKLES = [  # mane down the back of the neck
    ((540, 250), 165, 110, 20, 0.2, 0.9),
    ((530, 280), 155, 115, 21, 0.2, 0.9),
    ((518, 310), 145, 115, 21, 0.2, 0.85),
    ((502, 338), 135, 105, 20, 0.2, 0.8),
]
EMBERS = [  # loose flames rising around the bird
    ((150, 130), -100, 70, 13, 0.0, 0.6), ((880, 120), -80, 60, 12, 0.0, -0.6),
    ((95, 330), -95, 55, 11, 0.0, 0.5), ((935, 310), -85, 50, 10, 0.0, -0.5),
    ((330, 905), -100, 60, 12, 0.0, 0.5), ((705, 915), -80, 55, 11, 0.0, -0.5),
    ((410, 80), -95, 45, 9, 0.0, 0.4),
]

def build():
    PTS.clear(); LAYERS.clear()
    add('url(#deep)', TAIL_BACK, shafts=True, asym=0.25, n=20)
    add('url(#mid)', TAIL_MID, asym=0.25, n=18)
    add('url(#hot)', TAIL_FRONT, asym=0.25, n=16)
    add('url(#deep)', both(PRIMARIES[::-1]), shafts=True, asym=0.15)
    add('url(#mid)', both(SECONDARIES), shafts=True, asym=0.15)
    add('url(#mid)', both(PRIMARY_COVERTS[::-1]), asym=0.1)
    add('url(#hot)', both(GREATER_COVERTS), asym=0.1)
    band = covert_band()
    LAYERS.append(('url(#hot)', '#7A0B22', 3, [band, band_mirror()], []))
    add('url(#mid)', CREST, shafts=True, asym=0.2)
    add('url(#mid)', HACKLES, asym=0.2)
    LAYERS.append(('url(#hot)', '#7A0B22', 3, [closed(BODY)], []))
    LAYERS.append(('#FFD45C', '#7A0B22', 3, [closed(BEAK_LO), closed(BEAK_UP)], []))

    xs = [p[0] for p in PTS]; ys = [p[1] for p in PTS]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    side = max(x1 - x0, y1 - y0) + 16
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    vb = f"{r(cx - side / 2)} {r(cy - side / 2)} {r(side)} {r(side)}"

    out = []
    for fill, stroke, sw, ds, sh in LAYERS:
        st = f' stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round"' if stroke != 'none' else ''
        out.append(f'<g fill="{fill}"{st}>' + "".join(f'<path d="{d}"/>' for d in ds) + '</g>')
        if sh:
            out.append('<g fill="none" stroke="#FFE7A3" stroke-opacity=".6" stroke-width="3" stroke-linecap="round">'
                       + "".join(f'<path d="M{r(s[0][0])} {r(s[0][1])} ' + spline(s) + '"/>' for s in sh) + '</g>')
    # breast scales, clipped to the body
    glow = [tongue(*g, asym=0.2)[0] for g in BREAST_FLAMES]
    out.append('<g clip-path="url(#body)" fill="#FF8A1F" fill-opacity=".55">' + "".join(f'<path d="{d}"/>' for d in glow) + '</g>')
    # eye: gold ring, dark pupil, light glint; dark stripe sweeping back
    out.append('<path d="M592 226 C574 228 556 236 538 250 C560 246 576 244 590 240Z" fill="#7A0B22"/>')
    out.append('<path d="M578 228 C586 216 604 214 614 224 C604 234 588 236 578 228Z" fill="#FFE27A" stroke="#7A0B22" stroke-width="3"/>'
               '<circle cx="598" cy="225" r="6" fill="#2A0610"/><circle cx="600" cy="223" r="2" fill="#fff"/>')
    out.append('<path d="M570 214 C586 204 604 204 618 214" fill="none" stroke="#7A0B22" stroke-width="5" stroke-linecap="round"/>')
    out.append('<path d="M610 234 C628 236 646 240 664 246" fill="none" stroke="#7A0B22" stroke-width="3" stroke-linecap="round"/>')
    return vb, "\n  ".join(out)

DEFS = f"""<defs>
  <radialGradient id="hot" gradientUnits="userSpaceOnUse" cx="{X0}" cy="400" r="420">
    <stop offset="0" stop-color="#FFF4C4"/><stop offset=".3" stop-color="#FFD24A"/>
    <stop offset=".6" stop-color="#FFA126"/><stop offset=".85" stop-color="#FF6A1F"/><stop offset="1" stop-color="#E8381E"/>
  </radialGradient>
  <radialGradient id="mid" gradientUnits="userSpaceOnUse" cx="{X0}" cy="400" r="520">
    <stop offset="0" stop-color="#FFE08A"/><stop offset=".3" stop-color="#FFB536"/>
    <stop offset=".55" stop-color="#FF7A1F"/><stop offset=".8" stop-color="#EE3D22"/><stop offset="1" stop-color="#C2162E"/>
  </radialGradient>
  <radialGradient id="deep" gradientUnits="userSpaceOnUse" cx="{X0}" cy="420" r="560">
    <stop offset="0" stop-color="#FFC14A"/><stop offset=".3" stop-color="#FF8E24"/>
    <stop offset=".55" stop-color="#F2501F"/><stop offset=".8" stop-color="#D42129"/><stop offset="1" stop-color="#A8132E"/>
  </radialGradient>
  <clipPath id="body"><path d="{{BODY}}"/></clipPath>
</defs>"""

def svg(bg=None):
    vb, body = build()
    d = DEFS.replace('{BODY}', closed(BODY))
    x, y, s, _ = vb.split()
    back = f'<rect x="{x}" y="{y}" width="{s}" height="{s}" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">\n{d}\n  {back}{body}\n</svg>\n'

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    open(f'{out}/phoenix.svg', 'w').write(svg())
    open(f'{out}/on-light.svg', 'w').write(svg('#ffffff'))
    open(f'{out}/on-dark.svg', 'w').write(svg('#141418'))
    print('ok', len(svg()), 'bytes')
