/**
 * GLB avatar adapter — used when an external photo-to-avatar service (or an admin) supplies a rigged GLB.
 *
 * Expected: a humanoid glTF with animation clips whose names contain "idle" and "walk" (optionally "run").
 * Walk playback speed is scaled to the avatar's actual ground speed to minimise foot sliding.
 * Clothing recolouring is not possible on arbitrary GLBs; try-on accessories still attach to the hand bone if found.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { AvatarConfig } from '../../../types';
import { AvatarRig, AvatarMotion } from './AvatarModel';

let sharedLoader: GLTFLoader | null = null;

/** GLTF loader with Draco, Meshopt and KTX2 (compressed texture) support. Decoders are served from /decoders. */
export function getGLTFLoader(renderer?: THREE.WebGLRenderer) {
  if (sharedLoader) return sharedLoader;
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('/decoders/draco/');
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);
  if (renderer) {
    const ktx2 = new KTX2Loader();
    ktx2.setTranscoderPath('/decoders/basis/');
    ktx2.detectSupport(renderer);
    loader.setKTX2Loader(ktx2);
  }
  sharedLoader = loader;
  return loader;
}

export async function createGlbAvatar(url: string, cfg: AvatarConfig, renderer?: THREE.WebGLRenderer, clipWalkSpeed = 1.35): Promise<AvatarRig> {
  const gltf = await getGLTFLoader(renderer).loadAsync(url);
  const root = new THREE.Group();
  const model = gltf.scene;
  // normalise height to ~1.72 m × heightScale, feet on the floor, facing +z
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const target = 1.72 * (cfg.heightScale || 1);
  const s = size.y > 0 ? target / size.y : 1;
  model.scale.setScalar(s);
  const box2 = new THREE.Box3().setFromObject(model);
  model.position.y -= box2.min.y;
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.frustumCulled = false;
    }
  });
  root.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const find = (re: RegExp) => gltf.animations.find((a) => re.test(a.name));
  const idleClip = find(/idle/i) || gltf.animations[0];
  const walkClip = find(/walk/i) || find(/run/i) || gltf.animations[1];
  const runClip = find(/run/i);
  const idle = idleClip ? mixer.clipAction(idleClip) : null;
  const walk = walkClip ? mixer.clipAction(walkClip) : null;
  const run = runClip && runClip !== walkClip ? mixer.clipAction(runClip) : null;
  [idle, walk, run].forEach((a) => {
    if (a) {
      a.play();
      a.setEffectiveWeight(0);
    }
  });
  idle?.setEffectiveWeight(1);

  let headBone: THREE.Object3D = model;
  let leftHand: THREE.Object3D = model;
  model.traverse((o) => {
    if (/head$/i.test(o.name) && headBone === model) headBone = o;
    if (/left.?hand$/i.test(o.name) && leftHand === model) leftHand = o;
  });
  const lips = new THREE.Object3D();
  headBone.add(lips);
  const feet = new THREE.Object3D();
  root.add(feet);

  let wW = 0;
  let rW = 0;
  const rig: AvatarRig = {
    root,
    eyeHeight: target * 0.94,
    update(dt: number, motion: AvatarMotion) {
      const moving = motion.speed > 0.05;
      wW = THREE.MathUtils.damp(wW, moving ? 1 : 0, 6, dt);
      rW = THREE.MathUtils.damp(rW, motion.speed > 3 && run ? 1 : 0, 4, dt);
      idle?.setEffectiveWeight(1 - wW);
      walk?.setEffectiveWeight(wW * (1 - rW));
      run?.setEffectiveWeight(wW * rW);
      if (walk) walk.timeScale = moving ? THREE.MathUtils.clamp(motion.speed / clipWalkSpeed, 0.5, 2.2) : 1;
      if (run) run.timeScale = moving ? THREE.MathUtils.clamp(motion.speed / (clipWalkSpeed * 2.4), 0.6, 1.6) : 1;
      mixer.update(dt);
    },
    applyConfig() {
      /* GLB avatars carry their own appearance */
    },
    setBasketCount() {},
    triggerPick() {},
    setLookTarget() {},
    pose() {},
    anchors: { head: headBone, chest: model, leftWrist: leftHand, feet, lips },
    setVisible(v: boolean) {
      model.visible = v;
    },
    dispose() {
      mixer.stopAllAction();
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (Array.isArray(m.material) ? m.material : [m.material]).forEach((mm) => mm.dispose());
        }
      });
      root.removeFromParent();
    },
  };
  return rig;
}
