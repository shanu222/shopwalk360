import * as THREE from 'three';

/**
 * Lobby centrepiece: a brass armillary sculpture over a reflecting pool, with a
 * soft fountain, ripples, orbiting light and a kinetic ceiling installation.
 * Everything is procedural and animated from a single update(t) call.
 */
export interface Centerpiece {
  group: THREE.Group;
  /** collider radius around the plinth (metres) */
  radius: number;
  update: (t: number, dt: number) => void;
  dispose: () => void;
}

function brandBandTexture(text: string) {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  g.font = '700 74px Inter, "Helvetica Neue", Arial, sans-serif';
  g.fillStyle = '#ffe9b8';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(255,214,140,0.9)';
  g.shadowBlur = 18;
  const unit = `${text}   ·   `;
  const w = g.measureText(unit).width;
  for (let x = 0; x < c.width + w; x += w) g.fillText(unit, x, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function glowSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,240,210,0.6)');
  gr.addColorStop(1, 'rgba(255,240,210,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function buildCenterpiece(opts: { x: number; z: number; low: boolean; brand: string; ceilingY: number }): Centerpiece {
  const group = new THREE.Group();
  group.position.set(opts.x, 0, opts.z);
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(o: T) => (disposables.push(o), o);

  const brass = track(new THREE.MeshStandardMaterial({ color: '#d4ad62', metalness: 1, roughness: 0.22 }));
  const darkBrass = track(new THREE.MeshStandardMaterial({ color: '#8a6a34', metalness: 1, roughness: 0.35 }));
  const stone = track(new THREE.MeshStandardMaterial({ color: '#23252a', metalness: 0.2, roughness: 0.18 }));
  const stoneLight = track(new THREE.MeshStandardMaterial({ color: '#e8e2d6', metalness: 0.05, roughness: 0.3 }));
  const water = track(new THREE.MeshStandardMaterial({ color: '#16323b', metalness: 0.9, roughness: 0.04, transparent: true, opacity: 0.92 }));

  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    track(geo);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = !opts.low;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  // ---- plinth & reflecting pool
  add(new THREE.CylinderGeometry(1.62, 1.7, 0.36, 64), stone, 0, 0.18);
  add(new THREE.TorusGeometry(1.6, 0.045, 10, 96), brass, 0, 0.36).rotation.x = Math.PI / 2;
  add(new THREE.CylinderGeometry(1.52, 1.52, 0.02, 64), water, 0, 0.35);
  add(new THREE.CylinderGeometry(0.42, 0.52, 0.7, 48), stoneLight, 0, 0.7);
  add(new THREE.CylinderGeometry(0.46, 0.46, 0.05, 48), brass, 0, 1.07);
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 16), darkBrass, 0, 1.45);

  // ---- armillary sculpture
  const sculpt = new THREE.Group();
  sculpt.position.y = 2.35;
  group.add(sculpt);
  const ringA = new THREE.Mesh(track(new THREE.TorusGeometry(1.0, 0.035, 12, 128)), brass);
  const ringB = new THREE.Mesh(track(new THREE.TorusGeometry(0.86, 0.03, 12, 128)), brass);
  const ringC = new THREE.Mesh(track(new THREE.TorusGeometry(0.72, 0.026, 12, 128)), darkBrass);
  const gimbalB = new THREE.Group();
  const gimbalC = new THREE.Group();
  sculpt.add(ringA, gimbalB);
  gimbalB.add(ringB, gimbalC);
  gimbalC.add(ringC);
  ringA.rotation.x = Math.PI / 2;
  // brand band, slowly turning
  const bandTex = track(brandBandTexture(opts.brand.toUpperCase()));
  bandTex.repeat.set(2, 1);
  const bandMat = track(new THREE.MeshBasicMaterial({ map: bandTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
  const band = new THREE.Mesh(track(new THREE.CylinderGeometry(1.18, 1.18, 0.16, 96, 1, true)), bandMat);
  sculpt.add(band);
  // glowing core
  const coreMat = track(new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: '#ffcf7a', emissiveIntensity: 1.6, roughness: 0.2 }));
  const core = new THREE.Mesh(track(new THREE.IcosahedronGeometry(0.24, 4)), coreMat);
  sculpt.add(core);
  const sprite = track(glowSprite());
  const haloMat = track(new THREE.SpriteMaterial({ map: sprite, color: '#ffd89a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const halo = new THREE.Sprite(haloMat);
  halo.scale.setScalar(1.6);
  sculpt.add(halo);
  const coreLight = new THREE.PointLight('#ffd08a', opts.low ? 0 : 3, 7, 2);
  sculpt.add(coreLight);

  // ---- orbiting sparkles
  const sparkN = opts.low ? 24 : 60;
  const sparkPos = new Float32Array(sparkN * 3);
  const sparkGeo = track(new THREE.BufferGeometry());
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = track(new THREE.PointsMaterial({ map: sprite, color: '#ffe2a8', size: 0.12, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  group.add(sparks);
  const sparkSeed = Array.from({ length: sparkN }, (_, i) => ({ r: 1.25 + Math.random() * 0.5, a: (i / sparkN) * Math.PI * 2, h: 1.6 + Math.random() * 1.6, s: 0.2 + Math.random() * 0.35, p: Math.random() * 6 }));

  // ---- fountain: arcs of droplets from the pool edge towards the pedestal
  const dropN = opts.low ? 90 : 260;
  const dropPos = new Float32Array(dropN * 3);
  const dropGeo = track(new THREE.BufferGeometry());
  dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
  const dropMat = track(new THREE.PointsMaterial({ map: sprite, color: '#cfeeff', size: 0.07, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
  const drops = new THREE.Points(dropGeo, dropMat);
  drops.frustumCulled = false;
  group.add(drops);
  const JETS = 12;
  const dropSeed = Array.from({ length: dropN }, (_, i) => ({ jet: i % JETS, p: Math.random() }));

  // ---- ripples
  const rippleMats: THREE.MeshBasicMaterial[] = [];
  const ripples: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const m = track(new THREE.MeshBasicMaterial({ color: '#bfe6ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    const r = new THREE.Mesh(track(new THREE.RingGeometry(0.96, 1, 64)), m);
    r.rotation.x = -Math.PI / 2;
    r.position.y = 0.365;
    group.add(r);
    ripples.push(r);
    rippleMats.push(m);
  }

  // ---- kinetic ceiling installation: brass discs rising and falling in a wave
  let kinetic: THREE.InstancedMesh | null = null;
  const kSeed: { x: number; z: number; d: number }[] = [];
  if (!opts.low) {
    for (let ring = 0; ring < 6; ring++) {
      const r = 0.35 + ring * 0.42;
      const n = ring === 0 ? 6 : Math.round(r * 9);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ring * 0.3;
        kSeed.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, d: r });
      }
    }
    const kGeo = track(new THREE.CylinderGeometry(0.11, 0.11, 0.015, 20));
    kinetic = new THREE.InstancedMesh(kGeo, brass, kSeed.length);
    kinetic.frustumCulled = false;
    group.add(kinetic);
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();

  const update = (t: number) => {
    // sculpture
    ringA.rotation.z = t * 0.25;
    gimbalB.rotation.x = t * 0.32;
    gimbalB.rotation.y = t * 0.18;
    gimbalC.rotation.y = -t * 0.45;
    gimbalC.rotation.z = t * 0.21;
    band.rotation.y = -t * 0.12;
    sculpt.position.y = 2.35 + Math.sin(t * 0.8) * 0.06;
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.7);
    coreMat.emissiveIntensity = 1.3 + pulse * 0.9;
    halo.scale.setScalar(1.4 + pulse * 0.45);
    coreLight.intensity = opts.low ? 0 : 2.4 + pulse * 1.2;

    // sparkles
    for (let i = 0; i < sparkN; i++) {
      const s = sparkSeed[i];
      const a = s.a + t * s.s;
      sparkPos[i * 3] = Math.cos(a) * s.r;
      sparkPos[i * 3 + 1] = s.h + Math.sin(t * 1.3 + s.p) * 0.18;
      sparkPos[i * 3 + 2] = Math.sin(a) * s.r;
    }
    sparkGeo.attributes.position.needsUpdate = true;

    // fountain droplets follow a parabola from the rim (r=1.42) to the pedestal (r=0.5)
    for (let i = 0; i < dropN; i++) {
      const d = dropSeed[i];
      const k = (d.p + t * 0.55) % 1;
      const a = (d.jet / JETS) * Math.PI * 2 + t * 0.05;
      const r = 1.42 - 0.95 * k;
      dropPos[i * 3] = Math.cos(a) * r;
      dropPos[i * 3 + 1] = 0.38 + 1.15 * 4 * k * (1 - k);
      dropPos[i * 3 + 2] = Math.sin(a) * r;
    }
    dropGeo.attributes.position.needsUpdate = true;

    // ripples spreading where the jets land
    ripples.forEach((r, i) => {
      const k = (t * 0.35 + i / 3) % 1;
      const s = 0.5 + k * 0.95;
      r.scale.set(s, s, 1);
      rippleMats[i].opacity = 0.35 * (1 - k);
    });

    // kinetic wave
    if (kinetic) {
      for (let i = 0; i < kSeed.length; i++) {
        const k = kSeed[i];
        const y = opts.ceilingY - 2.6 + Math.sin(t * 0.7 - k.d * 1.6) * 0.55;
        pos.set(k.x, y, k.z);
        e.set(Math.sin(t * 0.7 - k.d * 1.6) * 0.25, 0, 0);
        q.setFromEuler(e);
        m4.compose(pos, q, one);
        kinetic.setMatrixAt(i, m4);
      }
      kinetic.instanceMatrix.needsUpdate = true;
    }
  };
  update(0);

  return {
    group,
    radius: 1.72,
    update,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
