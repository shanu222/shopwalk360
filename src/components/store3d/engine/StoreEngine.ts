import { mediaUrl, screenMediaUrl } from '../../../lib/api';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildStore, BuiltStore, InteractiveTarget, VideoScreen, PickUnit } from '../builder/storeBuilder';
import { skyTexture, setMaxAnisotropy, contactShadowTexture } from '../builder/materials';
import { createHumanAvatar, AvatarRig, normaliseAvatarConfig } from '../avatar/AvatarModel';
import { createGlbAvatar, getGLTFLoader } from '../avatar/glbAvatar';
import { NavGrid } from '../nav/pathfinding';
import { STORE, Rect, zoneAt, Zone, roomForSlot } from '../layout/storeLayout';
import { AvatarConfig, StoreLayoutV2 } from '../../../types';
import { storeAudio } from './audio';

export type Quality = 'high' | 'balanced' | 'low';
export type CameraMode = 'third_person' | 'first_person';
export type EngineState = 'loading' | 'outside' | 'entering' | 'inside';

export interface EngineEvents {
  onProgress?: (p: number, label: string) => void;
  onReady?: () => void;
  onNearest?: (t: InteractiveTarget | null) => void;
  onPosition?: (p: { x: number; z: number; yaw: number }) => void;
  onZone?: (z: Zone) => void;
  onInteract?: (t: InteractiveTarget) => void;
  onArrive?: (id: string | null) => void;
  onEntered?: () => void;
  onContextLost?: () => void;
  onQualityDrop?: (q: Quality) => void;
  onAvatarError?: (msg: string) => void;
  onRouteChange?: (route: { x: number; z: number }[] | null) => void;
}

const LIGHT_TINT = { warm: new THREE.Color('#fff0dc'), neutral: new THREE.Color('#fff8ef'), cool: new THREE.Color('#f1f6ff') };

export function detectWebGL(): { ok: boolean; software: boolean } {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return { ok: false, software: false };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { ok: true, software: /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(r) };
  } catch {
    return { ok: false, software: false };
  }
}

export function suggestQuality(): Quality {
  const gl = detectWebGL();
  if (gl.software) return 'low';
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const mem = (navigator as any).deviceMemory as number | undefined;
  if ((coarse && small) || (mem !== undefined && mem <= 4)) return 'balanced';
  return 'high';
}

export class StoreEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private events: EngineEvents;
  private store: BuiltStore | null = null;
  private nav: NavGrid | null = null;
  private avatar: AvatarRig | null = null;
  private avatarShadow: THREE.Mesh;
  private hemi: THREE.HemisphereLight;
  private raf = 0;
  private disposed = false;
  private paused = false;
  quality: Quality;
  cameraMode: CameraMode = 'third_person';
  state: EngineState = 'loading';
  inputEnabled = true;
  reducedMotion = false;

  // player
  private pos = new THREE.Vector3(STORE.spawnOutside.x, 0, STORE.spawnOutside.z);
  private yaw = Math.PI; // avatar facing
  private camYaw = Math.PI;
  private camPitch = 0.26;
  private fpPitch = -0.05;
  private camDist = 3.6;
  private speedNow = 0;
  private turnRate = 0;
  private keys: Record<string, boolean> = {};
  private joystick = { x: 0, y: 0 };

  // navigation
  private path: { x: number; z: number }[] = [];
  private pathSpeed = 2.0;
  private pathTarget: { id: string | null; face?: THREE.Vector3; interact?: InteractiveTarget } | null = null;
  private routeLine: THREE.Mesh | null = null;
  private beacon: THREE.Group;
  private clickMarker: THREE.Mesh;
  private guidePersistent = false;

  // interaction
  private nearest: InteractiveTarget | null = null;
  private lastZoneKey = '';
  private lastPosEmit = 0;
  private frame = 0;
  private skip = 0;
  private accum = 0;
  private doorOpen = 0;
  private doorWasOpen = false;
  private lastStep = 0;
  private videos = new Map<string, ScreenPlayer>();
  private videoFrustum = new THREE.Frustum();
  private videoProj = new THREE.Matrix4();
  /** screens whose video failed: when to try again, and how often it has failed */
  private videoGaveUp = new Map<string, { until: number; tries: number }>();
  private videoWanted = new Map<string, number>();
  private fpsSamples: number[] = [];
  private lastQualityCheck = 0;
  private raycaster = new THREE.Raycaster();
  private pointer = { down: false, x: 0, y: 0, sx: 0, sy: 0, t: 0, id: -1, moved: false };
  private pinch: { d: number } | null = null;
  private touchPoints = new Map<number, { x: number; y: number }>();
  private cinematicT = 0;
  private lightTarget = LIGHT_TINT.neutral.clone();

  // other real shoppers in the store (from the live presence channel)
  private remotes = new Map<string, { rig: AvatarRig; tx: number; tz: number; tyaw: number; ts: number; pos: THREE.Vector3; yaw: number; key: string }>();
  private showRemotes = true;

  setShowOthers(v: boolean) {
    this.showRemotes = v;
    this.remotes.forEach((r) => (r.rig.root.visible = v));
  }

  setRemoteShoppers(list: { id: string; x: number; z: number; yaw: number; s: number; look: any }[]) {
    if (!this.store) return;
    // nearest 24 only, to keep the frame rate smooth
    const sorted = [...list].sort((a, b) => Math.hypot(a.x - this.pos.x, a.z - this.pos.z) - Math.hypot(b.x - this.pos.x, b.z - this.pos.z)).slice(0, 24);
    const keep = new Set(sorted.map((o) => o.id));
    this.remotes.forEach((r, id) => {
      if (!keep.has(id)) {
        this.scene.remove(r.rig.root);
        r.rig.dispose();
        this.remotes.delete(id);
      }
    });
    for (const o of sorted) {
      const key = JSON.stringify(o.look || {});
      let r = this.remotes.get(o.id);
      if (r && r.key !== key) {
        this.scene.remove(r.rig.root);
        r.rig.dispose();
        this.remotes.delete(o.id);
        r = undefined;
      }
      if (!r) {
        const cfg = normaliseAvatarConfig({ ...(o.look || {}), accessories: { ...(o.look?.accessories || {}), shoppingBasket: true }, glbUrl: undefined } as Partial<AvatarConfig>);
        const rig = createHumanAvatar(cfg, { lowDetail: true });
        rig.root.position.set(o.x, 0, o.z);
        rig.root.rotation.y = o.yaw;
        rig.root.visible = this.showRemotes;
        this.scene.add(rig.root);
        r = { rig, tx: o.x, tz: o.z, tyaw: o.yaw, ts: o.s, pos: new THREE.Vector3(o.x, 0, o.z), yaw: o.yaw, key };
        this.remotes.set(o.id, r);
      }
      r.tx = o.x;
      r.tz = o.z;
      r.tyaw = o.yaw;
      r.ts = o.s;
    }
  }

  private updateRemotes(dt: number) {
    this.remotes.forEach((r) => {
      const px = r.pos.x;
      const pz = r.pos.z;
      const k = 1 - Math.exp(-dt * 8);
      // snap if they teleported (e.g. "go now")
      if (Math.hypot(r.tx - px, r.tz - pz) > 6) r.pos.set(r.tx, 0, r.tz);
      else {
        r.pos.x += (r.tx - px) * k;
        r.pos.z += (r.tz - pz) * k;
      }
      const prevYaw = r.yaw;
      r.yaw = dampAngle(r.yaw, r.tyaw, 8, dt);
      const speed = dt > 0 ? Math.hypot(r.pos.x - px, r.pos.z - pz) / dt : 0;
      r.rig.root.position.copy(r.pos);
      r.rig.root.rotation.y = r.yaw;
      if (r.rig.root.visible) r.rig.update(dt, { speed, turnRate: dt > 0 ? angleDiff(r.yaw, prevYaw) / dt : 0 });
    });
  }

  /** current state for sharing with other shoppers */
  getPlayerState() {
    return { x: this.pos.x, z: this.pos.z, yaw: this.yaw, camYaw: this.camYaw, speed: this.speedNow, inside: this.state === 'inside' };
  }

  // pick-from-shelf → basket animation
  private pickAnim: { mesh: THREE.Object3D; t: number; from: THREE.Vector3; faceYaw: number | null; owned: boolean } | null = null;
  private restockTimers = new Set<number>();
  private basketShown = 0;
  private basketTarget = 0;

  constructor(container: HTMLElement, quality: Quality, events: EngineEvents) {
    this.container = container;
    this.events = events;
    this.quality = quality;
    this.reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', powerPreference: 'high-performance', alpha: false });
    this.renderer.setSize(w, h);
    this.applyPixelRatio();
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.domElement.setAttribute('aria-label', 'ShopWalk 360 virtual store. Use the on-screen buttons, arrow keys or tap to move.');
    this.renderer.domElement.setAttribute('role', 'application');
    this.renderer.domElement.tabIndex = 0;
    container.appendChild(this.renderer.domElement);
    setMaxAnisotropy(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));

    this.camera = new THREE.PerspectiveCamera(58, w / h, 0.05, 220);
    this.scene.background = skyTexture();
    this.scene.fog = new THREE.Fog('#d9d3c8', 60, 160);

    try {
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environmentIntensity = 0.55;
      pm.dispose();
    } catch {
      /* environment is optional */
    }

    this.hemi = new THREE.HemisphereLight('#fff8ef', '#6f665b', 0.9);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight('#fff3e2', 0.95);
    sun.position.set(18, 40, 26);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight('#ffffff', 0.1));

    // avatar blob shadow
    this.avatarShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.95),
      new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false, blending: THREE.MultiplyBlending, premultipliedAlpha: true }),
    );
    this.avatarShadow.rotation.x = -Math.PI / 2;
    this.avatarShadow.renderOrder = 2;
    this.scene.add(this.avatarShadow);

    // guidance beacon & click marker
    this.beacon = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 48), new THREE.MeshBasicMaterial({ color: '#c8a96a', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#f3dfb4', transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }));
    beam.position.y = 1.6;
    this.beacon.add(ring, beam);
    this.beacon.visible = false;
    this.scene.add(this.beacon);
    this.clickMarker = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.22, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    this.clickMarker.rotation.x = -Math.PI / 2;
    this.scene.add(this.clickMarker);

    this.bindInput();
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.loop();
  }

  /* ----------------------------------------------------------------------------- setup */

  async load(layout: StoreLayoutV2, avatarConfig: AvatarConfig, startInside: boolean) {
    this.state = 'loading';
    if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
      try {
        await Promise.race([(document as any).fonts.ready, new Promise((r) => setTimeout(r, 1200))]);
      } catch {
        /* fonts optional */
      }
    }
    const built = await buildStore(layout.departments, layout.shelves, layout.promos || [], {
      quality: this.quality,
      storeName: layout.storeName,
      leds: layout.leds || [],
      onProgress: (p, l) => this.events.onProgress?.(p, l),
    });
    if (this.disposed) {
      built.dispose();
      return;
    }
    this.store = built;
    this.scene.add(built.root);
    this.nav = new NavGrid(built.colliders);
    await this.setAvatarConfig(avatarConfig);
    if (startInside || this.reducedMotion) this.teleport(STORE.spawnInside.x, STORE.spawnInside.z, Math.PI, 'inside');
    else this.teleport(STORE.spawnOutside.x, STORE.spawnOutside.z, Math.PI, 'outside');
    this.events.onReady?.();
    void this.loadProductModels();
  }

  /** Real product models uploaded by the admin are shown on a display stand in front of their shelf. */
  private productModels: { obj: THREE.Object3D; spin: boolean; baseYaw: number }[] = [];
  /**
   * Uploaded 3D models (GLB) of products are placed on their shelf spots, one per unit the admin
   * chose to show, at the product's real size when its dimensions are given. Each model file is
   * downloaded once and copied for every unit.
   */
  private async loadProductModels() {
    const store = this.store;
    if (!store || !store.modelSlots.length) return;
    const loader = getGLTFLoader(this.renderer);
    const byUrl = new Map<string, typeof store.modelSlots>();
    store.modelSlots.forEach((s) => {
      const url = s.shelf.model_3d_url!;
      byUrl.set(url, [...(byUrl.get(url) || []), s]);
    });
    for (const [url, slots] of byUrl) {
      if (this.disposed || this.store !== store) return;
      let source: THREE.Object3D;
      try {
        source = (await loader.loadAsync(mediaUrl(url))).scene;
      } catch {
        continue; // a model that fails to load simply is not shown
      }
      if (this.disposed || this.store !== store) return;
      source.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = this.quality !== 'low';
          m.receiveShadow = true;
        }
      });
      const raw = new THREE.Box3().setFromObject(source).getSize(new THREE.Vector3());
      const modelMax = Math.max(raw.x, raw.y, raw.z) || 1;
      for (const slot of slots) {
        const sh = slot.shelf;
        let dims: { w?: number; h?: number; d?: number } | null = null;
        try {
          dims = sh.dimensions_json ? JSON.parse(sh.dimensions_json) : null;
        } catch {
          dims = null;
        }
        const realMax = dims ? Math.max(Number(dims.w) || 0, Number(dims.h) || 0, Number(dims.d) || 0) / 100 : 0;
        // real size when known (never larger than the spot allows), otherwise fill the spot
        const target = realMax > 0 ? Math.min(realMax, slot.maxSize) : slot.maxSize * 0.92;
        const scale = (target / modelMax) * (Number(sh.model_scale) > 0 ? Number(sh.model_scale) : 1);
        const model = source.clone(true);
        model.scale.setScalar(scale);
        model.rotation.y = THREE.MathUtils.degToRad(Number(sh.model_rotation_deg) || 0);
        const fitted = new THREE.Box3().setFromObject(model);
        const c = fitted.getCenter(new THREE.Vector3());
        model.position.set(-c.x, -fitted.min.y, -c.z);
        const holder = new THREE.Group();
        holder.add(model);
        holder.applyMatrix4(slot.matrix);
        this.scene.add(holder);
        this.productModels.push({ obj: holder, spin: false, baseYaw: holder.rotation.y });
        const list = store.units.get(slot.itemId) || [];
        list.push({ matrix: slot.matrix.clone(), size: fitted.getSize(new THREE.Vector3()), object: holder });
        store.units.set(slot.itemId, list);
      }
    }
  }

  async setAvatarConfig(cfg: AvatarConfig) {
    if (cfg.glbUrl) {
      try {
        const rig = await createGlbAvatar(cfg.glbUrl, cfg, this.renderer);
        this.swapAvatar(rig);
        return;
      } catch {
        this.events.onAvatarError?.('Your 3D avatar model could not be loaded, so a customisable avatar is shown instead.');
      }
    }
    if (this.avatar && !(this.avatar as any).__glb) {
      this.avatar.applyConfig(cfg);
      return;
    }
    this.swapAvatar(createHumanAvatar(cfg, { lowDetail: this.quality === 'low' }));
  }

  private swapAvatar(rig: AvatarRig) {
    this.avatar?.dispose();
    this.avatar = rig;
    this.scene.add(rig.root);
    rig.root.position.copy(this.pos);
    rig.root.rotation.y = this.yaw;
    rig.setVisible(this.cameraMode === 'third_person');
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.applyPixelRatio();
  }

  private applyPixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(this.quality === 'high' ? Math.min(dpr, 2) : this.quality === 'balanced' ? Math.min(dpr, 1.25) : Math.min(dpr, 0.85));
  }

  setCameraMode(m: CameraMode) {
    this.cameraMode = m;
    this.avatar?.setVisible(m === 'third_person');
    if (m === 'first_person') this.fpPitch = -0.05;
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p) this.videos.forEach((v) => v.pause());
  }

  setJoystick(x: number, y: number) {
    this.joystick.x = x;
    this.joystick.y = y;
    if (x || y) this.cancelPath(false);
  }

  setBasketCount(n: number) {
    this.basketTarget = n;
    // while an item is travelling to the basket, it appears in the basket when it lands
    if (!this.pickAnim || n < this.basketShown) {
      this.basketShown = n;
      this.avatar?.setBasketCount(n);
    }
  }

  /** The avatar takes the product from the shelf and drops it into the basket. */
  /**
   * The shopper takes the product: one real unit leaves its spot on the shelf, travels to the hand,
   * then into the basket. The shelf is restocked a minute later, as staff would.
   */
  playPick(opts: { shelfId?: string; productId?: string; imageUrl?: string } = {}) {
    storeAudio.pick();
    const avatar = this.avatar;
    if (!avatar) return;
    this.finishPick();
    const targets = this.store?.targets || [];
    let target: InteractiveTarget | undefined = opts.shelfId ? targets.find((t) => t.id === opts.shelfId) : undefined;
    if (!target && opts.productId) {
      let best = Infinity;
      for (const t of targets) {
        if (t.shelf?.product_id !== opts.productId) continue;
        const d = Math.hypot(t.stand.x - this.pos.x, t.stand.z - this.pos.z);
        if (d < best) {
          best = d;
          target = t;
        }
      }
    }
    const near = !!target && Math.hypot(target.position.x - this.pos.x, target.position.z - this.pos.z) < 5;
    let from: THREE.Vector3;
    let faceYaw: number | null = null;
    let carried: THREE.Object3D | null = null;
    let owned = true;
    // take the unit nearest to the shopper from that spot
    const unit = near && target ? this.takeUnit(target.id) : null;
    if (unit) {
      from = new THREE.Vector3();
      if (unit.object) unit.object.getWorldPosition(from);
      else from.setFromMatrixPosition(unit.matrix);
      faceYaw = Math.atan2(from.x - this.pos.x, from.z - this.pos.z);
      carried = new THREE.Group();
      if (unit.object) {
        const copy = unit.object.clone(true);
        copy.position.set(0, 0, 0);
        copy.quaternion.copy(unit.object.getWorldQuaternion(new THREE.Quaternion()));
        carried.add(copy);
      } else if (unit.mesh) {
        const box = new THREE.Mesh(unit.mesh.geometry, unit.mesh.material);
        box.scale.copy(unit.size);
        box.quaternion.setFromRotationMatrix(new THREE.Matrix4().extractRotation(unit.matrix));
        carried.add(box);
      }
      owned = false; // shares the shelf's geometry and materials
    } else if (near && target) {
      from = target.position.clone();
      from.y = THREE.MathUtils.clamp(from.y, 0.6, 1.5);
      faceYaw = Math.atan2(from.x - this.pos.x, from.z - this.pos.z);
    } else {
      // not standing at the shelf: take it from just in front of the shopper
      from = new THREE.Vector3(this.pos.x + Math.sin(this.yaw) * 0.7, 1.15, this.pos.z + Math.cos(this.yaw) * 0.7);
    }
    avatar.triggerPick();

    if (!carried) {
      const side = new THREE.MeshStandardMaterial({ color: '#e9e3d6', roughness: 0.55 });
      const front = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 });
      if (opts.imageUrl) {
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin('anonymous');
        loader.load(
          mediaUrl(opts.imageUrl),
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            front.map = tex;
            front.needsUpdate = true;
          },
          undefined,
          () => front.color.set('#c8a96a'),
        );
      } else front.color.set('#c8a96a');
      carried = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.08), [side, side, side, side, front, front]);
      owned = true;
    }
    carried.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    carried.position.copy(from);
    this.scene.add(carried);
    this.pickAnim = { mesh: carried, t: 0, from, faceYaw, owned };
  }

  /** Take one unit from a spot's shelf (the nearest one still there); it is restocked a minute later. */
  private takeUnit(spotId: string): PickUnit | null {
    const list = this.store?.units.get(spotId);
    if (!list?.length) return null;
    const p = new THREE.Vector3();
    let best: PickUnit | null = null;
    let bestD = Infinity;
    for (const u of list) {
      if (u.taken) continue;
      if (u.object) u.object.getWorldPosition(p);
      else p.setFromMatrixPosition(u.matrix);
      const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    if (!best) return null;
    // the last unit stays on show (the shopper takes a copy) so the shelf never looks abandoned
    if (list.filter((u) => !u.taken).length <= 1) return best;
    best.taken = true;
    this.setUnitVisible(best, false);
    const unit = best;
    const timer = window.setTimeout(() => {
      this.restockTimers.delete(timer);
      if (this.disposed) return;
      unit.taken = false;
      this.setUnitVisible(unit, true);
    }, 60000);
    this.restockTimers.add(timer);
    return best;
  }

  private setUnitVisible(u: PickUnit, show: boolean) {
    if (u.object) {
      u.object.visible = show;
      return;
    }
    if (u.mesh && u.index != null) {
      const m = show ? u.matrix.clone().multiply(new THREE.Matrix4().makeScale(u.size.x, u.size.y, u.size.z)) : new THREE.Matrix4().makeScale(0, 0, 0);
      u.mesh.setMatrixAt(u.index, m);
      u.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private finishPick() {
    const a = this.pickAnim;
    if (!a) return;
    this.scene.remove(a.mesh);
    if (a.owned) {
      a.mesh.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry?.dispose();
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((mm: any) => {
          mm.map?.dispose();
          mm.dispose();
        });
      });
    }
    this.pickAnim = null;
    this.basketShown = this.basketTarget;
    this.avatar?.setBasketCount(this.basketTarget);
  }

  private updatePick(dt: number) {
    const a = this.pickAnim;
    if (!a || !this.avatar) return;
    a.t += dt;
    if (a.faceYaw !== null && this.speedNow < 0.05 && !this.path.length) this.yaw = dampAngle(this.yaw, a.faceYaw, 7, dt);
    const fp = this.cameraMode === 'first_person';
    const hand = new THREE.Vector3();
    const drop = new THREE.Vector3();
    if (fp) {
      // first person: bring it towards the bottom of the view
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      hand.copy(this.camera.position).addScaledVector(dir, 0.55).add(new THREE.Vector3(0, -0.22, 0));
      drop.copy(this.camera.position).addScaledVector(dir, 0.35).add(new THREE.Vector3(0, -0.6, 0));
    } else {
      this.avatar.anchors.leftWrist.getWorldPosition(hand);
      const b = this.avatar.anchors.basket;
      if (b && b.visible !== false) {
        b.getWorldPosition(drop);
        drop.y -= 0.18;
      } else drop.copy(hand).add(new THREE.Vector3(0, -0.25, 0));
    }
    const T1 = 0.5; // shelf → hand (matches the arm reach)
    const T2 = 0.62; // brief hold
    const T3 = 1.05; // hand → basket
    const ease = (x: number) => x * x * (3 - 2 * x);
    const m = a.mesh;
    if (a.t < T1) {
      const k = ease(a.t / T1);
      m.position.lerpVectors(a.from, hand, k);
      m.rotation.y = this.yaw + k * 0.4;
    } else if (a.t < T2) {
      m.position.copy(hand);
    } else if (a.t < T3) {
      const k = ease((a.t - T2) / (T3 - T2));
      m.position.lerpVectors(hand, drop, k);
      m.position.y += Math.sin(k * Math.PI) * 0.12;
      m.scale.setScalar(1 - 0.35 * k);
      m.rotation.y = this.yaw + 0.4 + k * 0.8;
    } else {
      this.finishPick();
    }
  }

  getTargets() {
    return this.store?.targets || [];
  }

  getColliders(): Rect[] {
    return this.store?.colliders || [];
  }

  /* ----------------------------------------------------------------------------- movement API */

  teleport(x: number, z: number, yaw: number, state?: EngineState) {
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.camYaw = yaw;
    this.cancelPath(true);
    if (state) this.state = state;
    if (this.avatar) {
      this.avatar.root.position.copy(this.pos);
      this.avatar.root.rotation.y = yaw;
    }
    this.snapCamera();
  }

  /**
   * Put the shopper back where they were before a page reload. If that spot is now taken
   * (the layout changed) or is outside the building, use the nearest free spot, or the reception.
   */
  resumeAt(x: number, z: number, yaw: number, camYaw = yaw) {
    const B = STORE.bounds;
    const ok = (px: number, pz: number) =>
      Number.isFinite(px) && Number.isFinite(pz) && px > B.minX + 0.5 && px < B.maxX - 0.5 && pz > B.minZ + 0.5 && pz < STORE.facadeZ - 0.6 &&
      zoneAt(px, pz).kind !== 'outside' && !this.blocked(px, pz, 0.35);
    let spot: { x: number; z: number } | null = ok(x, z) ? { x, z } : null;
    for (let r = 0.5; !spot && r <= 4; r += 0.5) {
      for (let a = 0; a < 16 && !spot; a++) {
        const px = x + Math.cos((a / 16) * Math.PI * 2) * r;
        const pz = z + Math.sin((a / 16) * Math.PI * 2) * r;
        if (ok(px, pz)) spot = { x: px, z: pz };
      }
    }
    if (!spot) {
      this.teleport(STORE.spawnInside.x, STORE.spawnInside.z, Math.PI, 'inside');
      return false;
    }
    this.teleport(spot.x, spot.z, Number.isFinite(yaw) ? yaw : Math.PI, 'inside');
    if (Number.isFinite(camYaw)) {
      this.camYaw = camYaw;
      this.snapCamera();
    }
    this.lastZoneKey = '';
    this.updateZone();
    return true;
  }

  /** Scripted entrance: doors open, avatar walks into the reception, camera follows */
  enterStore() {
    if (this.state !== 'outside') return;
    if (this.reducedMotion) {
      this.teleport(STORE.spawnInside.x, STORE.spawnInside.z, Math.PI, 'inside');
      this.events.onEntered?.();
      return;
    }
    this.state = 'entering';
    this.camYaw = Math.PI;
    this.path = [{ x: 0, z: 38.5 }, { x: 0, z: 33 }, { x: STORE.spawnInside.x, z: STORE.spawnInside.z }];
    this.pathSpeed = 1.35;
    this.pathTarget = { id: '__enter__' };
  }

  skipEntrance() {
    if (this.state === 'outside' || this.state === 'entering') {
      this.teleport(STORE.spawnInside.x, STORE.spawnInside.z, Math.PI, 'inside');
      this.events.onEntered?.();
    }
  }

  /** Walk to a point (path-finding). `guide` keeps the route visible. */
  walkTo(x: number, z: number, opts: { id?: string | null; face?: THREE.Vector3; interact?: InteractiveTarget; speed?: number; guide?: boolean } = {}) {
    if (!this.nav || this.state === 'loading' || this.state === 'entering') return false;
    if (this.state === 'outside') this.state = 'inside';
    const path = this.nav.findPath(this.pos.x, this.pos.z, x, z);
    if (!path || !path.length) return false;
    this.path = path;
    const dist = path.reduce((acc, p, i) => acc + Math.hypot(p.x - (i ? path[i - 1].x : this.pos.x), p.z - (i ? path[i - 1].z : this.pos.z)), 0);
    this.pathSpeed = opts.speed ?? (dist > 18 ? 2.4 : 1.6);
    this.pathTarget = { id: opts.id ?? null, face: opts.face, interact: opts.interact };
    this.guidePersistent = !!opts.guide;
    this.drawRoute([{ x: this.pos.x, z: this.pos.z }, ...path]);
    this.beacon.position.set(path[path.length - 1].x, 0, path[path.length - 1].z);
    this.beacon.visible = true;
    return true;
  }

  /** Show a route on the floor without moving (the shopper walks it themselves) */
  showRoute(x: number, z: number) {
    if (!this.nav) return false;
    const path = this.nav.findPath(this.pos.x, this.pos.z, x, z);
    if (!path) return false;
    this.guidePersistent = true;
    this.drawRoute([{ x: this.pos.x, z: this.pos.z }, ...path]);
    this.beacon.position.set(path[path.length - 1].x, 0, path[path.length - 1].z);
    this.beacon.visible = true;
    return true;
  }

  goToTarget(targetId: string, opts: { interact?: boolean; walk?: boolean } = { interact: true, walk: true }) {
    const t = this.store?.targets.find((x) => x.id === targetId);
    if (!t) return false;
    if (opts.walk === false) return this.showRoute(t.stand.x, t.stand.z);
    return this.walkTo(t.stand.x, t.stand.z, { id: t.id, face: t.position, interact: opts.interact ? t : undefined, guide: true });
  }

  goToDepartment(slot: number, walk = true) {
    const room = roomForSlot(slot);
    if (!walk) {
      const yaw = Math.atan2(room.inward, 0);
      this.teleport(room.inside.x, room.inside.z, yaw, 'inside');
      return true;
    }
    return this.walkTo(room.inside.x, room.inside.z, { id: `dept_${slot}`, face: new THREE.Vector3(room.inside.x + room.inward * 5, 1.5, room.inside.z), guide: true });
  }

  /** Instantly move next to a target (quick shopping mode) */
  jumpToTarget(targetId: string) {
    const t = this.store?.targets.find((x) => x.id === targetId);
    if (!t) return null;
    const yaw = Math.atan2(t.position.x - t.stand.x, t.position.z - t.stand.z);
    this.teleport(t.stand.x, t.stand.z, yaw, 'inside');
    return t;
  }

  returnToLobby(walk = true) {
    if (walk) this.walkTo(STORE.lobbyCenter.x, STORE.lobbyCenter.z - 1, { id: 'lobby', face: new THREE.Vector3(0, 1.6, 12), guide: true });
    else this.teleport(STORE.lobbyCenter.x, STORE.lobbyCenter.z, Math.PI, 'inside');
  }

  isWalking() {
    return this.path.length > 0 && this.state === 'inside';
  }

  /** Jump to the end of the current walk (keeps the destination behaviour, e.g. opening a product) */
  skipToDestination() {
    if (!this.path.length) return;
    const end = this.path[this.path.length - 1];
    this.pos.set(end.x, 0, end.z);
    this.path = [];
    this.snapCamera();
    this.arrive();
  }

  cancelPath(clearRoute = true) {
    this.path = [];
    this.pathTarget = null;
    if (clearRoute || !this.guidePersistent) this.clearRoute();
  }

  clearRoute() {
    this.guidePersistent = false;
    if (this.routeLine) {
      this.scene.remove(this.routeLine);
      this.routeLine.geometry.dispose();
      (this.routeLine.material as THREE.Material).dispose();
      this.routeLine = null;
    }
    this.beacon.visible = false;
    this.events.onRouteChange?.(null);
  }

  interactNearest() {
    if (this.nearest) this.events.onInteract?.(this.nearest);
  }

  /* ----------------------------------------------------------------------------- input */

  private isTypingTarget(e: Event) {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.inputEnabled || this.isTypingTarget(e)) return;
    const k = e.code;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) {
      this.keys[k] = true;
      this.cancelPath(false);
      if (this.state === 'outside') this.state = 'inside';
      if (k.startsWith('Arrow')) e.preventDefault();
    }
    if (k === 'ShiftLeft' || k === 'ShiftRight') this.keys.Shift = true;
    if (k === 'KeyQ') this.keys.KeyQ = true;
    if (k === 'KeyE') this.keys.KeyE = true;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.code;
    this.keys[k] = false;
    if (k === 'ShiftLeft' || k === 'ShiftRight') this.keys.Shift = false;
  };

  private bindInput() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private onBlur = () => {
    this.keys = {};
  };

  private onVisibility = () => {
    if (document.hidden) this.videos.forEach((v) => v.pause());
  };

  private onPointerDown = (e: PointerEvent) => {
    if (!this.inputEnabled) return;
    this.renderer.domElement.focus({ preventScroll: true });
    this.touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.touchPoints.size === 2) {
      const [a, b] = [...this.touchPoints.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
      this.pointer.down = false;
      return;
    }
    this.pointer = { down: true, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), id: e.pointerId, moved: false };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.touchPoints.has(e.pointerId)) this.touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.touchPoints.size === 2) {
      const [a, b] = [...this.touchPoints.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.camDist = THREE.MathUtils.clamp(this.camDist * (this.pinch.d / Math.max(1, d)), 1.8, 7);
      this.pinch.d = d;
      return;
    }
    if (!this.pointer.down || e.pointerId !== this.pointer.id) return;
    const dx = e.clientX - this.pointer.x;
    const dy = e.clientY - this.pointer.y;
    this.pointer.x = e.clientX;
    this.pointer.y = e.clientY;
    if (Math.hypot(e.clientX - this.pointer.sx, e.clientY - this.pointer.sy) > 6) this.pointer.moved = true;
    if (!this.pointer.moved) return;
    const k = e.pointerType === 'touch' ? 0.0062 : 0.0045;
    this.camYaw -= dx * k;
    if (this.cameraMode === 'first_person') this.fpPitch = THREE.MathUtils.clamp(this.fpPitch - dy * k, -1.0, 0.9);
    else this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * k, -0.15, 1.1);
  };

  private onPointerUp = (e: PointerEvent) => {
    this.touchPoints.delete(e.pointerId);
    if (this.touchPoints.size < 2) this.pinch = null;
    if (!this.pointer.down || e.pointerId !== this.pointer.id) return;
    this.pointer.down = false;
    const quick = performance.now() - this.pointer.t < 450;
    if (!this.pointer.moved && quick && e.button !== 2) this.handleClick(e.clientX, e.clientY);
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.inputEnabled) return;
    e.preventDefault();
    this.camDist = THREE.MathUtils.clamp(this.camDist * (1 + Math.sign(e.deltaY) * 0.1), 1.8, 7);
  };

  private onResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.events.onContextLost?.();
  };

  private handleClick(cx: number, cy: number) {
    if (!this.store || this.state === 'loading' || this.state === 'entering') return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.store.hitGroup.children, false);
    if (hits.length && hits[0].distance < 25) {
      const id = hits[0].object.userData.targetId as string;
      const t = this.store.targets.find((x) => x.id === id);
      if (t) {
        if (Math.hypot(t.stand.x - this.pos.x, t.stand.z - this.pos.z) < 1.2) {
          this.events.onInteract?.(t);
          return;
        }
        this.walkTo(t.stand.x, t.stand.z, { id: t.id, face: t.position, interact: t });
        return;
      }
    }
    // floor click
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const p = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(plane, p) && p.distanceTo(this.camera.position) < 45) {
      if (this.walkTo(p.x, p.z, { id: null })) {
        this.clickMarker.position.set(this.beacon.position.x, 0.02, this.beacon.position.z);
        (this.clickMarker.material as THREE.MeshBasicMaterial).opacity = 0.9;
        this.beacon.visible = false;
        if (!this.guidePersistent) this.clearRouteLineOnly();
      }
    }
  }

  private clearRouteLineOnly() {
    if (this.routeLine) {
      this.scene.remove(this.routeLine);
      this.routeLine.geometry.dispose();
      (this.routeLine.material as THREE.Material).dispose();
      this.routeLine = null;
    }
  }

  /* ----------------------------------------------------------------------------- route ribbon */

  private drawRoute(points: { x: number; z: number }[]) {
    this.clearRouteLineOnly();
    if (points.length < 2) return;
    const curvePts = points.map((p) => new THREE.Vector3(p.x, 0.03, p.z));
    const positions: number[] = [];
    const uvs: number[] = [];
    let acc = 0;
    const halfW = 0.22;
    for (let i = 0; i < curvePts.length; i++) {
      const p = curvePts[i];
      const next = curvePts[Math.min(i + 1, curvePts.length - 1)];
      const prev = curvePts[Math.max(i - 1, 0)];
      const dir = new THREE.Vector3().subVectors(next, prev).setY(0).normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(halfW);
      if (i > 0) acc += p.distanceTo(curvePts[i - 1]);
      positions.push(p.x + side.x, 0.03, p.z + side.z, p.x - side.x, 0.03, p.z - side.z);
      uvs.push(0, acc / 0.9, 1, acc / 0.9);
    }
    const idx: number[] = [];
    for (let i = 0; i < curvePts.length - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    // chevron texture
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(200,169,106,0.35)';
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = '#fff4dc';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(10, 18);
    ctx.lineTo(32, 44);
    ctx.lineTo(54, 18);
    ctx.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.wrapT = THREE.RepeatWrapping;
    tex.rotation = Math.PI;
    tex.center.set(0.5, 0.5);
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
    this.routeLine = new THREE.Mesh(g, m);
    this.routeLine.renderOrder = 3;
    this.scene.add(this.routeLine);
    this.events.onRouteChange?.(points);
  }

  /* ----------------------------------------------------------------------------- simulation */

  private blocked(x: number, z: number, r = 0.3) {
    const cs = this.store?.colliders;
    if (!cs) return false;
    for (const b of cs) if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return true;
    return false;
  }

  private moveWithCollision(dx: number, dz: number) {
    const nx = this.pos.x + dx;
    const nz = this.pos.z + dz;
    if (!this.blocked(nx, nz)) {
      this.pos.x = nx;
      this.pos.z = nz;
      return Math.hypot(dx, dz);
    }
    if (!this.blocked(nx, this.pos.z)) {
      this.pos.x = nx;
      return Math.abs(dx);
    }
    if (!this.blocked(this.pos.x, nz)) {
      this.pos.z = nz;
      return Math.abs(dz);
    }
    return 0;
  }

  private step(dt: number) {
    let moved = 0;
    let wantYaw: number | null = null;
    const startX = this.pos.x;
    const startZ = this.pos.z;

    // keyboard turn for accessibility (Q/E are not used; arrows left/right strafe relative to camera)
    let ix = 0;
    let iz = 0;
    if (this.inputEnabled && this.state !== 'entering' && this.state !== 'loading') {
      if (this.keys.KeyW || this.keys.ArrowUp) iz += 1;
      if (this.keys.KeyS || this.keys.ArrowDown) iz -= 1;
      if (this.keys.KeyA || this.keys.ArrowLeft) ix -= 1;
      if (this.keys.KeyD || this.keys.ArrowRight) ix += 1;
      ix += this.joystick.x;
      iz += -this.joystick.y;
    }
    if (this.keys.KeyE) {
      this.keys.KeyE = false;
      this.interactNearest();
    }

    if (ix || iz) {
      const len = Math.min(1, Math.hypot(ix, iz));
      const fx = Math.sin(this.camYaw);
      const fz = Math.cos(this.camYaw);
      const rx = -Math.cos(this.camYaw);
      const rz = Math.sin(this.camYaw);
      let mx = fx * iz + rx * ix;
      let mz = fz * iz + rz * ix;
      const ml = Math.hypot(mx, mz) || 1;
      mx /= ml;
      mz /= ml;
      const speed = (this.keys.Shift ? 2.7 : 1.55) * len;
      moved = this.moveWithCollision(mx * speed * dt, mz * speed * dt);
      wantYaw = Math.atan2(mx, mz);
      if (this.cameraMode === 'first_person') wantYaw = this.camYaw;
    } else if (this.path.length) {
      const target = this.path[0];
      const dx = target.x - this.pos.x;
      const dz = target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const remaining = this.path.length === 1 ? d : Infinity;
      // ease in at the end so the avatar stops naturally
      const speed = Math.min(this.pathSpeed, remaining < 1.2 ? Math.max(0.6, remaining * 1.4) : this.pathSpeed);
      const stepLen = speed * dt;
      if (d <= Math.max(0.06, stepLen)) {
        this.pos.x = target.x;
        this.pos.z = target.z;
        moved = d;
        this.path.shift();
        if (!this.path.length) this.arrive();
      } else {
        const ux = dx / d;
        const uz = dz / d;
        const before = this.state === 'entering';
        moved = before ? (this.pos.x += ux * stepLen, this.pos.z += uz * stepLen, stepLen) : this.moveWithCollision(ux * stepLen, uz * stepLen);
        if (moved < stepLen * 0.2 && !before) {
          // something blocks the path — recompute once
          const goal = this.path[this.path.length - 1];
          const id = this.pathTarget;
          const re = this.nav?.findPath(this.pos.x, this.pos.z, goal.x, goal.z);
          if (re && re.length) this.path = re;
          else {
            this.cancelPath();
            void id;
          }
        }
        wantYaw = Math.atan2(ux, uz);
      }
      // camera eases behind the avatar during auto-walk (third person)
      if (wantYaw !== null && this.cameraMode === 'third_person' && !this.pointer.down) {
        this.camYaw = dampAngle(this.camYaw, wantYaw, this.state === 'entering' ? 2.5 : 1.6, dt);
      }
      if (this.cameraMode === 'first_person' && wantYaw !== null) this.camYaw = dampAngle(this.camYaw, wantYaw, 4, dt);
    }

    this.speedNow = dt > 0 ? Math.hypot(this.pos.x - startX, this.pos.z - startZ) / dt : 0;
    const prevYaw = this.yaw;
    if (wantYaw !== null) this.yaw = dampAngle(this.yaw, wantYaw, 9, dt);
    else if (this.pathTarget === null && this.nearest && this.speedNow < 0.05 && this.cameraMode === 'third_person') {
      // stay facing the current direction when idle
    }
    this.turnRate = dt > 0 ? angleDiff(this.yaw, prevYaw) / dt : 0;

    // footsteps
    if (moved > 0) {
      const now = performance.now();
      const interval = this.speedNow > 2.2 ? 330 : 480;
      if (now - this.lastStep > interval) {
        storeAudio.footstep();
        this.lastStep = now;
      }
    }
  }

  private arrive() {
    const t = this.pathTarget;
    this.pathTarget = null;
    (this.clickMarker.material as THREE.MeshBasicMaterial).opacity = 0;
    if (!t) return;
    if (t.id === '__enter__') {
      this.state = 'inside';
      this.events.onEntered?.();
      return;
    }
    if (t.face) this.yaw = Math.atan2(t.face.x - this.pos.x, t.face.z - this.pos.z);
    if (t.face && this.cameraMode === 'third_person') this.camYaw = this.yaw;
    if (!this.guidePersistent) this.clearRoute();
    else {
      this.clearRoute();
    }
    this.events.onArrive?.(t.id);
    if (t.interact) this.events.onInteract?.(t.interact);
  }

  private updateDoors(dt: number) {
    if (!this.store) return;
    const d = Math.hypot(this.pos.x, this.pos.z - STORE.facadeZ);
    const camD = Math.hypot(this.camera.position.x, this.camera.position.z - STORE.facadeZ);
    const open = d < 6 || (this.state === 'entering' && d < 9) || camD < 2.5;
    if (open !== this.doorWasOpen) {
      this.doorWasOpen = open;
      if (open) storeAudio.doors();
    }
    this.doorOpen = THREE.MathUtils.damp(this.doorOpen, open ? 1 : 0, 3.2, dt);
    const { left, right, closedHalf, openHalf } = this.store.doors;
    const off = THREE.MathUtils.lerp(closedHalf, openHalf, easeInOut(this.doorOpen));
    left.position.x = -off;
    right.position.x = off;
  }

  private updateNearest() {
    if (!this.store) return;
    let best: InteractiveTarget | null = null;
    let bestD = 2.8;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    for (const t of this.store.targets) {
      const dx = t.position.x - this.pos.x;
      const dz = t.position.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const standD = Math.hypot(t.stand.x - this.pos.x, t.stand.z - this.pos.z);
      if (d > 4.5) continue;
      const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      const score = Math.min(standD * 1.1, d - Math.max(0, facing) * 0.6);
      if ((facing > -0.25 || standD < 0.9) && score < bestD) {
        bestD = score;
        best = t;
      }
    }
    if ((best?.id ?? null) !== (this.nearest?.id ?? null)) {
      this.nearest = best;
      this.events.onNearest?.(best);
    }
    this.avatar?.setLookTarget(best ? best.position : null);
  }

  private updateZone() {
    const z = zoneAt(this.pos.x, this.pos.z);
    const key = z.kind === 'department' ? `d${z.slot}` : z.kind;
    if (key !== this.lastZoneKey) {
      this.lastZoneKey = key;
      this.events.onZone?.(z);
      const temp = z.kind === 'department' ? this.store?.roomLighting[z.slot] || 'neutral' : z.kind === 'outside' ? 'neutral' : 'warm';
      this.lightTarget.copy(LIGHT_TINT[temp]);
    }
    this.hemi.color.lerp(this.lightTarget, 0.03);
  }

  /**
   * Only a few screens decode video at once: the nearest ones the shopper can actually see.
   * Every browser stutters when it decodes a dozen clips together, so the rest wait on their LED
   * picture, and screens far away let go of their video entirely to free memory.
   */
  /**
   * Which screens play, which get ready, and which let go.
   *
   * - Play: the nearest screens the shopper can see (2–4 by graphics setting). Decoding a dozen
   *   clips at once makes any browser stutter.
   * - Ready: the next few screens the shopper is approaching are loaded in advance (paused on their
   *   first frame), so they start the moment they come into play instead of loading then.
   * - Let go: screens far away, or not needed for a while, release their video to free memory.
   * - A screen whose video fails is retried later (10 s, 30 s, 60 s) instead of giving up for good.
   */
  private updateVideos() {
    if (!this.store) return;
    const cap = this.quality === 'high' ? 4 : this.quality === 'balanced' ? 3 : 2;
    const warm = this.quality === 'low' ? 2 : 3;
    const now = performance.now();
    this.camera.updateMatrixWorld();
    this.videoProj.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.videoFrustum.setFromProjectionMatrix(this.videoProj);
    const sphere = new THREE.Sphere();
    const idle = this.paused || document.hidden;
    const playable: { s: VideoScreen; score: number }[] = [];
    const nearby: { s: VideoScreen; d: number }[] = [];
    for (const s of this.store.videoScreens) {
      const d = Math.hypot(s.center.x - this.pos.x, s.center.z - this.pos.z);
      const player = this.videos.get(s.id);
      const failed = this.videoGaveUp.get(s.id);
      if (failed && now < failed.until) continue;
      if (d > 60) {
        if (player) {
          player.release();
          this.videos.delete(s.id);
        }
        continue;
      }
      nearby.push({ s, d });
      if (d >= 42 || idle) continue;
      sphere.set(s.center, 1.8);
      const visible = this.videoFrustum.intersectsSphere(sphere);
      // on-screen screens first; the one already playing keeps its place unless another is clearly better
      let score = visible ? d : d + 40;
      if (player?.playing) score *= 0.8;
      playable.push({ s, score });
    }
    playable.sort((a, b) => a.score - b.score);
    const chosen = new Set(playable.slice(0, cap).map((r) => r.s.id));
    // get the closest of the rest ready ahead of time
    const ready = new Set(
      nearby
        .filter((n) => !chosen.has(n.s.id))
        .sort((a, b) => a.d - b.d)
        .slice(0, warm)
        .map((n) => n.s.id),
    );
    for (const s of this.store.videoScreens) {
      let player = this.videos.get(s.id);
      const want = chosen.has(s.id) || ready.has(s.id);
      if (want) {
        this.videoWanted.set(s.id, now);
        if (!player) {
          player = new ScreenPlayer(s, () => {
            this.videos.get(s.id)?.release();
            this.videos.delete(s.id);
            const prev = this.videoGaveUp.get(s.id);
            const tries = (prev?.tries || 0) + 1;
            const wait = [10000, 30000, 60000][tries - 1];
            // after three failed attempts the screen keeps its LED picture for this visit
            this.videoGaveUp.set(s.id, { tries, until: wait ? performance.now() + wait : Infinity });
          });
          this.videos.set(s.id, player);
        }
        if (chosen.has(s.id)) player.play();
        else player.pause();
      } else if (player) {
        player.pause();
        // not needed for a while: free the decoder and memory (it will be readied again when approached)
        if (now - (this.videoWanted.get(s.id) || 0) > 25000) {
          player.release();
          this.videos.delete(s.id);
        }
      }
    }
  }

  private snapCamera() {
    this.updateCamera(1, true);
  }

  private updateCamera(dt: number, snap = false) {
    const cam = this.camera;
    if (this.state === 'outside') {
      // slow establishing shot of the storefront with the avatar on the plaza
      this.cinematicT += dt;
      const sway = this.reducedMotion ? 0 : Math.sin(this.cinematicT * 0.18) * 1.6;
      cam.position.set(-2.6 + sway, 1.75, this.pos.z + 4.2);
      cam.lookAt(this.pos.x + 0.9, 2.45, this.pos.z - 7);
      return;
    }
    const scale = this.avatar ? this.avatar.eyeHeight / 1.615 : 1;
    if (this.cameraMode === 'first_person') {
      const eye = this.avatar?.eyeHeight ?? 1.62;
      cam.position.set(this.pos.x + Math.sin(this.camYaw) * 0.08, eye, this.pos.z + Math.cos(this.camYaw) * 0.08);
      cam.rotation.order = 'YXZ';
      cam.rotation.set(this.fpPitch, this.camYaw + Math.PI, 0);
      return;
    }
    const target = new THREE.Vector3(this.pos.x, 1.45 * scale, this.pos.z);
    const cp = Math.cos(this.camPitch);
    let dist = this.camDist;
    const dirX = -Math.sin(this.camYaw) * cp;
    const dirZ = -Math.cos(this.camYaw) * cp;
    // camera collision: pull in when a wall is between avatar and camera
    for (let t = 0.4; t <= dist; t += 0.2) {
      if (this.blocked(target.x + dirX * t, target.z + dirZ * t, 0.12)) {
        dist = Math.max(0.6, t - 0.3);
        break;
      }
    }
    const desired = new THREE.Vector3(target.x + dirX * dist, target.y + Math.sin(this.camPitch) * dist + 0.15, target.z + dirZ * dist);
    if (snap) cam.position.copy(desired);
    else {
      cam.position.x = THREE.MathUtils.damp(cam.position.x, desired.x, 10, dt);
      cam.position.y = THREE.MathUtils.damp(cam.position.y, desired.y, 10, dt);
      cam.position.z = THREE.MathUtils.damp(cam.position.z, desired.z, 10, dt);
    }
    cam.lookAt(target.x, target.y + 0.05, target.z);
  }

  private checkPerformance(dt: number) {
    if (dt <= 0) return;
    this.fpsSamples.push(1 / dt);
    if (this.fpsSamples.length > 120) this.fpsSamples.shift();
    const now = performance.now();
    if (now - this.lastQualityCheck < 5000 || this.fpsSamples.length < 100 || this.state !== 'inside') return;
    this.lastQualityCheck = now;
    const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    if (avg < 24 && this.quality !== 'low') {
      const next: Quality = this.quality === 'high' ? 'balanced' : 'low';
      this.setQuality(next);
      this.events.onQualityDrop?.(next);
      this.fpsSamples = [];
    }
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.accum += this.clock.getDelta();
    if (this.paused) {
      this.accum = 0;
      return;
    }
    // ~30 fps cap on low quality (time is accumulated so walking speed stays correct)
    if (this.quality === 'low' && (++this.skip & 1)) return;
    // allow larger steps so slow devices still move at real-world speed
    const dt = Math.min(0.1, this.accum);
    this.accum = 0;
    this.frame++;
    if (this.store) {
      this.step(dt);
      if (this.avatar) {
        this.avatar.root.position.copy(this.pos);
        this.avatar.root.rotation.y = this.yaw;
        this.avatar.update(dt, { speed: this.speedNow, turnRate: this.turnRate });
      }
      this.updatePick(dt);
      this.updateRemotes(dt);
      if (!this.reducedMotion) {
        const tt = this.clock.elapsedTime;
        this.store.animate(tt, dt);
        for (const m of this.productModels) if (m.spin) m.obj.rotation.y = m.baseYaw + Math.sin(tt * 0.5) * 0.6;
      }
      this.avatarShadow.position.set(this.pos.x, 0.015, this.pos.z);
      this.avatarShadow.visible = this.cameraMode === 'third_person';
      this.updateDoors(dt);
      if (this.frame % 4 === 0) this.updateNearest();
      if (this.frame % 10 === 0) {
        this.updateZone();
        this.updateVideos();
      } else this.hemi.color.lerp(this.lightTarget, 0.02);
      const now = performance.now();
      if (now - this.lastPosEmit > 180) {
        this.lastPosEmit = now;
        this.events.onPosition?.({ x: this.pos.x, z: this.pos.z, yaw: this.cameraMode === 'third_person' ? this.yaw : this.camYaw });
      }
      // beacon & marker animation
      if (this.beacon.visible) {
        const s = 1 + Math.sin(now * 0.005) * 0.12;
        this.beacon.children[0].scale.set(s, s, s);
      }
      const cm = this.clickMarker.material as THREE.MeshBasicMaterial;
      if (cm.opacity > 0 && !this.path.length) cm.opacity = Math.max(0, cm.opacity - dt * 2);
      if (this.routeLine) {
        const tex = (this.routeLine.material as THREE.MeshBasicMaterial).map!;
        tex.offset.y -= dt * 0.9;
      }
      this.checkPerformance(dt);
    }
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  };

  /** Render one frame into an image (used for screenshots / outfit comparisons) */
  snapshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/jpeg', 0.8);
  }

  dispose() {
    this.disposed = true;
    this.remotes.forEach((r) => r.rig.dispose());
    this.remotes.clear();
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.videos.forEach((v) => v.release());
    this.videos.clear();
    this.restockTimers.forEach((t) => clearTimeout(t));
    this.restockTimers.clear();
    this.productModels.forEach((m) => m.obj.parent?.remove(m.obj));
    this.avatar?.dispose();
    this.store?.dispose();
    this.clearRoute();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/**
 * Plays one screen's clips. A single clip loops. With several, the next clip loads while the current
 * one plays, and the screen switches on the new clip's first decoded frame, so there is no black gap.
 * The LED picture stays up until the first frame is ready, and comes back if nothing can play.
 */
interface Clip {
  i: number;
  video: HTMLVideoElement;
  texture: THREE.VideoTexture;
  ready: boolean;
}

class ScreenPlayer {
  playing = false;
  private cur: Clip | null = null;
  private next: Clip | null = null;
  private shown: Clip | null = null;
  private failed = new Set<number>();
  private ledMap: THREE.Texture | null;
  private wantPlay = false;
  private released = false;
  private readonly list: string[];

  constructor(private screen: VideoScreen, private onGiveUp: () => void) {
    this.ledMap = (screen.mesh.material as THREE.MeshBasicMaterial).map;
    this.list = (screen.playlist?.length ? screen.playlist : [screen.videoUrl]).filter(Boolean);
    if (!this.list.length) {
      queueMicrotask(onGiveUp);
      return;
    }
    this.cur = this.makeClip(0);
  }

  private makeClip(i: number): Clip {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.defaultMuted = true;
    video.loop = this.list.length === 1;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.disablePictureInPicture = true;
    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    const clip: Clip = { i, video, texture, ready: false };
    video.addEventListener('loadeddata', () => {
      if (this.released) return;
      clip.ready = true;
      // a readied screen keeps its LED picture until it is asked to play, then switches at once
      if (clip === this.cur && this.wantPlay) this.present(clip);
    });
    video.addEventListener('ended', () => {
      if (clip === this.cur) this.advance();
    });
    video.addEventListener('error', () => this.onError(clip));
    video.src = screenMediaUrl(this.list[i]);
    video.load();
    // a clip that has not shown a frame after 30 s is treated as failed (the screen retries later)
    window.setTimeout(() => {
      if (!this.released && !clip.ready && (clip === this.cur || clip === this.next)) this.onError(clip);
    }, 30000);
    return clip;
  }

  /** Put a clip on the screen and let go of the one it replaces. */
  private present(clip: Clip) {
    if (this.shown === clip) return;
    fitVideoCover(clip.texture, clip.video, this.screen.mesh);
    const m = this.screen.mesh.material as THREE.MeshBasicMaterial;
    m.map = clip.texture;
    m.color.set('#ffffff');
    m.needsUpdate = true;
    if (this.shown) this.drop(this.shown);
    this.shown = clip;
    this.preloadNext();
  }

  private nextIndex(from: number) {
    const n = this.list.length;
    for (let k = 1; k <= n; k++) {
      const j = (from + k) % n;
      if (!this.failed.has(j)) return j;
    }
    return -1;
  }

  private preloadNext() {
    if (this.released || this.list.length < 2 || this.next || !this.cur) return;
    const j = this.nextIndex(this.cur.i);
    if (j < 0 || j === this.cur.i) return;
    this.next = this.makeClip(j);
  }

  private advance() {
    if (this.released || !this.cur) return;
    let nxt = this.next;
    this.next = null;
    if (!nxt) {
      const j = this.nextIndex(this.cur.i);
      if (j < 0) return this.giveUp();
      if (j === this.cur.i) {
        // only one clip still works: loop it
        this.cur.video.loop = true;
        this.cur.video.currentTime = 0;
        if (this.wantPlay) this.cur.video.play().catch(() => {});
        return;
      }
      nxt = this.makeClip(j);
    }
    const old = this.cur;
    this.cur = nxt;
    if (old !== this.shown) this.drop(old);
    if (this.wantPlay) nxt.video.play().catch(() => {});
    if (nxt.ready) this.present(nxt);
  }

  private onError(clip: Clip) {
    if (this.released) return;
    this.failed.add(clip.i);
    if (this.failed.size >= this.list.length) return this.giveUp();
    if (clip === this.next) {
      this.drop(clip);
      this.next = null;
      this.preloadNext();
    } else if (clip === this.cur) this.advance();
  }

  private giveUp() {
    this.release();
    this.onGiveUp();
  }

  play() {
    if (this.released || !this.cur) return;
    this.wantPlay = true;
    this.playing = true;
    const v = this.cur.video;
    if (this.cur.ready && this.shown !== this.cur) this.present(this.cur);
    if (v.paused && !v.ended) v.play().catch(() => {});
  }

  pause() {
    this.wantPlay = false;
    this.playing = false;
    if (this.cur && !this.cur.video.paused) this.cur.video.pause();
  }

  private drop(c: Clip) {
    c.video.pause();
    c.video.removeAttribute('src');
    c.video.load();
    c.texture.dispose();
  }

  release() {
    if (this.released) return;
    this.released = true;
    this.playing = false;
    const m = this.screen.mesh.material as THREE.MeshBasicMaterial;
    m.map = this.ledMap;
    m.needsUpdate = true;
    // undo any resize made to show a whole clip
    [this.screen.mesh, ...((this.screen.mesh.userData.mirrors as THREE.Mesh[]) || [])].forEach((mm) => {
      const base = mm.userData.baseScale as THREE.Vector3 | undefined;
      if (base) mm.scale.copy(base);
    });
    new Set([this.cur, this.next, this.shown]).forEach((c) => c && this.drop(c));
    this.cur = this.next = this.shown = null;
  }
}

/**
 * Fit a video to its screen. When the shapes are close (a 16:9 clip on a 16:9 or slightly wider
 * screen) the clip fills the screen, trimming a little off the edges. When they are very different
 * (a wide clip on a tall directory screen) cropping would leave only a sliver, so the whole clip is
 * shown at full width or height, centred, by resizing the screen surface to the clip's shape.
 */
function fitVideoCover(texture: THREE.VideoTexture, video: HTMLVideoElement, mesh: THREE.Mesh) {
  const geo = mesh.geometry as THREE.PlaneGeometry;
  const pw = geo.parameters?.width || 16;
  const ph = geo.parameters?.height || 9;
  const vw = video.videoWidth || 16;
  const vh = video.videoHeight || 9;
  const imageAspect = vw / Math.max(1, vh);
  const planeAspect = pw / Math.max(0.001, ph);
  // copies of a screen (e.g. the directory faces) share its material, so they get the same fit
  const meshes: THREE.Mesh[] = [mesh, ...((mesh.userData.mirrors as THREE.Mesh[]) || [])];
  meshes.forEach((m) => {
    if (!m.userData.baseScale) m.userData.baseScale = m.scale.clone();
  });
  const fitScale = (sx: number, sy: number) => meshes.forEach((m) => {
    const b = m.userData.baseScale as THREE.Vector3;
    m.scale.set(b.x * sx, b.y * sy, b.z);
  });
  const mismatch = Math.max(imageAspect / planeAspect, planeAspect / imageAspect);
  if (mismatch > 1.45) {
    texture.repeat.set(1, 1);
    texture.offset.set(0, 0);
    if (imageAspect > planeAspect) fitScale(1, planeAspect / imageAspect);
    else fitScale(imageAspect / planeAspect, 1);
    return;
  }
  fitScale(1, 1);
  if (imageAspect > planeAspect) {
    const repeat = planeAspect / imageAspect;
    texture.repeat.set(repeat, 1);
    texture.offset.set((1 - repeat) / 2, 0);
  } else {
    const repeat = imageAspect / planeAspect;
    texture.repeat.set(1, repeat);
    texture.offset.set(0, (1 - repeat) / 2);
  }
}

function angleDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function dampAngle(cur: number, target: number, lambda: number, dt: number) {
  return cur + angleDiff(target, cur) * (1 - Math.exp(-lambda * dt));
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
