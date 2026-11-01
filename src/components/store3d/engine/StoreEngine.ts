import { mediaUrl } from '../../../lib/api';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildStore, BuiltStore, InteractiveTarget } from '../builder/storeBuilder';
import { skyTexture, setMaxAnisotropy, contactShadowTexture } from '../builder/materials';
import { createHumanAvatar, AvatarRig } from '../avatar/AvatarModel';
import { createGlbAvatar } from '../avatar/glbAvatar';
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
  private videos = new Map<string, { video: HTMLVideoElement; texture: THREE.VideoTexture }>();
  private fpsSamples: number[] = [];
  private lastQualityCheck = 0;
  private raycaster = new THREE.Raycaster();
  private pointer = { down: false, x: 0, y: 0, sx: 0, sy: 0, t: 0, id: -1, moved: false };
  private pinch: { d: number } | null = null;
  private touchPoints = new Map<number, { x: number; y: number }>();
  private cinematicT = 0;
  private lightTarget = LIGHT_TINT.neutral.clone();

  // pick-from-shelf → basket animation
  private pickAnim: { mesh: THREE.Mesh; t: number; from: THREE.Vector3; faceYaw: number | null } | null = null;
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
    if (p) this.videos.forEach((v) => v.video.pause());
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
    let from: THREE.Vector3;
    let faceYaw: number | null = null;
    if (target && Math.hypot(target.position.x - this.pos.x, target.position.z - this.pos.z) < 5) {
      from = target.position.clone();
      from.y = THREE.MathUtils.clamp(from.y, 0.6, 1.5);
      faceYaw = Math.atan2(from.x - this.pos.x, from.z - this.pos.z);
    } else {
      // not standing at the shelf: take it from just in front of the shopper
      from = new THREE.Vector3(this.pos.x + Math.sin(this.yaw) * 0.7, 1.15, this.pos.z + Math.cos(this.yaw) * 0.7);
    }
    avatar.triggerPick();

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
    const geo = new THREE.BoxGeometry(0.16, 0.2, 0.08);
    const mesh = new THREE.Mesh(geo, [side, side, side, side, front, front]);
    mesh.castShadow = true;
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.pickAnim = { mesh, t: 0, from, faceYaw };
  }

  private finishPick() {
    const a = this.pickAnim;
    if (!a) return;
    this.scene.remove(a.mesh);
    a.mesh.geometry.dispose();
    (a.mesh.material as THREE.MeshStandardMaterial[]).forEach((m) => {
      m.map?.dispose();
      m.dispose();
    });
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
    if (document.hidden) this.videos.forEach((v) => v.video.pause());
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

  private updateVideos() {
    if (!this.store) return;
    for (const s of this.store.videoScreens) {
      const d = Math.hypot(s.center.x - this.pos.x, s.center.z - this.pos.z);
      const id = s.shelf.id;
      let v = this.videos.get(id);
      if (d < 9 && !this.paused) {
        if (!v) {
          const video = document.createElement('video');
          video.src = mediaUrl(s.shelf.product_video_url);
          video.muted = true;
          video.loop = true;
          video.playsInline = true;
          video.crossOrigin = 'anonymous';
          video.preload = 'auto';
          const texture = new THREE.VideoTexture(video);
          texture.colorSpace = THREE.SRGBColorSpace;
          const m = s.mesh.material as THREE.MeshBasicMaterial;
          m.map = texture;
          m.color.set('#ffffff');
          m.needsUpdate = true;
          v = { video, texture };
          this.videos.set(id, v);
        }
        if (v.video.paused) v.video.play().catch(() => {});
      } else if (v && !v.video.paused) v.video.pause();
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
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.videos.forEach((v) => {
      v.video.pause();
      v.video.removeAttribute('src');
      v.video.load();
      v.texture.dispose();
    });
    this.avatar?.dispose();
    this.store?.dispose();
    this.clearRoute();
    this.renderer.dispose();
    this.renderer.domElement.remove();
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
