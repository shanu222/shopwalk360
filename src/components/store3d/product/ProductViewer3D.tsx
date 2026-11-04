import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ZoomIn, ZoomOut, RotateCw, Pause, Ruler, MapPin, Maximize } from 'lucide-react';
import { buildProductModel, Dimensions, Hotspot, DemoDefinition, ProductModel } from '../builder/productModels';
import { getGLTFLoader } from '../avatar/glbAvatar';
import { contactShadowTexture } from '../builder/materials';
import { screenMediaUrl } from '../../../lib/api';

export interface ViewerProps {
  preset?: string | null;
  glbUrl?: string | null;
  colorName?: string;
  colorMap: Record<string, string>;
  colorOptions?: string;
  dims: Dimensions | null;
  specs: Record<string, string>;
  showHotspots?: boolean;
  allowDims?: boolean;
  /** run the model's interactive demonstration */
  demo?: boolean;
  onDemoInfo?: (d: DemoDefinition | null) => void;
  demoStep?: number;
  className?: string;
}

export interface ViewerHandle {
  snapshot: () => string | null;
}

export const ProductViewer3D = forwardRef<ViewerHandle, ViewerProps>((props, ref) => {
  const { preset, glbUrl, colorName, colorMap, colorOptions, dims, specs, showHotspots = true, allowDims = true, demo = false, demoStep = 0, className } = props;
  const mount = useRef<HTMLDivElement>(null);
  const [labels, setLabels] = useState<{ x: number; y: number; text: string; detail?: string; visible: boolean }[]>([]);
  const [auto, setAuto] = useState(true);
  const [showDims, setShowDims] = useState(false);
  const [showSpots, setShowSpots] = useState(showHotspots);
  const [glbState, setGlbState] = useState<'none' | 'loading' | 'ok' | 'error'>('none');
  const st = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls;
    model: THREE.Object3D | null; hotspots: Hotspot[]; dimsGroup: THREE.Group | null; demo: DemoDefinition | null; size: THREE.Vector3;
  } | null>(null);
  const demoRef = useRef({ on: demo, step: demoStep, t: 0 });
  demoRef.current.on = demo;
  demoRef.current.step = demoStep;

  useImperativeHandle(ref, () => ({
    snapshot: () => {
      const s = st.current;
      if (!s) return null;
      s.renderer.render(s.scene, s.camera);
      return s.renderer.domElement.toDataURL('image/png');
    },
  }));

  useEffect(() => {
    const el = mount.current!;
    const w = el.clientWidth || 400;
    const h = el.clientHeight || 360;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', '3D product viewer. Drag to rotate, scroll or pinch to zoom.');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f1eee8');
    try {
      const pm = new THREE.PMREMGenerator(renderer);
      scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.9;
      pm.dispose();
    } catch {
      /* optional */
    }
    scene.add(new THREE.HemisphereLight('#ffffff', '#b9b2a6', 0.8));
    const key = new THREE.DirectionalLight('#ffffff', 1.4);
    key.position.set(2, 4, 3);
    scene.add(key);
    const camera = new THREE.PerspectiveCamera(30, w / h, 0.001, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.6;
    controls.enablePan = false;
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    scene.add(shadow);
    st.current = { renderer, scene, camera, controls, model: null, hotspots: [], dimsGroup: null, demo: null, size: new THREE.Vector3(1, 1, 1) };
    (st.current as any).shadow = shadow;

    let raf = 0;
    const clock = new THREE.Clock();
    const v = new THREE.Vector3();
    let frame = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, clock.getDelta());
      controls.update();
      const s = st.current!;
      if (s.demo && demoRef.current.on) {
        demoRef.current.t = THREE.MathUtils.damp(demoRef.current.t, demoRef.current.step + 0.999, 2.5, dt);
        if (s.demo.title.includes('360')) demoRef.current.t += dt * 0.2;
        s.demo.update(demoRef.current.t);
      }
      renderer.render(scene, camera);
      if (frame++ % 2 === 0 && s.model) {
        const rect = renderer.domElement.getBoundingClientRect();
        const next = s.hotspots.map((hs) => {
          v.copy(hs.position).applyMatrix4(s.model!.matrixWorld).project(camera);
          const facing = v.z < 1;
          return {
            x: ((v.x + 1) / 2) * rect.width,
            y: ((1 - v.y) / 2) * rect.height,
            text: hs.label,
            detail: hs.specKey ? specs[hs.specKey] : undefined,
            visible: facing,
          };
        });
        setLabels(next);
      }
    };
    loop();
    const ro = new ResizeObserver(() => {
      const ww = el.clientWidth;
      const hh = el.clientHeight;
      if (!ww || !hh) return;
      camera.aspect = ww / hh;
      camera.updateProjectionMatrix();
      renderer.setSize(ww, hh);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (re)build model when product / colour changes
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    let cancelled = false;
    const place = (obj: THREE.Object3D, model: ProductModel | null) => {
      if (s.model) s.scene.remove(s.model);
      s.model = obj;
      s.scene.add(obj);
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      s.size.copy(size);
      const radius = Math.max(size.x, size.y, size.z) * 0.5 || 0.1;
      const dist = radius / Math.tan((s.camera.fov * Math.PI) / 360) * 1.25;
      s.camera.near = dist / 200;
      s.camera.far = dist * 50;
      s.camera.updateProjectionMatrix();
      s.camera.position.set(center.x + dist * 0.55, center.y + dist * 0.35, center.z + dist * 0.8);
      s.controls.target.copy(center);
      s.controls.minDistance = radius * 0.6;
      s.controls.maxDistance = dist * 3;
      s.controls.update();
      const sh = (s as any).shadow as THREE.Mesh;
      sh.scale.set(size.x * 1.8 + 0.01, size.z * 1.8 + 0.01, 1);
      sh.position.set(center.x, box.min.y + 0.0005, center.z);
      s.hotspots = model ? model.hotspots.filter((h) => !h.specKey || specs[h.specKey]) : [];
      s.demo = model?.demo || null;
      props.onDemoInfo?.(s.demo);
      // dimension frame (only from the product's real dimensions)
      if (s.dimsGroup) s.scene.remove(s.dimsGroup);
      s.dimsGroup = null;
      if (dims) {
        const g = new THREE.Group();
        const m = new THREE.LineBasicMaterial({ color: '#b48e57' });
        const b = new THREE.Box3().setFromObject(obj);
        const helper = new THREE.Box3Helper(b, new THREE.Color('#b48e57'));
        (helper.material as THREE.LineBasicMaterial).transparent = true;
        (helper.material as THREE.LineBasicMaterial).opacity = 0.8;
        g.add(helper);
        void m;
        g.visible = showDims;
        s.dimsGroup = g;
        s.scene.add(g);
      }
    };
    if (glbUrl) {
      setGlbState('loading');
      getGLTFLoader(s.renderer)
        .loadAsync(screenMediaUrl(glbUrl))
        .then((gltf) => {
          if (cancelled) return;
          const obj = gltf.scene;
          const box = new THREE.Box3().setFromObject(obj);
          obj.position.y -= box.min.y;
          place(obj, null);
          setGlbState('ok');
        })
        .catch(() => {
          if (cancelled) return;
          setGlbState('error');
          const pm = buildProductModel({ preset, colorName, colorMap, colorOptions, dims });
          place(pm.group, pm);
        });
    } else {
      setGlbState('none');
      const pm = buildProductModel({ preset, colorName, colorMap, colorOptions, dims });
      place(pm.group, pm);
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, glbUrl, colorName, JSON.stringify(dims)]);

  useEffect(() => {
    if (st.current) st.current.controls.autoRotate = auto && !demo;
  }, [auto, demo]);
  useEffect(() => {
    if (st.current?.dimsGroup) st.current.dimsGroup.visible = showDims;
  }, [showDims]);
  useEffect(() => {
    demoRef.current.t = 0;
  }, [demo]);

  const zoom = (k: number) => {
    const s = st.current;
    if (!s) return;
    const off = s.camera.position.clone().sub(s.controls.target).multiplyScalar(k);
    const len = THREE.MathUtils.clamp(off.length(), s.controls.minDistance, s.controls.maxDistance);
    s.camera.position.copy(s.controls.target).add(off.setLength(len));
  };

  const fullscreen = () => {
    const el = mount.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-[#f1eee8] ${className || ''}`}>
      <div ref={mount} className="absolute inset-0 cursor-grab active:cursor-grabbing" />
      {showSpots && labels.map((l, i) => l.visible && (
        <div key={i} className="pointer-events-none absolute -translate-x-1/2 -translate-y-full" style={{ left: l.x, top: l.y }}>
          <div className="mb-1 max-w-[180px] rounded-lg bg-[#1a1816]/90 px-2 py-1 text-[10px] leading-snug text-white shadow-lg">
            <div className="font-bold">{l.text}</div>
            {l.detail && <div className="text-white/70">{l.detail}</div>}
          </div>
          <div className="mx-auto h-2 w-2 rounded-full border-2 border-white bg-[#c8a96a] shadow" />
        </div>
      ))}
      {showDims && dims && (
        <div className="absolute left-3 top-3 rounded-xl bg-white/90 px-3 py-2 text-[11px] font-semibold text-slate-800 shadow">
          W {dims.w} × H {dims.h} × D {dims.d} cm <span className="font-normal text-slate-500">(from product data)</span>
        </div>
      )}
      {glbState === 'loading' && <div className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-[11px]">Loading 3D model…</div>}
      {glbState === 'error' && <div className="absolute left-3 top-3 rounded-full bg-amber-100 px-3 py-1 text-[11px] text-amber-900">Showing a preview model</div>}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
        {[
          { icon: ZoomIn, label: 'Zoom in', fn: () => zoom(0.75) },
          { icon: ZoomOut, label: 'Zoom out', fn: () => zoom(1.33) },
          { icon: auto ? Pause : RotateCw, label: auto ? 'Stop rotating' : 'Rotate automatically', fn: () => setAuto(!auto) },
          { icon: MapPin, label: showSpots ? 'Hide details' : 'Show details', fn: () => setShowSpots(!showSpots) },
          ...(dims && allowDims ? [{ icon: Ruler, label: showDims ? 'Hide dimensions' : 'Show dimensions', fn: () => setShowDims(!showDims) }] : []),
          { icon: Maximize, label: 'Full screen', fn: fullscreen },
        ].map((b) => (
          <button key={b.label} onClick={b.fn} aria-label={b.label} title={b.label} className="rounded-xl bg-white/90 p-2 text-slate-700 shadow hover:bg-white">
            <b.icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  );
});
ProductViewer3D.displayName = 'ProductViewer3D';
