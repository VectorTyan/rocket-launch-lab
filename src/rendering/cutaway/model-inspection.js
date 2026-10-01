import * as THREE from 'three';

const SHELL_IDS = new Set(['stage1', 'stage2', 'interstage', 'fairing-left', 'fairing-right', 'heatshield']);
export function isBooster(id) {
  return /^booster(?:-\d+)?s?$/.test(id);
}
function isShellPart(id) {
  return SHELL_IDS.has(id) || isBooster(id);
}

/** Read original geometry in a part coordinate frame; never mutate source bounds. */
export function createModelInspector({ rocketId, parts, coreRadius }) {
  const geometryBounds = new WeakMap();
  function isTeachingCraft(id) {
    return (rocketId === 'cz2f' && id === 'spacecraft') || (rocketId === 'cz7' && id === 'payload');
  }

  function baseBounds(geometry) {
    if (!geometryBounds.has(geometry)) {
      const bounds = new THREE.Box3();
      if (geometry.attributes.position) bounds.setFromBufferAttribute(geometry.attributes.position);
      geometryBounds.set(geometry, bounds);
    }
    return geometryBounds.get(geometry);
  }

  // Exact geometry bounds in the requested ancestor's coordinates. This neither
  // writes boundingBox into original geometries nor relies on world-axis boxes.

  function meshBounds(object, ancestor) {
    const relative = new THREE.Matrix4().copy(ancestor.matrixWorld).invert().multiply(object.matrixWorld);
    const result = new THREE.Box3();
    const original = baseBounds(object.geometry);
    if (object.isInstancedMesh) {
      const instance = new THREE.Matrix4(),
        combined = new THREE.Matrix4();
      for (let index = 0; index < object.count; index++) {
        object.getMatrixAt(index, instance);
        combined.multiplyMatrices(relative, instance);
        result.union(original.clone().applyMatrix4(combined));
      }
    } else result.copy(original).applyMatrix4(relative);
    return result;
  }

  function protectedEngine(object, id, part) {
    if (object.userData.cutawayRole === 'internal') return true;
    if (object.userData.cutawayRole === 'shell') return false;
    const names = [object.name, ...[object.material].flat().map((material) => material?.name ?? '')].join(
      ' ',
    );
    if (/nozzle|engine|chamber|turbopump|喷管|发动机/i.test(names)) return true;
    // Booster modules include complete engines in the same part. Protect their
    // rims, chambers and plumbing as well as meshes explicitly named "nozzle".
    return isBooster(id) && meshBounds(object, part).max.y <= 2.5;
  }

  function shellMeshes(id, part) {
    const result = [];
    const craft = isTeachingCraft(id);
    if (!isShellPart(id) && !craft) return result;
    part.traverse((object) => {
      if (!object.isMesh || object.userData.cutawayInterior || !object.material) return;
      if (craft) {
        // Only the two selected teaching spacecraft have cabin cutaways. Keep
        // their folded solar panels, windows and exterior equipment complete.
        const type = object.geometry.type;
        if (!['CylinderGeometry', 'LatheGeometry', 'TorusGeometry'].includes(type)) return;
        if (
          type === 'CylinderGeometry' &&
          Math.max(object.geometry.parameters.radiusTop, object.geometry.parameters.radiusBottom) < 0.4
        )
          return;
      }
      if (!protectedEngine(object, id, part)) result.push(object);
    });
    return result;
  }

  function tankEnvelope(id, part, objects) {
    const candidates = [];
    for (const object of objects) {
      if (object.isInstancedMesh || object.geometry.type !== 'CylinderGeometry') continue;
      const bounds = meshBounds(object, part);
      const size = bounds.getSize(new THREE.Vector3());
      const radius = Math.min(size.x, size.z) / 2;
      // Restrict tanks to the straight main barrels, excluding thin skirts,
      // nozzle plumbing, reinforcement rings and the tapering payload nose.
      if (
        radius < coreRadius * (isBooster(id) ? 0.25 : 0.52) ||
        size.y < radius * 1.15 ||
        Math.max(size.x, size.z) > radius * 2.2
      )
        continue;
      candidates.push({ bounds, radius, size });
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.size.y - a.size.y);
    const barrel = candidates[0];
    const center = barrel.bounds.getCenter(new THREE.Vector3());
    const bounds = barrel.bounds.clone();
    for (const candidate of candidates.slice(1)) {
      const other = candidate.bounds.getCenter(new THREE.Vector3());
      if (
        Math.hypot(other.x - center.x, other.z - center.z) < barrel.radius * 0.15 &&
        candidate.radius >= barrel.radius * 0.8 &&
        candidate.radius <= barrel.radius * 1.15
      )
        bounds.union(candidate.bounds);
    }
    const endMargin = Math.max(0.35, barrel.radius * 0.16);
    let low = bounds.min.y + endMargin;
    let high = bounds.max.y - endMargin;
    if (id === 'stage2') {
      // Ship's barrel also contains the teaching payload: reserve that bay.
      for (const payloadId of ['payload', 'spacecraft']) {
        const payload = parts.get(payloadId);
        if (!payload) continue;
        let payloadLow = Infinity;
        payload.traverse((object) => {
          if (object.isMesh && !object.userData.cutawayInterior)
            payloadLow = Math.min(payloadLow, meshBounds(object, part).min.y);
        });
        if (payloadLow > low && payloadLow < high) high = payloadLow - 0.3;
      }
    }
    if (high - low < 1.2) return null;
    return {
      x: center.x,
      z: center.z,
      low,
      high,
      radius: Math.max(0.1, barrel.radius * 0.9 - 0.035),
      shellRadius: barrel.radius,
    };
  }
  return { meshBounds, shellMeshes, tankEnvelope };
}
