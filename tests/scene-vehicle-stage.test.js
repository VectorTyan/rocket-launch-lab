import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createVehicleStage } from '../src/rendering/scene/vehicle-stage.js';

function factoryHarness({ failCutaway = false } = {}) {
  const events = [],
    vehicles = [];
  let serial = 0;
  const factories = {
    createVehicle(rocket) {
      const name = `${rocket.id}:${++serial}`,
        root = new THREE.Group();
      const vehicle = {
        root,
        parts: new Map(),
        setExplode(value) {
          events.push(`${name}:explode:${value}`);
        },
        selectPart(value) {
          events.push(`${name}:select:${value}`);
        },
        dispose() {
          assert.equal(root.parent, null);
          assert.equal(root.children.length, 0, 'plume graphs are removed before model disposal');
          events.push(`${name}:model`);
        },
      };
      vehicle.name = name;
      vehicles.push(vehicle);
      return vehicle;
    },
    createCutaway(vehicle) {
      if (failCutaway) throw new Error('cutaway setup failed');
      return {
        dispose() {
          events.push(`${vehicle.name}:cutaway`);
        },
      };
    },
    createSelectionView(vehicle) {
      const group = new THREE.Group();
      return {
        group,
        dispose() {
          group.removeFromParent();
          events.push(`${vehicle.name}:selection`);
        },
      };
    },
    createPlumes(rocket) {
      const group = new THREE.Group();
      return {
        group,
        dispose() {
          assert.equal(group.parent, null);
          events.push(`${rocket.id}:plume`);
        },
      };
    },
    createAssemblyView(vehicle) {
      return {
        setState(state) {
          events.push({ assemblyState: state });
        },
        dispose() {
          events.push(`${vehicle.name}:assembly`);
        },
      };
    },
  };
  return { factories, events, vehicles };
}

test('vehicle switching restores temporary controllers before releasing models and their attached plumes', () => {
  const scene = new THREE.Scene(),
    h = factoryHarness();
  const stage = createVehicleStage(
    scene,
    { id: 'falcon9' },
    { factories: h.factories, cancelDrag: () => h.events.push('cancel-drag') },
  );
  const vehicle = stage.vehicle,
    state = { placed: ['stage1'], selectedId: 'engines1' };
  vehicle.root.position.set(4, 5, 6);
  const assembly = stage.ensureAssembly(state);
  assert.deepEqual(vehicle.root.position.toArray(), [0, 0, 0]);
  assert.equal(stage.ensureAssembly(state), assembly);
  assert.equal(
    h.events.filter((item) => typeof item === 'object').length,
    1,
    'ensure does not replay placement on every frame',
  );
  assert.equal(stage.setRocket({ id: 'falcon9' }), false);
  assert.equal(h.vehicles.length, 2);
  assert.equal(stage.setRocket({ id: 'starship' }), true);
  assert.equal(stage.rocket.id, 'starship');
  assert.notEqual(stage.vehicle, vehicle);
  assert.equal(stage.assembly, null);
  assert.equal(scene.children.length, 3);
  const assemblyRelease = h.events.indexOf(`${vehicle.name}:assembly`),
    cutawayRelease = h.events.indexOf(`${vehicle.name}:cutaway`),
    modelRelease = h.events.indexOf(`${vehicle.name}:model`);
  assert.ok(h.events.indexOf('cancel-drag') < assemblyRelease);
  assert.ok(assemblyRelease < cutawayRelease && cutawayRelease < modelRelease);
  assert.equal(h.events.filter((item) => item === 'falcon9:plume').length, 2);
  stage.dispose();
  stage.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(h.events.filter((item) => typeof item === 'string' && item.endsWith(':model')).length, 4);
  assert.equal(stage.setRocket({ id: 'cz5' }), false);
  assert.equal(stage.ensureAssembly(state), null);
});

test('mode changes release only assembly resources and allow fresh assembly on the same model', () => {
  const scene = new THREE.Scene(),
    h = factoryHarness();
  const stage = createVehicleStage(scene, { id: 'cz7' }, { factories: h.factories });
  const first = stage.ensureAssembly({ placed: [], selectedId: 'stage1' });
  stage.releaseAssembly();
  assert.equal(stage.assembly, null);
  assert.equal(h.vehicles.length, 2);
  assert.equal(scene.children.length, 3);
  const second = stage.ensureAssembly({ placed: ['stage1'], selectedId: 'engines1' });
  assert.notEqual(first, second);
  stage.dispose();
  assert.equal(h.events.filter((item) => typeof item === 'string' && item.endsWith(':assembly')).length, 2);
});

test('partially constructed vehicle owners clean completed resources when a later controller fails', () => {
  const scene = new THREE.Scene(),
    h = factoryHarness({ failCutaway: true });
  assert.throws(
    () => createVehicleStage(scene, { id: 'cz8' }, { factories: h.factories }),
    /cutaway setup failed/,
  );
  assert.equal(scene.children.length, 0);
  assert.deepEqual(h.events, ['cz8:2:model', 'cz8:1:model']);
});
