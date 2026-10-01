import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAssemblyView } from '../src/assembly-view.js';
import { createVehicle } from '../src/fleet-model.js';
import { ROCKETS } from '../src/fleet-data.js';

function fixture(t, rocket = ROCKETS[0]) {
  const vehicle = createVehicle(rocket);
  vehicle.setExplode(0);
  const baseline = new Map([...vehicle.parts].map(([id, part]) => [id, {
    position: part.position.clone(), quaternion: part.quaternion.clone(), scale: part.scale.clone(), visible: part.visible,
    center: new THREE.Box3().setFromObject(part).getCenter(new THREE.Vector3()),
  }]));
  const originalMeshes = new Map();
  vehicle.root.traverse(object => {
    if (object.isMesh) originalMeshes.set(object, { geometry: object.geometry, material: object.material });
  });
  const view = createAssemblyView(vehicle, rocket);
  t.after(() => { view.dispose(); vehicle.dispose(); });
  return { vehicle, rocket, view, baseline, originalMeshes };
}

function vectorClose(actual, expected, message = '', tolerance = 1e-5) {
  assert.ok(actual.distanceTo(expected) < tolerance, `${message}: ${actual.toArray()} differs from ${expected.toArray()}`);
}

for (const rocket of ROCKETS) {
  test(`${rocket.id}: assembly centres use real geometry and all original module poses/materials restore`, t => {
    const { vehicle, view, baseline, originalMeshes } = fixture(t, rocket);
    const ids = [...vehicle.parts.keys()];
    const selected = 'stage1';
    for (const id of ids) {
      // Box3 first unions an InstancedMesh's local boxes before rotating them;
      // the per-instance calculation can be a few millimetres tighter on fins.
      vectorClose(view.getDropTarget(id), baseline.get(id).center, `${id}: assembled target`, .01);
      assert.ok(view.getDropRadius(id) >= 1.3 && view.getDropRadius(id) <= 8);
    }
    assert.ok(view.getDropTarget(selected).y > rocket.height * .15, 'absolute-Y mesh centre is not part.position');
    view.setState({ placed: [], selectedId: selected });
    vectorClose(view.getPartCenter(selected), new THREE.Vector3(-rocket.height * .5, rocket.height * .45, 0));
    for (const [id, part] of vehicle.parts) assert.equal(part.visible, id === selected);
    const target = view.getDropTarget(selected);
    assert.equal(view.setDrag(selected, target), true);
    view.setState({ placed: new Set([selected]), selectedId: ids.find(id => id !== selected) });
    view.endDrag();
    view.update(1);
    vectorClose(view.getPartCenter(selected), target);
    for (const [mesh, original] of originalMeshes) {
      assert.equal(mesh.geometry, original.geometry);
      assert.equal(mesh.material, original.material);
    }
    assert.deepEqual([...vehicle.parts.keys()], ids);
    view.dispose();
    for (const [id, part] of vehicle.parts) {
      const before = baseline.get(id);
      assert.ok(part.position.equals(before.position));
      assert.ok(part.quaternion.equals(before.quaternion));
      assert.ok(part.scale.equals(before.scale));
      assert.equal(part.visible, before.visible);
    }
  });
}

test('dragging positions are geometric centres in root-local space even with translated, rotated and scaled roots', t => {
  const { vehicle, view, baseline } = fixture(t, ROCKETS.find(rocket => rocket.id === 'cz5'));
  const id = 'booster-1';
  view.setState({ placed: [], selectedId: id });
  vehicle.root.position.set(230, -170, 95);
  vehicle.root.rotation.set(.25, -.6, .2);
  vehicle.root.scale.set(1.7, .85, 2.1);
  const desired = new THREE.Vector3(-24, 31, 6);
  view.setDrag(id, desired);
  vectorClose(view.getPartCenter(id), desired);
  assert.ok(vehicle.parts.get(id).quaternion.equals(baseline.get(id).quaternion));
  assert.ok(vehicle.parts.get(id).scale.equals(baseline.get(id).scale));
  vectorClose(view.getDropTarget(id), baseline.get(id).center);
});

test('newly placed pieces snap smoothly without restarting on repeated state or returning when endDrag follows setState', t => {
  const { view, vehicle } = fixture(t);
  const id = 'stage1';
  view.setState({ placed: [], selectedId: id });
  const target = view.getDropTarget(id);
  const from = target.clone().add(new THREE.Vector3(-4, 2, 1));
  view.setDrag(id, from);
  view.setState({ placed: [id], selectedId: 'engine2' });
  view.endDrag();
  vectorClose(view.getPartCenter(id), from, 'placing does not teleport before animation');
  view.update(.10);
  const middle = view.getPartCenter(id);
  assert.ok(middle.distanceTo(target) < from.distanceTo(target));
  assert.ok(middle.distanceTo(target) > .001);
  view.setState({ placed: [id], selectedId: 'engine2' });
  view.update(.26);
  vectorClose(view.getPartCenter(id), target);
  assert.equal(vehicle.parts.get(id).visible, true);
  view.update(1);
  vectorClose(view.getPartCenter(id), target, 'late updates never send a placed piece back to the tray');
});

test('unsuccessful drops ease back to the tray without changing placement or original material colours', t => {
  const { view, vehicle, originalMeshes } = fixture(t);
  const colors = new Map();
  for (const { material } of originalMeshes.values()) for (const item of [material].flat()) {
    if (item.color) colors.set(item, item.color.clone());
  }
  view.setState({ placed: [], selectedId: 'stage2' });
  const tray = view.getPartCenter('stage2');
  const dropped = tray.clone().add(new THREE.Vector3(17, 4, 0));
  view.setDrag('stage2', dropped);
  view.showFeedback(false);
  view.setState({ placed: [], selectedId: 'stage2', usedHint: true });
  view.endDrag();
  vectorClose(view.getPartCenter('stage2'), dropped, 'no immediate reset at pointer release');
  view.update(.08);
  assert.ok(view.getPartCenter('stage2').distanceTo(tray) < dropped.distanceTo(tray));
  view.update(.25);
  vectorClose(view.getPartCenter('stage2'), tray);
  assert.equal(vehicle.parts.get('stage2').visible, true);
  assert.equal(vehicle.parts.get('stage1').visible, false);
  for (const [material, color] of colors) assert.ok(material.color.equals(color));
});

test('success feedback refers to the just-placed piece rather than the next selected target', t => {
  const { view, vehicle } = fixture(t);
  view.setState({ placed: [], selectedId: 'stage1' });
  view.setDrag('stage1', view.getDropTarget('stage1'));
  view.setState({ placed: ['stage1'], selectedId: 'stage2' });
  view.endDrag();
  view.showFeedback(true);
  const ring = vehicle.root.getObjectByName('assembly-feedback-ring');
  assert.equal(ring.userData.assemblyFeedbackId, 'stage1');
  assert.equal(ring.userData.success, true);
  vectorClose(ring.position, view.getDropTarget('stage1'));
  assert.equal(ring.visible, true);
  view.update(1);
  assert.equal(ring.visible, false);
});

test('ghost targets share only original geometries, remain pickable through placed shells and switch with selection/hints', t => {
  const { view, originalMeshes } = fixture(t, ROCKETS.find(rocket => rocket.id === 'falcon-heavy'));
  const sourceGeometries = new Set([...originalMeshes.values()].map(entry => entry.geometry));
  const sourceMaterials = new Set([...originalMeshes.values()].flatMap(entry => [entry.material].flat()));
  view.setState({ placed: ['stage1'], selectedId: 'booster-1', hintId: 'booster-1' });
  const first = view.getTargetMeshes();
  assert.ok(first.length > 0);
  assert.ok(first.some(mesh => mesh.isInstancedMesh));
  for (const mesh of first) {
    assert.equal(mesh.userData.assemblyTargetId, 'booster-1');
    assert.ok(sourceGeometries.has(mesh.geometry));
    assert.ok(!sourceMaterials.has(mesh.material));
    assert.equal(mesh.material.depthTest, false);
    assert.equal(mesh.material.depthWrite, false);
    assert.equal(mesh.material.transparent, true);
  }
  view.setState({ placed: ['stage1'], selectedId: 'engine2', hintId: null });
  assert.ok(view.getTargetMeshes().every(mesh => mesh.userData.assemblyTargetId === 'engine2'));
  view.setState({ placed: ['stage1'], selectedId: null, hintId: 'stage2' });
  assert.ok(view.getTargetMeshes().every(mesh => mesh.userData.assemblyTargetId === 'stage2'));
  view.setState({ placed: [...new Set(['stage1', 'stage2'])], selectedId: null, hintId: 'stage2' });
  assert.deepEqual(view.getTargetMeshes(), []);
});

test('hidden ancestors and cutaway interiors are excluded from bounds and ghosts without changing their visibility', t => {
  const root = new THREE.Group(), part = new THREE.Group();
  const geometry = new THREE.CylinderGeometry(2, 2, 10, 12);
  const material = new THREE.MeshStandardMaterial({ color: '#b1b9bd' });
  const shell = new THREE.Mesh(geometry, material); shell.position.y = 12; part.add(shell);
  const ignoredGeometry = new THREE.SphereGeometry(100, 6, 4);
  const hidden = new THREE.Group(); hidden.visible = false;
  const hiddenMesh = new THREE.Mesh(ignoredGeometry, material); hiddenMesh.position.set(4000, 5000, 6000); hidden.add(hiddenMesh); part.add(hidden);
  const internal = new THREE.Group(); internal.userData.cutawayInterior = true;
  const internalMesh = new THREE.Mesh(ignoredGeometry, material); internalMesh.position.set(-5000, 7000, 0); internal.add(internalMesh); part.add(internal);
  root.add(part);
  const vehicle = { root, parts: new Map([['stage1', part]]), height: 30 };
  const view = createAssemblyView(vehicle, { height: 30 });
  t.after(() => { view.dispose(); geometry.dispose(); ignoredGeometry.dispose(); material.dispose(); });
  vectorClose(view.getDropTarget('stage1'), new THREE.Vector3(0, 12, 0));
  view.setState({ placed: [], selectedId: 'stage1' });
  assert.equal(view.getTargetMeshes().length, 1);
  assert.equal(view.getTargetMeshes()[0].geometry, geometry);
  assert.equal(hidden.visible, false);
  assert.equal(internal.visible, true, 'controller does not edit child visibility, even when flagged interiors are excluded');
  view.dispose();
  assert.equal(hidden.visible, false);
  assert.equal(hiddenMesh.visible, true);
  assert.equal(internal.visible, true);
});

test('dispose restores active drags and releases presentation resources once without disposing source geometry, materials or instances', t => {
  const { view, vehicle, originalMeshes, baseline } = fixture(t, ROCKETS.find(rocket => rocket.id === 'falcon-heavy'));
  const sources = new Set();
  for (const [mesh, original] of originalMeshes) {
    sources.add(original.geometry);
    for (const material of [original.material].flat()) sources.add(material);
    if (mesh.isInstancedMesh) sources.add(mesh);
  }
  let originalDisposals = 0;
  for (const resource of sources) resource.addEventListener('dispose', () => originalDisposals++);
  view.setState({ placed: [], selectedId: 'booster-1' });
  view.setState({ placed: [], selectedId: 'booster-2' });
  view.setDrag('booster-2', new THREE.Vector3(-30, 50, 6));
  const owned = vehicle.root.getObjectByName('assembly-view-targets-and-feedback');
  const resources = new Set();
  owned.traverse(object => {
    if (object.geometry && !sources.has(object.geometry)) resources.add(object.geometry);
    if (object.material && !sources.has(object.material)) resources.add(object.material);
    if (object.isInstancedMesh) resources.add(object);
  });
  const released = new Map([...resources].map(resource => [resource, 0]));
  for (const resource of resources) resource.addEventListener('dispose', () => released.set(resource, released.get(resource) + 1));
  view.dispose(); view.dispose();
  assert.equal(originalDisposals, 0);
  assert.ok([...released.values()].every(count => count === 1));
  assert.equal(owned.parent, null);
  assert.ok(vehicle.parts.get('booster-2').position.equals(baseline.get('booster-2').position));
  assert.equal(vehicle.parts.get('booster-2').visible, baseline.get('booster-2').visible);
  assert.deepEqual(view.getTargetMeshes(), []);
  assert.equal(view.setDrag('booster-2', new THREE.Vector3()), false);
  assert.doesNotThrow(() => view.update(1));
});

test('invalid selections, bad coordinates and invalid frame deltas cannot corrupt part poses or assembled targets', t => {
  const { view } = fixture(t);
  view.setState({ placed: ['not-a-part'], selectedId: 'stage1' });
  const before = view.getPartCenter('stage1');
  assert.equal(view.setDrag('stage2', new THREE.Vector3()), false);
  assert.equal(view.setDrag('stage1', new THREE.Vector3(NaN, 1, 2)), false);
  for (const delta of [NaN, Infinity, -10, undefined]) view.update(delta);
  vectorClose(view.getPartCenter('stage1'), before);
  assert.equal(view.getDropTarget('missing'), null);
  assert.equal(view.getPartCenter('missing'), null);
  assert.equal(view.getDropRadius('missing'), 0);
  const target = view.getDropTarget('stage1');
  target.set(999, 999, 999);
  assert.notEqual(view.getDropTarget('stage1').x, 999, 'returned target vectors are defensive copies');
});
