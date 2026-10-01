import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ROCKETS } from '../src/fleet-data.js';
import { createVehicle } from '../src/fleet-model.js';
import { createPlumes } from '../src/plumes.js';

function modelMouths(part) {
  const result = [];
  if (!part) return result;
  part.updateWorldMatrix(true, true);
  part.traverse(object => {
    if (!object.isMesh || object.geometry.type !== 'LatheGeometry' || !object.material.name.endsWith('/nozzle')) return;
    object.geometry.computeBoundingBox();
    const local = new THREE.Vector3(0, object.geometry.boundingBox.min.y, 0);
    if (object.isInstancedMesh) {
      const instance = new THREE.Matrix4();
      for (let i = 0; i < object.count; i++) {
        object.getMatrixAt(i, instance);
        result.push(local.clone().applyMatrix4(instance).applyMatrix4(object.matrixWorld));
      }
    } else result.push(local.clone().applyMatrix4(object.matrixWorld));
  });
  return result;
}

function plumeMouths(mesh) {
  mesh.updateWorldMatrix(true, true);
  const result = [], matrix = new THREE.Matrix4();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix);
    // Unit jet's top plane is at Y=0 before its instance transform.
    result.push(new THREE.Vector3().applyMatrix4(matrix).applyMatrix4(mesh.matrixWorld));
  }
  return result;
}

function assertSameMouths(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label} count`);
  const unmatched = [...expected];
  for (const position of actual) {
    const index = unmatched.findIndex(candidate => candidate.distanceTo(position) < 1e-4);
    assert.ok(index >= 0, `${label} plume at ${position.toArray()} must begin inside a real bell mouth`);
    unmatched.splice(index, 1);
  }
}

for (const rocket of ROCKETS) {
  test(`${rocket.id}: every instanced plume is aligned with its actual model nozzle`, t => {
    assert.equal(typeof document, 'undefined', 'engine plumes do not require a canvas');
    const model = createVehicle(rocket);
    const plumes = createPlumes(rocket);
    t.after(() => { model.dispose(); plumes.dispose(); });
    assert.equal(plumes.root, plumes.group, 'both public root names refer to the same group');
    plumes.update({ time: 10, firstEngineOn: true, secondEngineOn: true, boostersEngineOn: true }, { upperBase: model.upperBase });
    const actualLayers = new Map();
    plumes.group.traverse(object => { if (object.isInstancedMesh) actualLayers.set(object.userData.layer, object); });
    const expectedIds = ['core', ...(rocket.secondStageEngines ? ['upper'] : []), ...Array.from({ length: rocket.boosters }, (_, i) => `booster-${i + 1}`)];
    assert.deepEqual([...actualLayers.keys()].sort(), expectedIds.sort());
    for (const [layer, mesh] of actualLayers) {
      const part = model.parts.get(layer === 'core' ? 'engines1' : layer === 'upper' ? 'engine2' : layer);
      assertSameMouths(plumeMouths(mesh), modelMouths(part), `${rocket.id}/${layer}`);
      assert.equal(mesh.material.depthWrite, false);
      assert.equal(mesh.material.blending, THREE.AdditiveBlending);
    }
  });
}

test('propellant palettes distinguish hydrogen, methane, kerosene and hypergolic stages', t => {
  const expected = {
    falcon9: ['kerolox', 'kerolox', 'kerolox'],
    'falcon-heavy': ['kerolox', 'kerolox', 'kerolox'],
    starship: ['methalox', 'methalox', 'methalox'],
    cz5: ['hydrolox', 'hydrolox', 'kerolox'],
    cz5b: ['hydrolox', null, 'kerolox'],
    cz7: ['kerolox', 'kerolox', 'kerolox'],
    cz8: ['kerolox', 'hydrolox', 'kerolox'],
    cz2f: ['hypergolic', 'hypergolic', 'hypergolic'],
  };
  for (const rocket of ROCKETS) {
    const plumes = createPlumes(rocket); t.after(() => plumes.dispose());
    const layers = plumes.group.children.filter(object => object.userData.layer);
    for (const layer of layers) {
      const index = layer.userData.layer === 'core' ? 0 : layer.userData.layer === 'upper' ? 1 : 2;
      assert.equal(layer.userData.propulsion, expected[rocket.id][index], `${rocket.id}/${layer.userData.layer}`);
    }
  }
});

test('Starship uses three large outer vacuum jets and three smaller inner sea-level jets', t => {
  const plumes = createPlumes('starship'); t.after(() => plumes.dispose());
  const upper = plumes.group.children.find(object => object.userData.layer === 'upper').children[0];
  const layout = upper.userData.nozzles;
  const vacuum = layout.filter(nozzle => nozzle.kind === 'vacuum');
  const sea = layout.filter(nozzle => nozzle.kind === 'sea-level');
  assert.equal(vacuum.length, 3); assert.equal(sea.length, 3);
  for (const nozzle of vacuum) assert.ok(Math.abs(Math.hypot(nozzle.position[0], nozzle.position[2]) - 2.72) < 1e-8);
  for (const nozzle of sea) assert.ok(Math.abs(Math.hypot(nozzle.position[0], nozzle.position[2]) - 1.05) < 1e-8);
  assert.ok(vacuum[0].radius > sea[0].radius);
  assert.ok(vacuum[0].position[1] < sea[0].position[1], 'different bell extensions remain aligned vertically');
});

test('CZ-2F upper main jet and four small verniers retain distinct scales', t => {
  const plumes = createPlumes('cz2f'); t.after(() => plumes.dispose());
  const upper = plumes.group.children.find(object => object.userData.layer === 'upper').children[0];
  const verniers = upper.userData.nozzles.filter(nozzle => nozzle.kind === 'vernier');
  assert.equal(upper.count, 5); assert.equal(verniers.length, 4);
  for (const nozzle of verniers) assert.ok(nozzle.radius < upper.userData.nozzles[0].radius / 3);
});

test('side-engine shutdown is independent of core shutdown and booster separation', t => {
  const plumes = createPlumes('falcon-heavy'); t.after(() => plumes.dispose());
  const core = plumes.group.children.find(object => object.userData.layer === 'core');
  const sides = plumes.group.children.filter(object => object.userData.layer?.startsWith('booster-'));
  plumes.update({ time: 149, firstEngineOn: true, secondEngineOn: false, boostersEngineOn: true, boostersSeparated: false });
  assert.ok(sides.every(side => side.visible));
  plumes.update({ time: 151, firstEngineOn: true, secondEngineOn: false, boostersEngineOn: false, boostersSeparated: false });
  assert.equal(core.visible, true);
  assert.ok(sides.every(side => !side.visible), 'side jets stop before the boosters physically separate');
  plumes.update({ time: -4, firstEngineOn: true, secondEngineOn: false, boostersEngineOn: true, boostersSeparated: false });
  assert.ok(sides.every(side => side.visible), 'negative ignition time is supplied by simulation rather than hard-coded');
  plumes.update({ time: 470, firstEngineOn: false, secondEngineOn: true, boostersEngineOn: true, booster: { engineOn: true } }, { boosterOnly: true });
  assert.equal(core.visible, true);
  assert.ok(sides.every(side => !side.visible));
  assert.equal(plumes.group.children.find(object => object.userData.layer === 'upper').visible, false);
});

test('jet flicker leaves each mouth anchored and upperBase changes only upper-stage jets', t => {
  const plumes = createPlumes('starship'); t.after(() => plumes.dispose());
  const upper = plumes.group.children.find(object => object.userData.layer === 'upper').children[0];
  const core = plumes.group.children.find(object => object.userData.layer === 'core').children[0];
  plumes.update({ time: 0, firstEngineOn: true, secondEngineOn: true });
  const originalUpper = plumeMouths(upper), originalCore = plumeMouths(core);
  plumes.update({ time: 13.2, firstEngineOn: true, secondEngineOn: true });
  assertSameMouths(plumeMouths(upper), originalUpper, 'animated upper mouths');
  plumes.update({ time: 20, firstEngineOn: true, secondEngineOn: true }, { upperBase: 76.1 });
  const moved = plumeMouths(upper);
  moved.forEach((position, index) => assert.ok(Math.abs(position.y - originalUpper[index].y - 5) < 1e-5));
  assertSameMouths(plumeMouths(core), originalCore, 'core mouths stay fixed');
  assert.doesNotThrow(() => { plumes.dispose(); plumes.dispose(); });
});
