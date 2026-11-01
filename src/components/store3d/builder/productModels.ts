/**
 * Procedural product models, built at TRUE real-world scale (metres), origin at the base, front facing +z.
 *
 * These are illustrative models generated from each product's listed form factor and specifications.
 * The UI labels them as such. When an admin uploads a GLB for a product, that model is used instead.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { std, emissive } from './materials';

export interface Hotspot {
  /** label shown to the shopper */
  label: string;
  /** specification key whose value is shown (only if the product actually has it) */
  specKey?: string;
  position: THREE.Vector3;
}

export interface ProductModel {
  group: THREE.Group;
  hotspots: Hotspot[];
  /** true when the model's size comes from the product's own dimensions */
  dimensionsFromData: boolean;
  /** optional interactive demonstration */
  demo?: DemoDefinition;
}

export interface DemoDefinition {
  title: string;
  steps: { label: string; specKey?: string }[];
  /** advance the demo animation; t in [0, steps.length] */
  update: (t: number) => void;
}

export interface Dimensions {
  w: number;
  h: number;
  d: number;
}

export function parseDims(json?: string | null): Dimensions | null {
  if (!json) return null;
  try {
    const d = JSON.parse(json);
    if (d && d.w > 0 && d.h > 0 && d.d > 0) return { w: +d.w, h: +d.h, d: +d.d };
  } catch {
    /* ignore */
  }
  return null;
}

export function parseColorMap(json?: string | null): Record<string, string> {
  if (!json) return {};
  try {
    const m = JSON.parse(json);
    return m && typeof m === 'object' ? m : {};
  } catch {
    return {};
  }
}

const NAMED: [RegExp, string][] = [
  [/black|obsidian|onyx|jet/i, '#1c1d1f'], [/white|chalk|ivory|pearl/i, '#eeece6'], [/navy/i, '#1f2a44'], [/blue|sapphire|sky/i, '#3e6aa8'],
  [/red|ruby|crimson/i, '#8e1b2b'], [/green|olive|forest|emerald|sage/i, '#4d5a3a'], [/gr[ae]y|slate|charcoal|graphite|gunmetal|carbon/i, '#55595f'],
  [/silver|steel|stainless|aluminum|aluminium/i, '#b8bcc1'], [/gold|brass/i, '#c8a96a'], [/rose/i, '#c99b86'], [/brown|walnut|cognac|tan|saddle|mocha/i, '#7a4a2a'],
  [/oak|natural|beige|khaki|sand|linen|oat/i, '#c8b28a'], [/pink|nude/i, '#c58a86'], [/purple|plum/i, '#5c2240'], [/orange|peach|coral/i, '#d9805f'],
  [/yellow|mustard/i, '#cfa53a'],
];

/** Resolve a colour name to hex: admin-defined map first, then common colour words. Returns null if unknown. */
export function resolveColor(name: string | undefined, map: Record<string, string>): string | null {
  if (!name) return null;
  if (map[name]) return map[name];
  const k = Object.keys(map).find((x) => x.toLowerCase() === name.toLowerCase());
  if (k) return map[k];
  for (const [re, hex] of NAMED) if (re.test(name)) return hex;
  return null;
}

const rb = (w: number, h: number, d: number, r: number, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) / 2 - 1e-4));

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  o.castShadow = true;
  return o;
}

function lathe(profile: [number, number][], seg = 40) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

/* ------------------------------------------------------------------------------------------------ */

function charger(color: string): ProductModel {
  const g = new THREE.Group();
  const body = std(color, 0.55, 0.05);
  const dark = std('#0c0d0f', 0.4, 0.2);
  const metal = std('#cfd3d7', 0.25, 0.9);
  // 2-pin body, ports on the top face (matches "2x USB Type-C, 1x USB-A")
  g.add(mesh(rb(0.056, 0.064, 0.033, 0.008), body, 0, 0.032, 0));
  const portsY = 0.0641;
  g.add(mesh(rb(0.0095, 0.002, 0.0035, 0.0015), dark, -0.013, portsY, 0.004));
  g.add(mesh(rb(0.0095, 0.002, 0.0035, 0.0015), dark, 0.003, portsY, 0.004));
  g.add(mesh(new THREE.BoxGeometry(0.0125, 0.002, 0.005), dark, 0.019, portsY, 0.004));
  // prongs
  g.add(mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.019, 12), metal, -0.0095, 0.012, -0.026, Math.PI / 2));
  g.add(mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.019, 12), metal, 0.0095, 0.012, -0.026, Math.PI / 2));
  // coiled braided cable next to it
  const cable = std('#2a2c30', 0.85, 0);
  for (let i = 0; i < 4; i++) g.add(mesh(new THREE.TorusGeometry(0.038 - i * 0.002, 0.0028, 8, 40), cable, 0.085, 0.004 + i * 0.0055, 0.01, Math.PI / 2));
  return {
    group: g,
    dimensionsFromData: false,
    hotspots: [
      { label: 'USB-C ports', specKey: 'Port Setup', position: new THREE.Vector3(-0.005, 0.068, 0.004) },
      { label: 'USB-A port', specKey: 'Port Setup', position: new THREE.Vector3(0.019, 0.068, 0.004) },
      { label: 'Wall plug', specKey: 'Input Voltage', position: new THREE.Vector3(0, 0.012, -0.036) },
      { label: 'Cable', specKey: 'Cable Included', position: new THREE.Vector3(0.11, 0.02, 0.01) },
    ],
  };
}

function carMount(color: string): ProductModel {
  const g = new THREE.Group();
  const body = std(color, 0.5, 0.2);
  const ring = std('#9aa0a6', 0.3, 0.9);
  g.add(mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.012, 48), body, 0, 0.09, 0.02, Math.PI / 2));
  g.add(mesh(new THREE.TorusGeometry(0.026, 0.0016, 8, 48), ring, 0, 0.09, 0.0265));
  g.add(mesh(new THREE.SphereGeometry(0.009, 20, 16), body, 0, 0.09, 0.008));
  g.add(mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.07, 16), body, 0, 0.05, 0.0));
  g.add(mesh(rb(0.05, 0.016, 0.03, 0.005), body, 0, 0.008, 0));
  // phone (for the demonstration)
  const phone = new THREE.Group();
  phone.add(mesh(rb(0.075, 0.155, 0.008, 0.009), std('#141518', 0.3, 0.4)));
  phone.add(mesh(new THREE.PlaneGeometry(0.069, 0.148), emissive('#2a3646', 0.9), 0, 0, 0.0042));
  phone.position.set(0, 0.09, 0.08);
  phone.visible = false;
  g.add(phone);
  return {
    group: g,
    dimensionsFromData: false,
    hotspots: [
      { label: 'Magnetic ring', specKey: 'Magnetic Strength', position: new THREE.Vector3(0, 0.12, 0.03) },
      { label: 'Wireless charging pad', specKey: 'Wireless Output', position: new THREE.Vector3(0, 0.09, 0.03) },
      { label: 'Mount', specKey: 'Mount Types', position: new THREE.Vector3(0, 0.01, 0.02) },
    ],
    demo: {
      title: 'How it attaches',
      steps: [{ label: 'Bring the phone close to the magnetic ring', specKey: 'Magnetic Strength' }, { label: 'Phone snaps on and starts charging wirelessly', specKey: 'Wireless Output' }],
      update: (t) => {
        phone.visible = true;
        const k = Math.min(1, t);
        phone.position.z = 0.08 - k * 0.051;
        phone.rotation.z = (1 - k) * 0.3;
        const glow = phone.children[1] as THREE.Mesh;
        glow.material = t >= 1.6 ? emissive('#3b7a57', 1) : emissive('#2a3646', 0.9);
      },
    },
  };
}

function kettle(color: string): ProductModel {
  const g = new THREE.Group();
  const body = std(color, color === '#b9bcbf' ? 0.25 : 0.45, color === '#b9bcbf' ? 0.9 : 0.4);
  const wood = std('#8b5a35', 0.6, 0);
  g.add(mesh(lathe([[0, 0], [0.072, 0], [0.078, 0.01], [0.08, 0.07], [0.074, 0.11], [0.05, 0.135], [0.045, 0.14], [0, 0.14]]), body));
  g.add(mesh(lathe([[0, 0], [0.047, 0], [0.047, 0.01], [0.02, 0.018], [0, 0.02]]), body, 0, 0.14, 0));
  g.add(mesh(new THREE.SphereGeometry(0.011, 16, 12), wood, 0, 0.165, 0));
  // thermometer dial on lid
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.006, 24), std('#f2f0ea', 0.3), 0.022, 0.158, 0.012, 0.3));
  // gooseneck spout
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.02, 0.07), new THREE.Vector3(0, 0.03, 0.12), new THREE.Vector3(0, 0.1, 0.16), new THREE.Vector3(0, 0.15, 0.19), new THREE.Vector3(0, 0.16, 0.215),
  ]);
  g.add(mesh(new THREE.TubeGeometry(curve, 40, 0.0055, 12, false), body));
  // handle
  const hc = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.12, -0.068), new THREE.Vector3(0, 0.14, -0.12), new THREE.Vector3(0, 0.07, -0.135), new THREE.Vector3(0, 0.03, -0.08),
  ]);
  g.add(mesh(new THREE.TubeGeometry(hc, 30, 0.011, 12, false), wood));
  return {
    group: g,
    dimensionsFromData: false,
    hotspots: [
      { label: 'Gooseneck spout', specKey: 'Spout', position: new THREE.Vector3(0, 0.16, 0.215) },
      { label: 'Thermometer', specKey: 'Thermometer', position: new THREE.Vector3(0.022, 0.17, 0.012) },
      { label: 'Handle', specKey: 'Handle', position: new THREE.Vector3(0, 0.1, -0.135) },
      { label: 'Body', specKey: 'Material', position: new THREE.Vector3(0.08, 0.06, 0) },
    ],
  };
}

function diffuser(color: string): ProductModel {
  const g = new THREE.Group();
  const base = std(color, 0.6, 0);
  g.add(mesh(lathe([[0, 0], [0.085, 0], [0.09, 0.02], [0.085, 0.06], [0, 0.06]]), base));
  g.add(mesh(lathe([[0, 0.06], [0.083, 0.06], [0.075, 0.11], [0.05, 0.16], [0.012, 0.195], [0, 0.198]]), std('#f3f1ec', 0.35)));
  g.add(mesh(new THREE.TorusGeometry(0.084, 0.003, 8, 48), emissive('#ffd9a8', 1.2), 0, 0.06, 0, Math.PI / 2));
  return {
    group: g,
    dimensionsFromData: false,
    hotspots: [
      { label: 'Reservoir', specKey: 'Capacity', position: new THREE.Vector3(0, 0.13, 0.07) },
      { label: 'Timer & safety', specKey: 'Timer Modes', position: new THREE.Vector3(0.088, 0.03, 0) },
    ],
  };
}

function laptopStand(color: string): ProductModel {
  const g = new THREE.Group();
  const al = std(color, 0.35, 0.85);
  const swivel = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.11, 0.115, 0.012, 64), al, 0, 0.006, 0));
  swivel.position.y = 0.012;
  g.add(swivel);
  swivel.add(mesh(rb(0.02, 0.16, 0.03, 0.006), al, -0.09, 0.08, 0, 0, 0, 0));
  swivel.add(mesh(rb(0.02, 0.16, 0.03, 0.006), al, 0.09, 0.08, 0, 0, 0, 0));
  const plate = mesh(rb(0.26, 0.006, 0.22, 0.004), al, 0, 0.17, 0, -0.26);
  swivel.add(plate);
  swivel.add(mesh(rb(0.26, 0.012, 0.006, 0.002), al, 0, 0.142, 0.106, -0.26));
  return {
    group: g,
    dimensionsFromData: false,
    hotspots: [
      { label: 'Swivel base', specKey: 'Swivel', position: new THREE.Vector3(0.11, 0.01, 0) },
      { label: 'Platform', specKey: 'Load Capacity', position: new THREE.Vector3(0, 0.19, 0) },
      { label: 'Frame', specKey: 'Material', position: new THREE.Vector3(0.09, 0.09, 0) },
    ],
    demo: {
      title: '360° swivel',
      steps: [{ label: 'Rotate the platform on its base', specKey: 'Swivel' }],
      update: (t) => {
        swivel.rotation.y = (t % 1) * Math.PI * 2;
      },
    },
  };
}

function packingCubes(color: string): ProductModel {
  const g = new THREE.Group();
  const m = std(color, 0.85, 0);
  const zip = std('#141517', 0.5, 0.3);
  const sizes: [number, number, number][] = [[0.4, 0.1, 0.3], [0.33, 0.09, 0.25], [0.26, 0.08, 0.2]];
  let y = 0;
  sizes.forEach(([w, h, d], i) => {
    g.add(mesh(rb(w, h, d, 0.025), m, i * 0.01, y + h / 2, 0));
    g.add(mesh(new THREE.BoxGeometry(w * 0.9, 0.004, 0.004), zip, i * 0.01, y + h * 0.85, d / 2));
    y += h;
  });
  return { group: g, dimensionsFromData: false, hotspots: [{ label: 'Fabric', specKey: 'Material', position: new THREE.Vector3(0.2, 0.05, 0.15) }, { label: 'Zips', specKey: 'Zippers', position: new THREE.Vector3(0, 0.09, 0.16) }] };
}

function tireInflator(color: string): ProductModel {
  const g = new THREE.Group();
  const body = std(color, 0.5, 0.2);
  g.add(mesh(rb(0.07, 0.17, 0.045, 0.014), body, 0, 0.085, 0));
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 128;
  screenCanvas.height = 96;
  const sctx = screenCanvas.getContext('2d')!;
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  const draw = (val: number) => {
    sctx.fillStyle = '#0b1410';
    sctx.fillRect(0, 0, 128, 96);
    sctx.fillStyle = '#7ff0b0';
    sctx.font = 'bold 44px monospace';
    sctx.textAlign = 'center';
    sctx.fillText(String(Math.round(val)), 64, 58);
    sctx.font = 'bold 16px monospace';
    sctx.fillText('PSI', 64, 84);
    screenTex.needsUpdate = true;
  };
  draw(0);
  g.add(mesh(new THREE.PlaneGeometry(0.05, 0.038), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }), 0, 0.12, 0.0226));
  [-0.014, 0, 0.014].forEach((x) => g.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.004, 16), std('#2b2d31', 0.5), x, 0.07, 0.0225, Math.PI / 2)));
  g.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.004, 24), emissive('#fff6dc', 1), 0, 0.172, 0));
  const hose = new THREE.CatmullRomCurve3([new THREE.Vector3(0.03, 0.15, 0), new THREE.Vector3(0.07, 0.16, 0.02), new THREE.Vector3(0.09, 0.08, 0.03), new THREE.Vector3(0.08, 0.02, 0.04)]);
  g.add(mesh(new THREE.TubeGeometry(hose, 30, 0.004, 8, false), std('#151618', 0.7)));
  return {
    group: g,
    dimensionsFromData: false,
    hotspots: [
      { label: 'Digital gauge', specKey: 'Pressure Range', position: new THREE.Vector3(0, 0.13, 0.025) },
      { label: 'Battery', specKey: 'Battery', position: new THREE.Vector3(0.036, 0.05, 0) },
      { label: 'LED light', specKey: 'Flashlight', position: new THREE.Vector3(0, 0.175, 0) },
      { label: 'Adapters', specKey: 'Attachments', position: new THREE.Vector3(0.08, 0.02, 0.04) },
    ],
    demo: {
      title: 'Auto-stop inflation (illustrative)',
      steps: [{ label: 'Attach the hose to the valve', specKey: 'Attachments' }, { label: 'Set the target pressure and start', specKey: 'Pressure Range' }],
      update: (t) => draw(Math.max(0, Math.min(35, (t - 1) * 35))),
    },
  };
}

function wallet(color: string, dims: Dimensions | null): ProductModel {
  const g = new THREE.Group();
  const w = dims ? dims.w / 100 : 0.105;
  const h = dims ? dims.h / 100 : 0.082;
  const d = dims ? dims.d / 100 : 0.011;
  g.add(mesh(rb(w, d, h, 0.004), std(color, 0.75, 0), 0, d / 2, 0));
  g.add(mesh(new THREE.BoxGeometry(w * 0.92, 0.0004, 0.0008), std('#e8dcc4', 0.8), 0, d + 0.0002, h * 0.45));
  return { group: g, dimensionsFromData: !!dims, hotspots: [{ label: 'Leather', specKey: 'Leather', position: new THREE.Vector3(0, d, 0) }, { label: 'RFID shielding', specKey: 'RFID Protection', position: new THREE.Vector3(w / 2, d / 2, 0) }] };
}

/** Parse a watch colour option like "Silver Case / Black Leather" */
export function parseWatchVariant(name: string, map: Record<string, string>) {
  const [casePart, strapPart] = name.split('/').map((s) => s.trim());
  const strap: 'leather' | 'metal' | 'silicone' = /mesh|steel|metal|bracelet|milanese/i.test(strapPart || '') ? 'metal' : /silicone|rubber|fkm|sport/i.test(strapPart || '') ? 'silicone' : 'leather';
  const caseHex = resolveColor(casePart, {}) || map[name] || '#c9ccd0';
  const strapHex = resolveColor(strapPart, {}) || '#1c1d1f';
  return { caseHex, strapHex, strap };
}

export function buildWatch(caseHex: string, strapHex: string, strap: 'leather' | 'metal' | 'silicone', scale = 1): ProductModel {
  const g = new THREE.Group();
  const caseM = std(caseHex, 0.22, 0.95);
  const dialCanvas = document.createElement('canvas');
  dialCanvas.width = 256;
  dialCanvas.height = 256;
  const c = dialCanvas.getContext('2d')!;
  c.fillStyle = '#16181c';
  c.beginPath();
  c.arc(128, 128, 128, 0, Math.PI * 2);
  c.fill();
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const long = i % 5 === 0;
    c.strokeStyle = long ? '#f2efe8' : '#7d8188';
    c.lineWidth = long ? 5 : 2;
    c.beginPath();
    c.moveTo(128 + Math.sin(a) * (long ? 96 : 108), 128 - Math.cos(a) * (long ? 96 : 108));
    c.lineTo(128 + Math.sin(a) * 118, 128 - Math.cos(a) * 118);
    c.stroke();
  }
  [[-34, 0], [34, 0], [0, 40]].forEach(([dx, dy]) => {
    c.strokeStyle = '#5c6067';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(128 + dx, 128 + dy, 18, 0, Math.PI * 2);
    c.stroke();
  });
  const dialTex = new THREE.CanvasTexture(dialCanvas);
  dialTex.colorSpace = THREE.SRGBColorSpace;
  const R = 0.02;
  const H = 0.0078;
  const head = new THREE.Group();
  head.add(mesh(new THREE.CylinderGeometry(R, R * 0.97, H, 64), caseM, 0, 0, 0));
  head.add(mesh(new THREE.TorusGeometry(R * 0.97, 0.0011, 12, 64), caseM, 0, H / 2, 0, Math.PI / 2));
  head.add(mesh(new THREE.CircleGeometry(R * 0.9, 64), new THREE.MeshStandardMaterial({ map: dialTex, roughness: 0.4 }), 0, H / 2 + 0.0002, 0, -Math.PI / 2));
  const crystal = new THREE.Mesh(new THREE.CircleGeometry(R * 0.93, 64), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, roughness: 0, metalness: 0.5 }));
  crystal.rotation.x = -Math.PI / 2;
  crystal.position.y = H / 2 + 0.0008;
  head.add(crystal);
  const handM = std('#f4f1ea', 0.3, 0.6);
  head.add(mesh(new THREE.BoxGeometry(0.0012, 0.0004, 0.0125), handM, 0.003, H / 2 + 0.0005, -0.005, 0, 0.6));
  head.add(mesh(new THREE.BoxGeometry(0.001, 0.0004, 0.016), handM, -0.002, H / 2 + 0.0006, -0.007, 0, -0.3));
  head.add(mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.003, 16), caseM, R + 0.0014, 0, 0, 0, 0, Math.PI / 2));
  head.add(mesh(new THREE.CylinderGeometry(0.0014, 0.0014, 0.0028, 12), caseM, R * 0.82, 0, -R * 0.6, 0, 0.6, Math.PI / 2));
  head.add(mesh(new THREE.CylinderGeometry(0.0014, 0.0014, 0.0028, 12), caseM, R * 0.82, 0, R * 0.6, 0, -0.6, Math.PI / 2));
  [-1, 1].forEach((s) => [-1, 1].forEach((t) => head.add(mesh(new THREE.BoxGeometry(0.0035, 0.004, 0.007), caseM, t * 0.0085, -0.0005, s * (R + 0.0025)))));
  g.add(head);
  // straps (curved down like they would hang on a display cushion)
  const strapM = strap === 'metal' ? std(caseHex, 0.35, 0.9) : std(strapHex, strap === 'silicone' ? 0.7 : 0.8, 0);
  [-1, 1].forEach((s) => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.001, s * (R + 0.004)), new THREE.Vector3(0, -0.006, s * (R + 0.03)), new THREE.Vector3(0, -0.022, s * (R + 0.05)), new THREE.Vector3(0, -0.045, s * (R + 0.058)),
    ]);
    const pts = curve.getPoints(16);
    pts.forEach((p, i) => {
      if (i === pts.length - 1) return;
      const n = pts[i + 1];
      const len = p.distanceTo(n);
      const seg = mesh(new THREE.BoxGeometry(0.02, 0.0028, len + 0.0004), strapM);
      seg.position.copy(p).lerp(n, 0.5);
      seg.lookAt(n);
      head.add(seg);
    });
  });
  head.position.y = 0.05;
  g.scale.setScalar(scale);
  return {
    group: g,
    dimensionsFromData: false,
    hotspots: [
      { label: 'Case', specKey: 'Case Diameter', position: new THREE.Vector3(R, 0.05, 0) },
      { label: 'Crystal', specKey: 'Glass', position: new THREE.Vector3(0, 0.056, 0) },
      { label: 'Movement', specKey: 'Movement', position: new THREE.Vector3(-R, 0.05, 0) },
      { label: 'Strap', specKey: 'Lug Width', position: new THREE.Vector3(0, 0.03, R + 0.05) },
    ],
  };
}

export function buildShoe(upperHex: string, soleHex: string, mirror = false): ProductModel {
  const g = new THREE.Group();
  const L = 0.28;
  const shape = new THREE.Shape();
  // footprint outline (toe at +z)
  shape.moveTo(0, -L / 2);
  shape.bezierCurveTo(0.042, -L / 2, 0.046, -L * 0.2, 0.044, 0);
  shape.bezierCurveTo(0.05, L * 0.25, 0.052, L * 0.45, 0.012, L / 2);
  shape.bezierCurveTo(-0.025, L / 2 + 0.004, -0.045, L * 0.35, -0.043, L * 0.1);
  shape.bezierCurveTo(-0.04, -L * 0.15, -0.042, -L / 2, 0, -L / 2);
  const sole = new THREE.ExtrudeGeometry(shape, { depth: 0.032, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3, curveSegments: 24 });
  sole.rotateX(Math.PI / 2);
  sole.translate(0, 0.036, 0);
  g.add(mesh(sole, std(soleHex, 0.8, 0)));
  // upper: shaped half-ellipsoid
  const up = new THREE.SphereGeometry(1, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = up.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // taller at heel, low at toe
    const heel = (1 - z) / 2;
    pos.setXYZ(i, x * 0.046, y * (0.045 + heel * 0.05), z * (L / 2) * 0.96);
  }
  up.computeVertexNormals();
  const upper = mesh(up, std(upperHex, 0.85, 0), 0, 0.036, 0);
  g.add(upper);
  // collar opening
  g.add(mesh(new THREE.TorusGeometry(0.032, 0.006, 10, 32), std(upperHex, 0.7), 0, 0.105, -0.055, Math.PI / 2 - 0.25));
  g.add(mesh(new THREE.CircleGeometry(0.03, 32), std('#2a2a2a', 0.9), 0, 0.104, -0.055, -Math.PI / 2 + 0.25));
  // laces
  const lace = std(upperHex === '#ecebe6' ? '#d9d6cf' : '#efeeea', 0.7);
  for (let i = 0; i < 5; i++) g.add(mesh(new THREE.BoxGeometry(0.03, 0.003, 0.004), lace, 0, 0.088 - i * 0.004, -0.02 + i * 0.018, -0.35));
  if (mirror) g.scale.x = -1;
  return {
    group: g,
    dimensionsFromData: false,
    hotspots: [
      { label: 'Upper', specKey: 'Upper Material', position: new THREE.Vector3(0.046, 0.07, 0.02) },
      { label: 'Midsole', specKey: 'Midsole', position: new THREE.Vector3(0.05, 0.03, -0.04) },
      { label: 'Outsole', specKey: 'Outsole', position: new THREE.Vector3(0, 0.0, 0.08) },
    ],
  };
}

function lipTint(shade: string): ProductModel {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.06, 32), std(shade, 0.3, 0.1, { transparent: true, opacity: 0.92 }), 0, 0.03, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.0089, 0.0089, 0.045, 32), std('#d8b67a', 0.25, 0.9), 0, 0.0825, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.002, 16), std('#d8b67a', 0.25, 0.9), 0, 0.106, 0));
  return { group: g, dimensionsFromData: false, hotspots: [{ label: 'Shade', position: new THREE.Vector3(0.009, 0.03, 0) }, { label: 'Volume', specKey: 'Net Volume', position: new THREE.Vector3(0, 0.1, 0) }] };
}

function gripTrainer(color: string): ProductModel {
  const g = new THREE.Group();
  const m = std(color, 0.45, 0.7);
  g.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.11, 24), m, -0.03, 0.055, 0, 0, 0, 0.12));
  g.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.11, 24), m, 0.03, 0.055, 0, 0, 0, -0.12));
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 80; i++) {
    const a = (i / 80) * Math.PI * 6;
    pts.push(new THREE.Vector3(Math.cos(a) * 0.012, 0.115 + Math.sin(a) * 0.012, (i / 80) * 0.024 - 0.012));
  }
  g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.0018, 6, false), std('#9da2a8', 0.3, 0.9)));
  return { group: g, dimensionsFromData: false, hotspots: [{ label: 'Handles', specKey: 'Handle Material', position: new THREE.Vector3(-0.03, 0.06, 0.015) }, { label: 'Spring', specKey: 'Spring', position: new THREE.Vector3(0, 0.12, 0.015) }] };
}

/** Garment silhouette (for racks, folded stacks are separate) */
export function garmentSilhouette(kind: 'top' | 'bottom', hex: string): THREE.Group {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  if (kind === 'top') {
    s.moveTo(-0.07, 0);
    s.lineTo(-0.2, -0.05);
    s.lineTo(-0.27, -0.33);
    s.lineTo(-0.21, -0.35);
    s.lineTo(-0.17, -0.18);
    s.lineTo(-0.2, -0.72);
    s.lineTo(0.2, -0.72);
    s.lineTo(0.17, -0.18);
    s.lineTo(0.21, -0.35);
    s.lineTo(0.27, -0.33);
    s.lineTo(0.2, -0.05);
    s.lineTo(0.07, 0);
    s.quadraticCurveTo(0, -0.06, -0.07, 0);
  } else {
    s.moveTo(-0.2, 0);
    s.lineTo(0.2, 0);
    s.lineTo(0.22, -0.98);
    s.lineTo(0.05, -0.98);
    s.lineTo(0, -0.25);
    s.lineTo(-0.05, -0.98);
    s.lineTo(-0.22, -0.98);
    s.closePath();
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 });
  geo.translate(0, 0, -0.01);
  g.add(mesh(geo, std(hex, 0.9, 0)));
  // hanger
  const hanger = std('#6b4a32', 0.6);
  g.add(mesh(new THREE.TorusGeometry(0.02, 0.003, 6, 16, Math.PI * 1.4), std('#b9bcbf', 0.3, 0.9), 0, 0.045, 0));
  g.add(mesh(new THREE.BoxGeometry(kind === 'top' ? 0.42 : 0.4, 0.012, 0.012), hanger, 0, 0.01, 0));
  return g;
}

function foldedStack(hex: string, kind: 'top' | 'bottom'): ProductModel {
  const g = new THREE.Group();
  const m = std(hex, 0.9, 0);
  for (let i = 0; i < 3; i++) {
    g.add(mesh(rb(kind === 'top' ? 0.3 : 0.32, 0.045, 0.24, 0.015), m, 0, 0.0225 + i * 0.046, 0));
    if (kind === 'top') g.add(mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 20, Math.PI), m, 0, 0.046 + i * 0.046, 0.08, -Math.PI / 2));
  }
  return { group: g, dimensionsFromData: false, hotspots: [] };
}

export function buildArmchair(hex: string, dims: Dimensions | null): ProductModel {
  const d = dims || { w: 78, h: 82, d: 80 };
  const W = d.w / 100;
  const H = d.h / 100;
  const D = d.d / 100;
  const g = new THREE.Group();
  const fabric = std(hex, 0.95, 0);
  const wood = std('#7a5235', 0.55, 0);
  const legH = 0.14;
  const armW = Math.min(0.16, W * 0.18);
  g.add(mesh(rb(W, 0.2, D, 0.05), fabric, 0, legH + 0.1, 0));
  g.add(mesh(rb(W - armW * 2, 0.14, D - 0.16, 0.06), fabric, 0, legH + 0.27, 0.05));
  g.add(mesh(rb(W - armW * 2, H - legH - 0.2, 0.18, 0.07), fabric, 0, legH + 0.2 + (H - legH - 0.2) / 2, -D / 2 + 0.09, -0.12));
  [-1, 1].forEach((s) => g.add(mesh(rb(armW, 0.62 * (H - legH), D, 0.05), fabric, s * (W / 2 - armW / 2), legH + 0.31 * (H - legH), 0)));
  [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => g.add(mesh(new THREE.CylinderGeometry(0.018, 0.012, legH, 12), wood, sx * (W / 2 - 0.06), legH / 2, sz * (D / 2 - 0.06)))));
  return { group: g, dimensionsFromData: !!dims, hotspots: [] };
}

export function buildSideTable(hex: string, dims: Dimensions | null): ProductModel {
  const d = dims || { w: 50, h: 55, d: 50 };
  const W = d.w / 100;
  const H = d.h / 100;
  const g = new THREE.Group();
  const wood = std(hex, 0.55, 0);
  g.add(mesh(new THREE.CylinderGeometry(W / 2, W / 2, 0.03, 64), wood, 0, H - 0.015, 0));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = mesh(new THREE.CylinderGeometry(0.016, 0.011, H - 0.03, 12), wood, Math.cos(a) * W * 0.32, (H - 0.03) / 2, Math.sin(a) * W * 0.32);
    leg.rotation.z = Math.cos(a) * 0.06;
    leg.rotation.x = -Math.sin(a) * 0.06;
    g.add(leg);
  }
  return { group: g, dimensionsFromData: !!dims, hotspots: [] };
}

export function buildSunglasses(frameHex: string): ProductModel {
  const g = new THREE.Group();
  const frame = std(frameHex, 0.35, 0.1);
  const lens = std('#1a1f24', 0.05, 0.6, { transparent: true, opacity: 0.85 });
  [-1, 1].forEach((s) => {
    const ring = mesh(new THREE.TorusGeometry(0.025, 0.0035, 12, 40), frame, s * 0.033, 0.03, 0);
    ring.scale.set(1.15, 0.9, 1);
    g.add(ring);
    const l = mesh(new THREE.CircleGeometry(0.025, 40), lens, s * 0.033, 0.03, 0);
    l.scale.set(1.15, 0.9, 1);
    g.add(l);
    g.add(mesh(new THREE.BoxGeometry(0.004, 0.004, 0.13), frame, s * 0.067, 0.033, -0.065));
  });
  g.add(mesh(new THREE.BoxGeometry(0.016, 0.004, 0.004), frame, 0, 0.038, 0));
  return { group: g, dimensionsFromData: false, hotspots: [] };
}

export function buildTote(hex: string): ProductModel {
  const g = new THREE.Group();
  const m = std(hex, 0.95, 0);
  const geo = rb(0.38, 0.4, 0.11, 0.02);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) * (1 + (y / 0.4) * 0.12));
  }
  geo.computeVertexNormals();
  g.add(mesh(geo, m, 0, 0.2, 0));
  [-1, 1].forEach((s) => g.add(mesh(new THREE.TorusGeometry(0.09, 0.008, 8, 24, Math.PI), m, 0, 0.4, s * 0.03)));
  return { group: g, dimensionsFromData: false, hotspots: [] };
}

function generic(hex: string, dims: Dimensions | null): ProductModel {
  const d = dims ? { w: dims.w / 100, h: dims.h / 100, d: dims.d / 100 } : { w: 0.18, h: 0.18, d: 0.12 };
  const g = new THREE.Group();
  g.add(mesh(rb(d.w, d.h, d.d, Math.min(d.w, d.h, d.d) * 0.08), std(hex, 0.6, 0.1), 0, d.h / 2, 0));
  return { group: g, dimensionsFromData: !!dims, hotspots: [] };
}

export const MODEL_PRESETS: { id: string; label: string }[] = [
  { id: 'charger', label: 'Wall charger' },
  { id: 'car_mount', label: 'Magnetic car mount' },
  { id: 'kettle', label: 'Gooseneck kettle' },
  { id: 'diffuser', label: 'Aroma diffuser' },
  { id: 'laptop_stand', label: 'Laptop stand' },
  { id: 'packing_cubes', label: 'Packing cubes' },
  { id: 'tire_inflator', label: 'Tyre inflator' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'watch', label: 'Wristwatch' },
  { id: 'shoe', label: 'Shoe' },
  { id: 'lip_tint', label: 'Lip tint / lipstick' },
  { id: 'grip_trainer', label: 'Hand grip trainer' },
  { id: 'shirt', label: 'Shirt / top (folded)' },
  { id: 'trousers', label: 'Trousers (folded)' },
  { id: 'armchair', label: 'Armchair (uses dimensions)' },
  { id: 'side_table', label: 'Side table (uses dimensions)' },
  { id: 'sunglasses', label: 'Sunglasses' },
  { id: 'tote_bag', label: 'Tote bag' },
  { id: 'generic', label: 'Generic box (uses dimensions)' },
];

export interface ModelRequest {
  preset?: string | null;
  colorName?: string;
  colorMap?: Record<string, string>;
  colorOptions?: string;
  dims?: Dimensions | null;
}

/** Build a product model for a preset and colour */
export function buildProductModel(req: ModelRequest): ProductModel {
  const map = req.colorMap || {};
  const firstColour = (req.colorOptions || '').split(',').map((s) => s.trim()).filter(Boolean)[0];
  const colorName = req.colorName || firstColour;
  const hex = resolveColor(colorName, map) || '#6b7078';
  const dims = req.dims ?? null;
  switch (req.preset) {
    case 'charger': return charger(hex);
    case 'car_mount': return carMount(hex);
    case 'kettle': return kettle(hex);
    case 'diffuser': return diffuser(hex);
    case 'laptop_stand': return laptopStand(hex);
    case 'packing_cubes': return packingCubes(hex);
    case 'tire_inflator': return tireInflator(hex);
    case 'wallet': return wallet(hex, dims);
    case 'watch': {
      const w = parseWatchVariant(colorName || '', map);
      return buildWatch(w.caseHex, w.strapHex, w.strap);
    }
    case 'shoe': {
      const sole = /gum/i.test(colorName || '') ? '#b98b55' : /white|chalk/i.test(colorName || '') ? '#f3f2ee' : '#e9e7e2';
      const pair = new THREE.Group();
      const left = buildShoe(hex, sole, true);
      const right = buildShoe(hex, sole);
      left.group.position.x = -0.06;
      right.group.position.x = 0.06;
      right.group.rotation.y = -0.08;
      left.group.rotation.y = 0.08;
      pair.add(left.group, right.group);
      return { group: pair, hotspots: right.hotspots.map((h) => ({ ...h, position: h.position.clone().add(new THREE.Vector3(0.06, 0, 0)) })), dimensionsFromData: false };
    }
    case 'lip_tint': return lipTint(hex);
    case 'grip_trainer': return gripTrainer(hex);
    case 'shirt': return foldedStack(hex, 'top');
    case 'trousers': return foldedStack(hex, 'bottom');
    case 'armchair': return buildArmchair(hex, dims);
    case 'side_table': return buildSideTable(hex, dims);
    case 'sunglasses': return buildSunglasses(hex);
    case 'tote_bag': return buildTote(hex);
    default: return generic(hex, dims);
  }
}
