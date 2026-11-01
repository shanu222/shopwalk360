import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RotateCcw, RotateCw, Smartphone, Info, X, Move } from 'lucide-react';
import { buildProductModel, Dimensions } from '../builder/productModels';
import { woodTexture, plasterTexture } from '../builder/materials';

interface Props {
  preset?: string | null;
  colorName?: string;
  colorMap: Record<string, string>;
  dims: Dimensions | null;
  productName: string;
}

type ArSupport = { webxr: boolean; quickLook: boolean; checked: boolean };

/**
 * Room visualisation at true scale. The product is generated from its stored dimensions,
 * so what you see is only as accurate as the dimensions entered in Admin.
 */
export const RoomVisualizer: React.FC<Props> = ({ preset, colorName, colorMap, dims, productName }) => {
  const mount = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ w: 4, d: 3.5 });
  const [rot, setRot] = useState(0);
  const [ar, setAr] = useState<ArSupport>({ webxr: false, quickLook: false, checked: false });
  const [arActive, setArActive] = useState(false);
  const [arMsg, setArMsg] = useState<string | null>(null);
  const st = useRef<{ product: THREE.Group; roomG: THREE.Group; scene: THREE.Scene; renderer: THREE.WebGLRenderer; camera: THREE.PerspectiveCamera; controls: OrbitControls } | null>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const arRef = useRef<{ session: any; renderer: THREE.WebGLRenderer; model: THREE.Group } | null>(null);

  // AR capability detection (feature detection only; nothing is claimed until a session actually starts)
  useEffect(() => {
    const quickLook = (() => {
      try {
        return document.createElement('a').relList.supports('ar');
      } catch {
        return false;
      }
    })();
    const xr = (navigator as any).xr;
    if (xr?.isSessionSupported) {
      xr.isSessionSupported('immersive-ar').then((ok: boolean) => setAr({ webxr: !!ok, quickLook, checked: true })).catch(() => setAr({ webxr: false, quickLook, checked: true }));
    } else setAr({ webxr: false, quickLook, checked: true });
  }, []);

  useEffect(() => {
    if (!dims) return;
    const el = mount.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e9e4dc');
    try {
      const pm = new THREE.PMREMGenerator(renderer);
      scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.7;
      pm.dispose();
    } catch {
      /* optional */
    }
    scene.add(new THREE.HemisphereLight('#fffaf2', '#a59a8a', 0.9));
    const sun = new THREE.DirectionalLight('#fff1dc', 1.2);
    sun.position.set(-3, 5, 4);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.05, 50);
    camera.position.set(2.6, 2.4, 4.2);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.6, 0);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minDistance = 1.2;
    controls.maxDistance = 9;
    const roomG = new THREE.Group();
    scene.add(roomG);
    const product = new THREE.Group();
    scene.add(product);
    st.current = { product, roomG, scene, renderer, camera, controls };

    // drag the product across the floor
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    let dragging = false;
    const ndc = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const down = (e: PointerEvent) => {
      ray.setFromCamera(ndc(e), camera);
      if (ray.intersectObject(product, true).length) {
        dragging = true;
        controls.enabled = false;
        renderer.domElement.setPointerCapture(e.pointerId);
      }
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      ray.setFromCamera(ndc(e), camera);
      const p = new THREE.Vector3();
      if (ray.ray.intersectPlane(plane, p)) {
        const s = st.current!;
        const box = new THREE.Box3().setFromObject(s.product.children[0] || s.product);
        const hw = (box.max.x - box.min.x) / 2;
        const hd = (box.max.z - box.min.z) / 2;
        const lim = (s.roomG.userData.w || 4) / 2;
        const limD = (s.roomG.userData.d || 3.5) / 2;
        product.position.x = THREE.MathUtils.clamp(p.x, -lim + hw, lim - hw);
        product.position.z = THREE.MathUtils.clamp(p.z, -limD + hd, limD - hd);
      }
    };
    const up = () => {
      dragging = false;
      controls.enabled = true;
    };
    renderer.domElement.addEventListener('pointerdown', down);
    renderer.domElement.addEventListener('pointermove', move);
    renderer.domElement.addEventListener('pointerup', up);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();
    const ro = new ResizeObserver(() => {
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      st.current = null;
    };
  }, [!!dims]);

  // room shell
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    s.roomG.clear();
    s.roomG.userData = { w: room.w, d: room.d };
    const floorTex = woodTexture(['#c49a6c', '#b48a5c'], { planks: 6, seed: 33 }).clone();
    floorTex.repeat.set(room.w / 2.5, room.d / 2.5);
    floorTex.needsUpdate = true;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(room.w, room.d), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    s.roomG.add(floor);
    const wallM = new THREE.MeshStandardMaterial({ map: plasterTexture('#efe9df', 7), roughness: 0.95 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(room.w, 2.6, 0.08), wallM);
    back.position.set(0, 1.3, -room.d / 2 - 0.04);
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.6, room.d), wallM);
    side.position.set(-room.w / 2 - 0.04, 1.3, 0);
    s.roomG.add(back, side);
    // standard interior door (0.9 m × 2.1 m) as a size reference
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.1, 0.03), new THREE.MeshStandardMaterial({ color: '#8b6a4c', roughness: 0.6 }));
    door.position.set(room.w / 2 - 0.8, 1.05, -room.d / 2 + 0.005);
    s.roomG.add(door);
    // 170 cm person silhouette as a size reference
    const person = new THREE.Group();
    const pm = new THREE.MeshStandardMaterial({ color: '#9aa3ad', roughness: 0.8, transparent: true, opacity: 0.55 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 1.04, 6, 16), pm);
    body.position.y = 0.69;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 16), pm);
    head.position.y = 1.59;
    person.add(body, head);
    person.position.set(-room.w / 2 + 0.45, 0, -room.d / 2 + 0.6);
    s.roomG.add(person);
  }, [room, !!dims]);

  // product model
  useEffect(() => {
    const s = st.current;
    if (!s || !dims) return;
    s.product.clear();
    const m = buildProductModel({ preset, colorName, colorMap, dims });
    // centre the footprint on the origin
    const box = new THREE.Box3().setFromObject(m.group);
    const c = box.getCenter(new THREE.Vector3());
    m.group.position.set(-c.x, -box.min.y, -c.z);
    const holder = new THREE.Group();
    holder.add(m.group);
    s.product.add(holder);
    // dimension lines
    const W = dims.w / 100;
    const H = dims.h / 100;
    const D = dims.d / 100;
    const lm = new THREE.LineBasicMaterial({ color: '#9a6b2f' });
    const seg = (a: THREE.Vector3, b: THREE.Vector3) => holder.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), lm));
    seg(new THREE.Vector3(-W / 2, 0.01, D / 2 + 0.08), new THREE.Vector3(W / 2, 0.01, D / 2 + 0.08));
    seg(new THREE.Vector3(W / 2 + 0.08, 0.01, -D / 2), new THREE.Vector3(W / 2 + 0.08, 0.01, D / 2));
    seg(new THREE.Vector3(W / 2 + 0.08, 0, D / 2 + 0.08), new THREE.Vector3(W / 2 + 0.08, H, D / 2 + 0.08));
  }, [preset, colorName, JSON.stringify(dims), JSON.stringify(colorMap)]);

  useEffect(() => {
    if (st.current) st.current.product.rotation.y = (rot * Math.PI) / 180;
  }, [rot]);

  /* ----------------------------------------------------------------- AR */
  const startWebXR = async () => {
    if (!dims) return;
    setArMsg(null);
    try {
      const xr = (navigator as any).xr;
      const session = await xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay'], domOverlay: { root: overlay.current } });
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.xr.enabled = true;
      renderer.xr.setReferenceSpaceType('local');
      document.body.appendChild(renderer.domElement);
      renderer.domElement.style.display = 'none';
      await renderer.xr.setSession(session);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight('#ffffff', '#888888', 1.4));
      const camera = new THREE.PerspectiveCamera();
      const model = buildProductModel({ preset, colorName, colorMap, dims }).group;
      model.visible = false;
      scene.add(model);
      const reticle = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.16, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      reticle.matrixAutoUpdate = false;
      reticle.visible = false;
      scene.add(reticle);
      const viewerSpace = await session.requestReferenceSpace('viewer');
      const hitSource = await session.requestHitTestSource({ space: viewerSpace });
      session.addEventListener('select', () => {
        if (reticle.visible) {
          model.position.setFromMatrixPosition(reticle.matrix);
          model.visible = true;
        }
      });
      session.addEventListener('end', () => {
        renderer.setAnimationLoop(null);
        renderer.dispose();
        renderer.domElement.remove();
        arRef.current = null;
        setArActive(false);
      });
      renderer.setAnimationLoop((_t: number, frame: any) => {
        if (frame) {
          const ref = renderer.xr.getReferenceSpace();
          const hits = frame.getHitTestResults(hitSource);
          if (hits.length) {
            const pose = hits[0].getPose(ref);
            reticle.visible = true;
            reticle.matrix.fromArray(pose.transform.matrix);
          } else reticle.visible = false;
        }
        renderer.render(scene, camera);
      });
      arRef.current = { session, renderer, model };
      setArActive(true);
    } catch (e: any) {
      setArMsg(`AR could not start on this device (${e?.message || 'not supported'}). Use the 3D room preview instead.`);
    }
  };

  const startQuickLook = async () => {
    if (!dims) return;
    try {
      const { USDZExporter } = await import('three/examples/jsm/exporters/USDZExporter.js');
      const model = buildProductModel({ preset, colorName, colorMap, dims }).group;
      const exporter = new USDZExporter();
      const data = await exporter.parseAsync(model);
      const url = URL.createObjectURL(new Blob([data], { type: 'model/vnd.usdz+zip' }));
      const a = document.createElement('a');
      a.rel = 'ar';
      a.href = url;
      a.appendChild(document.createElement('img'));
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e: any) {
      setArMsg(`AR Quick Look could not open (${e?.message || 'error'}).`);
    }
  };

  if (!dims) {
    return (
      <div className="flex gap-3 rounded-2xl bg-amber-50 p-5 text-sm text-amber-900">
        <Info className="h-5 w-5 shrink-0" />
        <div>
          <div className="font-semibold">Room preview isn’t available for this product yet.</div>
          <div className="mt-1 text-xs leading-relaxed">Placing a product in a room needs its real width, height and depth. The store hasn’t entered these for “{productName}”, so we won’t show a to-scale preview that could be misleading. You can still rotate it in 3D on the “3D view” tab.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div ref={mount} className="relative h-[340px] overflow-hidden rounded-2xl bg-[#e9e4dc] sm:h-[400px]">
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-700 shadow"><Move className="h-3.5 w-3.5" /> Drag the product to move it</div>
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-xl bg-white/90 px-3 py-2 text-[11px] text-slate-700 shadow">
          <div className="font-semibold">W {dims.w} × H {dims.h} × D {dims.d} cm</div>
          <div className="text-slate-500">Grey figure = 170 cm person · door = 90 × 210 cm</div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-xs text-slate-600">Room width: <b>{room.w.toFixed(1)} m</b>
          <input type="range" min={2} max={8} step={0.1} value={room.w} onChange={(e) => setRoom((r) => ({ ...r, w: +e.target.value }))} className="w-full accent-slate-800" />
        </label>
        <label className="text-xs text-slate-600">Room depth: <b>{room.d.toFixed(1)} m</b>
          <input type="range" min={2} max={8} step={0.1} value={room.d} onChange={(e) => setRoom((r) => ({ ...r, d: +e.target.value }))} className="w-full accent-slate-800" />
        </label>
        <div className="text-xs text-slate-600">Rotate: <b>{rot}°</b>
          <div className="mt-1 flex gap-2">
            <button onClick={() => setRot((r) => (r - 15 + 360) % 360)} aria-label="Rotate left" className="flex-1 rounded-lg border border-slate-200 py-1.5 hover:bg-slate-50"><RotateCcw className="mx-auto h-4 w-4" /></button>
            <button onClick={() => setRot((r) => (r + 15) % 360)} aria-label="Rotate right" className="flex-1 rounded-lg border border-slate-200 py-1.5 hover:bg-slate-50"><RotateCw className="mx-auto h-4 w-4" /></button>
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Smartphone className="h-4 w-4" /> View in your own room (AR)</div>
        {!ar.checked ? (
          <div className="mt-1 text-xs text-slate-500">Checking your device…</div>
        ) : ar.webxr || ar.quickLook ? (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap gap-2">
              {ar.webxr && <button onClick={startWebXR} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white">Open camera & place in my room</button>}
              {ar.quickLook && <button onClick={startQuickLook} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white">Open in AR Quick Look</button>}
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">Your device reports AR support. Point the camera at the floor, wait for the ring, then tap to place. The model is built at the listed dimensions. AR placement has not yet been verified on physical devices for this store, so please treat it as a preview.</p>
          </div>
        ) : (
          <p className="mt-1 text-xs leading-relaxed text-slate-500">This device or browser doesn’t support camera AR. On a compatible phone (Chrome on Android with ARCore, or Safari on iPhone) this button opens your camera. Until then, use the to-scale room preview above.</p>
        )}
        {arMsg && <div className="mt-2 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-900">{arMsg}</div>}
      </div>
      {/* DOM overlay shown inside the AR session */}
      <div ref={overlay} className={arActive ? 'fixed inset-x-0 bottom-0 z-[100] flex justify-center gap-2 p-6' : 'hidden'}>
        <button onClick={() => arRef.current && (arRef.current.model.rotation.y -= Math.PI / 12)} className="rounded-full bg-white/90 p-3 shadow"><RotateCcw className="h-5 w-5" /></button>
        <button onClick={() => arRef.current && (arRef.current.model.rotation.y += Math.PI / 12)} className="rounded-full bg-white/90 p-3 shadow"><RotateCw className="h-5 w-5" /></button>
        <button onClick={() => arRef.current?.session.end()} className="rounded-full bg-white/90 p-3 shadow"><X className="h-5 w-5" /></button>
      </div>
    </div>
  );
};
