import * as THREE from 'three';
import { buildCenterpiece } from './centerpiece';
import {
  StaticBatcher, std, emissive, glass, mat, marbleTexture, terrazzoTexture, woodTexture, concreteTexture, carpetTexture,
  plasterTexture, flutedTexture, rubberTexture, lightPoolTexture, contactShadowTexture,
} from './materials';
import {
  fasciaTexture, bladeTexture, aisleSignTexture, wayfindingTexture, welcomeWallTexture, buildFacadeSign, directoryTexture,
  promoTexture, deptInfoTexture, packagingTexture, simpleScreenTexture,
} from './signage';
import { buildFixture, FixturePalette } from './fixtures';
import { STORE, Rect, roomForSlot, placeFixture, RoomGeometry, localToWorld } from '../layout/storeLayout';
import { StoreDepartment, StoreShelf, PromoScreen, InteriorStyle } from '../../../types';

export type TargetKind = 'product' | 'reception' | 'checkout' | 'basket' | 'map' | 'dept_info' | 'promo';

export interface InteractiveTarget {
  id: string;
  kind: TargetKind;
  title: string;
  subtitle: string;
  /** focus point (where the avatar looks) */
  position: THREE.Vector3;
  /** where the shopper stands to interact */
  stand: { x: number; z: number };
  shelf?: StoreShelf;
  department?: StoreDepartment;
  promo?: PromoScreen;
}

export interface VideoScreen {
  mesh: THREE.Mesh;
  shelf: StoreShelf;
  center: THREE.Vector3;
}

export interface BuiltStore {
  root: THREE.Group;
  /** per-frame environmental animation (lobby centrepiece etc.) */
  animate: (t: number, dt: number) => void;
  colliders: Rect[];
  doors: { left: THREE.Object3D; right: THREE.Object3D; closedHalf: number; openHalf: number };
  targets: InteractiveTarget[];
  hitGroup: THREE.Group;
  videoScreens: VideoScreen[];
  /** per-department-slot lighting temperature for subtle global light shifts */
  roomLighting: Record<number, 'warm' | 'neutral' | 'cool'>;
  deptBySlot: Record<number, StoreDepartment>;
  dispose: () => void;
}

interface StyleDef {
  floor: () => THREE.Material;
  floorTile: number;
  wall: string;
  backWall: () => THREE.Material;
  ceiling: string;
  palette: Omit<FixturePalette, 'accent'>;
}

const LIGHT_HEX = { warm: '#ffe4c4', neutral: '#fff4e6', cool: '#eef5ff' };

const STYLES: Record<InteriorStyle, StyleDef> = {
  tech: {
    floor: () => std('#2a2c30', 0.32, 0.1, { map: concreteTexture('#3a3d42', 31) }), floorTile: 4,
    wall: '#e9eaec', backWall: () => std('#1d1f23', 0.6, 0.1, { map: flutedTexture('#25282d', 22) }), ceiling: '#f2f2f2',
    palette: { body: '#202226', shelf: '#f3f3f1', metal: '#9aa0a6', bodyRough: 0.35 },
  },
  warm_wood: {
    floor: () => std('#ffffff', 0.55, 0, { map: woodTexture(['#b98c5e', '#a77a4e'], { planks: 6, seed: 3 }) }), floorTile: 3,
    wall: '#efe7dc', backWall: () => std('#ffffff', 0.85, 0, { map: plasterTexture('#d8c7b0', 4) }), ceiling: '#f6f1ea',
    palette: { body: '#c8a37a', shelf: '#efe6d8', metal: '#3b3530' },
  },
  kitchen: {
    floor: () => std('#ffffff', 0.4, 0, { map: marbleTexture('#e7e3da', '#b6aea0', 3, 12) }), floorTile: 2.4,
    wall: '#f1efe9', backWall: () => std('#93a58a', 0.8, 0), ceiling: '#f5f4f0',
    palette: { body: '#8fa384', shelf: '#f4f1ea', metal: '#c8a96a' },
  },
  boutique: {
    floor: () => std('#ffffff', 0.5, 0, { map: woodTexture(['#8a5b38', '#76492b'], { herringbone: true, seed: 5 }) }), floorTile: 2.2,
    wall: '#f3ede4', backWall: () => std('#ffffff', 0.7, 0, { map: flutedTexture('#e8dccb', 18) }), ceiling: '#f7f3ec',
    palette: { body: '#3b2a20', shelf: '#efe7da', metal: '#c8a96a' },
  },
  concrete: {
    floor: () => std('#ffffff', 0.38, 0.05, { map: concreteTexture('#9c9a95', 8) }), floorTile: 5,
    wall: '#e7e5e1', backWall: () => std('#ffffff', 0.9, 0, { map: concreteTexture('#bdbab3', 17) }), ceiling: '#eeede9',
    palette: { body: '#1f2023', shelf: '#d9d6cf', metal: '#5b5e63' },
  },
  luxury: {
    floor: () => std('#ffffff', 0.2, 0.05, { map: marbleTexture('#24262b', '#8a7a5c', 2, 21) }), floorTile: 2.6,
    wall: '#1f2a44', backWall: () => std('#ffffff', 0.55, 0, { map: woodTexture(['#3a2418', '#2d1a10'], { planks: 10, seed: 9 }) }), ceiling: '#191b20',
    palette: { body: '#2a1d16', shelf: '#e9e1d2', metal: '#c8a96a', bodyRough: 0.35 },
  },
  spa: {
    floor: () => std('#ffffff', 0.32, 0, { map: terrazzoTexture('#efe9e4', ['#d8b3ac', '#bfb8b0', '#a5928b', '#ffffff'], 41) }), floorTile: 2,
    wall: '#f6efec', backWall: () => std('#e9cfc8', 0.85, 0), ceiling: '#fbf7f5',
    palette: { body: '#f4ece8', shelf: '#ffffff', metal: '#c99b86' },
  },
  gym: {
    floor: () => std('#ffffff', 0.92, 0, { map: rubberTexture('#232427') }), floorTile: 1.5,
    wall: '#e4e5e7', backWall: () => std('#16171a', 0.7, 0.1), ceiling: '#2a2b2f',
    palette: { body: '#141518', shelf: '#2a2c30', metal: '#cfa53a' },
  },
  garage: {
    floor: () => std('#ffffff', 0.25, 0.1, { map: concreteTexture('#6c6f74', 44) }), floorTile: 6,
    wall: '#e6e7e9', backWall: () => std('#2a2c31', 0.6, 0.2), ceiling: '#eff0f2',
    palette: { body: '#18191c', shelf: '#e9e9ea', metal: '#b91c1c' },
  },
  travel: {
    floor: () => std('#ffffff', 0.35, 0, { map: terrazzoTexture('#e9ecec', ['#7aa6a1', '#c3c9c9', '#3d6f6a', '#ffffff'], 52) }), floorTile: 2,
    wall: '#eef1f1', backWall: () => std('#cfe0dd', 0.85, 0), ceiling: '#f6f8f8',
    palette: { body: '#e8e1d5', shelf: '#ffffff', metal: '#0f766e' },
  },
  study: {
    floor: () => std('#ffffff', 0.95, 0, { map: carpetTexture('#59616d', 6) }), floorTile: 0.6,
    wall: '#eceef1', backWall: () => std('#ffffff', 0.6, 0, { map: woodTexture(['#b48c62', '#a07a52'], { planks: 12, seed: 19 }) }), ceiling: '#f4f5f7',
    palette: { body: '#b48c62', shelf: '#f1f1ef', metal: '#3a3d44' },
  },
  gallery: {
    floor: () => std('#ffffff', 0.5, 0, { map: woodTexture(['#d6b48c', '#c9a57c'], { planks: 5, seed: 23 }) }), floorTile: 3.2,
    wall: '#f7f6f3', backWall: () => std('#f0ebe3', 0.9, 0), ceiling: '#fbfaf8',
    palette: { body: '#f2efe9', shelf: '#d6b48c', metal: '#2b2b2b' },
  },
};

export interface BuildOptions {
  quality: 'high' | 'balanced' | 'low';
  storeName: string;
  onProgress?: (p: number, label: string) => void;
}

const nextFrame = () => new Promise<void>((r) => (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));

export async function buildStore(departments: StoreDepartment[], shelves: StoreShelf[], promos: PromoScreen[], opts: BuildOptions): Promise<BuiltStore> {
  const low = opts.quality === 'low';
  const root = new THREE.Group();
  root.name = 'ShopWalk360';
  const colliders: Rect[] = [];
  const targets: InteractiveTarget[] = [];
  const videoScreens: VideoScreen[] = [];
  const hitGroup = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];

  // ShopWalk 360 emblem (served with the website); shared texture, loads in the background
  const logoTex = new THREE.TextureLoader().load('/brand/logo-512.png');
  logoTex.colorSpace = THREE.SRGBColorSpace;
  logoTex.anisotropy = 8;
  const logoMat = new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, alphaTest: 0.02, toneMapped: false });
  disposables.push(logoTex, logoMat);
  const logoDisc = (radius: number, x: number, y: number, z: number, ry: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), logoMat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    return m;
  };
  const roomLighting: Record<number, 'warm' | 'neutral' | 'cool'> = {};
  const deptBySlot: Record<number, StoreDepartment> = {};
  departments.forEach((d) => {
    if (d.slot_index !== undefined && d.slot_index !== null) deptBySlot[d.slot_index] = d;
  });

  const wallC = (minX: number, maxX: number, minZ: number, maxZ: number) => colliders.push({ minX, maxX, minZ, maxZ });

  // packaging instances, merged per product at the end
  const packaging = new Map<string, { shelf: StoreShelf; mats: THREE.Matrix4[]; size: THREE.Vector3 }>();
  const addPackaging = (shelf: StoreShelf, m: THREE.Matrix4, size: THREE.Vector3) => {
    const key = `${shelf.product_id}:${size.toArray().join()}`;
    let e = packaging.get(key);
    if (!e) {
      e = { shelf, mats: [], size };
      packaging.set(key, e);
    }
    e.mats.push(m);
  };

  const progress = async (p: number, label: string) => {
    opts.onProgress?.(p, label);
    await nextFrame();
  };

  /* ================================= EXTERIOR & FAÇADE ================================= */
  await progress(0.05, 'Building the entrance');
  const ext = new StaticBatcher();
  {
    const paving = std('#ffffff', 0.8, 0, { map: concreteTexture('#a29c92', 61) });
    ext.floor(paving, -60, 60, STORE.facadeZ, 110, 0, 3);
    // lawn strips and street
    ext.floor(std('#6f8a55', 0.95), -60, -22, 52, 110, 0.01, 4);
    ext.floor(std('#6f8a55', 0.95), 22, 60, 52, 110, 0.01, 4);
    ext.floor(std('#3b3d40', 0.9), -60, 60, 62, 72, 0.012, 6);
    // planters with trees along the plaza
    [-14, -8, 8, 14].forEach((x) => {
      ext.box(std('#d9d4ca', 0.8), 2.2, 0.55, 2.2, x, 0.275, 46, 0, 1);
      ext.box(std('#3d2f25', 0.95), 2, 0.05, 2, x, 0.56, 46);
      const trunk = new THREE.CylinderGeometry(0.09, 0.12, 2.6, 8);
      ext.add(trunk, std('#5b4636', 0.9), x, 1.85, 46);
      trunk.dispose();
      [[0, 3.6, 0, 1.25], [0.5, 3.2, 0.3, 0.9], [-0.45, 3.3, -0.25, 0.95], [0.1, 4.2, 0.1, 0.8]].forEach(([dx, y, dz, r]) => {
        const f = new THREE.IcosahedronGeometry(r, 1);
        ext.add(f, std('#46603a', 0.9), x + dx, y, 46 + dz);
        f.dispose();
      });
    });
    // façade: stone base wall either side of a tall glass curtain wall
    const stone = std('#ffffff', 0.7, 0, { map: plasterTexture('#d8d2c6', 71) });
    ext.box(stone, 14, 10, 0.6, -19, 5, STORE.facadeZ, 0, 2);
    ext.box(stone, 14, 10, 0.6, 19, 5, STORE.facadeZ, 0, 2);
    ext.box(stone, 24, 2.6, 0.6, 0, 8.7, STORE.facadeZ, 0, 2);
    ext.box(std('#1d1e20', 0.4, 0.4), 52, 0.4, 1.2, 0, 10.2, STORE.facadeZ, 0);
    // curtain wall glass with bronze mullions
    const g = glass('#cfdde4', 0.22);
    const bronze = std('#5a4a3a', 0.35, 0.8);
    [[-12, -STORE.doorHalfWidth], [STORE.doorHalfWidth, 12]].forEach(([a, b]) => {
      ext.box(g, b - a, 7.4, 0.04, (a + b) / 2, 3.7, STORE.facadeZ);
      for (let x = a; x <= b + 0.01; x += (b - a) / 3) ext.box(bronze, 0.12, 7.4, 0.2, x, 3.7, STORE.facadeZ);
    });
    ext.box(bronze, 24, 0.14, 0.22, 0, 3.6, STORE.facadeZ);
    ext.box(bronze, 4.6, 0.2, 0.3, 0, 3.3, STORE.facadeZ);
    // canopy over the doors
    ext.box(std('#2a2b2e', 0.35, 0.6), 9, 0.22, 4, 0, 4.3, STORE.facadeZ + 2);
    ext.box(emissive('#fff2dc', 1.2), 8.4, 0.02, 0.12, 0, 4.18, STORE.facadeZ + 3.6);
    // threshold mat
    ext.floor(std('#2a2b2e', 0.95), -2.4, 2.4, STORE.facadeZ - 2, STORE.facadeZ + 2, 0.008, 1);
    // façade colliders (door gap left open — doors slide automatically)
    wallC(-26, -STORE.doorHalfWidth, STORE.facadeZ - 0.35, STORE.facadeZ + 0.35);
    wallC(STORE.doorHalfWidth, 26, STORE.facadeZ - 0.35, STORE.facadeZ + 0.35);
    // plaza limits
    wallC(-24, -22, STORE.facadeZ, 53);
    wallC(22, 24, STORE.facadeZ, 53);
    wallC(-24, 24, 52, 53);
    [-14, -8, 8, 14].forEach((x) => wallC(x - 1.2, x + 1.2, 44.8, 47.2));
    // avatar studio kiosk on the plaza
    ext.box(std('#1d1e20', 0.4, 0.4), 0.9, 2.1, 0.3, 6.5, 1.05, 40.2, -0.5);
    wallC(5.9, 7.1, 39.8, 40.6);
  }
  root.add(ext.build('exterior'));
  // big façade lettering — raised letters, kept separate so they can animate
  let facadeAnim: (t: number) => void = () => {};
  {
    const sign = await buildFacadeSign();
    sign.disposables.forEach((d) => disposables.push(d));
    sign.group.position.set(0, 8.78, STORE.facadeZ + 0.5);
    root.add(sign.group);
    facadeAnim = (t) => sign.update(t);
    // brand emblems on the stone piers either side of the entrance
    [-19, 19].forEach((x) => root.add(logoDisc(2.3, x, 5.6, STORE.facadeZ + 0.33, 0)));
    const kiosk = new THREE.Mesh(
      new THREE.PlaneGeometry(0.78, 1.3),
      new THREE.MeshBasicMaterial({ map: simpleScreenTexture('Avatar Studio', ['Create your virtual self', 'Step inside — your shopping journey begins here'], '#c8a96a', 512, 860), toneMapped: false }),
    );
    kiosk.position.set(6.5 + Math.sin(-0.5) * 0.16, 1.35, 40.2 + Math.cos(-0.5) * 0.16);
    kiosk.rotation.y = -0.5;
    root.add(kiosk);
  }
  // automatic sliding doors
  const doorLeaf = (sign: number) => {
    const leaf = new THREE.Group();
    const pane = new THREE.Mesh(new THREE.BoxGeometry(STORE.doorHalfWidth, 3.2, 0.03), glass('#d9e6ec', 0.2));
    pane.position.y = 1.6;
    leaf.add(pane);
    const frame = std('#5a4a3a', 0.35, 0.8);
    [[0, 3.2 - 0.04, STORE.doorHalfWidth, 0.08], [0, 0.04, STORE.doorHalfWidth, 0.08]].forEach(([x, y, w, h]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), frame);
      m.position.set(x, y, 0);
      leaf.add(m);
    });
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.2, 0.06), frame);
    edge.position.set((-sign * STORE.doorHalfWidth) / 2, 1.6, 0);
    leaf.add(edge);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.2, 0.08), std('#c8a96a', 0.3, 0.9));
    handle.position.set((-sign * STORE.doorHalfWidth) / 2 + sign * 0.12, 1.1, 0.06);
    leaf.add(handle);
    leaf.position.set(sign * (STORE.doorHalfWidth / 2), 0, STORE.facadeZ);
    root.add(leaf);
    return leaf;
  };
  const doorL = doorLeaf(-1);
  const doorR = doorLeaf(1);

  /* ================================= RECEPTION LOBBY ================================= */
  await progress(0.15, 'Building the reception lobby');
  const lob = new StaticBatcher();
  {
    const L = STORE.lobby;
    const floorM = std('#ffffff', 0.18, 0.05, { map: marbleTexture('#ece7de', '#b9ad98', 2, 4) });
    lob.floor(floorM, L.minX, L.maxX, L.minZ, L.maxZ, 0, 2.4);
    // inlay medallion
    const ring = new THREE.RingGeometry(3.4, 3.6, 72);
    lob.add(ring, std('#b48e57', 0.3, 0.8), 0, 0.004, 27.5, 0, -Math.PI / 2);
    ring.dispose();
    const disc = new THREE.CircleGeometry(3.4, 72);
    lob.add(disc, std('#ffffff', 0.15, 0.05, { map: marbleTexture('#2b2d31', '#8a7a5c', 1, 9) }), 0, 0.003, 27.5, 0, -Math.PI / 2);
    disc.dispose();
    // walls: fluted oak panels with stone base
    const fluted = std('#ffffff', 0.6, 0, { map: flutedTexture('#b48c62', 24) });
    const stone = std('#ffffff', 0.8, 0, { map: plasterTexture('#e3ddd2', 33) });
    lob.box(fluted, 0.3, STORE.lobbyHeight, L.maxZ - L.minZ, L.minX, STORE.lobbyHeight / 2, (L.minZ + L.maxZ) / 2, 0, 2);
    lob.box(fluted, 0.3, STORE.lobbyHeight, L.maxZ - L.minZ, L.maxX, STORE.lobbyHeight / 2, (L.minZ + L.maxZ) / 2, 0, 2);
    // lobby north wall segments either side of the promenade (above shop 01/02 south walls)
    lob.box(stone, L.maxX - STORE.promenade.maxX, STORE.lobbyHeight, 0.3, (L.maxX + STORE.promenade.maxX) / 2, STORE.lobbyHeight / 2, L.minZ, 0, 3);
    lob.box(stone, STORE.promenade.minX - L.minX, STORE.lobbyHeight, 0.3, (L.minX + STORE.promenade.minX) / 2, STORE.lobbyHeight / 2, L.minZ, 0, 3);
    lob.box(stone, 16, STORE.lobbyHeight - STORE.promenadeHeight, 0.3, 0, (STORE.lobbyHeight + STORE.promenadeHeight) / 2, L.minZ, 0, 3);
    wallC(L.minX - 0.3, L.minX + 0.2, L.minZ, L.maxZ);
    wallC(L.maxX - 0.2, L.maxX + 0.3, L.minZ, L.maxZ);
    // ceiling with coffers and skylight
    const ceil = std('#f3f0ea', 0.9);
    lob.floor(ceil, L.minX, L.maxX, L.minZ, L.maxZ, STORE.lobbyHeight, 4, false);
    for (let x = L.minX + 4; x < L.maxX; x += 4) lob.box(std('#e7e2d8', 0.9), 0.25, 0.5, L.maxZ - L.minZ, x, STORE.lobbyHeight - 0.25, (L.minZ + L.maxZ) / 2);
    for (let z = L.minZ + 4; z < L.maxZ; z += 4) lob.box(std('#e7e2d8', 0.9), L.maxX - L.minX, 0.5, 0.25, 0, STORE.lobbyHeight - 0.25, z);
    lob.floor(emissive('#f4f8ff', 1.05), -6, 6, 22, 31, STORE.lobbyHeight - 0.02, 12, false);
    // reception desk (curved, stone top) facing the entrance
    const desk = new THREE.CylinderGeometry(3.0, 3.0, 1.08, 64, 1, true, -Math.PI * 0.42, Math.PI * 0.84);
    lob.add(desk, std('#ffffff', 0.55, 0, { map: flutedTexture('#a57d55', 40) }), STORE.reception.x, 0.54, STORE.reception.z - 2.4);
    desk.dispose();
    const deskTop = new THREE.RingGeometry(2.75, 3.15, 64, 1, -Math.PI * 0.42 + Math.PI / 2, Math.PI * 0.84);
    lob.add(deskTop, std('#f2efe9', 0.2, 0.05), STORE.reception.x, 1.09, STORE.reception.z - 2.4, 0, -Math.PI / 2);
    deskTop.dispose();
    const back = new THREE.BoxGeometry(5.2, 1.0, 0.6);
    lob.add(back, std('#2a2b2e', 0.5, 0.2), 0, 0.5, STORE.reception.z - 3.3);
    back.dispose();
    wallC(-2.8, 2.8, STORE.reception.z - 3.6, STORE.reception.z - 0.2);
    // directory totems at the mouth of the promenade
    [-5.2, 5.2].forEach((x) => {
      lob.box(std('#1c1d20', 0.4, 0.4), 1.2, 2.5, 0.3, x, 1.25, 13.4);
      wallC(x - 0.7, x + 0.7, 13.1, 13.7);
    });
    // map kiosk
    lob.box(std('#1c1d20', 0.4, 0.4), 0.9, 1.0, 0.5, STORE.mapKiosk.x, 0.5, STORE.mapKiosk.z);
    wallC(STORE.mapKiosk.x - 0.5, STORE.mapKiosk.x + 0.5, STORE.mapKiosk.z - 0.3, STORE.mapKiosk.z + 0.3);
    // checkout counters (cashier on the east side)
    [19.2, 24.8].forEach((z) => {
      lob.box(std('#2a2b2e', 0.45, 0.2), 1.0, 1.0, 3.4, 16.4, 0.5, z);
      lob.box(std('#f2efe9', 0.2, 0.05), 1.1, 0.05, 3.5, 16.4, 1.02, z);
      lob.box(std('#111214', 0.6, 0.2), 0.7, 0.02, 2.2, 16.3, 1.05, z - 0.4);
      lob.box(std('#1d1e20', 0.3, 0.5), 0.06, 0.45, 0.3, 16.6, 1.3, z + 1.1);
      wallC(15.8, 17.0, z - 1.8, z + 1.8);
    });
    lob.box(std('#1c1d20', 0.4, 0.4), 0.1, 1.6, 0.1, 16.4, 3.6, 22);
    // basket & trolley station
    const B = STORE.basketStation;
    lob.box(std('#2a2b2e', 0.4, 0.3), 2.4, 0.08, 1.2, B.x, 0.04, B.z);
    for (let i = 0; i < 6; i++) lob.box(std(i % 2 ? '#b0172c' : '#8f1324', 0.6), 0.42, 0.06, 0.3, B.x - 0.6, 0.12 + i * 0.07, B.z);
    for (let i = 0; i < 3; i++) {
      lob.box(std('#9aa0a6', 0.3, 0.8), 0.6, 0.5, 0.9, B.x + 0.6, 0.75, B.z - 0.3 + i * 0.25);
      lob.box(std('#9aa0a6', 0.3, 0.8), 0.6, 0.04, 1.0, B.x + 0.6, 0.28, B.z - 0.3 + i * 0.25);
    }
    wallC(B.x - 1.3, B.x + 1.3, B.z - 0.7, B.z + 0.7);
    // seating & planters
    [[-11, 26], [11, 30.5]].forEach(([x, z]) => {
      lob.box(std('#e9e3d8', 0.85), 2.6, 0.45, 0.8, x, 0.225, z);
      lob.box(std('#3b2a20', 0.5), 2.6, 0.06, 0.8, x, 0.47, z);
      wallC(x - 1.4, x + 1.4, z - 0.5, z + 0.5);
    });
    [[-21.5, 14.5], [21.5, 14.5], [-21.5, 32], [21.5, 32]].forEach(([x, z]) => {
      const pot = new THREE.CylinderGeometry(0.55, 0.42, 0.9, 24);
      lob.add(pot, std('#d9d4ca', 0.7), x, 0.45, z);
      pot.dispose();
      [[0, 1.4, 0, 0.7, '#3f6b3a'], [0.3, 1.95, 0.1, 0.5, '#4c7a43'], [-0.25, 1.8, -0.15, 0.55, '#45733f']].forEach(([dx, y, dz, r, c]) => {
        const f = new THREE.IcosahedronGeometry(r as number, 3);
        lob.add(f, std(c as string, 0.85), x + (dx as number), y as number, z + (dz as number));
        f.dispose();
      });
      wallC(x - 0.7, x + 0.7, z - 0.7, z + 0.7);
    });
    // pendant ring over the medallion
    const ringL = new THREE.TorusGeometry(2.6, 0.05, 8, 96);
    lob.add(ringL, emissive('#fff0d8', 1.3), 0, 6.2, 27.5, Math.PI / 2);
    ringL.dispose();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      lob.box(std('#2a2b2e', 0.4, 0.5), 0.01, STORE.lobbyHeight - 6.2, 0.01, Math.cos(a) * 2.6, 6.2 + (STORE.lobbyHeight - 6.2) / 2, 27.5 + Math.sin(a) * 2.6);
    }
    // light pools
    const pool = mat('lightpool:lobby', () => new THREE.MeshBasicMaterial({ map: lightPoolTexture(), color: '#fff1dc', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35 }));
    [[0, 27.5, 9], [0, 19.5, 7]].forEach(([x, z, s]) => {
      const p = new THREE.PlaneGeometry(s, s);
      lob.add(p, pool, x, 0.01, z, 0, -Math.PI / 2);
      p.dispose();
    });
  }
  root.add(lob.build('lobby'));

  // animated centrepiece on the lobby medallion
  const centre = buildCenterpiece({ x: 0, z: 27.5, low, brand: opts.storeName || 'ShopWalk 360', ceilingY: STORE.lobbyHeight });
  root.add(centre.group);
  disposables.push({ dispose: centre.dispose } as any);
  wallC(-centre.radius, centre.radius, 27.5 - centre.radius, 27.5 + centre.radius);

  // lobby screens (unique textures)
  const addScreen = (t: THREE.Texture, w: number, h: number, x: number, y: number, z: number, ry = 0) => {
    disposables.push(t);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    root.add(m);
    return m;
  };
  {
    // welcome LED wall suspended above the reception
    const frame = new THREE.Mesh(new THREE.BoxGeometry(10.4, 4.0, 0.2), std('#141518', 0.4, 0.4));
    frame.position.set(0, 7.2, STORE.reception.z - 3.8);
    root.add(frame);
    addScreen(welcomeWallTexture(opts.storeName ? `Operated by ${opts.storeName}` : ''), 10, 3.75, 0, 7.2, STORE.reception.z - 3.69);
    const dirTex = directoryTexture(departments);
    disposables.push(dirTex);
    [-5.2, 5.2].forEach((x) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 2.16), new THREE.MeshBasicMaterial({ map: dirTex, toneMapped: false }));
      m.position.set(x, 1.3, 13.56);
      root.add(m);
      const m2 = m.clone();
      m2.position.z = 13.24;
      m2.rotation.y = Math.PI;
      root.add(m2);
    });
    addScreen(simpleScreenTexture('Store Map', ['Tap or press E to open the interactive map', 'Search any product and we will guide you to it'], '#c8a96a', 800, 500), 0.8, 0.5, STORE.mapKiosk.x, 1.22, STORE.mapKiosk.z + 0.1, 0).rotation.x = -0.6;
    addScreen(simpleScreenTexture('CHECKOUT', ['Pay at the counter', 'Cash on delivery · Bank transfer · Card'], '#c8a96a', 1024, 380), 2.6, 0.96, 16.35, 3.2, 22, -Math.PI / 2);
    addScreen(simpleScreenTexture('Baskets', ['Pick up a basket', 'Your basket fills as you shop'], '#b0172c', 768, 420), 1.6, 0.88, STORE.basketStation.x, 2.1, STORE.basketStation.z - 0.65, 0);
    // promos: freestanding digital totems
    const promoSpots: [number, number, number][] = [[-10.5, 16.2, 0.35], [10.5, 15.6, -0.35], [-8.6, 31, 0.6]];
    promos.filter((p) => p.location === 'lobby').slice(0, 3).forEach((p, i) => {
      const [x, z, ry] = promoSpots[i];
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.25, 2.3, 0.18), std('#141518', 0.4, 0.4));
      body.position.set(x, 1.15, z);
      body.rotation.y = ry;
      root.add(body);
      addScreen(promoTexture(p), 1.12, 1.68, x + Math.sin(ry) * 0.095, 1.3, z + Math.cos(ry) * 0.095, ry);
      colliders.push({ minX: x - 0.75, maxX: x + 0.75, minZ: z - 0.4, maxZ: z + 0.4 });
      targets.push({
        id: `promo_${p.id}`, kind: 'promo', title: p.title, subtitle: p.product_name || p.subtitle || '',
        position: new THREE.Vector3(x, 1.4, z), stand: { x: x + Math.sin(ry) * 1.5, z: z + Math.cos(ry) * 1.5 }, promo: p,
      });
    });
  }
  targets.push(
    { id: 'reception', kind: 'reception', title: 'Reception & Concierge', subtitle: 'Department directory, help and store map', position: new THREE.Vector3(0, 1.4, STORE.reception.z - 1), stand: { x: 0, z: STORE.reception.z + 1.2 } },
    { id: 'checkout', kind: 'checkout', title: 'Checkout Counters', subtitle: 'Review your basket and pay', position: new THREE.Vector3(16.2, 1.2, 22), stand: { x: 14.2, z: 22 } },
    { id: 'basket', kind: 'basket', title: 'Basket Station', subtitle: 'Pick up a basket for your visit', position: new THREE.Vector3(STORE.basketStation.x, 1, STORE.basketStation.z), stand: { x: STORE.basketStation.x + 0.5, z: STORE.basketStation.z + 1.8 } },
    { id: 'map', kind: 'map', title: 'Interactive Store Map', subtitle: 'Find any department or product', position: new THREE.Vector3(STORE.mapKiosk.x, 1.2, STORE.mapKiosk.z), stand: { x: STORE.mapKiosk.x, z: STORE.mapKiosk.z + 1.3 } },
  );

  /* ================================= GALLERIA PROMENADE ================================= */
  await progress(0.25, 'Building the galleria');
  const prom = new StaticBatcher();
  {
    const P = STORE.promenade;
    prom.floor(std('#ffffff', 0.28, 0.02, { map: terrazzoTexture('#e6e1d8', ['#b8a98f', '#8f8a82', '#d9d0c0', '#ffffff', '#6f6a63'], 77) }), P.minX, P.maxX, P.minZ, P.maxZ, 0, 2.2);
    // brass floor inlay lines leading to each shop door
    for (let i = 0; i < STORE.roomsPerSide; i++) {
      const z = STORE.lobby.minZ - i * STORE.roomFrontage - STORE.roomFrontage / 2;
      prom.box(std('#b48e57', 0.3, 0.8), 16, 0.004, 0.06, 0, 0.003, z);
    }
    prom.floor(std('#f2efe9', 0.9), P.minX, P.maxX, P.minZ, P.maxZ, STORE.promenadeHeight, 4, false);
    // skylight strip with beams
    prom.floor(emissive('#f2f7ff', 1.08), -3.2, 3.2, P.minZ + 1, P.maxZ - 1, STORE.promenadeHeight - 0.03, 10, false);
    for (let z = P.minZ + 2; z < P.maxZ; z += 2.5) prom.box(std('#e9e4da', 0.8), 6.6, 0.2, 0.16, 0, STORE.promenadeHeight - 0.12, z);
    // north feature wall
    prom.box(std('#ffffff', 0.6, 0, { map: flutedTexture('#b48c62', 24) }), 16, STORE.promenadeHeight, 0.3, 0, STORE.promenadeHeight / 2, P.minZ);
    wallC(P.minX, P.maxX, P.minZ - 0.4, P.minZ + 0.15);
    // brand emblem at the far end of the promenade
    root.add(logoDisc(2.1, 0, 4.1, P.minZ + 0.17, 0));
    // benches + planters down the centre line
    [-4, -24, -40].forEach((z) => {
      prom.box(std('#e9e3d8', 0.85), 0.8, 0.45, 3.2, 0, 0.225, z);
      prom.box(std('#3b2a20', 0.5), 0.8, 0.06, 3.2, 0, 0.47, z);
      wallC(-0.5, 0.5, z - 1.7, z + 1.7);
      [-2.6, 2.6].forEach((dz) => {
        const pot = new THREE.CylinderGeometry(0.5, 0.4, 0.8, 24);
        prom.add(pot, std('#d9d4ca', 0.7), 0, 0.4, z + dz);
        pot.dispose();
        // clipped topiary: stacked spheres on a brass collar
        prom.add(new THREE.CylinderGeometry(0.52, 0.52, 0.05, 32), std('#b48e57', 0.3, 0.9), 0, 0.82, z + dz);
        [[0, 1.3, 0.56, '#3f6b3a'], [0, 1.95, 0.4, '#4c7a43'], [0, 2.42, 0.26, '#5a8a4c']].forEach(([dx, y, r, c]) => {
          const f = new THREE.IcosahedronGeometry(r as number, 3);
          prom.add(f, std(c as string, 0.85), dx as number, y as number, z + dz);
          f.dispose();
        });
        wallC(-0.6, 0.6, z + dz - 0.6, z + dz + 0.6);
      });
    });
    const pool = mat('lightpool:prom', () => new THREE.MeshBasicMaterial({ map: lightPoolTexture(), color: '#fff4e4', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.25 }));
    for (let z = P.minZ + 5; z < P.maxZ; z += 10) {
      const p = new THREE.PlaneGeometry(9, 9);
      prom.add(p, pool, 0, 0.012, z, 0, -Math.PI / 2);
      p.dispose();
    }
  }
  root.add(prom.build('promenade'));
  {
    // overhead wayfinding signs between each pair of shops
    for (let i = 0; i < STORE.roomsPerSide; i++) {
      const z = STORE.lobby.minZ - i * STORE.roomFrontage - STORE.roomFrontage / 2;
      const t = wayfindingTexture(deptBySlot[i], deptBySlot[i + STORE.roomsPerSide]);
      disposables.push(t);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.12), new THREE.MeshBasicMaterial({ map: t, toneMapped: false, side: THREE.DoubleSide }));
      m.position.set(0, 5.7, z + 2.5);
      root.add(m);
      const cable = new THREE.Mesh(new THREE.BoxGeometry(0.01, STORE.promenadeHeight - 6.26, 0.01), std('#2a2b2e', 0.4, 0.5));
      [-4, 4].forEach((x) => {
        const c = cable.clone();
        c.position.set(x, 6.26 + (STORE.promenadeHeight - 6.26) / 2, z + 2.5);
        root.add(c);
      });
    }
    addScreen(directoryTexture(departments), 2.2, 4.4, 0, 3.2, STORE.promenade.minZ + 0.17);
  }

  /* ================================= DEPARTMENT ROOMS ================================= */
  const slotsUsed = Object.keys(deptBySlot).map(Number);
  for (let slot = 0; slot < 12; slot++) {
    await progress(0.3 + (slot / 12) * 0.6, `Opening department ${slot + 1} of 12`);
    const room = roomForSlot(slot);
    const dept = deptBySlot[slot];
    buildRoom(room, dept, slot);
  }

  function buildRoom(room: RoomGeometry, dept: StoreDepartment | undefined, slot: number) {
    const b = new StaticBatcher();
    const style = STYLES[(dept?.interior_style as InteriorStyle) || 'gallery'] || STYLES.gallery;
    const accent = dept?.theme_color || '#8a8f98';
    const lighting = (dept?.lighting as 'warm' | 'neutral' | 'cool') || 'neutral';
    roomLighting[slot] = lighting;
    const R = room.rect;
    const H = STORE.roomHeight;
    const front = room.facadeX;
    const backX = front + room.inward * STORE.roomDepth;
    const zN = R.minZ;
    const zS = R.maxZ;
    const cz = room.centerZ;

    // floor & ceiling
    b.floor(dept ? style.floor() : std('#cfcac2', 0.9), R.minX, R.maxX, zN, zS, 0, style.floorTile);
    b.floor(std(style.ceiling, 0.92), R.minX, R.maxX, zN, zS, H, 4, false);
    // partition walls (shared walls drawn by each room is fine — they are coplanar and identical)
    const wallM = std('#ffffff', 0.9, 0, { map: plasterTexture(style.wall, 90 + slot) });
    b.box(wallM, STORE.roomDepth, H, 0.2, (front + backX) / 2, H / 2, zN, 0, 3);
    b.box(wallM, STORE.roomDepth, H, 0.2, (front + backX) / 2, H / 2, zS, 0, 3);
    b.box(style.backWall(), 0.2, H, STORE.roomFrontage, backX, H / 2, cz, 0, 2.5);
    wallC(Math.min(front, backX), Math.max(front, backX), zN - 0.15, zN + 0.15);
    wallC(Math.min(front, backX), Math.max(front, backX), zS - 0.15, zS + 0.15);
    wallC(backX - 0.2, backX + 0.2, zN, zS);
    // skirting
    b.box(std('#2b2b2b', 0.6), STORE.roomDepth, 0.1, 0.22, (front + backX) / 2, 0.05, zN);
    b.box(std('#2b2b2b', 0.6), STORE.roomDepth, 0.1, 0.22, (front + backX) / 2, 0.05, zS);
    // ceiling lighting: recessed panels + cove in department colour on the back wall
    const panel = emissive(LIGHT_HEX[lighting], 1.15);
    for (let u = 3; u < STORE.roomDepth - 1; u += 3.2) {
      [-2.6, 0, 2.6].forEach((v) => {
        const p = localToWorld(room, u, v);
        b.box(panel, 1.2, 0.02, 0.6, p.x, H - 0.012, p.z);
      });
    }
    b.box(emissive(accent, 0.75), 0.04, 0.06, STORE.roomFrontage - 0.4, backX - room.inward * 0.12, H - 0.25, cz);
    const pool = mat(`lightpool:${lighting}`, () => new THREE.MeshBasicMaterial({ map: lightPoolTexture(), color: LIGHT_HEX[lighting], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.3 }));
    for (let u = 3; u < STORE.roomDepth - 1; u += 3.2) {
      const p = localToWorld(room, u, 0);
      const g = new THREE.PlaneGeometry(4.5, 4.5);
      b.add(g, pool, p.x, 0.012, p.z, 0, -Math.PI / 2);
      g.dispose();
    }

    // ---------- shop front (façade on the promenade) ----------
    const fasciaBottom = 4.5;
    const stone = std('#ffffff', 0.7, 0, { map: plasterTexture('#ddd6ca', 140) });
    const portal = std(dept ? '#2a2b2e' : '#8d8f93', 0.35, 0.6);
    // pilasters
    b.box(stone, 0.5, STORE.promenadeHeight, 0.6, front - room.inward * 0.05, STORE.promenadeHeight / 2, zN + 0.3);
    b.box(stone, 0.5, STORE.promenadeHeight, 0.6, front - room.inward * 0.05, STORE.promenadeHeight / 2, zS - 0.3);
    // wall above the door/window heads, carrying the fascia
    b.box(stone, 0.3, STORE.promenadeHeight - 4.1, STORE.roomFrontage, front, (STORE.promenadeHeight + 4.1) / 2, cz, 0, 3);
    void fasciaBottom;
    // bulkheads and glass
    const winZ0 = zN + 0.6;
    const doorZ0 = cz - room.door.halfWidth;
    const doorZ1 = cz + room.door.halfWidth;
    const winZ1 = zS - 0.6;
    const gl = glass('#dfe9ee', 0.12);
    [[winZ0, doorZ0 - 0.15], [doorZ1 + 0.15, winZ1]].forEach(([a, c2]) => {
      b.box(portal, 0.24, 0.45, c2 - a, front, 0.225, (a + c2) / 2);
      b.box(gl, 0.03, 3.6, c2 - a, front, 2.25, (a + c2) / 2);
      b.box(portal, 0.12, 0.1, c2 - a, front, 4.05, (a + c2) / 2);
      wallC(front - 0.2, front + 0.2, Math.min(a, c2) - 0.1, Math.max(a, c2) + 0.1);
    });
    // door portal frame (department colour reveal)
    b.box(portal, 0.4, 4.1, 0.16, front, 2.05, doorZ0 - 0.08);
    b.box(portal, 0.4, 4.1, 0.16, front, 2.05, doorZ1 + 0.08);
    b.box(portal, 0.4, 0.3, room.door.halfWidth * 2 + 0.32, front, 3.95, cz);
    b.box(emissive(accent, 0.9), 0.05, 3.9, 0.04, front - room.inward * 0.21, 1.95, doorZ0 - 0.02);
    b.box(emissive(accent, 0.9), 0.05, 3.9, 0.04, front - room.inward * 0.21, 1.95, doorZ1 + 0.02);
    // threshold strip
    b.box(std('#b48e57', 0.3, 0.8), 0.6, 0.006, room.door.halfWidth * 2, front, 0.004, cz);
    // back-of-house space above the shop ceiling hidden by façade wall; inside fascia face
    b.box(std(style.ceiling, 0.9), 0.2, 0.2, STORE.roomFrontage, front + room.inward * 0.1, H + 0.1, cz);

    // ---------- fixtures ----------
    const deptShelves = dept ? shelves.filter((s) => s.department_id === dept.id) : [];
    const palette: FixturePalette = { ...style.palette, accent };
    let productCount = 0;
    let hasDemo = false;
    deptShelves.forEach((shelf) => {
      const placed = placeFixture(room, shelf.slot_code);
      if (!placed) return;
      const res = buildFixture({ batch: b, addPackaging, palette, lowDetail: low }, shelf, placed.x, placed.z, placed.yaw);
      // collider (fixtures are axis-aligned at 0/90/180/270°)
      const rot = Math.abs(Math.round(placed.yaw / (Math.PI / 2))) % 2 === 1;
      const hw = (rot ? res.d : res.w) / 2 + 0.15;
      const hd = (rot ? res.w : res.d) / 2 + 0.15;
      colliders.push({ minX: placed.x - hw, maxX: placed.x + hw, minZ: placed.z - hd, maxZ: placed.z + hd });
      res.dynamic.forEach((o) => root.add(o));
      if (res.screen && shelf.product_video_url && shelf.product_video_type === 'file') {
        videoScreens.push({ mesh: res.screen, shelf, center: res.screen.position.clone() });
      } else if (res.screen && shelf.shelf_type !== 'fitting_station') {
        const m = res.screen.material as THREE.MeshBasicMaterial;
        m.map = simpleScreenTexture(shelf.product_name ? shelf.product_name.replace(/\s*\(Sample Listing\)/, '') : 'Demonstration zone', [
          shelf.product_video_url ? 'Demonstration video available — choose Explore Product' : 'Explore the product in 3D and read how it works',
          shelf.featured_label || '',
        ].filter(Boolean), accent, 1024, 576);
        m.color.set('#ffffff');
        m.needsUpdate = true;
      }
      // invisible hit volume for click selection
      const hit = new THREE.Mesh(new THREE.BoxGeometry(res.w, res.h, res.d));
      hit.position.set(placed.x, res.h / 2, placed.z);
      hit.rotation.y = placed.yaw;
      hit.userData.targetId = shelf.id;
      hit.updateMatrixWorld();
      hitGroup.add(hit);
      if (shelf.zone === 'demo') hasDemo = true;
      if (shelf.product_id && shelf.product_name) {
        productCount++;
        targets.push({
          id: shelf.id,
          kind: 'product',
          title: shelf.product_name,
          subtitle: `${dept?.name ?? ''} · ${shelf.aisle_label}`,
          position: new THREE.Vector3(placed.x, Math.min(1.3, res.h * 0.7), placed.z),
          stand: { x: placed.standX, z: placed.standZ },
          shelf,
          department: dept,
        });
      }
    });

    if (!dept) {
      // vacant unit: close the doorway
      b.box(std('#d6d2ca', 0.9), 0.1, 4, room.door.halfWidth * 2, front, 2, cz);
      wallC(front - 0.2, front + 0.2, cz - room.door.halfWidth, cz + room.door.halfWidth);
    }
    root.add(b.build(`dept_${slot}`));

    // ---------- signage (unique textures) ----------
    if (dept) {
      const fascia = fasciaTexture(dept);
      disposables.push(fascia);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(STORE.roomFrontage - 1.1, 1.18), new THREE.MeshBasicMaterial({ map: fascia, toneMapped: false }));
      f.position.set(front - room.inward * 0.16, 5.1, cz);
      f.rotation.y = room.inward === 1 ? -Math.PI / 2 : Math.PI / 2;
      root.add(f);
      // blade sign projecting into the promenade near the south pilaster
      const blade = bladeTexture(dept);
      disposables.push(blade);
      const bm = new THREE.MeshBasicMaterial({ map: blade, toneMapped: false, side: THREE.DoubleSide });
      const bl = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.35), bm);
      bl.position.set(front - room.inward * 0.95, 4.2, zS - 0.3);
      root.add(bl);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.05), std('#2a2b2e', 0.4, 0.6));
      arm.position.set(front - room.inward * 0.6, 4.95, zS - 0.3);
      root.add(arm);
      // hanging aisle marker inside
      const aisle = aisleSignTexture(dept);
      disposables.push(aisle);
      const ap = localToWorld(room, 8.2, 0);
      const aisleMat = new THREE.MeshBasicMaterial({ map: aisle, toneMapped: false });
      // two back-to-back faces so the sign reads correctly from both directions
      [Math.atan2(-room.inward, 0), Math.atan2(room.inward, 0)].forEach((ry, k) => {
        const am = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.75), aisleMat);
        am.position.set(ap.x - (k === 0 ? room.inward : -room.inward) * 0.01, 3.55, ap.z);
        am.rotation.y = ry;
        root.add(am);
      });
      // department information screen just inside the entrance (faces arriving shoppers)
      const ip = localToWorld(room, 3.2, 4.05);
      const info = deptInfoTexture(dept, productCount, hasDemo);
      disposables.push(info);
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.08), std('#2a2b2e', 0.4, 0.5));
      stand.position.set(ip.x, 0.6, ip.z);
      root.add(stand);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.6), new THREE.MeshBasicMaterial({ map: info, toneMapped: false }));
      scr.position.set(ip.x - room.inward * 0.05, 1.5, ip.z);
      scr.rotation.y = Math.atan2(-room.inward, -0.6);
      root.add(scr);
      colliders.push({ minX: ip.x - 0.3, maxX: ip.x + 0.3, minZ: ip.z - 0.3, maxZ: ip.z + 0.3 });
      targets.push({
        id: `info_${dept.id}`, kind: 'dept_info', title: dept.name, subtitle: dept.description || '', department: dept,
        position: new THREE.Vector3(ip.x, 1.5, ip.z), stand: { ...localToWorld(room, 1.9, 3.0) },
      });
    } else {
      // vacant unit: hoarding
      const t = simpleScreenTexture('Coming soon', ['This unit is not assigned to a department'], '#8a8f98', 1024, 300);
      disposables.push(t);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(STORE.roomFrontage - 1.1, 1.18), new THREE.MeshBasicMaterial({ map: t }));
      f.position.set(front - room.inward * 0.16, 5.1, cz);
      f.rotation.y = room.inward === 1 ? -Math.PI / 2 : Math.PI / 2;
      root.add(f);
    }
  }
  void slotsUsed;

  /* ================================= PACKAGED PRODUCTS (instanced) ================================= */
  await progress(0.93, 'Stocking the shelves');
  const box = new THREE.BoxGeometry(1, 1, 1);
  disposables.push(box);
  packaging.forEach((e) => {
    const t = packagingTexture(e.shelf.product_name || '', e.shelf.product_brand, e.shelf.theme_color || '#8a8f98', e.shelf.primary_image);
    disposables.push(t);
    const side = std(new THREE.Color(e.shelf.theme_color || '#8a8f98').lerp(new THREE.Color('#f3f1ec'), 0.55).getStyle(), 0.6);
    const front = new THREE.MeshStandardMaterial({ map: t, roughness: 0.55 });
    disposables.push(front);
    const mats = [side, side, side, side, front, front];
    const inst = new THREE.InstancedMesh(box, mats, e.mats.length);
    const scaleM = new THREE.Matrix4().makeScale(e.size.x, e.size.y, e.size.z);
    e.mats.forEach((m, i) => inst.setMatrixAt(i, m.clone().multiply(scaleM)));
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    root.add(inst);
  });

  // soft contact shadows under the lobby objects
  {
    const m = new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false, blending: THREE.MultiplyBlending, premultipliedAlpha: true });
    disposables.push(m);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(7, 4), m);
    p.rotation.x = -Math.PI / 2;
    p.position.set(0, 0.007, STORE.reception.z - 2);
    root.add(p);
  }

  // outer bounds
  const Bd = STORE.bounds;
  wallC(Bd.minX - 1, Bd.minX, Bd.minZ, Bd.maxZ);
  wallC(Bd.maxX, Bd.maxX + 1, Bd.minZ, Bd.maxZ);
  wallC(Bd.minX, Bd.maxX, Bd.minZ - 1, Bd.minZ);

  hitGroup.updateMatrixWorld(true);
  await progress(1, 'Ready');

  return {
    root,
    colliders,
    doors: { left: doorL, right: doorR, closedHalf: STORE.doorHalfWidth / 2, openHalf: STORE.doorHalfWidth * 1.55 },
    targets,
    hitGroup,
    videoScreens,
    animate: (t: number, dt: number) => {
      centre.update(t, dt);
      facadeAnim(t);
    },
    roomLighting,
    deptBySlot,
    dispose: () => {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry?.dispose();
      });
      hitGroup.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      disposables.forEach((d) => d.dispose());
    },
  };
}
