import * as THREE from 'three';
import { EARTH_RADIUS, flightPose } from '../../flight-space.js';

/** Pure placement calculation shared by every viewing mode and rocket family. */
export function computeFramePlacement(state, { mode = 'launch', subject = 'vehicle', mount = 3.2 } = {}) {
  const isStructure = mode === 'structure',
    isAssembly = mode === 'assembly';
  const isStudio = isStructure || isAssembly;
  const boosterActive = subject === 'booster' && state.hasRecovery && state.separated && !isStudio;
  const pose = flightPose(state);
  const primaryWorld = new THREE.Vector3(pose.vehicle.x, pose.vehicle.y + mount - 3.2, pose.vehicle.z);
  const boosterWorld = new THREE.Vector3(pose.booster.x, pose.booster.y, pose.booster.z);
  let boosterRotation = pose.booster.rotation;
  if (state.separated && !state.hasRecovery) {
    const elapsed = state.stageSeparationElapsed || 0;
    boosterWorld.y += mount - 3.2;
    const behind = new THREE.Vector3(
      -Math.sin(pose.vehicle.rotation),
      Math.cos(pose.vehicle.rotation),
      0,
    ).multiplyScalar(-(elapsed * 2 + elapsed * elapsed * 0.12));
    const blend = THREE.MathUtils.smoothstep(elapsed, 0, 35);
    boosterWorld.lerpVectors(primaryWorld.clone().add(behind), boosterWorld, blend);
    boosterRotation = THREE.MathUtils.lerp(pose.vehicle.rotation, pose.booster.rotation, blend);
  }
  return {
    isStructure,
    isAssembly,
    isStudio,
    boosterActive,
    primaryWorld,
    boosterWorld,
    primaryRotation: pose.vehicle.rotation,
    boosterRotation,
    anchor: isStudio ? new THREE.Vector3() : (boosterActive ? boosterWorld : primaryWorld).clone(),
    altitude: isStudio ? 0 : boosterActive ? state.booster.altitude : state.altitude,
  };
}

/** Atmosphere depends on the observer, including a camera still on the ground. */
export function observerAltitude(position, anchor) {
  return Math.max(
    0,
    Math.hypot(position.x + anchor.x, position.y + anchor.y + EARTH_RADIUS, position.z + anchor.z) -
      EARTH_RADIUS,
  );
}
