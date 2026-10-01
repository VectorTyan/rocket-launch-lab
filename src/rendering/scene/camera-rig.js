import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function observationCenter({
  mode,
  view,
  rocket,
  vehicle,
  booster,
  state,
  boosterActive,
  explode = 0,
}) {
  const isStudio = mode === 'structure' || mode === 'assembly';
  const y = isStudio
    ? rocket.height * (0.52 + (mode === 'structure' ? explode * 0.28 : 0))
    : view === 'engine'
      ? boosterActive || !state.separated
        ? 3
        : vehicle.upperBase + 2
      : boosterActive
        ? vehicle.firstTop * 0.5
        : state.separated
          ? (vehicle.upperBase + vehicle.height) * 0.5
          : rocket.height * 0.5;
  const center = new THREE.Vector3(mode === 'assembly' ? -rocket.height * 0.06 : 0, y, 0);
  if (!isStudio) {
    const pivot = boosterActive ? booster.root : vehicle.root;
    center.applyQuaternion(pivot.quaternion).add(pivot.position);
  }
  return center;
}

export function trackingOffset({ view, rocket, state, boosterActive, altitude, environmentTime = 0 }) {
  const scale = rocket.height / 70;
  const offset = (
    state.separated && !boosterActive ? new THREE.Vector3(42, 16, 64) : new THREE.Vector3(75, 20, 110)
  ).multiplyScalar(scale);
  if (view === 'engine') offset.set(13, altitude < 50 ? 6 : -12, 18);
  if (view === 'wide') offset.set(350 + altitude * 0.015, 160 + altitude * 0.006, 460 + altitude * 0.018);
  if (view === 'cinematic') {
    const angle = environmentTime * 0.045 + 0.5,
      radius = (state.separated ? 70 : 155) * scale;
    offset.set(Math.sin(angle) * radius, 18 * scale + Math.sin(angle * 0.7) * 8, Math.cos(angle) * radius);
  }
  return offset.applyAxisAngle(
    new THREE.Vector3(0, 0, 1),
    -(boosterActive ? state.booster.pitch : state.pitch) * 0.6,
  );
}

export function createCameraRig(
  camera,
  element,
  { controlsFactory = (view, canvas) => new OrbitControls(view, canvas) } = {},
) {
  const controls = controlsFactory(camera, element);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.target.set(0, 34, 0);
  controls.minDistance = 8;
  controls.maxDistance = 2000000;
  controls.maxPolarAngle = Math.PI * 0.96;
  const previousFocus = new THREE.Vector3();
  let needsReset = true,
    disposed = false;
  function requestReset() {
    needsReset = true;
  }
  function setCutaway(value) {
    controls.minAzimuthAngle = value ? -1.1 : -Infinity;
    controls.maxAzimuthAngle = value ? 1.1 : Infinity;
    requestReset();
  }
  function focus(part, { cutawayEnabled = false } = {}) {
    if (!part || disposed) return false;
    const bounds = new THREE.Box3();
    if (cutawayEnabled)
      part.traverse((object) => {
        if (object.userData.cutawayInterior && object.visible && object.isMesh)
          bounds.union(new THREE.Box3().setFromObject(object));
      });
    if (bounds.isEmpty()) bounds.setFromObject(part);
    if (bounds.isEmpty()) return false;
    const center = bounds.getCenter(new THREE.Vector3()),
      size = bounds.getSize(new THREE.Vector3()).length();
    controls.target.copy(center);
    camera.position
      .copy(center)
      .add(
        cutawayEnabled
          ? new THREE.Vector3(0, size * 0.06, Math.max(size * 1.65, 8))
          : new THREE.Vector3(size * 0.75, size * 0.2, size),
      );
    camera.fov = 42;
    camera.updateProjectionMatrix();
    needsReset = false;
    controls.update();
    return true;
  }
  function update(context) {
    if (disposed) return;
    const { mode, view, rocket, state, boosterActive, anchor, explode, cutawayEnabled, dragging, dt } =
      context;
    const isStructure = mode === 'structure',
      isAssembly = mode === 'assembly',
      isStudio = isStructure || isAssembly;
    const center = observationCenter(context),
      scale = rocket.height / 70;
    controls.enabled = !dragging && (view === 'orbit' || isStudio);
    if (needsReset) {
      camera.fov = 42;
      camera.updateProjectionMatrix();
      controls.target.copy(center);
      camera.position
        .copy(center)
        .add(
          new THREE.Vector3(
            isStructure ? 90 : -110,
            isStructure ? 12 : 22,
            isStructure ? 130 : 145,
          ).multiplyScalar(scale),
        );
      if (isStructure && explode > 0)
        camera.position.copy(center).add(new THREE.Vector3(80, 18, 145 + explode * 25).multiplyScalar(scale));
      if (isStructure && cutawayEnabled)
        camera.position.copy(center).add(new THREE.Vector3(0, 2, 110).multiplyScalar(scale));
      if (isAssembly) camera.position.copy(center).add(new THREE.Vector3(0, 4, rocket.height * 2));
      previousFocus.copy(center);
      needsReset = false;
    }
    if (!isStudio && view === 'orbit') {
      const shift = center.clone().sub(previousFocus);
      camera.position.add(shift);
      controls.target.add(shift);
    }
    previousFocus.copy(center);
    if (!isStudio && view !== 'orbit') {
      if (view === 'pad') {
        const position = new THREE.Vector3(180, 40, 220).sub(anchor);
        camera.position.copy(position);
        camera.lookAt(center);
        camera.fov = THREE.MathUtils.clamp(
          THREE.MathUtils.radToDeg(2 * Math.atan(rocket.height / Math.max(100, position.distanceTo(center)))),
          0.04,
          42,
        );
        camera.updateProjectionMatrix();
      } else {
        camera.fov = view === 'engine' ? 65 : 42;
        camera.updateProjectionMatrix();
        camera.position.copy(center).add(trackingOffset(context));
        camera.lookAt(center);
      }
    } else if (!dragging) controls.update(dt);
  }
  return {
    controls,
    requestReset,
    setCutaway,
    focus,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      controls.dispose();
    },
  };
}
