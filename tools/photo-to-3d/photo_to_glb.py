#!/usr/bin/env python3
"""
Photo → 3D product model (.glb) for the ShopWalk 360 virtual store.

Give it one product photo (ideally on a plain background, product facing the camera) and it
writes a .glb you upload in Admin → Virtual Store → Product experience → 3D Product Configuration.

How the shape is made, from the product's outline in the photo:
  round   bottles, jars, cups, cans, vases …  the outline is spun into a round body and the
          photo is wrapped around it (front shows the photo, sides curve away naturally)
  cutout  gadgets, shoes, bags, tools …        a solid of the outline with real thickness;
          the photo on the front and back, its edge colours on the sides
  box     boxed / rectangular products        a box with the photo on the front
  auto    (default) picks one of the above from the outline

The model is in metres, standing on the floor (y = 0), centred, front facing +Z — the way the
store expects it. The store then sizes it to the product's real dimensions (if entered in admin)
and to the shelf.

Usage:
  python3 photo_to_glb.py photo.jpg -o product.glb
  python3 photo_to_glb.py photo.jpg -o product.glb --shape round --height-cm 24
  python3 photo_to_glb.py shoe.jpg -o shoe.glb --size-cm 28            (longest side 28 cm)
  python3 photo_to_glb.py photo.jpg -o product.glb --shape cutout --depth-cm 9 --preview preview.png

Requirements: pillow numpy opencv-python-headless scipy mapbox_earcut  (rembg optional: better
background removal for busy backgrounds)
"""
from __future__ import annotations

import argparse
import io
import json
import struct
import sys

import cv2
import mapbox_earcut as earcut
import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage

MAX_TEX = 1024


# ----------------------------------------------------------------------------- image + mask
def load_rgba(path: str) -> Image.Image:
    img = ImageOps.exif_transpose(Image.open(path)).convert('RGBA')
    s = MAX_TEX / max(img.size)
    if s < 1:
        img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    return img


def mask_from_alpha(img: Image.Image) -> np.ndarray | None:
    a = np.asarray(img)[:, :, 3]
    if (a < 250).mean() > 0.02:  # the photo already has a transparent background
        return a > 127
    return None


def mask_rembg(img: Image.Image) -> np.ndarray | None:
    try:
        from rembg import new_session, remove  # type: ignore
        # u2net: a good general-purpose cut-out model (176 MB, downloaded once)
        out = remove(img.convert('RGB'), session=new_session('u2net'))
        a = np.asarray(out)[:, :, 3]
        m = a > 127
        return m if 0.02 < m.mean() < 0.98 else None
    except Exception as e:  # model not available, offline, …
        print(f'  (AI background removal unavailable: {type(e).__name__}; using plain-background removal)', file=sys.stderr)
        return None


def mask_plain_background(img: Image.Image) -> np.ndarray:
    """Background = pixels close to the border colour that connect to the border."""
    rgb = np.asarray(img.convert('RGB'))
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    h, w = lab.shape[:2]
    border = np.concatenate([lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]])
    bg = np.median(border, axis=0)
    spread = np.percentile(np.linalg.norm(border - bg, axis=1), 90)
    tol = max(14.0, spread * 1.6)
    near = np.linalg.norm(lab - bg, axis=2) < tol
    # keep only background that touches the image border (so white parts of the product survive)
    lbl, _ = ndimage.label(near)
    edge_labels = np.unique(np.concatenate([lbl[0, :], lbl[-1, :], lbl[:, 0], lbl[:, -1]]))
    background = np.isin(lbl, edge_labels[edge_labels > 0])
    return ~background


def clean_mask(m: np.ndarray) -> np.ndarray:
    m = m.astype(np.uint8)
    k = max(3, round(min(m.shape) / 200)) | 1
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((k, k), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((k, k), np.uint8))
    n, lbl, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    if n <= 1:
        raise SystemExit('Could not find the product in the photo. Use a photo with the product on a plain background.')
    biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    m = lbl == biggest
    return ndimage.binary_fill_holes(m)


def get_mask(img: Image.Image, mode: str) -> np.ndarray:
    m = mask_from_alpha(img)
    if m is None and mode in ('auto', 'rembg'):
        m = mask_rembg(img)
    if m is None and mode != 'none':
        m = mask_plain_background(img)
    if m is None:
        m = np.ones((img.height, img.width), bool)
    return clean_mask(m)


def crop(img: Image.Image, m: np.ndarray):
    ys, xs = np.nonzero(m)
    pad = 2
    y0, y1 = max(0, ys.min() - pad), min(m.shape[0], ys.max() + pad + 1)
    x0, x1 = max(0, xs.min() - pad), min(m.shape[1], xs.max() + pad + 1)
    rgb = np.asarray(img.convert('RGB'))[y0:y1, x0:x1].copy()
    mm = m[y0:y1, x0:x1]
    # bleed product colours into the background so edges never sample the backdrop
    _, (iy, ix) = ndimage.distance_transform_edt(~mm, return_indices=True)
    rgb = rgb[iy, ix]
    return rgb, mm


# ----------------------------------------------------------------------------- shape choice
def choose_shape(m: np.ndarray) -> str:
    h, w = m.shape
    fill = m.mean()
    rows = [np.nonzero(r)[0] for r in m]
    spans = [(r[0], r[-1]) for r in rows if len(r) > 2]
    if not spans:
        return 'cutout'
    centres = np.array([(a + b) / 2 for a, b in spans])
    widths = np.array([b - a + 1 for a, b in spans])
    gaps = np.mean([len(r) / (r[-1] - r[0] + 1) for r in rows if len(r) > 2])  # row continuity
    symmetric = np.std(centres) / max(1, widths.max()) < 0.03
    if fill > 0.9:
        return 'box'
    if symmetric and gaps > 0.95 and h > w * 0.6:
        return 'round'
    return 'cutout'


# ----------------------------------------------------------------------------- geometry builders
class Mesh:
    def __init__(self):
        self.pos: list[tuple[float, float, float]] = []
        self.uv: list[tuple[float, float]] = []
        self.idx: list[int] = []

    def v(self, p, uv):
        self.pos.append(tuple(map(float, p)))
        self.uv.append((float(uv[0]), float(uv[1])))
        return len(self.pos) - 1

    def tri(self, a, b, c):
        self.idx += [a, b, c]


def build_round(m: np.ndarray, height_m: float, segments: int = 56) -> Mesh:
    h, w = m.shape
    s = height_m / h
    cols = np.nonzero(m.any(axis=0))[0]
    rows_idx = [i for i in range(h) if m[i].any()]
    centre = float(np.median([(np.nonzero(m[i])[0][0] + np.nonzero(m[i])[0][-1]) / 2 for i in rows_idx]))
    rings = np.linspace(rows_idx[0], rows_idx[-1], min(96, len(rows_idx)))
    prof = []
    for y in rings:
        r = m[int(round(y))]
        xs = np.nonzero(r)[0]
        half = (xs[-1] - xs[0] + 1) / 2 if len(xs) else 0
        prof.append((y, max(half, 0.5)))
    prof = np.array(prof)
    prof[:, 1] = ndimage.uniform_filter1d(prof[:, 1], 3)  # smooth the silhouette a little
    mesh = Mesh()
    grid = []
    for y, r in prof:
        ring = []
        for k in range(segments + 1):
            th = (k / segments) * 2 * np.pi - np.pi  # θ = 0 faces +Z (the photo)
            x = r * np.sin(th)
            z = r * np.cos(th)
            u = (centre + x) / w
            ring.append(mesh.v(((x) * s, (h - y) * s, z * s), (u, y / h)))
        grid.append(ring)
    for i in range(len(grid) - 1):
        for k in range(segments):
            a, b, c, d = grid[i][k], grid[i][k + 1], grid[i + 1][k], grid[i + 1][k + 1]
            mesh.tri(a, c, b)
            mesh.tri(b, c, d)
    # caps
    for ring, (y, r), up in ((grid[0], prof[0], True), (grid[-1], prof[-1], False)):
        c = mesh.v((0, (h - y) * s, 0), (centre / w, y / h))
        for k in range(segments):
            if up:
                mesh.tri(c, ring[k + 1], ring[k])
            else:
                mesh.tri(c, ring[k], ring[k + 1])
    return mesh


def outline(m: np.ndarray) -> np.ndarray:
    cs, _ = cv2.findContours(m.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cs, key=cv2.contourArea)
    eps = 0.0025 * cv2.arcLength(c, True)
    c = cv2.approxPolyDP(c, eps, True)[:, 0, :].astype(np.float64)
    # counter-clockwise in image space (y down) → consistent winding below
    area = 0.5 * np.sum(c[:, 0] * np.roll(c[:, 1], -1) - np.roll(c[:, 0], -1) * c[:, 1])
    return c if area < 0 else c[::-1]


def build_cutout(m: np.ndarray, height_m: float, depth_m: float) -> Mesh:
    h, w = m.shape
    s = height_m / h
    poly = outline(m)
    n = len(poly)
    tris = earcut.triangulate_float64(poly, np.array([n], dtype=np.uint32)).reshape(-1, 3)
    cx = w / 2
    mesh = Mesh()
    P = lambda x, y, z: ((x - cx) * s, (h - y) * s, z)
    UV = lambda x, y: (x / w, y / h)  # glTF: v = 0 is the top of the image
    # front (+Z) and back (−Z) faces
    for zsign in (1, -1):
        ids = [mesh.v(P(x, y, zsign * depth_m / 2), UV(x, y)) for x, y in poly]
        for t in tris:
            a, b, c = (ids[i] for i in t)
            # image y points down, so a CCW-in-image triangle is CW seen from +Z
            if zsign > 0:
                mesh.tri(a, c, b)
            else:
                mesh.tri(a, b, c)
    # sides: the photo's edge colour stretched across the thickness
    for i in range(n):
        (x0, y0), (x1, y1) = poly[i], poly[(i + 1) % n]
        a = mesh.v(P(x0, y0, depth_m / 2), UV(x0, y0))
        b = mesh.v(P(x1, y1, depth_m / 2), UV(x1, y1))
        c = mesh.v(P(x0, y0, -depth_m / 2), UV(x0, y0))
        d = mesh.v(P(x1, y1, -depth_m / 2), UV(x1, y1))
        mesh.tri(a, b, c)
        mesh.tri(b, d, c)
    return mesh


def build_box(m: np.ndarray, height_m: float, depth_m: float) -> Mesh:
    h, w = m.shape
    s = height_m / h
    W, H, D = w * s, height_m, depth_m
    mesh = Mesh()

    def quad(p0, p1, p2, p3, uv0, uv1, uv2, uv3):
        # uv given with v = 0 at the bottom; glTF counts from the top
        a, b, c, d = (mesh.v(p, (uv[0], 1 - uv[1])) for p, uv in ((p0, uv0), (p1, uv1), (p2, uv2), (p3, uv3)))
        mesh.tri(a, b, c)
        mesh.tri(a, c, d)

    x0, x1, z0, z1 = -W / 2, W / 2, -D / 2, D / 2
    e = 0.004  # sides sample a thin strip at the photo's edges
    quad((x0, 0, z1), (x1, 0, z1), (x1, H, z1), (x0, H, z1), (0, 0), (1, 0), (1, 1), (0, 1))  # front
    quad((x1, 0, z0), (x0, 0, z0), (x0, H, z0), (x1, H, z0), (0, 0), (1, 0), (1, 1), (0, 1))  # back
    quad((x1, 0, z1), (x1, 0, z0), (x1, H, z0), (x1, H, z1), (1 - e, 0), (1, 0), (1, 1), (1 - e, 1))  # right
    quad((x0, 0, z0), (x0, 0, z1), (x0, H, z1), (x0, H, z0), (0, 0), (e, 0), (e, 1), (0, 1))  # left
    quad((x0, H, z1), (x1, H, z1), (x1, H, z0), (x0, H, z0), (0, 1 - e), (1, 1 - e), (1, 1), (0, 1))  # top
    quad((x0, 0, z0), (x1, 0, z0), (x1, 0, z1), (x0, 0, z1), (0, 0), (1, 0), (1, e), (0, e))  # bottom
    return mesh


# ----------------------------------------------------------------------------- GLB writer
def normals(pos: np.ndarray, idx: np.ndarray) -> np.ndarray:
    n = np.zeros_like(pos)
    t = idx.reshape(-1, 3)
    fn = np.cross(pos[t[:, 1]] - pos[t[:, 0]], pos[t[:, 2]] - pos[t[:, 0]])
    for k in range(3):
        np.add.at(n, t[:, k], fn)
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    ln[ln == 0] = 1
    return (n / ln).astype(np.float32)


def write_glb(mesh: Mesh, tex_rgb: np.ndarray, out: str, name: str):
    pos = np.array(mesh.pos, np.float32)
    uv = np.array(mesh.uv, np.float32)
    idx = np.array(mesh.idx, np.uint32)
    nrm = normals(pos, idx)
    buf = io.BytesIO()
    Image.fromarray(tex_rgb).save(buf, 'JPEG', quality=88)
    jpg = buf.getvalue()

    chunks, views = [], []

    def add(data: bytes, target=None):
        off = sum(len(c) for c in chunks)
        chunks.append(data + b'\0' * ((4 - len(data) % 4) % 4))
        v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
        if target:
            v['target'] = target
        views.append(v)
        return len(views) - 1

    vp = add(pos.tobytes(), 34962)
    vn = add(nrm.tobytes(), 34962)
    vt = add(uv.tobytes(), 34962)
    vi = add(idx.tobytes(), 34963)
    vimg = add(jpg)
    gltf = {
        'asset': {'version': '2.0', 'generator': 'ShopWalk 360 photo_to_glb'},
        'scene': 0,
        'scenes': [{'nodes': [0]}],
        'nodes': [{'mesh': 0, 'name': name}],
        'meshes': [{'name': name, 'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1, 'TEXCOORD_0': 2}, 'indices': 3, 'material': 0}]}],
        'materials': [{'name': name, 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0.0, 'roughnessFactor': 0.55}}],
        'textures': [{'source': 0, 'sampler': 0}],
        'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}],
        'images': [{'bufferView': vimg, 'mimeType': 'image/jpeg'}],
        'accessors': [
            {'bufferView': vp, 'componentType': 5126, 'count': len(pos), 'type': 'VEC3', 'min': pos.min(0).tolist(), 'max': pos.max(0).tolist()},
            {'bufferView': vn, 'componentType': 5126, 'count': len(nrm), 'type': 'VEC3'},
            {'bufferView': vt, 'componentType': 5126, 'count': len(uv), 'type': 'VEC2'},
            {'bufferView': vi, 'componentType': 5125, 'count': len(idx), 'type': 'SCALAR'},
        ],
        'buffers': [{'byteLength': sum(len(c) for c in chunks)}],
        'bufferViews': views,
    }
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    binary = b''.join(chunks)
    total = 12 + 8 + len(js) + 8 + len(binary)
    with open(out, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<I4s', len(js), b'JSON') + js)
        f.write(struct.pack('<I4s', len(binary), b'BIN\0') + binary)
    return len(pos), len(idx) // 3, total


# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description='Turn a product photo into a .glb for ShopWalk 360.')
    ap.add_argument('photo')
    ap.add_argument('-o', '--out', required=True, help='output .glb')
    ap.add_argument('--shape', choices=['auto', 'round', 'cutout', 'box'], default='auto')
    ap.add_argument('--height-cm', type=float, default=None, help='real product height (optional)')
    ap.add_argument('--size-cm', type=float, default=25.0, help='longest side when no height is given (the store rescales to the dimensions entered in admin)')
    ap.add_argument('--depth-cm', type=float, default=None, help='thickness for cutout / box (default: from the width)')
    ap.add_argument('--background', choices=['auto', 'rembg', 'plain', 'none'], default='auto', help='how to remove the photo background')
    ap.add_argument('--preview', help='also write the cut-out product as a PNG (to check the background removal)')
    a = ap.parse_args()

    img = load_rgba(a.photo)
    m = get_mask(img, a.background)
    rgb, mm = crop(img, m)
    shape = choose_shape(mm) if a.shape == 'auto' else a.shape
    h, w = mm.shape
    if a.height_cm:
        height_m = a.height_cm / 100
    else:
        height_m = (a.size_cm / 100) * (h / max(w, h))
    width_m = height_m * w / h
    if a.depth_cm:
        depth_m = a.depth_cm / 100
    else:
        depth_m = width_m * (0.35 if shape == 'box' else 0.22)
    if shape == 'round':
        mesh = build_round(mm, height_m)
    elif shape == 'box':
        mesh = build_box(mm, height_m, depth_m)
    else:
        mesh = build_cutout(mm, height_m, depth_m)
    name = a.out.rsplit('/', 1)[-1].rsplit('.', 1)[0]
    verts, tris, size = write_glb(mesh, rgb, a.out, name)
    if a.preview:
        rgba = np.dstack([rgb, (mm * 255).astype(np.uint8)])
        Image.fromarray(rgba).save(a.preview)
    dims = f'{width_m * 100:.1f} × {height_m * 100:.1f} × {(width_m if shape == "round" else depth_m) * 100:.1f} cm'
    print(f'{a.out}: shape={shape}, {dims} (W×H×D), {verts} vertices, {tris} triangles, {size / 1024:.0f} KB')


if __name__ == '__main__':
    main()
