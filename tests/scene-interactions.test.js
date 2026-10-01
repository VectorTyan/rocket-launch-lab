import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createSceneInteractions,
  retainedHit,
  projectViewportPoint,
} from '../src/rendering/scene/interactions.js';

class PointerSurface {
  style = { cursor: 'crosshair' };
  listeners = [];
  captures = new Set();
  removed = [];
  addEventListener(type, callback, capture) {
    this.listeners.push({ type, callback, capture });
  }
  removeEventListener(type, callback, capture) {
    this.removed.push({ type, callback, capture });
    this.listeners = this.listeners.filter(
      (listener) => listener.type !== type || listener.callback !== callback || listener.capture !== capture,
    );
  }
  getBoundingClientRect() {
    return { left: 10, top: 20, width: 400, height: 300 };
  }
  setPointerCapture(id) {
    this.captures.add(id);
  }
  hasPointerCapture(id) {
    return this.captures.has(id);
  }
  releasePointerCapture(id) {
    this.captures.delete(id);
  }
  emit(type, extra = {}) {
    const event = {
      clientX: 210,
      clientY: 170,
      button: 0,
      pointerId: 1,
      preventDefault() {
        this.prevented = true;
      },
      stopImmediatePropagation() {
        this.stopped = true;
      },
      ...extra,
    };
    for (const listener of [...this.listeners].sort((a, b) => Number(b.capture) - Number(a.capture))) {
      if (listener.type === type) listener.callback(event);
      if (event.stopped) break;
    }
    return event;
  }
}
function fixture(t, mode = 'assembly') {
  const element = new PointerSurface(),
    container = { clientWidth: 400, clientHeight: 300 };
  const camera = new THREE.PerspectiveCamera(45, 4 / 3, 0.1, 100);
  camera.position.z = 20;
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const root = new THREE.Group(),
    part = new THREE.Group(),
    mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
  part.userData.partId = 'stage1';
  part.add(mesh);
  root.add(part);
  root.updateWorldMatrix(true, true);
  const controls = { enabled: true },
    drops = [],
    selections = [],
    moves = [];
  let ends = 0;
  const point = new THREE.Vector3();
  const assembly = {
    getDropTarget: () => point,
    getPartCenter: () => point,
    getTargetMeshes: () => [mesh],
    setDrag: (id, position) => moves.push({ id, position }),
    endDrag: () => ends++,
  };
  let context = {
    mode,
    view: 'orbit',
    vehicle: { root, parts: new Map([['stage1', part]]) },
    assemblyView: assembly,
    assemblyState: { selectedId: 'stage1' },
  };
  const interactions = createSceneInteractions({
    element,
    container,
    camera,
    controls,
    getContext: () => context,
    onPartSelect: (id) => selections.push(id),
    onAssemblyDrop: (id, near) => {
      drops.push({ id, near });
      interactions.cancelDrag();
    },
  });
  t.after(() => {
    interactions.dispose();
    mesh.geometry.dispose();
    mesh.material.dispose();
  });
  return {
    element,
    camera,
    controls,
    interactions,
    drops,
    selections,
    moves,
    root,
    part,
    mesh,
    point,
    get ends() {
      return ends;
    },
    get context() {
      return context;
    },
    set context(value) {
      context = value;
    },
  };
}

test('target projection uses viewport coordinates and does not mutate controller-owned points', (t) => {
  const f = fixture(t);
  assert.deepEqual(f.interactions.getAssemblyTargetScreen(), { x: 200, y: 150, visible: true });
  f.root.position.x = 3;
  assert.ok(f.interactions.getAssemblyTargetScreen().x > 200);
  assert.deepEqual(f.point.toArray(), [0, 0, 0]);
  assert.equal(projectViewportPoint(new THREE.Vector3(0, 0, 25), f.camera, 400, 300).visible, false);
});

test('DOM drops use the generous target radius without firing the 3D drop callback', (t) => {
  const f = fixture(t);
  assert.equal(f.interactions.tryAssemblyDrop('stage1', 260, 170), true);
  assert.equal(f.interactions.tryAssemblyDrop('stage1', 390, 290), false);
  assert.equal(f.interactions.tryAssemblyDrop('another', 210, 170), false);
  assert.deepEqual(f.drops, []);
  f.context.mode = 'launch';
  assert.equal(f.interactions.tryAssemblyDrop('stage1', 210, 170), false);
});

test('assembly dragging captures one pointer, preserves orbit control, and tolerates callback cancellation', (t) => {
  const f = fixture(t);
  const down = f.element.emit('pointerdown');
  assert.equal(down.stopped, true);
  assert.equal(f.controls.enabled, false);
  assert.equal(f.interactions.isDragging, true);
  assert.equal(f.element.hasPointerCapture(1), true);
  assert.equal(f.element.style.cursor, 'grabbing');
  f.element.emit('pointermove', { pointerId: 2, clientX: 230 });
  assert.equal(f.moves.length, 0);
  const move = f.element.emit('pointermove', { clientX: 230 });
  assert.equal(move.prevented, true);
  assert.equal(f.moves.length, 1);
  assert.ok(f.moves[0].position.x > 0);
  f.element.emit('pointerup', { pointerId: 2 });
  assert.equal(f.interactions.isDragging, true);
  f.element.emit('pointerup');
  assert.deepEqual(f.drops, [{ id: 'stage1', near: true }]);
  assert.equal(f.ends, 1);
  assert.equal(f.controls.enabled, true);
  assert.equal(f.element.hasPointerCapture(1), false);
  assert.equal(f.element.style.cursor, 'crosshair');
});

test('cancelling or disposing a drag releases capture and unregisters the exact listener functions', (t) => {
  const f = fixture(t),
    registrations = [...f.element.listeners];
  assert.equal(registrations.length, 5);
  assert.equal(registrations.find((listener) => listener.type === 'pointerdown').capture, true);
  f.element.emit('pointerdown');
  f.element.emit('pointercancel', { pointerId: 99 });
  assert.equal(f.interactions.isDragging, true);
  f.interactions.dispose();
  f.interactions.dispose();
  assert.equal(f.ends, 1);
  assert.equal(f.element.listeners.length, 0);
  assert.equal(f.element.captures.size, 0);
  assert.equal(f.element.removed.length, registrations.length);
  for (const item of registrations)
    assert.ok(
      f.element.removed.some(
        (removed) =>
          removed.type === item.type &&
          removed.callback === item.callback &&
          removed.capture === item.capture,
      ),
    );
  f.element.emit('pointerup');
  assert.equal(f.drops.length, 0);
  assert.equal(f.interactions.getAssemblyTargetScreen(), null);
});

test('structure picking ignores hidden and clipped surfaces and follows replacement model references', (t) => {
  const f = fixture(t, 'structure');
  f.element.emit('pointerdown');
  f.element.emit('pointerup');
  assert.deepEqual(f.selections, ['stage1']);
  f.part.visible = false;
  f.element.emit('pointerdown');
  f.element.emit('pointerup');
  assert.equal(f.selections.length, 1);
  f.part.visible = true;
  f.mesh.material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 0, -1), -5)];
  f.element.emit('pointerdown');
  f.element.emit('pointerup');
  assert.equal(f.selections.length, 1);
  f.mesh.material.clippingPlanes = null;
  f.part.userData.partId = 'stage2';
  f.context = { ...f.context, vehicle: { root: f.root, parts: new Map([['stage2', f.part]]) } };
  f.element.emit('pointerdown');
  f.element.emit('pointerup');
  assert.deepEqual(f.selections, ['stage1', 'stage2']);
  f.element.emit('pointerdown');
  f.element.emit('pointerup', { clientX: 230 });
  assert.equal(f.selections.length, 2, 'orbit gestures do not select a module');
});

test('retained-hit checks the material used by an intersected face', () => {
  const object = new THREE.Mesh(new THREE.BoxGeometry(), [
    new THREE.MeshBasicMaterial(),
    new THREE.MeshBasicMaterial(),
  ]);
  object.material[1].clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)];
  const point = new THREE.Vector3(0, 0, 1);
  assert.equal(retainedHit({ object, point, face: { materialIndex: 0 } }), true);
  assert.equal(retainedHit({ object, point, face: { materialIndex: 1 } }), false);
  object.geometry.dispose();
  object.material.forEach((material) => material.dispose());
});
