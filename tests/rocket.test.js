import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createRocket } from '../src/rocket.js';

const PART_IDS = [
  'stage1', 'engines1', 'interstage', 'stage2', 'engine2',
  'fairing-left', 'fairing-right', 'payload', 'grid-fins', 'landing-legs',
];
const BOOSTER_IDS = new Set(['stage1', 'engines1', 'interstage', 'grid-fins', 'landing-legs']);

function fixture(t) {
  const rocket = createRocket();
  t.after(() => rocket.dispose());
  return rocket;
}

function approximately(actual, expected, label, tolerance = 1e-5) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, received ${actual}`);
}

function bounds(object) {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
}

function pose(object) {
  return [...object.position.toArray(), ...object.quaternion.toArray(), ...object.scale.toArray()];
}

function uniqueMaterials(object) {
  const materials = new Set();
  object.traverse(child => {
    if (child.material) for (const material of [child.material].flat()) materials.add(material);
  });
  return materials;
}

function materialAppearance(material) {
  return {
    color: material.color.getHex(),
    emissive: material.emissive.getHex(),
    emissiveIntensity: material.emissiveIntensity,
  };
}

function geometryFingerprint(object) {
  const hash = createHash('sha256');
  object.traverse(child => {
    if (!child.geometry) return;
    hash.update(child.geometry.uuid);
    const vertices = child.geometry.attributes.position.array;
    hash.update(Buffer.from(vertices.buffer, vertices.byteOffset, vertices.byteLength));
  });
  return hash.digest('hex');
}

test('constructs the complete 70 m rocket in Node without a DOM or canvas', t => {
  assert.equal(typeof document, 'undefined');
  const rocket = fixture(t);
  assert.equal(rocket.parts.size, 10);
  assert.deepEqual([...rocket.parts.keys()].sort(), [...PART_IDS].sort());
  const box = bounds(rocket.root);
  const size = box.getSize(new THREE.Vector3());
  approximately(box.min.y, 0, 'bottom at ground level');
  approximately(size.y, 70, 'total height');
  approximately(size.x, 5.2, 'fairing width');
  approximately(size.z, 5.2, 'fairing depth');
  for (const [id, group] of rocket.parts) {
    assert.ok(group.isGroup, `${id} is an independently movable group`);
    assert.equal(group.parent, rocket.root);
    let surfaces = 0;
    group.traverse(child => {
      assert.equal(child.userData.partId, id, `${id} remains identifiable during raycasting`);
      if (child.isMesh) surfaces++;
    });
    assert.ok(surfaces > 0, `${id} contains actual geometry`);
  }
});

test('second-stage aft shell spans the assembled exterior gap without moving the vacuum nozzle', t => {
  const rocket = fixture(t);
  const stage2 = rocket.parts.get('stage2');
  const skirt = stage2.getObjectByName('Second-stage open aft skirt');
  const tank = stage2.getObjectByName('Second-stage tank shell');
  const interstageShell = rocket.parts.get('interstage').children.find(object => object.geometry?.type === 'CylinderGeometry' && object.geometry.parameters.openEnded);
  const nozzle = rocket.parts.get('engine2').getObjectByName('Merlin Vacuum nozzle');
  assert.ok(skirt && tank && interstageShell && nozzle);
  assert.equal(skirt.geometry.parameters.openEnded, true, 'aft skirt has no cap covering the engine');
  approximately(bounds(skirt).min.y, bounds(interstageShell).max.y, 'aft skirt joins the upper interstage edge');
  approximately(bounds(skirt).max.y, bounds(tank).min.y, 'aft skirt joins the tank shell');
  approximately(bounds(skirt).getSize(new THREE.Vector3()).x, 3.7, 'aft skirt retains the core diameter');
  approximately(bounds(nozzle).min.y, 43.62, 'vacuum nozzle mouth stays aligned with its plume');
  assert.equal(skirt.userData.cutawayRole, 'shell');
  assert.equal(nozzle.userData.cutawayRole, 'internal');
  rocket.root.updateWorldMatrix(true, true);
  for (const y of [45.6, 46.1, 46.6]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(5, y, 0), new THREE.Vector3(-1, 0, 0));
    const hits = ray.intersectObject(skirt);
    assert.ok(hits.length > 0, `the former side-on exterior gap at Y=${y} is covered`);
    approximately(hits[0].point.x, 1.85, 'continuous outside surface');
  }
});

test('vacuum-engine attachment chain stays connected in assembly and flight, and restores after explosion', t => {
  const rocket = fixture(t);
  const engine = rocket.parts.get('engine2');
  const nozzle = engine.getObjectByName('Merlin Vacuum nozzle');
  const chamber = engine.getObjectByName('Vacuum-engine combustion chamber');
  const flange = engine.getObjectByName('Vacuum-engine mounting flange');
  const bulkhead = rocket.parts.get('stage2').getObjectByName('Second-stage engine mounting bulkhead');
  const chain = [nozzle, chamber, flange, bulkhead];
  function assertConnected(mode) {
    for (let i = 1; i < chain.length; i++) {
      assert.ok(bounds(chain[i - 1]).intersectsBox(bounds(chain[i])), `${mode}: ${chain[i - 1].name} meets ${chain[i].name}`);
    }
  }
  assertConnected('assembled');
  for (const object of [chamber, flange, bulkhead]) assert.equal(object.userData.cutawayRole, 'internal');
  rocket.setFlight({ time: 160, separated: true, secondEngineOn: true });
  assert.equal(rocket.parts.get('stage2').visible, true);
  assert.equal(engine.visible, true);
  assertConnected('upper-stage flight');
  rocket.setExplode(1);
  assert.equal(bounds(flange).intersectsBox(bounds(bulkhead)), false, 'museum explosion intentionally separates the engine from its mounting bulkhead');
  rocket.setExplode(0);
  assertConnected('reassembled');
  approximately(bounds(nozzle).min.y, 43.62, 'reassembly preserves the nozzle position');
});

test('stage separation removes only booster modules and seeking back restores them', t => {
  const rocket = fixture(t);
  rocket.setFlight({ time: 148, separated: true });
  for (const [id, part] of rocket.parts) {
    assert.equal(part.visible, !BOOSTER_IDS.has(id), `${id} separation visibility`);
  }
  rocket.setFlight({ time: 140, separated: false });
  for (const [id, part] of rocket.parts) assert.equal(part.visible, true, `${id} restored before separation`);
});

test('boosterOnly shows the complete recovery vehicle without second-stage or payload surfaces', t => {
  const rocket = fixture(t);
  rocket.setFlight({
    time: 480, separated: true, boosterOnly: true,
    fairingSeparated: true, fairingElapsed: 285, deployed: true,
    legsDeployed: 1, gridFinsDeployed: 1,
  });
  for (const [id, part] of rocket.parts) {
    assert.equal(part.visible, BOOSTER_IDS.has(id), `${id} recovery visibility`);
  }
  rocket.setFlight({ time: 156, separated: true });
  assert.equal(rocket.parts.get('stage2').visible, true, 'returning to the main vehicle restores the upper stage');
  assert.equal(rocket.parts.get('stage1').visible, false);
});

test('fairing halves separate, disappear at 20 seconds, and recover after a backwards seek', t => {
  const rocket = fixture(t);
  const left = rocket.parts.get('fairing-left');
  const right = rocket.parts.get('fairing-right');
  const originalLeft = bounds(left).getCenter(new THREE.Vector3());
  const originalRight = bounds(right).getCenter(new THREE.Vector3());
  rocket.setFlight({ time: 200, separated: true, fairingSeparated: true, fairingElapsed: 5 });
  assert.ok(left.visible && right.visible);
  assert.ok(bounds(left).getCenter(new THREE.Vector3()).x < originalLeft.x, 'left shell moves outwards');
  assert.ok(bounds(right).getCenter(new THREE.Vector3()).x > originalRight.x, 'right shell moves outwards');
  const samplePose = [pose(left), pose(right)];
  rocket.setFlight({ time: 215, separated: true, fairingSeparated: true, fairingElapsed: 20 });
  assert.equal(left.visible, false);
  assert.equal(right.visible, false);

  rocket.setFlight({ time: 200, separated: true, fairingSeparated: true, fairingElapsed: 5 });
  assert.ok(left.visible && right.visible, 'seeking into the separation animation makes both shells visible');
  assert.deepEqual([pose(left), pose(right)], samplePose, 'an explicit elapsed time reproduces the same pose');
  rocket.setFlight({ time: 190, separated: true, fairingSeparated: false });
  assert.ok(left.visible && right.visible);
  approximately(bounds(left).getCenter(new THREE.Vector3()).distanceTo(originalLeft), 0, 'left shell restored');
  approximately(bounds(right).getCenter(new THREE.Vector3()).distanceTo(originalRight), 0, 'right shell restored');
});

test('payload deployment moves upwards continuously and a pre-deployment seek restores its pose', t => {
  const rocket = fixture(t);
  const payload = rocket.parts.get('payload');
  const initial = pose(payload);
  rocket.setFlight({ time: 3390, separated: true, deployed: true, deploymentElapsed: 0 });
  approximately(payload.position.y, 0, 'deployment begins without a translation jump');
  rocket.setFlight({ time: 3400, separated: true, deployed: true, deploymentElapsed: 10 });
  const earlyHeight = payload.position.y;
  assert.ok(earlyHeight > 0);
  rocket.setFlight({ time: 3425, separated: true, deployed: true, deploymentElapsed: 35 });
  assert.ok(payload.position.y > earlyHeight, 'payload continues away from its adapter');
  rocket.setFlight({ time: 3300, separated: true, deployed: false });
  assert.deepEqual(pose(payload), initial);
});

test('museum expansion restores hidden modules and reassembly restores the original geometry and bounds', t => {
  const rocket = fixture(t);
  const originalFingerprint = geometryFingerprint(rocket.root);
  const originalBox = bounds(rocket.root);
  rocket.setFlight({ time: 480, separated: true, boosterOnly: true, legsDeployed: 1, gridFinsDeployed: 1 });
  rocket.setExplode(1);
  for (const [id, part] of rocket.parts) assert.equal(part.visible, true, `${id} is available in the museum`);
  const expanded = bounds(rocket.root).getSize(new THREE.Vector3());
  assert.ok(expanded.y > 70 && expanded.x > 5.2, 'modules are visibly spread apart');
  assert.equal(geometryFingerprint(rocket.root), originalFingerprint, 'exploding does not replace or deform meshes');
  rocket.setExplode(0);
  const restored = bounds(rocket.root);
  approximately(restored.min.distanceTo(originalBox.min), 0, 'original lower bounds');
  approximately(restored.max.distanceTo(originalBox.max), 0, 'original upper bounds');
  assert.equal(geometryFingerprint(rocket.root), originalFingerprint);
});

test('selection highlights only its module and switching or clearing selection restores original materials', t => {
  const rocket = fixture(t);
  const materials = uniqueMaterials(rocket.root);
  const original = new Map([...materials].map(material => [material, materialAppearance(material)]));
  const firstStageMaterials = uniqueMaterials(rocket.parts.get('stage1'));
  const secondEngineMaterials = uniqueMaterials(rocket.parts.get('engine2'));

  rocket.selectPart('stage1');
  assert.equal(rocket.root.userData.selectedPart, 'stage1');
  for (const material of materials) {
    if (firstStageMaterials.has(material)) {
      assert.notEqual(material.emissive.getHex(), original.get(material).emissive);
      assert.equal(material.color.getHex(), original.get(material).color, 'selection preserves base paint');
    } else assert.deepEqual(materialAppearance(material), original.get(material), 'other modules retain their appearance');
  }
  rocket.selectPart('engine2');
  for (const material of firstStageMaterials) assert.deepEqual(materialAppearance(material), original.get(material));
  for (const material of secondEngineMaterials) assert.notEqual(material.emissive.getHex(), original.get(material).emissive);
  rocket.selectPart(null);
  assert.equal(rocket.root.userData.selectedPart, null);
  for (const material of materials) assert.deepEqual(materialAppearance(material), original.get(material));
});

test('flight and museum poses preserve the caller-owned root world transform', t => {
  const rocket = fixture(t);
  rocket.root.position.set(1500, 65000, -250);
  rocket.root.rotation.set(0.05, -0.2, -0.8);
  const worldPose = pose(rocket.root);
  rocket.setFlight({ time: 200, separated: true, fairingSeparated: true, fairingElapsed: 5 });
  assert.deepEqual(pose(rocket.root), worldPose);
  rocket.setExplode(1);
  assert.deepEqual(pose(rocket.root), worldPose);
  rocket.setExplode(0);
  assert.deepEqual(pose(rocket.root), worldPose);
});

test('dispose releases each unique geometry and material without throwing', () => {
  const rocket = createRocket();
  const resources = new Set(uniqueMaterials(rocket.root));
  rocket.root.traverse(child => { if (child.geometry) resources.add(child.geometry); });
  const released = new Map([...resources].map(resource => [resource, 0]));
  for (const resource of resources) {
    resource.addEventListener('dispose', () => released.set(resource, released.get(resource) + 1));
  }
  assert.doesNotThrow(() => rocket.dispose());
  for (const [resource, count] of released) assert.equal(count, 1, `${resource.type} ${resource.uuid} is disposed once`);
});
