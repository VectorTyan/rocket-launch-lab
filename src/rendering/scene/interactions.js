import * as THREE from 'three';
import { createDisposalScope } from './lifecycle.js';

export function visibleHit(hit) {
  for (let node = hit.object; node; node = node.parent) if (!node.visible) return false;
  return true;
}

export function retainedHit(hit) {
  if (!visibleHit(hit)) return false;
  const material = Array.isArray(hit.object.material)
    ? hit.object.material[hit.face?.materialIndex || 0]
    : hit.object.material;
  return !material?.clippingPlanes?.some((plane) => plane.distanceToPoint(hit.point) < -1e-5);
}

export function projectViewportPoint(point, camera, width, height) {
  camera.updateMatrixWorld();
  const projected = point.clone().project(camera);
  return {
    x: (projected.x * 0.5 + 0.5) * width,
    y: (-projected.y * 0.5 + 0.5) * height,
    visible: projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1,
  };
}

/** Owns pointer listeners/capture only; model references are read afresh on events. */
export function createSceneInteractions({
  element,
  container,
  camera,
  controls,
  getContext,
  onPartSelect,
  onAssemblyDrop,
}) {
  const scope = createDisposalScope(),
    raycaster = new THREE.Raycaster(),
    mouse = new THREE.Vector2();
  const originalCursor = element.style.cursor;
  let drag = null,
    pointerStart = null,
    disposed = false;
  function pointRay(x, y) {
    const rect = element.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return null;
    mouse.set(((x - rect.left) / rect.width) * 2 - 1, (-(y - rect.top) / rect.height) * 2 + 1);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(mouse, camera);
    return rect;
  }
  function getAssemblyTargetScreen() {
    if (disposed) return null;
    const { assemblyView, assemblyState, vehicle } = getContext();
    const point = assemblyView?.getDropTarget(assemblyState.selectedId);
    if (!point) return null;
    vehicle.root.updateWorldMatrix(true, false);
    return projectViewportPoint(
      point.clone().applyMatrix4(vehicle.root.matrixWorld),
      camera,
      container.clientWidth,
      container.clientHeight,
    );
  }
  function tryAssemblyDrop(id, x, y) {
    if (disposed) return false;
    const { mode, assemblyState, assemblyView } = getContext();
    if (mode !== 'assembly' || id !== assemblyState.selectedId || !assemblyView) return false;
    const rect = pointRay(x, y),
      target = getAssemblyTargetScreen();
    if (!rect || !target?.visible) return false;
    if (Math.hypot(x - rect.left - target.x, y - rect.top - target.y) < 56) return true;
    return raycaster.intersectObjects(assemblyView.getTargetMeshes(), false).some(visibleHit);
  }
  function cancelDrag(event) {
    if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
    const pointerId = drag.pointerId;
    drag = null;
    const context = getContext();
    try {
      context.assemblyView?.endDrag();
    } finally {
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
      controls.enabled = context.view === 'orbit' || context.mode !== 'launch';
      element.style.cursor = originalCursor;
    }
  }
  function down(event) {
    if (disposed) return;
    const { mode, assemblyView, assemblyState, vehicle } = getContext();
    if (mode === 'assembly' && (drag || event.button !== 0)) return;
    pointerStart = [event.clientX, event.clientY];
    if (mode !== 'assembly' || event.button !== 0 || !assemblyView || !assemblyState.selectedId) return;
    const rect = pointRay(event.clientX, event.clientY),
      part = vehicle.parts.get(assemblyState.selectedId);
    if (!rect || !part) return;
    vehicle.root.updateWorldMatrix(true, true);
    const center = assemblyView
      .getPartCenter(assemblyState.selectedId)
      .clone()
      .applyMatrix4(vehicle.root.matrixWorld);
    const screen = projectViewportPoint(center, camera, rect.width, rect.height);
    const nearCenter =
      screen.visible &&
      Math.hypot(event.clientX - rect.left - screen.x, event.clientY - rect.top - screen.y) < 26;
    if (!nearCenter && !raycaster.intersectObject(part, true).some(visibleHit)) return;
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      camera.getWorldDirection(new THREE.Vector3()),
      center,
    );
    const start = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    if (!start) return;
    drag = { id: assemblyState.selectedId, pointerId: event.pointerId, plane, offset: center.sub(start) };
    controls.enabled = false;
    element.setPointerCapture(event.pointerId);
    element.style.cursor = 'grabbing';
    event.stopImmediatePropagation();
  }
  function move(event) {
    if (disposed || !drag || event.pointerId !== drag.pointerId) return;
    if (!pointRay(event.clientX, event.clientY)) return;
    const point = raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3());
    if (point) {
      const { assemblyView, vehicle } = getContext();
      assemblyView?.setDrag(drag.id, vehicle.root.worldToLocal(point.add(drag.offset)));
    }
    event.preventDefault();
  }
  function up(event) {
    if (disposed) return;
    const { mode, assemblyState, vehicle } = getContext();
    if (mode === 'assembly') {
      if (event.button !== 0 || (drag && event.pointerId !== drag.pointerId)) return;
      if (drag) {
        const id = drag.id,
          near = tryAssemblyDrop(id, event.clientX, event.clientY);
        try {
          onAssemblyDrop?.(id, near);
        } finally {
          cancelDrag();
          pointerStart = null;
        }
      } else if (
        pointerStart &&
        Math.hypot(event.clientX - pointerStart[0], event.clientY - pointerStart[1]) < 5 &&
        tryAssemblyDrop(assemblyState.selectedId, event.clientX, event.clientY)
      )
        onAssemblyDrop?.(assemblyState.selectedId, true);
      pointerStart = null;
      return;
    }
    const click =
      pointerStart && Math.hypot(event.clientX - pointerStart[0], event.clientY - pointerStart[1]) <= 5;
    pointerStart = null;
    if (mode !== 'structure' || !click || !pointRay(event.clientX, event.clientY)) return;
    for (const hit of raycaster.intersectObject(vehicle.root, true).filter(retainedHit)) {
      let node = hit.object;
      while (node && !node.userData.partId) node = node.parent;
      if (node) {
        onPartSelect?.(node.userData.partId);
        break;
      }
    }
  }
  for (const [type, callback, capture] of [
    ['pointerdown', down, true],
    ['pointermove', move, false],
    ['pointerup', up, false],
    ['pointercancel', cancelDrag, false],
    ['lostpointercapture', cancelDrag, false],
  ]) {
    element.addEventListener(type, callback, capture);
    scope.defer(() => element.removeEventListener(type, callback, capture));
  }
  return {
    tryAssemblyDrop,
    getAssemblyTargetScreen,
    cancelDrag,
    get isDragging() {
      return Boolean(drag);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        scope.dispose();
      } finally {
        cancelDrag();
        pointerStart = null;
      }
    },
  };
}
