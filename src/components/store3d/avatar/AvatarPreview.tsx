import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { AvatarConfig } from '../../../types';
import { createHumanAvatar, AvatarRig } from './AvatarModel';
import { createGlbAvatar } from './glbAvatar';
import { contactShadowTexture } from '../builder/materials';

export type PreviewFocus = 'full' | 'upper' | 'face' | 'wrist' | 'feet';
export type PreviewAngle = 'front' | 'side' | 'back' | 'three_quarter';

export interface AvatarPreviewHandle {
  setAngle: (a: PreviewAngle) => void;
  snapshot: () => string | null;
}

interface Props {
  config: AvatarConfig;
  focus?: PreviewFocus;
  className?: string;
  autoRotate?: boolean;
  label?: string;
}

const FOCUS: Record<PreviewFocus, { target: [number, number, number]; dist: number }> = {
  full: { target: [0, 0.95, 0], dist: 3.3 },
  upper: { target: [0, 1.3, 0], dist: 1.9 },
  face: { target: [0, 1.62, 0], dist: 0.62 },
  wrist: { target: [0.25, 1.05, 0.2], dist: 0.65 },
  feet: { target: [0, 0.12, 0.05], dist: 1.0 },
};

const ANGLE: Record<PreviewAngle, number> = { front: 0, three_quarter: Math.PI / 5, side: Math.PI / 2, back: Math.PI };

/** "Preview room": the avatar on a lit plinth, rotatable, with fixed front/side/back views */
export const AvatarPreview = forwardRef<AvatarPreviewHandle, Props>(({ config, focus = 'full', className, autoRotate = false, label }, ref) => {
  const mount = useRef<HTMLDivElement>(null);
  const state = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls; rig: AvatarRig | null; glbUrl?: string } | null>(null);
  const focusRef = useRef(focus);

  useImperativeHandle(ref, () => ({
    setAngle: (a) => {
      const s = state.current;
      if (!s) return;
      const f = FOCUS[focusRef.current];
      const az = ANGLE[a];
      s.camera.position.set(f.target[0] + Math.sin(az) * f.dist, f.target[1] + f.dist * 0.12, f.target[2] + Math.cos(az) * f.dist);
      s.controls.target.set(...f.target);
      s.controls.update();
    },
    snapshot: () => {
      const s = state.current;
      if (!s) return null;
      s.renderer.render(s.scene, s.camera);
      return s.renderer.domElement.toDataURL('image/jpeg', 0.85);
    },
  }));

  useEffect(() => {
    const el = mount.current!;
    const w = el.clientWidth || 360;
    const h = el.clientHeight || 460;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', 'Avatar preview. Drag to rotate.');

    const scene = new THREE.Scene();
    const bg = document.createElement('canvas');
    bg.width = 4;
    bg.height = 256;
    const g = bg.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#3a3631');
    grad.addColorStop(0.6, '#26231f');
    grad.addColorStop(1, '#171512');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    const bgTex = new THREE.CanvasTexture(bg);
    bgTex.colorSpace = THREE.SRGBColorSpace;
    scene.background = bgTex;
    try {
      const pm = new THREE.PMREMGenerator(renderer);
      scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.6;
      pm.dispose();
    } catch {
      /* optional */
    }
    scene.add(new THREE.HemisphereLight('#fff6ea', '#3b342c', 0.9));
    const key = new THREE.DirectionalLight('#fff1de', 1.6);
    key.position.set(1.5, 3, 2.5);
    scene.add(key);
    const rim = new THREE.DirectionalLight('#c8d8ff', 0.9);
    rim.position.set(-2, 2.2, -2.5);
    scene.add(rim);

    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.06, 64), new THREE.MeshStandardMaterial({ color: '#2d2925', roughness: 0.35, metalness: 0.2 }));
    plinth.position.y = -0.03;
    scene.add(plinth);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.006, 6, 96), new THREE.MeshBasicMaterial({ color: '#c8a96a', toneMapped: false }));
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    scene.add(shadow);

    const f = FOCUS[focusRef.current];
    const camera = new THREE.PerspectiveCamera(32, w / h, 0.02, 50);
    camera.position.set(f.target[0] + Math.sin(ANGLE.three_quarter) * f.dist, f.target[1] + f.dist * 0.12, f.target[2] + Math.cos(ANGLE.three_quarter) * f.dist);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...f.target);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 0.35;
    controls.maxDistance = 5;
    controls.maxPolarAngle = Math.PI * 0.62;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 1.2;
    controls.update();

    state.current = { renderer, scene, camera, controls, rig: null };

    let raf = 0;
    const clock = new THREE.Clock();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, clock.getDelta());
      controls.update();
      state.current?.rig?.update(dt, { speed: 0, turnRate: 0 });
      renderer.render(scene, camera);
    };
    loop();
    const onResize = () => {
      const ww = el.clientWidth;
      const hh = el.clientHeight;
      if (!ww || !hh) return;
      camera.aspect = ww / hh;
      camera.updateProjectionMatrix();
      renderer.setSize(ww, hh);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      state.current?.rig?.dispose();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      bgTex.dispose();
      state.current = null;
    };
  }, []);

  // (re)build the avatar when the configuration changes
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    let cancelled = false;
    if (config.glbUrl && config.glbUrl !== s.glbUrl) {
      createGlbAvatar(config.glbUrl, config, s.renderer)
        .then((rig) => {
          if (cancelled || !state.current) return rig.dispose();
          state.current.rig?.dispose();
          state.current.rig = rig;
          state.current.glbUrl = config.glbUrl;
          s.scene.add(rig.root);
        })
        .catch(() => {
          /* fall back below on next config change */
        });
      return () => {
        cancelled = true;
      };
    }
    if (!config.glbUrl) {
      if (s.rig && !s.glbUrl) s.rig.applyConfig(config);
      else {
        s.rig?.dispose();
        s.glbUrl = undefined;
        s.rig = createHumanAvatar(config);
        s.scene.add(s.rig.root);
      }
      s.rig.pose(focus === 'wrist' ? 'showWrist' : 'idle');
    }
    return () => {
      cancelled = true;
    };
  }, [config, focus]);

  // focus changes reframe the camera
  useEffect(() => {
    focusRef.current = focus;
    const s = state.current;
    if (!s) return;
    const f = FOCUS[focus];
    const az = focus === 'wrist' ? Math.PI / 2.4 : ANGLE.three_quarter;
    s.camera.position.set(f.target[0] + Math.sin(az) * f.dist, f.target[1] + f.dist * 0.12, f.target[2] + Math.cos(az) * f.dist);
    s.controls.target.set(...f.target);
    s.controls.minDistance = Math.min(0.35, f.dist * 0.6);
    s.controls.update();
  }, [focus]);

  return (
    <div ref={mount} className={`relative overflow-hidden ${className || ''}`}>
      {label && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-3 py-1 text-[11px] font-semibold tracking-wide text-white/90 backdrop-blur">
          {label}
        </div>
      )}
    </div>
  );
});
AvatarPreview.displayName = 'AvatarPreview';
