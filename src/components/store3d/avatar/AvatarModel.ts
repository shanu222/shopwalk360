/**
 * Customisable human avatar (procedural, real-world proportions).
 *
 * - Joint hierarchy (hips → spine → chest → neck → head, shoulders → elbows → wrists, hips → knees → ankles)
 * - Gait is driven by DISTANCE travelled, with hip-swing amplitude derived from stride length and leg length,
 *   so the planted foot moves backwards at the same speed the body moves forwards (no foot sliding).
 * - Idle breathing/weight shift, walk/stop blending, turn-in-place shuffle, head look-at, pick-up reach,
 *   basket carrying with visible items.
 * - Clothing / accessories are rebuilt from AvatarConfig so try-on can dress the avatar.
 *
 * This is NOT a photographic likeness. A photo-to-3D service can supply a GLB instead (see glbAvatar.ts).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { AvatarConfig } from '../../../types';
import { buildShoe, buildWatch, buildSunglasses, buildTote } from '../builder/productModels';

export interface AvatarMotion {
  /** ground speed in m/s */
  speed: number;
  /** yaw rate in rad/s (for turning in place) */
  turnRate: number;
}

export interface AvatarRig {
  root: THREE.Group;
  eyeHeight: number;
  update(dt: number, motion: AvatarMotion): void;
  applyConfig(cfg: AvatarConfig): void;
  setBasketCount(n: number): void;
  triggerPick(): void;
  setLookTarget(p: THREE.Vector3 | null): void;
  pose(name: 'display' | 'idle' | 'showWrist'): void;
  anchors: { head: THREE.Object3D; chest: THREE.Object3D; leftWrist: THREE.Object3D; feet: THREE.Object3D; lips: THREE.Object3D };
  setVisible(v: boolean): void;
  dispose(): void;
}

interface Options {
  mannequin?: boolean;
  lowDetail?: boolean;
}

const v2 = (r: number, y: number) => new THREE.Vector2(r, y);

let gridTex: THREE.Texture | null = null;
function basketGridTexture() {
  if (gridTex) return gridTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 64; i += 8) {
    ctx.fillRect(i, 0, 2, 64);
    ctx.fillRect(0, i, 64, 2);
  }
  gridTex = new THREE.CanvasTexture(c);
  gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
  gridTex.repeat.set(3, 2);
  return gridTex;
}

/** Body frame proportions */
function frame(cfg: AvatarConfig) {
  const female = cfg.gender === 'female';
  const neutral = cfg.gender === 'neutral';
  const t = cfg.bodyType || 'average';
  const shoulder = female ? 0.172 : neutral ? 0.185 : 0.2;
  const hip = female ? 0.168 : neutral ? 0.158 : 0.152;
  const waist = female ? 0.128 : neutral ? 0.138 : 0.145;
  const k = t === 'slim' ? 0.92 : t === 'broad' ? 1.1 : t === 'curvy' ? 1.04 : 1;
  return {
    female,
    shoulder: shoulder * (t === 'broad' ? 1.08 : t === 'slim' ? 0.95 : 1),
    hip: hip * (t === 'curvy' ? 1.12 : k),
    waist: waist * (t === 'curvy' ? 1.0 : k),
    chest: (female ? 0.165 : 0.175) * k,
    limb: k,
    overall: female ? 0.955 : 1,
  };
}

function lathe(points: THREE.Vector2[], seg: number) {
  return new THREE.LatheGeometry(points, seg);
}

export function createHumanAvatar(initial: AvatarConfig, opts: Options = {}): AvatarRig {
  const seg = opts.lowDetail ? 16 : 28;
  let cfg = initial;

  const root = new THREE.Group();
  root.name = 'Avatar';
  const body = new THREE.Group(); // scaled by height
  root.add(body);

  // ---------------- joints (persist across rebuilds) ----------------
  const hips = new THREE.Group();
  const spine = new THREE.Group();
  const chest = new THREE.Group();
  const neck = new THREE.Group();
  const head = new THREE.Group();
  const shoulderL = new THREE.Group();
  const shoulderR = new THREE.Group();
  const elbowL = new THREE.Group();
  const elbowR = new THREE.Group();
  const wristL = new THREE.Group();
  const wristR = new THREE.Group();
  const thighL = new THREE.Group();
  const thighR = new THREE.Group();
  const kneeL = new THREE.Group();
  const kneeR = new THREE.Group();
  const ankleL = new THREE.Group();
  const ankleR = new THREE.Group();
  const lipsAnchor = new THREE.Object3D();
  const feetAnchor = new THREE.Object3D();
  const basket = new THREE.Group();

  body.add(hips);
  hips.add(spine);
  spine.add(chest);
  chest.add(neck);
  neck.add(head);
  chest.add(shoulderL, shoulderR);
  shoulderL.add(elbowL);
  shoulderR.add(elbowR);
  elbowL.add(wristL);
  elbowR.add(wristR);
  hips.add(thighL, thighR);
  thighL.add(kneeL);
  thighR.add(kneeR);
  kneeL.add(ankleL);
  kneeR.add(ankleR);
  head.add(lipsAnchor);
  body.add(feetAnchor);
  wristR.add(basket);

  const HIP_Y = 0.94;
  const THIGH = 0.43;
  const SHIN = 0.42;
  const UPPER_ARM = 0.285;
  const FOREARM = 0.25;
  const LEG_LEN = THIGH + SHIN;

  let materials: THREE.Material[] = [];
  let geometries: THREE.BufferGeometry[] = [];
  let built: THREE.Object3D[] = [];
  let basketItems: THREE.Mesh[] = [];
  let basketCount = 0;
  let eyeHeight = 1.62;

  const track = <T extends THREE.Material>(m: T) => {
    materials.push(m);
    return m;
  };

  function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    parent.add(mesh);
    built.push(mesh);
    return mesh;
  }

  /** tapered limb segment from y=0 down to y=-len with rounded (capsule) ends so joints blend smoothly */
  function limb(r0: number, r1: number, len: number) {
    const pts: THREE.Vector2[] = [];
    const capSeg = 5;
    // top hemisphere (radius r0, centred at y=0)
    for (let i = 0; i <= capSeg; i++) {
      const a = (Math.PI / 2) * (1 - i / capSeg);
      pts.push(v2(Math.cos(a) * r0, Math.sin(a) * r0 * 0.7));
    }
    const n = 8;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const bulge = Math.sin(t * Math.PI) * 0.05;
      pts.push(v2((r0 + (r1 - r0) * t) * (1 + bulge), -t * len));
    }
    // bottom hemisphere (radius r1, centred at y=-len)
    for (let i = 0; i <= capSeg; i++) {
      const a = (Math.PI / 2) * (i / capSeg);
      pts.push(v2(Math.cos(a) * r1, -len - Math.sin(a) * r1 * 0.7));
    }
    pts[0].x = 0;
    pts[pts.length - 1].x = 0;
    return lathe(pts, seg);
  }

  function clearBuilt() {
    built.forEach((o) => o.parent?.remove(o));
    built = [];
    geometries.forEach((g) => g.dispose());
    geometries = [];
    materials.forEach((m) => m.dispose());
    materials = [];
    basketItems = [];
  }

  function build() {
    clearBuilt();
    const F = frame(cfg);
    const mannequin = !!opts.mannequin;
    const scale = (cfg.heightScale || 1) * F.overall;
    body.scale.setScalar(scale);
    eyeHeight = 1.615 * scale;

    const skin = track(new THREE.MeshStandardMaterial({ color: cfg.skinTone || '#c99a74', roughness: mannequin ? 0.45 : 0.62, metalness: 0 }));
    const top = track(new THREE.MeshStandardMaterial({ color: cfg.outfitColor || '#2f3a4a', roughness: 0.88 }));
    const bottom = track(new THREE.MeshStandardMaterial({ color: cfg.pantsColor || '#2b2e33', roughness: 0.86 }));
    const hairM = track(new THREE.MeshStandardMaterial({ color: cfg.hairColor || '#1d1714', roughness: cfg.hairStyle === 'headscarf' ? 0.92 : 0.7 }));

    // joint placement
    hips.position.set(0, HIP_Y, 0);
    spine.position.set(0, 0.06, 0);
    chest.position.set(0, 0.2, 0);
    neck.position.set(0, 0.25, 0);
    head.position.set(0, 0.11, 0.008);
    shoulderL.position.set(F.shoulder - 0.03, 0.175, -0.005);
    shoulderR.position.set(-(F.shoulder - 0.03), 0.175, -0.005);
    elbowL.position.set(0, -UPPER_ARM, 0);
    elbowR.position.set(0, -UPPER_ARM, 0);
    wristL.position.set(0, -FOREARM, 0);
    wristR.position.set(0, -FOREARM, 0);
    thighL.position.set(F.hip * 0.56, -0.035, 0);
    thighR.position.set(-F.hip * 0.56, -0.035, 0);
    kneeL.position.set(0, -THIGH, 0);
    kneeR.position.set(0, -THIGH, 0);
    ankleL.position.set(0, -SHIN, 0);
    ankleR.position.set(0, -SHIN, 0);
    lipsAnchor.position.set(0, -0.045, 0.09);

    const topStyle = cfg.topStyle || 'tee';
    const bottomStyle = cfg.bottomStyle || 'trousers';
    const longSleeve = topStyle !== 'tee';

    // ---------------- pelvis (bottoms) ----------------
    {
      const pts = [v2(0, 0.075), v2(F.waist * 1.02, 0.075), v2(F.hip * 0.98, 0.0), v2(F.hip * 1.02, -0.06), v2(F.hip * 0.86, -0.12), v2(0, -0.13)];
      add(hips, lathe(pts, seg), bottomStyle === 'skirt' ? bottom : bottom, 0, 0, 0, 0, 0, 0, 1, 1, 0.7);
      if (bottomStyle !== 'skirt') {
        // waistband
        add(hips, new THREE.TorusGeometry(F.waist * 1.02, 0.008, 6, seg), bottom, 0, 0.07, 0, Math.PI / 2, 0, 0, 1, 0.7, 1);
      }
    }

    // ---------------- torso (top) ----------------
    {
      const w = F.waist;
      const c = F.chest;
      const s = F.shoulder;
      const pts = [
        v2(0, -0.1), v2(w * 1.04, -0.1), v2(w, -0.02), v2(w * 0.98, 0.06), v2(c * 0.96, 0.17), v2(c, 0.26),
        v2(s * 0.97, 0.34), v2(s, 0.385), v2(s * 0.93, 0.425), v2(s * 0.6, 0.455), v2(0.075, 0.47), v2(0, 0.475),
      ];
      const torso = lathe(pts, seg);
      const zDepth = F.female ? 0.66 : 0.62;
      add(spine, torso, top, 0, 0, 0, 0, 0, 0, 1, 1, zDepth);
      if (F.female && !mannequin) {
        [-1, 1].forEach((sd) => add(spine, new THREE.SphereGeometry(0.055, seg, 12), top, sd * 0.06, 0.24, c * zDepth * 0.72, 0, 0, 0, 1, 0.85, 0.75));
      }
      if (topStyle === 'jacket') {
        const shell = lathe(pts.map((p) => v2(p.x * 1.05, p.y)), seg);
        const jacketM = top;
        add(spine, shell, jacketM, 0, -0.01, 0, 0, 0, 0, 1, 1, zDepth * 1.03);
        // shirt placket visible down the front
        const shirtM = track(new THREE.MeshStandardMaterial({ color: '#f1f0ec', roughness: 0.8 }));
        add(spine, new THREE.PlaneGeometry(0.07, 0.3), shirtM, 0, 0.27, c * zDepth * 1.06 + 0.004, -0.08);
        // lapels
        const lapel = track(new THREE.MeshStandardMaterial({ color: new THREE.Color(cfg.outfitColor).multiplyScalar(0.8), roughness: 0.8 }));
        [-1, 1].forEach((sd) => add(spine, new THREE.PlaneGeometry(0.05, 0.22), lapel, sd * 0.05, 0.31, c * zDepth * 1.07 + 0.006, -0.1, 0, sd * 0.35));
      }
      if (topStyle === 'shirt') {
        const buttonM = track(new THREE.MeshStandardMaterial({ color: new THREE.Color(cfg.outfitColor).multiplyScalar(0.75), roughness: 0.5 }));
        for (let i = 0; i < 5; i++) add(spine, new THREE.CylinderGeometry(0.005, 0.005, 0.003, 10), buttonM, 0, 0.36 - i * 0.075, (i < 2 ? c : w) * zDepth + 0.003, Math.PI / 2);
        // collar
        [-1, 1].forEach((sd) => add(spine, new THREE.PlaneGeometry(0.06, 0.045), top, sd * 0.04, 0.455, 0.05, -0.5, sd * 0.6, sd * 0.25));
      }
      if (topStyle === 'knit') {
        add(spine, new THREE.TorusGeometry(w * 1.03, 0.012, 6, seg), top, 0, -0.095, 0, Math.PI / 2, 0, 0, 1, zDepth, 1);
      }
    }

    // ---------------- neck & head ----------------
    add(neck, new THREE.CylinderGeometry(0.048, 0.056, 0.13, seg), skin, 0, 0.04, 0);
    buildHead(skin, hairM, mannequin, F.female);

    // ---------------- arms ----------------
    const sleeveM = top;
    [shoulderL, shoulderR].forEach((sh, i) => {
      const sd = i === 0 ? 1 : -1;
      if (longSleeve) add(sh, limb(0.052 * F.limb, 0.042 * F.limb, UPPER_ARM), sleeveM);
      else {
        add(sh, limb(0.05 * F.limb, 0.041 * F.limb, UPPER_ARM), skin);
        add(sh, limb(0.06 * F.limb, 0.056 * F.limb, 0.13), sleeveM);
      }
      const el = i === 0 ? elbowL : elbowR;
      add(el, limb(0.04 * F.limb, 0.029 * F.limb, FOREARM), longSleeve ? sleeveM : skin);
      if (longSleeve) add(el, new THREE.TorusGeometry(0.031, 0.006, 6, seg), sleeveM, 0, -FOREARM + 0.02, 0, Math.PI / 2);
      const wr = i === 0 ? wristL : wristR;
      // hand: palm + fingers + thumb
      add(wr, new RoundedBoxGeometry(0.075, 0.09, 0.03, 2, 0.012), skin, 0, -0.05, 0);
      add(wr, new RoundedBoxGeometry(0.07, 0.07, 0.024, 2, 0.01), skin, 0, -0.115, 0.006, -0.25);
      add(wr, new THREE.CapsuleGeometry(0.011, 0.04, 4, 8), skin, sd * 0.042, -0.05, 0.016, 0.3, 0, sd * 0.55);
    });

    // ---------------- legs ----------------
    const shorts = bottomStyle === 'shorts';
    const skirt = bottomStyle === 'skirt';
    [thighL, thighR].forEach((th, i) => {
      if (skirt) add(th, limb(0.078 * F.limb, 0.056 * F.limb, THIGH), skin);
      else if (shorts) {
        add(th, limb(0.078 * F.limb, 0.056 * F.limb, THIGH), skin);
        add(th, limb(0.092 * F.limb, 0.08 * F.limb, THIGH * 0.55), bottom);
      } else add(th, limb(0.088 * F.limb, 0.062 * F.limb, THIGH), bottom);
      const kn = i === 0 ? kneeL : kneeR;
      const jeans = bottomStyle === 'jeans';
      add(kn, limb((shorts || skirt ? 0.054 : 0.064) * F.limb, (shorts || skirt ? 0.036 : jeans ? 0.048 : 0.052) * F.limb, SHIN), shorts || skirt ? skin : bottom);
    });
    if (skirt) {
      const pts = [v2(0, 0.0), v2(F.hip * 1.02, 0.0), v2(F.hip * 1.35, -0.42), v2(0, -0.42)];
      add(hips, lathe(pts, seg), bottom, 0, -0.06, 0, 0, 0, 0, 1, 1, 0.78);
    }

    // ---------------- shoes ----------------
    const shoeStyle = cfg.shoeStyle || 'sneakers';
    [ankleL, ankleR].forEach((an, i) => {
      const soleHex = shoeStyle === 'formal' ? '#1a1514' : shoeStyle === 'boots' ? '#2a211c' : '#efede8';
      const shoe = buildShoe(cfg.shoesColor || '#efede8', soleHex, i === 1);
      shoe.group.scale.multiplyScalar(0.94);
      if (shoeStyle === 'formal') shoe.group.scale.y *= 0.82;
      shoe.group.position.set(0, -0.085, 0.045);
      an.add(shoe.group);
      built.push(shoe.group);
      if (shoeStyle === 'boots') {
        const bootM = track(new THREE.MeshStandardMaterial({ color: cfg.shoesColor, roughness: 0.75 }));
        add(an, new THREE.CylinderGeometry(0.056, 0.052, 0.16, seg), bootM, 0, 0.0, -0.005);
      }
      // make shoe materials independent so colour updates don't affect shared caches
      shoe.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.material = track((m.material as THREE.Material).clone());
          geometries.push(m.geometry);
        }
      });
    });

    // ---------------- accessories ----------------
    if (!mannequin) {
      if (cfg.accessories?.watch) {
        const w = buildWatch(cfg.watchCaseColor || '#c9ccd0', cfg.watchStrapColor || '#1c1d1f', cfg.watchStrap || 'leather', 0.85);
        // wrap the watch around the left wrist: show only the head on the back of the wrist plus a band
        const holder = new THREE.Group();
        const headObj = w.group.children[0];
        headObj.position.set(0, 0, 0);
        // drop the display straps (last 32 segments); a band is modelled around the wrist instead
        headObj.children.slice(-32).forEach((ch) => headObj.remove(ch));
        holder.add(headObj);
        holder.rotation.set(0, 0, -Math.PI / 2); // dial faces outward (+x = avatar's left side)
        holder.position.set(0.034, -0.005, 0);
        wristL.add(holder);
        built.push(holder);
        const bandM = track(new THREE.MeshStandardMaterial({ color: cfg.watchStrap === 'metal' ? cfg.watchCaseColor || '#c9ccd0' : cfg.watchStrapColor || '#1c1d1f', roughness: cfg.watchStrap === 'metal' ? 0.3 : 0.75, metalness: cfg.watchStrap === 'metal' ? 0.9 : 0 }));
        add(wristL, new THREE.TorusGeometry(0.033, 0.0085, 8, seg), bandM, 0, 0.0, 0, Math.PI / 2, 0, 0, 1, 1, 0.8);
        holder.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) geometries.push(m.geometry);
        });
      }
      if (cfg.accessories?.glasses) {
        const sun = cfg.glassesStyle === 'sun';
        const g = buildSunglasses(cfg.glassesColor || '#151515');
        g.group.scale.setScalar(1.02);
        g.group.position.set(0, -0.0165, 0.094);
        g.group.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            geometries.push(m.geometry);
            if (!sun && (m.geometry as any).type === 'CircleGeometry') {
              m.material = track(new THREE.MeshStandardMaterial({ color: '#dfe9ee', transparent: true, opacity: 0.18, roughness: 0.05 }));
            }
          }
        });
        head.add(g.group);
        built.push(g.group);
      }
      if (cfg.accessories?.bag) {
        const t = buildTote(cfg.bagColor || '#e6dcc6');
        t.group.scale.setScalar(0.85);
        t.group.position.set(0.0, -0.26, -0.03);
        t.group.rotation.y = Math.PI / 2;
        shoulderL.add(t.group);
        built.push(t.group);
        t.group.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) geometries.push(m.geometry);
        });
      }
    }

    // ---------------- shopping basket ----------------
    basket.clear();
    basket.position.set(0, -0.14, 0.02);
    const wire = track(new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: 0.35, metalness: 0.6 }));
    const red = track(new THREE.MeshStandardMaterial({ color: '#b0172c', roughness: 0.6 }));
    const bk = new THREE.Group();
    bk.position.set(0, -0.2, 0);
    basket.add(bk);
    const geo = new THREE.BoxGeometry(0.4, 0.2, 0.28, 1, 1, 1);
    geometries.push(geo);
    const bodyMesh = new THREE.Mesh(geo, track(new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: 0.4, metalness: 0.5, alphaMap: basketGridTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide })));
    bk.add(bodyMesh);
    const base = new THREE.BoxGeometry(0.4, 0.01, 0.28);
    geometries.push(base);
    const baseMesh = new THREE.Mesh(base, wire);
    baseMesh.position.y = -0.1;
    bk.add(baseMesh);
    const rim = new THREE.BoxGeometry(0.42, 0.02, 0.3);
    geometries.push(rim);
    const rimMesh = new THREE.Mesh(rim, red);
    rimMesh.position.y = 0.1;
    bk.add(rimMesh);
    const handle = new THREE.TorusGeometry(0.16, 0.009, 6, 20, Math.PI);
    geometries.push(handle);
    const hMesh = new THREE.Mesh(handle, red);
    hMesh.position.y = 0.1;
    bk.add(hMesh);
    rimMesh.castShadow = true;
    // item boxes (shown according to basket count)
    const itemColours = ['#e9e3d6', '#c8a96a', '#3e6aa8', '#8e1b2b', '#4d5a3a', '#f2f0ea'];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.BoxGeometry(0.11, 0.1 + (i % 3) * 0.03, 0.08);
      geometries.push(g);
      const m = new THREE.Mesh(g, track(new THREE.MeshStandardMaterial({ color: itemColours[i], roughness: 0.6 })));
      m.position.set(-0.12 + (i % 3) * 0.12, -0.04 + Math.floor(i / 3) * 0.06, i < 3 ? -0.05 : 0.06);
      m.rotation.y = (i - 2) * 0.12;
      m.visible = false;
      bk.add(m);
      basketItems.push(m);
    }
    basket.visible = !!cfg.accessories?.shoppingBasket && !mannequin;
    applyBasketCount();
  }

  function buildHead(skin: THREE.Material, hairM: THREE.Material, mannequin: boolean, female: boolean) {
    // sculpted skull + face
    const g = new THREE.SphereGeometry(1, seg * 2, seg + 8);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      // jaw taper & chin
      if (y < 0) {
        const t = -y;
        const taper = 1 - 0.32 * Math.pow(t, 1.6) * (female ? 1.1 : 1);
        x *= taper;
        z *= 1 - 0.18 * Math.pow(t, 2);
        if (z > 0) z += 0.06 * Math.pow(t, 1.5) * z;
      }
      // flatten the face plane slightly and round the cranium
      if (z > 0.55) z = 0.55 + (z - 0.55) * 0.75;
      if (z < 0) z *= 1.08;
      // cheekbones
      if (y > -0.35 && y < 0.05 && z > 0.3) x *= 1.03;
      pos.setXYZ(i, x * 0.074, y * 0.113, z * 0.096);
    }
    g.computeVertexNormals();
    add(head, g, skin);
    // ears
    [-1, 1].forEach((sd) => add(head, new THREE.SphereGeometry(0.018, 12, 10), skin, sd * 0.073, 0.0, -0.005, 0, 0, 0, 0.45, 1.3, 0.85));
    if (mannequin) return;

    // nose
    add(head, new THREE.ConeGeometry(0.0115, 0.04, 12), skin, 0, -0.005, 0.098, 0.45, 0, 0, 1, 1, 0.8);
    add(head, new THREE.SphereGeometry(0.0115, 12, 10), skin, 0, -0.022, 0.104, 0, 0, 0, 1.25, 0.85, 1);
    // eyes
    const sclera = track(new THREE.MeshStandardMaterial({ color: '#f3efe9', roughness: 0.25 }));
    const iris = track(new THREE.MeshStandardMaterial({ color: cfg.eyeColor || '#3b2a1e', roughness: 0.3 }));
    const pupil = track(new THREE.MeshBasicMaterial({ color: '#0b0b0b' }));
    const lid = skin;
    [-1, 1].forEach((sd) => {
      add(head, new THREE.SphereGeometry(0.0118, 16, 12), sclera, sd * 0.031, 0.014, 0.079, 0, 0, 0, 1.1, 0.8, 0.7);
      add(head, new THREE.CircleGeometry(0.0062, 18), iris, sd * 0.031, 0.0135, 0.0875);
      add(head, new THREE.CircleGeometry(0.0028, 14), pupil, sd * 0.031, 0.0135, 0.0877);
      // upper lid
      add(head, new THREE.SphereGeometry(0.0128, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), lid, sd * 0.031, 0.0145, 0.0785, 0.25, 0, 0, 1.12, 0.85, 0.75);
      // brow
      const brow = add(head, new RoundedBoxGeometry(0.03, 0.005, 0.008, 1, 0.002), hairM, sd * 0.032, 0.034, 0.088, 0, 0, sd * -0.12);
      if (cfg.hairStyle === 'headscarf') brow.material = track(new THREE.MeshStandardMaterial({ color: '#2a201b', roughness: 0.8 }));
    });
    // lips
    const lipHex = cfg.lipColor || new THREE.Color(cfg.skinTone || '#c99a74').lerp(new THREE.Color('#9b4b4b'), 0.38).getStyle();
    const lipM = track(new THREE.MeshStandardMaterial({ color: lipHex, roughness: 0.45 }));
    add(head, new THREE.CapsuleGeometry(0.0055, 0.024, 4, 10), lipM, 0, -0.04, 0.089, 0, 0, Math.PI / 2, 1, 1, 0.8);
    add(head, new THREE.CapsuleGeometry(0.0062, 0.021, 4, 10), lipM, 0, -0.0505, 0.0875, 0, 0, Math.PI / 2, 1, 1, 0.8);

    // facial hair
    const fh = cfg.facialHair || 'none';
    if (fh !== 'none') {
      const fhM = track(new THREE.MeshStandardMaterial({ color: cfg.hairStyle === 'headscarf' ? '#2a201b' : cfg.hairColor, roughness: 0.9, transparent: fh === 'stubble', opacity: fh === 'stubble' ? 0.16 : 1 }));
      if (fh === 'beard' || fh === 'stubble') {
        const b = new THREE.SphereGeometry(1, seg, 12, Math.PI * 0.12, Math.PI * 0.76, Math.PI * 0.6, Math.PI * 0.33);
        add(head, b, fhM, 0, 0.0, 0.0, 0, 0, 0, 0.078, 0.118, 0.1 + (fh === 'beard' ? 0.006 : 0.001));
      }
      if (fh === 'moustache' || fh === 'beard') add(head, new THREE.CapsuleGeometry(0.005, 0.03, 4, 8), fhM, 0, -0.031, 0.093, 0, 0, Math.PI / 2);
    }

    buildHair(hairM);
  }

  function buildHair(hairM: THREE.Material) {
    const style = cfg.hairStyle || 'short';
    const cap = (thetaLen: number, sx = 1.07, sy = 1.06, sz = 1.08, y = 0.006) =>
      add(head, new THREE.SphereGeometry(1, seg * 2, seg, 0, Math.PI * 2, 0, thetaLen), hairM, 0, y, -0.008, -0.22, 0, 0, 0.074 * sx, 0.113 * sy, 0.096 * sz);
    // back-of-head cap opening at the face
    const shell = (thetaStart: number, thetaLen: number, s = 1.1, open = 1.15) =>
      add(head, new THREE.SphereGeometry(1, seg * 2, seg, Math.PI / 2 + open / 2, Math.PI * 2 - open, thetaStart, thetaLen), hairM, 0, 0, -0.002, 0, 0, 0, 0.074 * s, 0.113 * s, 0.096 * s);

    switch (style) {
      case 'buzz':
        cap(Math.PI * 0.42, 1.02, 1.02, 1.03, 0.004);
        break;
      case 'parted': {
        cap(Math.PI * 0.5, 1.05, 1.07, 1.06, 0.004);
        // soft side-swept volume over the crown
        add(head, new THREE.SphereGeometry(0.05, 18, 10), hairM, 0.012, 0.094, 0.036, 0.15, 0, -0.25, 1.45, 0.36, 1.1);
        break;
      }
      case 'curly': {
        cap(Math.PI * 0.48, 1.1, 1.1, 1.12);
        const rnd = (n: number) => Math.sin(n * 12.9898) * 0.5 + 0.5;
        for (let i = 0; i < (opts.lowDetail ? 26 : 60); i++) {
          const th = rnd(i) * Math.PI * 0.42;
          const ph = rnd(i + 99) * Math.PI * 2;
          if (Math.cos(ph) > 0.65 && th > Math.PI * 0.25) continue; // keep the forehead clear
          const x = Math.sin(th) * Math.sin(ph) * 0.082;
          const z = Math.sin(th) * Math.cos(ph) * 0.104;
          const y = Math.cos(th) * 0.12 + 0.005;
          add(head, new THREE.SphereGeometry(0.02 + rnd(i + 7) * 0.012, 8, 6), hairM, x, y, z - 0.004);
        }
        break;
      }
      case 'bun':
        cap(Math.PI * 0.5, 1.06, 1.06, 1.08);
        add(head, new THREE.SphereGeometry(0.042, 16, 12), hairM, 0, 0.1, -0.075);
        break;
      case 'bob':
        cap(Math.PI * 0.46, 1.1, 1.1, 1.1);
        shell(Math.PI * 0.35, Math.PI * 0.38, 1.13, 1.5);
        break;
      case 'long':
        cap(Math.PI * 0.46, 1.1, 1.1, 1.1);
        shell(Math.PI * 0.35, Math.PI * 0.4, 1.12, 1.45);
        add(head, new RoundedBoxGeometry(0.16, 0.26, 0.05, 2, 0.02), hairM, 0, -0.14, -0.075, 0.12);
        break;
      case 'ponytail': {
        cap(Math.PI * 0.5, 1.06, 1.06, 1.08);
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.05, -0.1), new THREE.Vector3(0, -0.02, -0.14), new THREE.Vector3(0, -0.14, -0.13), new THREE.Vector3(0, -0.22, -0.1)]);
        add(head, new THREE.TubeGeometry(curve, 16, 0.022, 8, false), hairM);
        break;
      }
      case 'waves':
        cap(Math.PI * 0.47, 1.12, 1.12, 1.12);
        shell(Math.PI * 0.32, Math.PI * 0.32, 1.16, 1.4);
        add(head, new THREE.SphereGeometry(0.05, 14, 10), hairM, 0.035, 0.1, 0.05, 0, 0, -0.4, 1.3, 0.5, 1);
        break;
      case 'headscarf': {
        // hijab: covers hair, ears and neck, leaves the face open
        shell(0, Math.PI * 0.8, 1.16, 1.25);
        const drape = [v2(0.0, 0.0), v2(0.085, 0.0), v2(0.1, -0.08), v2(0.17, -0.2), v2(0.2, -0.26), v2(0, -0.26)];
        add(neck, lathe(drape, seg), hairM, 0, 0.12, -0.005, 0, 0, 0, 1, 1, 0.85);
        break;
      }
      case 'short':
      default:
        cap(Math.PI * 0.5, 1.05, 1.06, 1.06, 0.004);
        add(head, new THREE.SphereGeometry(0.05, 16, 10), hairM, 0, 0.098, 0.03, 0.1, 0, 0, 1.3, 0.35, 1.1);
        break;
    }
  }

  function applyBasketCount() {
    basketItems.forEach((m, i) => (m.visible = i < Math.min(basketCount, basketItems.length)));
  }

  build();

  // ---------------- animation state ----------------
  let phase = 0;
  let walkW = 0;
  let shuffleW = 0;
  let time = Math.random() * 10;
  let pickT = -1;
  let posed: 'idle' | 'display' | 'showWrist' = 'idle';
  let lookTarget: THREE.Vector3 | null = null;
  const lookYaw = { v: 0 };
  const lookPitch = { v: 0 };
  const tmpV = new THREE.Vector3();
  const tmpM = new THREE.Matrix4();

  function damp(cur: number, target: number, lambda: number, dt: number) {
    return THREE.MathUtils.damp(cur, target, lambda, dt);
  }

  function update(dt: number, motion: AvatarMotion) {
    dt = Math.min(dt, 0.05);
    time += dt;
    const scale = body.scale.x;
    const speed = Math.max(0, motion.speed);
    const moving = speed > 0.05;
    walkW = damp(walkW, moving ? 1 : 0, moving ? 7 : 5, dt);
    const turning = !moving && Math.abs(motion.turnRate) > 0.8;
    shuffleW = damp(shuffleW, turning ? 1 : 0, 8, dt);

    // stride grows with speed (natural gait), limited by leg length
    const legLen = LEG_LEN * scale;
    const step = THREE.MathUtils.clamp(0.52 + speed * 0.16, 0.5, 0.95) * scale;
    // phase advances with distance travelled: one full cycle = two steps
    phase += (speed * dt) / (2 * step) * Math.PI * 2;
    if (turning) phase += Math.abs(motion.turnRate) * dt * 1.4;
    // amplitude chosen so planted-foot velocity matches body velocity (no sliding)
    const A = THREE.MathUtils.clamp(step / (Math.PI * legLen), 0.12, 0.42) * Math.max(walkW, shuffleW * 0.35);

    const s = Math.sin(phase);
    const c = Math.cos(phase);
    const fwdL = A * s;
    const fwdR = -A * s;

    // legs (negative rotation.x swings a leg forward because the avatar faces +z)
    thighL.rotation.x = -fwdL;
    thighR.rotation.x = -fwdR;
    const kneeAmp = walkW * (0.12 + A * 2.2);
    kneeL.rotation.x = kneeAmp * Math.pow(Math.max(0, c), 1.6) + walkW * 0.05;
    kneeR.rotation.x = kneeAmp * Math.pow(Math.max(0, -c), 1.6) + walkW * 0.05;
    // keep soles roughly parallel to the floor
    ankleL.rotation.x = -(thighL.rotation.x + kneeL.rotation.x) * 0.9;
    ankleR.rotation.x = -(thighR.rotation.x + kneeR.rotation.x) * 0.9;

    // pelvis: drops at double support (legs spread), sways and twists slightly
    const drop = LEG_LEN * (1 - Math.cos(A * Math.abs(s))) + walkW * 0.008 * Math.abs(Math.sin(phase * 2));
    const breathe = Math.sin(time * 1.6) * 0.004 * (1 - walkW);
    hips.position.y = HIP_Y - drop + breathe;
    hips.position.x = damp(hips.position.x, walkW > 0.2 ? 0.012 * c * walkW : Math.sin(time * 0.5) * 0.008, 6, dt);
    hips.rotation.y = 0.07 * s * walkW;
    hips.rotation.z = 0.025 * c * walkW;
    chest.rotation.y = -0.09 * s * walkW;
    spine.rotation.x = 0.04 * walkW + 0.015 * Math.min(1, speed / 2.5);
    chest.scale.setScalar(1 + Math.sin(time * 1.6) * 0.006 * (1 - walkW));

    // arms swing opposite to legs; elbows relax
    const carrying = basket.visible;
    const armA = A * 1.05;
    let lShoulderX = armA * s;
    let rShoulderX = armA * -s * (carrying ? 0.35 : 1);
    let lElbowX = -(0.18 + 0.32 * Math.max(0, -lShoulderX) * 2) * (0.6 + walkW * 0.4);
    let rElbowX = carrying ? -0.32 : -(0.18 + 0.32 * Math.max(0, -rShoulderX) * 2) * (0.6 + walkW * 0.4);
    let lZ = 0.1;
    let rZ = carrying ? -0.17 : -0.1;

    if (posed === 'display') {
      lShoulderX = 0.05;
      rShoulderX = -0.12;
      lElbowX = -0.2;
      rElbowX = -0.35;
      lZ = 0.16;
      rZ = -0.12;
    }
    if (posed === 'showWrist') {
      lShoulderX = -0.9;
      lElbowX = -1.4;
      lZ = 0.25;
    }

    // pick-up reach (right arm), 1.1 s
    if (pickT >= 0) {
      pickT += dt;
      const t = pickT / 1.1;
      const reach = t < 0.45 ? Math.sin((t / 0.45) * Math.PI / 2) : t < 1 ? Math.cos(((t - 0.45) / 0.55) * Math.PI / 2) : 0;
      rShoulderX = THREE.MathUtils.lerp(rShoulderX, -1.15, reach);
      rElbowX = THREE.MathUtils.lerp(rElbowX, -0.35, reach);
      rZ = THREE.MathUtils.lerp(rZ, -0.05, reach);
      spine.rotation.x += 0.12 * reach;
      if (t >= 1) pickT = -1;
    }

    shoulderL.rotation.x = damp(shoulderL.rotation.x, lShoulderX, 14, dt);
    shoulderR.rotation.x = damp(shoulderR.rotation.x, rShoulderX, 14, dt);
    shoulderL.rotation.z = damp(shoulderL.rotation.z, lZ, 10, dt);
    shoulderR.rotation.z = damp(shoulderR.rotation.z, rZ, 10, dt);
    elbowL.rotation.x = damp(elbowL.rotation.x, lElbowX, 12, dt);
    elbowR.rotation.x = damp(elbowR.rotation.x, rElbowX, 12, dt);
    wristL.rotation.x = posed === 'showWrist' ? 0.2 : 0.06;
    wristL.rotation.y = posed === 'showWrist' ? -1.2 : 0;

    // basket hangs vertically from the hand
    if (carrying) {
      basket.rotation.x = -(shoulderR.rotation.x + elbowR.rotation.x + spine.rotation.x);
      basket.rotation.z = -(shoulderR.rotation.z) + Math.sin(phase) * 0.05 * walkW;
    }

    // head look-at (target in world space)
    let yawT = 0;
    let pitchT = walkW * 0.04;
    if (lookTarget && posed === 'idle') {
      root.updateMatrixWorld(true);
      tmpM.copy(neck.matrixWorld).invert();
      tmpV.copy(lookTarget).applyMatrix4(tmpM);
      yawT = THREE.MathUtils.clamp(Math.atan2(tmpV.x, tmpV.z), -0.85, 0.85);
      pitchT = THREE.MathUtils.clamp(-Math.atan2(tmpV.y - 0.1, Math.hypot(tmpV.x, tmpV.z)), -0.45, 0.5);
    }
    lookYaw.v = damp(lookYaw.v, yawT, 4, dt);
    lookPitch.v = damp(lookPitch.v, pitchT, 4, dt);
    neck.rotation.y = lookYaw.v * 0.35;
    head.rotation.y = lookYaw.v * 0.65;
    head.rotation.x = lookPitch.v * 0.7 + Math.sin(phase * 2) * 0.012 * walkW;
    neck.rotation.x = lookPitch.v * 0.3;
  }

  function pose(name: 'display' | 'idle' | 'showWrist') {
    posed = name;
    // settle immediately (used for static mannequins)
    for (let i = 0; i < 30; i++) update(1 / 30, { speed: 0, turnRate: 0 });
  }

  const rig: AvatarRig = {
    root,
    get eyeHeight() {
      return eyeHeight;
    },
    update,
    applyConfig(next: AvatarConfig) {
      cfg = next;
      build();
    },
    setBasketCount(n: number) {
      basketCount = n;
      applyBasketCount();
    },
    triggerPick() {
      pickT = 0;
    },
    setLookTarget(p) {
      lookTarget = p ? p.clone() : null;
    },
    pose,
    anchors: { head, chest, leftWrist: wristL, feet: feetAnchor, lips: lipsAnchor },
    setVisible(v: boolean) {
      body.visible = v;
    },
    dispose() {
      clearBuilt();
      root.removeFromParent();
    },
  };
  return rig;
}

/** Ready-made avatars for guest mode — a diverse set of looks */
export const READY_MADE_AVATARS: { id: string; label: string; config: AvatarConfig }[] = [
  {
    id: 'ayaan', label: 'Smart casual',
    config: { gender: 'male', bodyType: 'average', skinTone: '#b98a64', hairColor: '#1b1512', hairStyle: 'parted', eyeColor: '#3b2a1e', facialHair: 'stubble', topStyle: 'shirt', outfitColor: '#dfe7ef', bottomStyle: 'trousers', pantsColor: '#2b3445', shoeStyle: 'formal', shoesColor: '#3a2618', heightScale: 1.02, accessories: { glasses: false, watch: true, shoppingBasket: true }, watchCaseColor: '#c9ccd0', watchStrap: 'leather', watchStrapColor: '#3a2618', avatarName: 'Smart casual', source: 'preset', version: 2 },
  },
  {
    id: 'mehwish', label: 'Modest classic',
    config: { gender: 'female', bodyType: 'average', skinTone: '#c99a74', hairColor: '#4b5a6a', hairStyle: 'headscarf', eyeColor: '#3b2a1e', topStyle: 'knit', outfitColor: '#e8dccb', bottomStyle: 'trousers', pantsColor: '#3b3f46', shoeStyle: 'formal', shoesColor: '#2a2421', heightScale: 0.99, accessories: { glasses: false, watch: true, shoppingBasket: true }, watchCaseColor: '#c99b86', watchStrap: 'metal', avatarName: 'Modest classic', source: 'preset', version: 2 },
  },
  {
    id: 'sara', label: 'Weekend',
    config: { gender: 'female', bodyType: 'slim', skinTone: '#e2b896', hairColor: '#3a2416', hairStyle: 'long', eyeColor: '#4a3524', topStyle: 'tee', outfitColor: '#9f1239', bottomStyle: 'jeans', pantsColor: '#30476b', shoeStyle: 'sneakers', shoesColor: '#f1f0ec', heightScale: 0.98, accessories: { glasses: false, watch: false, shoppingBasket: true }, avatarName: 'Weekend', source: 'preset', version: 2 },
  },
  {
    id: 'kofi', label: 'Creative',
    config: { gender: 'male', bodyType: 'slim', skinTone: '#6b4630', hairColor: '#141110', hairStyle: 'curly', eyeColor: '#2b1d14', facialHair: 'beard', topStyle: 'jacket', outfitColor: '#4d5a3a', bottomStyle: 'trousers', pantsColor: '#d8cbb3', shoeStyle: 'sneakers', shoesColor: '#ffffff', heightScale: 1.04, accessories: { glasses: true, watch: true, shoppingBasket: true }, glassesStyle: 'optical', glassesColor: '#2b1d14', watchCaseColor: '#232427', watchStrap: 'silicone', watchStrapColor: '#232427', avatarName: 'Creative', source: 'preset', version: 2 },
  },
  {
    id: 'mei', label: 'Minimal',
    config: { gender: 'female', bodyType: 'average', skinTone: '#ecc9a8', hairColor: '#120f0d', hairStyle: 'bob', eyeColor: '#2a1d16', topStyle: 'shirt', outfitColor: '#f4f4f1', bottomStyle: 'skirt', pantsColor: '#1f2a44', shoeStyle: 'formal', shoesColor: '#141414', heightScale: 0.96, accessories: { glasses: false, watch: true, shoppingBasket: true }, watchCaseColor: '#c8a96a', watchStrap: 'leather', watchStrapColor: '#141414', avatarName: 'Minimal', source: 'preset', version: 2 },
  },
  {
    id: 'omar', label: 'Classic',
    config: { gender: 'male', bodyType: 'broad', skinTone: '#a87c5a', hairColor: '#6e6a66', hairStyle: 'short', eyeColor: '#3b2a1e', facialHair: 'beard', topStyle: 'knit', outfitColor: '#1f2a44', bottomStyle: 'trousers', pantsColor: '#b9a27a', shoeStyle: 'boots', shoesColor: '#5a3a26', heightScale: 1.0, accessories: { glasses: true, watch: true, shoppingBasket: true }, glassesStyle: 'optical', glassesColor: '#1c1d1f', watchCaseColor: '#c9ccd0', watchStrap: 'metal', avatarName: 'Classic', source: 'preset', version: 2 },
  },
];

export const DEFAULT_AVATAR: AvatarConfig = READY_MADE_AVATARS[0].config;

/** Upgrade configs saved by the old avatar studio */
export function normaliseAvatarConfig(c: Partial<AvatarConfig> | null | undefined): AvatarConfig {
  const base = { ...DEFAULT_AVATAR };
  if (!c) return base;
  const merged: AvatarConfig = { ...base, ...c, accessories: { ...base.accessories, ...(c.accessories || {}) }, version: 2 };
  delete merged.customPhotoUrl;
  return merged;
}
