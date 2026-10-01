import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createDisposalScope,
  createViewportBinding,
  disposeObjectResources,
} from '../src/rendering/scene/lifecycle.js';
import { createStudioDisplay } from '../src/rendering/scene/studio-display.js';
import { createPadOwner } from '../src/rendering/scene/pad-owner.js';
import { getStudioTheme } from '../src/studio-themes.js';

test('disposal scope runs every cleanup in reverse order and is safe after an error', () => {
  const scope = createDisposalScope(),
    calls = [];
  scope.defer(() => calls.push('renderer'));
  scope.defer(() => {
    calls.push('owner');
    throw new Error('owner failure');
  });
  scope.defer(() => calls.push('listeners'));
  assert.throws(() => scope.dispose(), AggregateError);
  assert.deepEqual(calls, ['listeners', 'owner', 'renderer']);
  scope.dispose();
  assert.equal(calls.length, 3);
  assert.equal(scope.disposed, true);
  assert.throws(() => scope.defer(() => {}));
});

test('viewport binding ignores zero dimensions and late observer deliveries after disposal', () => {
  const container = { clientWidth: 640, clientHeight: 400 },
    sizes = [],
    composerSizes = [];
  let callback,
    disconnects = 0,
    projections = 0;
  class Observer {
    constructor(fn) {
      callback = fn;
    }
    observe(target) {
      assert.equal(target, container);
    }
    disconnect() {
      disconnects++;
    }
  }
  const camera = {
    aspect: 0,
    updateProjectionMatrix() {
      projections++;
    },
  };
  const binding = createViewportBinding(
    container,
    { setSize: (...args) => sizes.push(args) },
    camera,
    { resize: (...args) => composerSizes.push(args) },
    Observer,
  );
  assert.deepEqual(sizes, [[640, 400, false]]);
  assert.equal(camera.aspect, 1.6);
  container.clientHeight = 0;
  assert.equal(binding.resize(), false);
  assert.equal(projections, 1);
  container.clientWidth = 800;
  container.clientHeight = 600;
  callback();
  assert.deepEqual(composerSizes.at(-1), [800, 600]);
  binding.dispose();
  binding.dispose();
  callback();
  assert.equal(binding.resize(), false);
  assert.equal(disconnects, 1);
  assert.equal(sizes.length, 2);
});

test('shared meshes release each geometry/material/texture once and leave borrowed materials to their owner', () => {
  const group = new THREE.Group(),
    geometry = new THREE.BoxGeometry(),
    texture = new THREE.Texture();
  const owned = new THREE.MeshStandardMaterial({ map: texture, normalMap: texture }),
    external = new THREE.MeshStandardMaterial();
  group.add(
    new THREE.Mesh(geometry, owned),
    new THREE.Mesh(geometry, owned),
    new THREE.Mesh(geometry, external),
  );
  const counts = new Map([geometry, texture, owned, external].map((resource) => [resource, 0]));
  for (const resource of counts.keys())
    resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  disposeObjectResources(group, new Set([external]));
  assert.equal(counts.get(geometry), 1);
  assert.equal(counts.get(texture), 1);
  assert.equal(counts.get(owned), 1);
  assert.equal(counts.get(external), 0);
  external.dispose();
});

test('studio theme updates preserve existing display geometry and disposal detaches its whole graph', () => {
  const scene = new THREE.Scene(),
    display = createStudioDisplay(scene),
    geometry = display.group.children.map((object) => object.geometry);
  let releases = 0;
  for (const resource of geometry) resource.addEventListener('dispose', () => releases++);
  for (const id of ['technology', 'space', 'realistic', 'playful']) display.setTheme(getStudioTheme(id));
  assert.deepEqual(
    display.group.children.map((object) => object.geometry),
    geometry,
  );
  display.update({ visible: true, explode: 0.5 });
  assert.equal(display.group.position.y, -4.5);
  assert.equal(display.group.visible, true);
  display.update({ visible: false });
  assert.equal(display.group.visible, false);
  display.dispose();
  display.dispose();
  assert.equal(display.group.parent, null);
  assert.equal(releases, geometry.length);
});

test('pad replacement releases terrain/details separately from shared tower materials', () => {
  const scene = new THREE.Scene(),
    releases = [],
    inputs = [];
  function createPad(site, rocket) {
    inputs.push([site.id, rocket.id]);
    const group = new THREE.Group(),
      terrainGroup = new THREE.Group(),
      detailGroup = new THREE.Group();
    const shared = new THREE.MeshStandardMaterial();
    shared.addEventListener('dispose', () => releases.push(`${site.id}:material`));
    group.add(new THREE.Mesh(new THREE.BoxGeometry(), shared), terrainGroup, detailGroup);
    return {
      group,
      terrain: {
        group: terrainGroup,
        dispose() {
          releases.push(`${site.id}:terrain`);
        },
      },
      details: {
        group: detailGroup,
        concreteMaterial: shared,
        roadMaterial: shared,
        dispose() {
          releases.push(`${site.id}:details`);
          shared.dispose();
        },
      },
    };
  }
  const owner = createPadOwner(scene, { createPad });
  const first = owner.setSite({ id: 'a' }, { id: 'falcon9' });
  owner.setSite({ id: 'b' }, { id: 'starship' });
  assert.equal(first.group.parent, null);
  assert.deepEqual(releases, ['a:terrain', 'a:details', 'a:material']);
  owner.dispose();
  owner.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(owner.current, null);
  assert.deepEqual(inputs, [
    ['a', 'falcon9'],
    ['b', 'starship'],
  ]);
  assert.equal(releases.filter((value) => value.endsWith('material')).length, 2);
});
