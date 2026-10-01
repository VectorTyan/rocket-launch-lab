import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCameraRig, observationCenter, trackingOffset } from '../src/rendering/scene/camera-rig.js';

function context(extra = {}) {
  return {
    mode: 'launch',
    view: 'orbit',
    rocket: { height: 70 },
    vehicle: { root: new THREE.Group(), height: 70, upperBase: 43.62, firstTop: 41.7 },
    booster: { root: new THREE.Group() },
    state: { separated: false, pitch: 0, booster: { pitch: 0 } },
    boosterActive: false,
    altitude: 0,
    anchor: new THREE.Vector3(),
    explode: 0,
    cutawayEnabled: false,
    dragging: false,
    environmentTime: 0,
    dt: 0.016,
    ...extra,
  };
}
function fixture(t) {
  const camera = new THREE.PerspectiveCamera(42, 1, 0.2, 35000000);
  let updates = 0,
    disposals = 0;
  const controls = {
    target: new THREE.Vector3(),
    update() {
      updates++;
      camera.lookAt(this.target);
    },
    dispose() {
      disposals++;
    },
  };
  const rig = createCameraRig(camera, {}, { controlsFactory: () => controls });
  t.after(() => rig.dispose());
  return {
    camera,
    controls,
    rig,
    get updates() {
      return updates;
    },
    get disposals() {
      return disposals;
    },
  };
}
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} versus ${expected}`);

test('camera targets reflect stage geometry, model attitude and studio mode', () => {
  const c = context();
  close(observationCenter(c).y, 35);
  c.state.separated = true;
  close(observationCenter(c).y, (43.62 + 70) / 2);
  c.view = 'engine';
  close(observationCenter(c).y, 45.62);
  c.vehicle.root.rotation.z = -Math.PI / 2;
  c.vehicle.root.position.set(8, 2, 0);
  const rotated = observationCenter(c);
  close(rotated.x, 8 + 45.62);
  close(rotated.y, 2);
  c.mode = 'structure';
  c.explode = 1;
  close(observationCenter(c).y, 56);
  c.mode = 'assembly';
  assert.deepEqual(observationCenter(c).toArray(), [-4.2, 36.4, 0]);
});

test('engine and panorama offsets preserve the near-ground and altitude rules', () => {
  const c = context({ view: 'engine' });
  assert.deepEqual(trackingOffset(c).toArray(), [13, 6, 18]);
  c.altitude = 50;
  assert.deepEqual(trackingOffset(c).toArray(), [13, -12, 18]);
  c.view = 'wide';
  c.altitude = 200000;
  trackingOffset(c)
    .toArray()
    .forEach((value, index) => close(value, [3350, 1360, 4060][index]));
  c.view = 'follow';
  c.state.separated = true;
  assert.deepEqual(trackingOffset(c).toArray(), [42, 16, 64]);
  c.boosterActive = true;
  assert.deepEqual(trackingOffset(c).toArray(), [75, 20, 110]);
});

test('ground tracking uses a fixed world camera despite a floating flight origin', (t) => {
  const f = fixture(t),
    c = context({ view: 'pad', anchor: new THREE.Vector3(12000, 25000, -300) });
  f.rig.update(c);
  assert.deepEqual(f.camera.position.clone().add(c.anchor).toArray(), [180, 40, 220]);
  assert.ok(f.camera.fov >= 0.04 && f.camera.fov <= 42);
  assert.equal(f.controls.enabled, false);
});

test('orbit tracking preserves user camera offset and drag does not update orbit controls', (t) => {
  const f = fixture(t),
    c = context();
  f.rig.update(c);
  f.camera.position.add(new THREE.Vector3(12, 7, -9));
  const before = f.camera.position.clone();
  c.vehicle.root.position.set(10, 20, 3);
  f.rig.update(c);
  assert.deepEqual(f.camera.position.clone().sub(before).toArray(), [10, 20, 3]);
  const updates = f.updates;
  c.dragging = true;
  f.rig.update(c);
  assert.equal(f.updates, updates);
  assert.equal(f.controls.enabled, false);
});

test('cutaway and assembly framing scale with vehicle height and restore orbit limits', (t) => {
  const f = fixture(t),
    c = context({ mode: 'structure', cutawayEnabled: true });
  f.rig.setCutaway(true);
  f.rig.update(c);
  assert.equal(f.controls.minAzimuthAngle, -1.1);
  assert.equal(f.controls.maxAzimuthAngle, 1.1);
  assert.deepEqual(f.camera.position.clone().sub(f.controls.target).toArray(), [0, 2, 110]);
  f.rig.setCutaway(false);
  c.mode = 'assembly';
  c.rocket.height = 124.4;
  f.rig.update(c);
  assert.equal(f.controls.minAzimuthAngle, -Infinity);
  assert.equal(f.controls.maxAzimuthAngle, Infinity);
  const offset = f.camera.position.clone().sub(f.controls.target);
  close(offset.y, 4);
  close(offset.z, 248.8);
});

test('module focus uses visible interiors in cutaway and owns control disposal', (t) => {
  const f = fixture(t),
    part = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.BoxGeometry(5, 100, 5), new THREE.MeshBasicMaterial());
  shell.position.y = 50;
  const interior = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2), new THREE.MeshBasicMaterial());
  interior.position.y = 75;
  interior.userData.cutawayInterior = true;
  part.add(shell, interior);
  t.after(() => {
    shell.geometry.dispose();
    shell.material.dispose();
    interior.geometry.dispose();
    interior.material.dispose();
  });
  assert.equal(f.rig.focus(part, { cutawayEnabled: true }), true);
  close(f.controls.target.y, 75);
  interior.visible = false;
  f.rig.focus(part, { cutawayEnabled: true });
  close(f.controls.target.y, 50);
  f.rig.dispose();
  f.rig.dispose();
  assert.equal(f.disposals, 1);
  const updates = f.updates;
  f.rig.update(context());
  assert.equal(f.updates, updates);
});
