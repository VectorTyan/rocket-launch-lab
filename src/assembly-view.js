import * as THREE from 'three';

const SNAP_SECONDS = .35;
const RETURN_SECONDS = .28;
const FEEDBACK_SECONDS = .8;
const CYAN = '#76e2ea';

/**
 * Child-friendly assembly presentation, independent of DOM and camera controls.
 * Assemble the vehicle once before construction; do not call setExplode/setFlight
 * while this controller owns part transforms. All public positions are centres
 * in vehicle.root LOCAL coordinates, including setDrag and getDropTarget.
 * Dispose before disposing the source vehicle. Ghosts share its geometry only.
 */
export function createAssemblyView(vehicle, rocket = {}) {
  if (!vehicle?.root?.isObject3D || !(vehicle.parts instanceof Map)) {
    throw new TypeError('Assembly view requires a vehicle root and parts Map.');
  }
  const { root, parts } = vehicle;
  const height = Math.max(1, Number(rocket.height) || Number(vehicle.height) || Number(root.userData.heightMetres) || 70);
  const trayCenter = new THREE.Vector3(-height * .5, height * .45, 0);
  const ownedRoot = new THREE.Group();
  ownedRoot.name = 'assembly-view-targets-and-feedback';
  ownedRoot.userData.assemblyPresentation = true;
  const geometries = new Set();
  const materials = new Set();
  const ghostInstances = new Set();
  const originalVisibility = new WeakMap();
  const boundsCache = new WeakMap();
  const records = new Map();
  const animations = new Map();
  let placed = new Set();
  let selectedId = null;
  let hintId = null;
  let dragging = null;
  let lastPlacedId = null;
  let lastInteractionId = null;
  let feedback = null;
  let clock = 0;
  let disposed = false;

  root.updateWorldMatrix(true, true);
  for (const part of parts.values()) part.traverse(object => originalVisibility.set(object, object.visible));

  function sourceVisible(object) {
    return !object.userData.cutawayInterior && originalVisibility.get(object) !== false;
  }

  function walkSource(object, callback) {
    if (!sourceVisible(object)) return;
    callback(object);
    for (const child of object.children) walkSource(child, callback);
  }

  function geometryBounds(geometry) {
    if (!boundsCache.has(geometry)) {
      const bounds = new THREE.Box3();
      if (geometry.attributes.position) bounds.setFromBufferAttribute(geometry.attributes.position);
      boundsCache.set(geometry, bounds);
    }
    return boundsCache.get(geometry);
  }

  function assembledBounds(part) {
    const bounds = new THREE.Box3();
    const rootInverse = root.matrixWorld.clone().invert();
    const instance = new THREE.Matrix4();
    walkSource(part, object => {
      if (!object.isMesh || !object.geometry) return;
      const matrix = new THREE.Matrix4().multiplyMatrices(rootInverse, object.matrixWorld);
      const original = geometryBounds(object.geometry);
      if (object.isInstancedMesh) {
        for (let index = 0; index < object.count; index++) {
          object.getMatrixAt(index, instance);
          bounds.union(original.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(matrix, instance)));
        }
      } else bounds.union(original.clone().applyMatrix4(matrix));
    });
    return bounds;
  }

  for (const [id, part] of parts) {
    const base = {
      position: part.position.clone(), quaternion: part.quaternion.clone(),
      scale: part.scale.clone(), visible: part.visible,
    };
    const bounds = assembledBounds(part);
    const targetMatrix = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(part.matrixWorld);
    const target = bounds.isEmpty() ? new THREE.Vector3().setFromMatrixPosition(targetMatrix)
      : bounds.getCenter(new THREE.Vector3());
    const size = bounds.isEmpty() ? new THREE.Vector3(1, 1, 1) : bounds.getSize(new THREE.Vector3());
    const localCenter = target.clone().applyMatrix4(root.matrixWorld).applyMatrix4(part.matrixWorld.clone().invert());
    const tolerance = THREE.MathUtils.clamp(Math.max(size.x, size.z) * .8 + size.y * .035, 1.3, 8);
    const box = new THREE.BoxGeometry(Math.max(size.x, .12), Math.max(size.y, .12), Math.max(size.z, .12));
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    geometries.add(edges);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: '#6e9bae', transparent: true, opacity: .10, depthWrite: false,
    });
    materials.add(lineMaterial);
    const outline = new THREE.LineSegments(edges, lineMaterial);
    outline.name = `assembly-outline-${id}`;
    outline.position.copy(target);
    outline.userData.assemblyPresentation = true;
    outline.renderOrder = 10;
    ownedRoot.add(outline);
    records.set(id, { id, part, base, bounds, target, targetMatrix, localCenter, size,
      tolerance, outline, ghost: null, ghostMeshes: [], ghostMaterial: null });
  }

  const feedbackGeometry = new THREE.TorusGeometry(1, .028, 6, 48);
  const feedbackMaterial = new THREE.MeshBasicMaterial({
    color: '#78e5b5', transparent: true, opacity: 0, depthWrite: false, depthTest: false,
  });
  geometries.add(feedbackGeometry); materials.add(feedbackMaterial);
  const feedbackRing = new THREE.Mesh(feedbackGeometry, feedbackMaterial);
  feedbackRing.name = 'assembly-feedback-ring';
  feedbackRing.visible = false;
  feedbackRing.renderOrder = 80;
  feedbackRing.userData.assemblyPresentation = true;
  ownedRoot.add(feedbackRing);
  root.add(ownedRoot);

  function restorePose(record) {
    record.part.position.copy(record.base.position);
    record.part.quaternion.copy(record.base.quaternion);
    record.part.scale.copy(record.base.scale);
  }

  function setCenter(record, center) {
    // part.position is not its geometric centre: model meshes frequently use
    // absolute Y coordinates, and side boosters also have a parent X/Z offset.
    root.updateWorldMatrix(true, false);
    record.part.parent.updateWorldMatrix(true, false);
    const parentCenter = center.clone().applyMatrix4(root.matrixWorld)
      .applyMatrix4(record.part.parent.matrixWorld.clone().invert());
    const offset = record.localCenter.clone().multiply(record.base.scale).applyQuaternion(record.base.quaternion);
    record.part.position.copy(parentCenter).sub(offset);
    record.part.quaternion.copy(record.base.quaternion);
    record.part.scale.copy(record.base.scale);
  }

  function getPartCenter(id) {
    const record = records.get(id);
    if (!record) return null;
    record.part.updateWorldMatrix(true, false);
    root.updateWorldMatrix(true, false);
    return record.localCenter.clone().applyMatrix4(record.part.matrixWorld).applyMatrix4(root.matrixWorld.clone().invert());
  }

  function getDropTarget(id) { return records.get(id)?.target.clone() ?? null; }
  function getDropRadius(id) { return records.get(id)?.tolerance ?? 0; }

  function ensureGhost(record) {
    if (record.ghost) return record.ghost;
    const material = new THREE.MeshBasicMaterial({
      color: CYAN, transparent: true, opacity: .16, side: THREE.DoubleSide,
      depthWrite: false, depthTest: false, toneMapped: false,
    });
    materials.add(material);
    function cloneNode(source) {
      if (!sourceVisible(source)) return null;
      const object = source.clone(false);
      object.visible = true;
      object.userData.assemblyTargetId = record.id;
      object.userData.assemblyPresentation = true;
      object.castShadow = false; object.receiveShadow = false;
      object.renderOrder = 50;
      if (object.isMesh) {
        object.material = material;
        record.ghostMeshes.push(object);
        if (object.isInstancedMesh) {
          object.instanceColor = null;
          ghostInstances.add(object);
        }
      }
      for (const child of source.children) {
        const cloned = cloneNode(child);
        if (cloned) object.add(cloned);
      }
      return object;
    }
    const ghost = cloneNode(record.part) ?? new THREE.Group();
    record.targetMatrix.decompose(ghost.position, ghost.quaternion, ghost.scale);
    ghost.name = `assembly-ghost-${record.id}`;
    ghost.userData.assemblyTargetId = record.id;
    ghost.userData.assemblyPresentation = true;
    ownedRoot.add(ghost);
    record.ghost = ghost;
    record.ghostMaterial = material;
    return ghost;
  }

  function updateTargets() {
    const activeId = selectedId ?? hintId;
    for (const record of records.values()) {
      const active = record.id === activeId && !placed.has(record.id);
      if (active) ensureGhost(record).visible = true;
      else if (record.ghost) record.ghost.visible = false;
      record.outline.visible = !placed.has(record.id) && !active;
      const hint = hintId === record.id;
      record.outline.material.color.set(hint ? '#b5f1da' : '#6e9bae');
      record.outline.material.opacity = hint ? .36 : .10;
    }
  }

  function setState(state = {}) {
    if (disposed) return;
    const previousPlaced = placed;
    const previousSelected = selectedId;
    const requestedPlaced = Object.hasOwn(state, 'placed') ? state.placed : placed;
    const nextPlaced = new Set((requestedPlaced instanceof Set || Array.isArray(requestedPlaced)
      ? [...requestedPlaced] : []).filter(id => records.has(id)));
    const requestedSelected = Object.hasOwn(state, 'selectedId') ? state.selectedId : selectedId;
    const requestedHint = Object.hasOwn(state, 'hintId') ? state.hintId : hintId;
    for (const id of nextPlaced) {
      if (previousPlaced.has(id)) continue;
      const record = records.get(id);
      const from = getPartCenter(id);
      lastPlacedId = id;
      lastInteractionId = id;
      if (from.distanceToSquared(record.target) > .000001) {
        animations.set(id, { from, to: record.target.clone(), elapsed: 0, duration: SNAP_SECONDS, kind: 'place' });
      } else { animations.delete(id); restorePose(record); }
    }
    placed = nextPlaced;
    selectedId = records.has(requestedSelected) && !placed.has(requestedSelected) ? requestedSelected : null;
    hintId = records.has(requestedHint) && !placed.has(requestedHint) ? requestedHint : null;
    if (!placed.size && previousPlaced.size) lastPlacedId = null;
    if (dragging && (placed.has(dragging.id) || dragging.id !== selectedId)) dragging = null;
    for (const record of records.values()) {
      const assembled = placed.has(record.id);
      record.part.visible = assembled || selectedId === record.id;
      if (assembled) {
        if (!animations.has(record.id)) restorePose(record);
      } else if (selectedId === record.id) {
        if (selectedId !== previousSelected || previousPlaced.has(record.id)) {
          animations.delete(record.id);
          setCenter(record, trayCenter);
        }
      } else animations.delete(record.id);
    }
    updateTargets();
  }

  function setDrag(id, positionRootLocal) {
    const record = records.get(id);
    if (disposed || !record || placed.has(id) || selectedId !== id
      || !positionRootLocal || !['x', 'y', 'z'].every(axis => Number.isFinite(positionRootLocal[axis]))) return false;
    dragging = { id };
    lastInteractionId = id;
    animations.delete(id);
    record.part.visible = true;
    setCenter(record, new THREE.Vector3(positionRootLocal.x, positionRootLocal.y, positionRootLocal.z));
    return true;
  }

  function endDrag() {
    if (disposed || !dragging) return;
    const id = dragging.id;
    dragging = null;
    if (placed.has(id) || selectedId !== id) return;
    const from = getPartCenter(id);
    animations.set(id, { from, to: trayCenter.clone(), elapsed: 0, duration: RETURN_SECONDS, kind: 'return' });
  }

  function getTargetMeshes() {
    if (disposed) return [];
    const record = records.get(selectedId ?? hintId);
    if (!record?.ghost?.visible) return [];
    // DOM-card drops can request a target before the next renderer frame.
    record.ghost.updateWorldMatrix(true, true);
    return [...record.ghostMeshes];
  }

  function showFeedback(success) {
    if (disposed) return;
    const id = success ? lastPlacedId ?? lastInteractionId ?? selectedId : dragging?.id ?? lastInteractionId ?? selectedId;
    const record = records.get(id);
    if (!record) return;
    feedback = { elapsed: 0, radius: Math.max(1.7, Math.min(7, record.tolerance)), id };
    feedbackRing.position.copy(success ? record.target : getPartCenter(id));
    feedbackRing.scale.setScalar(feedback.radius);
    feedbackMaterial.color.set(success ? '#78e5b5' : '#f4b681');
    feedbackMaterial.opacity = .78;
    feedbackRing.visible = true;
    feedbackRing.userData.assemblyFeedbackId = id;
    feedbackRing.userData.success = Boolean(success);
  }

  function update(dt = 0) {
    if (disposed) return;
    const delta = Number.isFinite(dt) ? Math.min(5, Math.max(0, dt)) : 0;
    clock = (clock + delta) % 120;
    for (const [id, animation] of animations) {
      animation.elapsed += delta;
      const amount = Math.min(1, animation.elapsed / animation.duration);
      const eased = 1 - (1 - amount) ** 3;
      const record = records.get(id);
      setCenter(record, animation.from.clone().lerp(animation.to, eased));
      if (amount >= 1) {
        if (animation.kind === 'place' && placed.has(id)) restorePose(record);
        animations.delete(id);
      }
    }
    const target = records.get(selectedId ?? hintId);
    if (target?.ghostMaterial) target.ghostMaterial.opacity = (hintId === target.id ? .22 : .14) + Math.sin(clock * 2.2) * .018;
    if (feedback) {
      feedback.elapsed += delta;
      const amount = Math.min(1, feedback.elapsed / FEEDBACK_SECONDS);
      feedbackRing.scale.setScalar(feedback.radius * (1 + .22 * amount));
      feedbackMaterial.opacity = .78 * (1 - amount);
      if (amount >= 1) { feedbackRing.visible = false; feedback = null; }
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    animations.clear(); dragging = null; feedback = null;
    for (const record of records.values()) {
      restorePose(record);
      record.part.visible = record.base.visible;
    }
    ownedRoot.removeFromParent();
    ghostInstances.forEach(object => object.dispose());
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
  }

  setState({ placed: [], selectedId: null, hintId: null });
  return { setState, update, getDropTarget, getDropRadius, getPartCenter, setDrag,
    endDrag, getTargetMeshes, showFeedback, dispose };
}
