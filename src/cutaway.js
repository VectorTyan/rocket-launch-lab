import * as THREE from 'three';
import { createModelInspector } from './rendering/cutaway/model-inspection.js';
import { createSectionManager } from './rendering/cutaway/sections.js';
import { createInteriorBuilder } from './rendering/cutaway/interiors.js';
import { createShellMaterials } from './rendering/cutaway/shell-materials.js';

/**
 * Coordinate a reversible cutaway without owning the vehicle's original assets.
 * Enable renderer.localClippingEnabled and assemble the model before enabling.
 * Call update after changing transforms/highlighting; dispose before the vehicle.
 */
export function createCutaway(vehicle, rocket = {}) {
  if (!vehicle?.root?.isObject3D || !(vehicle.parts instanceof Map)) {
    throw new TypeError('Cutaway requires a vehicle root and parts Map.');
  }
  const { root, parts } = vehicle;
  const rocketId = typeof rocket === 'string' ? rocket : (rocket.id ?? root.userData.rocketId ?? '');
  const diameter = typeof rocket === 'object' ? rocket.diameter : undefined;
  const coreRadius = Math.max(
    0.1,
    Number(diameter) / 2 || Number(root.userData.coreDiameterMetres) / 2 || 1.85,
  );
  const localPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  const worldPlane = localPlane.clone();
  const inspector = createModelInspector({ rocketId, parts, coreRadius });
  const { meshBounds } = inspector;
  const sections = createSectionManager({ root, worldPlane });
  const interiors = createInteriorBuilder({ vehicle, rocketId, coreRadius, worldPlane, inspector, sections });
  const shells = createShellMaterials({ parts, shellMeshes: inspector.shellMeshes, worldPlane });
  const metadataKeys = ['cutawayLegend', 'cutawayEnabled', 'cutawayOffset'];
  const metadataBefore = new Map(
    metadataKeys.map((key) => [
      key,
      { existed: Object.hasOwn(root.userData, key), value: root.userData[key] },
    ]),
  );
  let enabled = false,
    disposed = false,
    offset = 0,
    focusPartId = null;

  function update() {
    if (disposed) return;
    root.updateWorldMatrix(true, false);
    let centerZ = 0,
      sectionRadius = coreRadius;
    const focusedPart = parts.get(focusPartId);
    if (focusedPart) {
      focusedPart.updateWorldMatrix(true, true);
      const envelope = interiors.getEnvelope(focusedPart);
      let localCenter;
      if (envelope) {
        localCenter = new THREE.Vector3(envelope.x, (envelope.low + envelope.high) / 2, envelope.z);
        sectionRadius = envelope.shellRadius;
      } else {
        // Original meshes are used irrespective of their current visible flags.
        const bounds = new THREE.Box3();
        focusedPart.traverse((object) => {
          if (object.isMesh && !object.userData.cutawayInterior)
            bounds.union(meshBounds(object, focusedPart));
        });
        if (!bounds.isEmpty()) {
          localCenter = bounds.getCenter(new THREE.Vector3());
          const size = bounds.getSize(new THREE.Vector3());
          sectionRadius = Math.max(0.1, Math.min(size.x, size.z) / 2);
        }
      }
      if (localCenter) {
        const partToRoot = new THREE.Matrix4()
          .copy(root.matrixWorld)
          .invert()
          .multiply(focusedPart.matrixWorld);
        centerZ = localCenter.applyMatrix4(partToRoot).z;
        // Include any explicit local part scale, but not root/world scaling.
        sectionRadius *= new THREE.Vector3().setFromMatrixScale(partToRoot).z;
      }
    }
    localPlane.constant = centerZ + offset * sectionRadius;
    worldPlane.copy(localPlane).applyMatrix4(root.matrixWorld);
    if (!enabled) return;
    sections.update();
    shells.syncHighlight();
  }

  function setEnabled(value) {
    if (disposed) return false;
    const next = Boolean(value);
    if (next === enabled) {
      update();
      return enabled;
    }
    if (next) {
      root.userData.cutawayLegend = interiors.build();
      root.updateWorldMatrix(true, true);
      shells.enable();
    } else shells.disable();
    enabled = next;
    interiors.setVisible(enabled);
    root.userData.cutawayEnabled = enabled;
    root.userData.cutawayOffset = offset;
    update();
    return enabled;
  }

  function setOffset(value) {
    if (disposed) return offset;
    offset = THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, -0.8, 0.8);
    root.userData.cutawayOffset = offset;
    update();
    return offset;
  }

  function setFocusPart(partId = null) {
    if (disposed) return null;
    focusPartId = parts.has(partId) ? partId : null;
    update();
    return focusPartId;
  }

  function dispose() {
    if (disposed) return;
    setEnabled(false);
    disposed = true;
    // Sections own cap resources; interior builders own everything behind them.
    // Shell materials are restored before either subsystem releases its assets.
    sections.dispose();
    interiors.dispose();
    shells.dispose();
    for (const [key, previous] of metadataBefore) {
      if (previous.existed) root.userData[key] = previous.value;
      else delete root.userData[key];
    }
  }

  return { setEnabled, setOffset, setFocusPart, update, dispose };
}
