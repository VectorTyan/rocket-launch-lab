import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCutawayResources } from '../src/rendering/cutaway/resources.js';
import { createSectionManager } from '../src/rendering/cutaway/sections.js';
import { createShellMaterials } from '../src/rendering/cutaway/shell-materials.js';
import { createModelInspector } from '../src/rendering/cutaway/model-inspection.js';

function countDisposals(resource) {
  let count = 0;
  resource.addEventListener('dispose', () => count++);
  return () => count;
}

test('resource ownership disposes shared owned assets once while leaving borrowed textures and materials alive', () => {
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  const resources = createCutawayResources(plane);
  const texture = new THREE.Texture(),
    borrowed = new THREE.MeshBasicMaterial();
  const material = resources.ownMaterial({ map: texture });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const parent = new THREE.Group();
  resources.interiorMesh(parent, geometry, material, 'owned');
  resources.interiorMesh(parent, geometry, borrowed, 'borrowed material');
  const released = [geometry, material, texture, borrowed].map(countDisposals);
  resources.dispose();
  resources.dispose();
  assert.deepEqual(
    released.map((count) => count()),
    [1, 1, 0, 0],
  );
  assert.throws(() => resources.ownMaterial({}), /disposed/);
  texture.dispose();
  borrowed.dispose();
});

test('geometry replacement releases the superseded section once and rejects borrowed source geometry', () => {
  const resources = createCutawayResources(new THREE.Plane());
  const material = resources.ownMaterial({});
  const first = new THREE.BufferGeometry(),
    next = new THREE.BufferGeometry();
  const mesh = resources.interiorMesh(new THREE.Group(), first, material, 'section');
  const firstCount = countDisposals(first),
    nextCount = countDisposals(next);
  resources.replaceGeometry(mesh, first);
  assert.equal(firstCount(), 0);
  resources.replaceGeometry(mesh, next);
  assert.equal(firstCount(), 1);
  assert.equal(nextCount(), 0);
  const borrowed = new THREE.BoxGeometry(),
    rejected = new THREE.BufferGeometry();
  const other = new THREE.Mesh(borrowed, material),
    borrowedCount = countDisposals(borrowed);
  assert.throws(() => resources.replaceGeometry(other, rejected), /borrowed/);
  assert.equal(other.geometry, borrowed);
  assert.equal(borrowedCount(), 0);
  resources.dispose();
  resources.dispose();
  assert.equal(firstCount(), 1);
  assert.equal(nextCount(), 1);
  assert.equal(borrowedCount(), 0);
  borrowed.dispose();
  rejected.dispose();
});

test('section manager caches unchanged local cuts, follows root transforms and disposes independently of the source model', () => {
  const root = new THREE.Group(),
    part = new THREE.Group();
  part.userData = { partId: 'stage1', cutawayInterior: true };
  root.add(part);
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  const originalPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 5);
  const geometry = new THREE.CylinderGeometry(2, 2, 10, 16);
  const material = new THREE.MeshStandardMaterial({ clippingPlanes: [originalPlane, plane] });
  const source = new THREE.Mesh(geometry, material);
  part.add(source);
  const manager = createSectionManager({ root, worldPlane: plane });
  const cap = manager.add(
    source,
    part,
    [
      [2, -5],
      [2, 5],
    ],
    { kind: 'propellant' },
  );
  const sourceGeometryReleased = countDisposals(geometry),
    sourceMaterialReleased = countDisposals(material);
  assert.deepEqual(cap.material.clippingPlanes, [originalPlane]);
  manager.update();
  const initial = cap.geometry,
    firstReleased = countDisposals(initial);
  for (let i = 0; i < 10; i++) manager.update();
  assert.equal(cap.geometry, initial);
  root.position.set(12, 3, -8);
  root.rotation.set(0.2, 0.4, -0.1);
  root.scale.set(1.5, 0.8, 2);
  root.updateWorldMatrix(true, true);
  plane.set(new THREE.Vector3(0, 0, -1), 0).applyMatrix4(root.matrixWorld);
  manager.update();
  assert.equal(cap.geometry, initial, 'world movement does not invalidate the same local cut');
  plane.set(new THREE.Vector3(0, 0, -1), 0.8).applyMatrix4(root.matrixWorld);
  manager.update();
  root.updateWorldMatrix(true, true);
  assert.notEqual(cap.geometry, initial);
  assert.equal(firstReleased(), 1);
  for (let i = 0; i < cap.geometry.attributes.position.count; i++) {
    const point = new THREE.Vector3()
      .fromBufferAttribute(cap.geometry.attributes.position, i)
      .applyMatrix4(cap.matrixWorld);
    assert.ok(Math.abs(plane.distanceToPoint(point)) < 1e-6);
  }
  const currentReleased = countDisposals(cap.geometry),
    capMaterialReleased = countDisposals(cap.material);
  manager.dispose();
  manager.dispose();
  manager.update();
  assert.equal(cap.parent, null);
  assert.equal(source.parent, part);
  assert.equal(currentReleased(), 1);
  assert.equal(capMaterialReleased(), 1);
  assert.equal(sourceGeometryReleased(), 0);
  assert.equal(sourceMaterialReleased(), 0);
  assert.throws(
    () =>
      manager.add(source, part, [
        [2, -5],
        [2, 5],
      ]),
    /disposed/,
  );
  geometry.dispose();
  material.dispose();
});

test('shell overrides are idempotent, keep separate clones for shared source material and restore original hooks', () => {
  const root = new THREE.Group(),
    part = new THREE.Group();
  root.add(part);
  const geometry = new THREE.CylinderGeometry(2, 2, 10, 16);
  const original = new THREE.MeshStandardMaterial();
  const hook = () => {};
  original.onBeforeCompile = hook;
  const a = new THREE.Mesh(geometry, original),
    b = new THREE.Mesh(geometry, original);
  part.add(a, b);
  const parts = new Map([['stage1', part]]);
  const shells = createShellMaterials({
    parts,
    shellMeshes: () => [a, b],
    worldPlane: new THREE.Plane(new THREE.Vector3(0, 0, -1), 0),
  });
  const originalReleased = countDisposals(original);
  shells.enable();
  const aClone = a.material,
    bClone = b.material;
  const aReleased = countDisposals(aClone),
    bReleased = countDisposals(bClone);
  assert.notEqual(aClone, bClone);
  shells.enable();
  assert.equal(a.material, aClone);
  original.emissive.set('#00aa99');
  original.emissiveIntensity = 0.6;
  shells.syncHighlight();
  assert.ok(aClone.emissive.equals(original.emissive));
  assert.equal(bClone.emissiveIntensity, 0.6);
  shells.disable();
  shells.disable();
  shells.dispose();
  shells.dispose();
  shells.enable();
  assert.equal(a.material, original);
  assert.equal(b.material, original);
  assert.equal(original.onBeforeCompile, hook);
  assert.equal(aReleased(), 1);
  assert.equal(bReleased(), 1);
  assert.equal(originalReleased(), 0);
  geometry.dispose();
  original.dispose();
});

test('model inspection measures instances in the requested local frame without writing original geometry bounds', () => {
  const root = new THREE.Group(),
    part = new THREE.Group();
  root.add(part);
  part.position.set(11, 3, -8);
  part.rotation.y = 0.7;
  const geometry = new THREE.BoxGeometry(2, 4, 2),
    material = new THREE.MeshBasicMaterial();
  assert.equal(geometry.boundingBox, null);
  const source = new THREE.InstancedMesh(geometry, material, 2);
  source.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-4, 2, 0));
  source.setMatrixAt(1, new THREE.Matrix4().makeTranslation(4, 6, 0));
  part.add(source);
  root.updateWorldMatrix(true, true);
  const inspector = createModelInspector({
    rocketId: 'falcon9',
    parts: new Map([['stage1', part]]),
    coreRadius: 1.85,
  });
  const bounds = inspector.meshBounds(source, part);
  for (const [actual, expected] of [
    [bounds.min.x, -5],
    [bounds.max.x, 5],
    [bounds.min.y, 0],
    [bounds.max.y, 8],
  ])
    assert.ok(Math.abs(actual - expected) < 1e-8);
  assert.equal(geometry.boundingBox, null);
  source.dispose();
  geometry.dispose();
  material.dispose();
});
