import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ROCKETS } from '../src/fleet-data.js';
import { createVehicle } from '../src/fleet-model.js';

function fixture(t, rocket) {
  const vehicle = createVehicle(rocket);
  t.after(() => vehicle.dispose());
  return vehicle;
}

function close(actual, expected, message, tolerance = 1e-5) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${message}: ${actual} versus ${expected}`);
}

function bellCount(part) {
  let count = 0;
  part?.traverse(object => {
    if (object.isMesh && object.geometry.type === 'LatheGeometry' && object.material.name.endsWith('/nozzle')) {
      count += object.isInstancedMesh ? object.count : 1;
    }
  });
  return count;
}

for (const rocket of ROCKETS) {
  test(`${rocket.id}: geometry, selectable modules and engine layout match the published fleet record`, t => {
    const vehicle = fixture(t, rocket);
    const bounds = new THREE.Box3().setFromObject(vehicle.root);
    close(bounds.min.y, 0, 'engine bells define the model origin');
    close(bounds.max.y, rocket.height, 'full-height geometry');
    close(vehicle.height, rocket.height, 'reported height');
    assert.ok(vehicle.firstTop > 0 && vehicle.firstTop < vehicle.height);
    assert.ok(vehicle.upperBase >= vehicle.firstTop - 0.1 && vehicle.upperBase < vehicle.height);
    assert.equal(vehicle.root.userData.rocketId, rocket.id);
    assert.deepEqual([...vehicle.parts.keys()].sort(), [...rocket.moduleIds].sort());
    for (const [id, part] of vehicle.parts) {
      let meshes = 0;
      part.traverse(object => {
        assert.equal(object.userData.partId, id, `${id} can be selected through nested geometry`);
        if (object.isMesh) meshes++;
      });
      assert.ok(meshes > 0, `${id} has a visible surface`);
    }
    let launchEngines = bellCount(vehicle.parts.get('engines1'));
    for (let i = 1; i <= rocket.boosters; i++) launchEngines += bellCount(vehicle.parts.get(`booster-${i}`));
    assert.equal(launchEngines, rocket.liftoffEngineCount, 'main and side-booster nozzle count');
    assert.equal(bellCount(vehicle.parts.get('engine2')), rocket.secondStageEngines + (rocket.vernierEngines || 0), 'upper propulsion includes the documented verniers');
  });
}

test('CZ-5B remains a single-core-stage vehicle through separation flags', t => {
  const vehicle = fixture(t, 'cz5b');
  for (const id of ['stage2', 'engine2', 'interstage']) assert.equal(vehicle.parts.has(id), false);
  vehicle.setFlight({ time: 400, separated: true, boostersSeparated: true, boosterSeparationElapsed: 50 });
  assert.equal(vehicle.parts.get('stage1').visible, true, 'single core is not confused with a two-stage vehicle');
  assert.equal(vehicle.parts.get('engines1').visible, true);
  assert.equal(vehicle.parts.get('payload').visible, true);
});

test('expendable first stages can appear as detached hardware without enabling recovery mode', t => {
  const firstIds = new Set(['stage1', 'engines1', 'interstage', 'grid-fins', 'landing-legs']);
  for (const rocketId of ['cz5', 'cz7', 'cz8', 'cz2f']) {
    const vehicle = fixture(t, rocketId);
    const state = {
      time: 400, separated: true, detachedStageOnly: true,
      boostersSeparated: true, boosterSeparationElapsed: 5,
      fairingSeparated: true, fairingElapsed: 5,
      escapeTowerJettisoned: true, escapeTowerElapsed: 5,
      deployed: true, deploymentElapsed: 10,
    };
    vehicle.setFlight(state);
    for (const [id, part] of vehicle.parts) {
      assert.equal(part.visible, firstIds.has(id), `${rocketId}/${id} detached-stage visibility`);
    }
    vehicle.setFlight({ ...state, detachedStageOnly: false, boosterOnly: true });
    for (const [id, part] of vehicle.parts) {
      assert.equal(part.visible, false, `${rocketId}/${id} does not claim a recoverable booster`);
    }
  }
});

test('side boosters start separating without a position jump, drift away, and restore on seek', t => {
  for (const rocket of ROCKETS.filter(item => item.boosters > 0)) {
    const vehicle = fixture(t, rocket.id);
    const baseline = new Map();
    for (let i = 1; i <= rocket.boosters; i++) baseline.set(`booster-${i}`, vehicle.parts.get(`booster-${i}`).position.clone());
    vehicle.setFlight({ time: 140, boostersSeparated: true, boosterSeparationElapsed: 0 });
    for (const [id, position] of baseline) close(vehicle.parts.get(id).position.distanceTo(position), 0, `${rocket.id}/${id} starts at its attached pose`);
    vehicle.setFlight({ time: 145, boostersSeparated: true, boosterSeparationElapsed: 5 });
    for (const [id, position] of baseline) {
      const part = vehicle.parts.get(id);
      assert.equal(part.visible, true);
      assert.ok(Math.hypot(part.position.x, part.position.z) > Math.hypot(position.x, position.z));
      assert.ok(part.position.y < position.y);
    }
    vehicle.setFlight({ time: 171, boostersSeparated: true, boosterSeparationElapsed: 31 });
    for (const id of baseline.keys()) assert.equal(vehicle.parts.get(id).visible, false);
    vehicle.setFlight({ time: 120, boostersSeparated: false });
    for (const [id, position] of baseline) {
      assert.equal(vehicle.parts.get(id).visible, true);
      close(vehicle.parts.get(id).position.distanceTo(position), 0, 'rewound booster position');
    }
  }
});

test('Starship V3 keeps Ship, flaps and windward tiles together and has no jettisonable fairing', t => {
  const vehicle = fixture(t, 'starship');
  assert.equal(vehicle.parts.has('fairing-left'), false);
  assert.equal(vehicle.parts.has('fairing-right'), false);
  assert.equal(vehicle.parts.has('landing-legs'), false, 'Super Heavy is not given Falcon landing legs');
  assert.equal(vehicle.parts.get('grid-fins').children.length, 3, 'V3 has three grid fins');
  assert.equal(vehicle.root.userData.thermalProtectionSide, 'windward (-Z)');
  vehicle.setFlight({ time: 230, separated: true, fairingSeparated: true, fairingElapsed: 40, deployed: true, deploymentElapsed: 35 });
  for (const id of ['stage2', 'engine2', 'flaps', 'heatshield']) assert.equal(vehicle.parts.get(id).visible, true, `${id} stays with Ship`);
  for (const id of ['stage1', 'engines1', 'interstage', 'grid-fins']) assert.equal(vehicle.parts.get(id).visible, false);
  close(vehicle.parts.get('payload').position.y, 0, 'a generic deployment flag does not eject the illustrative Ship cargo');
  vehicle.setFlight({ time: 500, separated: true, boosterOnly: true, gridFinsDeployed: 1 });
  for (const id of ['stage1', 'engines1', 'interstage', 'grid-fins']) assert.equal(vehicle.parts.get(id).visible, true, `${id} stays with Super Heavy`);
  for (const id of ['stage2', 'engine2', 'flaps', 'heatshield', 'payload']) assert.equal(vehicle.parts.get(id).visible, false);
});

test('CZ-2F ejects its escape tower independently from Shenzhou and the payload fairing', t => {
  const vehicle = fixture(t, 'cz2f');
  assert.equal(vehicle.parts.has('spacecraft'), true);
  assert.equal(vehicle.parts.has('payload'), false);
  const tower = vehicle.parts.get('escape-tower');
  vehicle.setFlight({ time: 150, escapeTowerJettisoned: true, escapeTowerElapsed: 5 });
  assert.ok(tower.position.y > 0);
  assert.equal(tower.visible, true);
  for (const id of ['spacecraft', 'fairing-left', 'fairing-right']) assert.equal(vehicle.parts.get(id).visible, true);
  vehicle.setFlight({ time: 180, escapeTowerJettisoned: true, escapeTowerElapsed: 35 });
  assert.equal(tower.visible, false);
  vehicle.setFlight({ time: 140, escapeTowerJettisoned: false });
  assert.equal(tower.visible, true);
  close(tower.position.y, 0, 'tower restored before its release event');
});

test('every fleet model can return from flight to a fully assembled museum pose', t => {
  for (const rocket of ROCKETS) {
    const vehicle = fixture(t, rocket);
    const original = new THREE.Box3().setFromObject(vehicle.root);
    vehicle.setFlight({ time: 600, separated: true, boostersSeparated: true, boosterSeparationElapsed: 200, fairingSeparated: true, fairingElapsed: 200, escapeTowerJettisoned: true, escapeTowerElapsed: 200, deployed: true, deploymentElapsed: 35 });
    vehicle.setExplode(1);
    for (const [id, part] of vehicle.parts) assert.equal(part.visible, true, `${rocket.id}/${id} available in museum`);
    vehicle.setExplode(0);
    const restored = new THREE.Box3().setFromObject(vehicle.root);
    close(restored.min.distanceTo(original.min), 0, `${rocket.id} original minimum`);
    close(restored.max.distanceTo(original.max), 0, `${rocket.id} original maximum`);
    vehicle.selectPart('stage1');
    vehicle.selectPart(null);
    vehicle.root.traverse(object => { if (object.isMesh) assert.equal(object.material.emissive.getHex(), 0, 'highlight is reversible'); });
  }
});

test('unknown vehicle ids are rejected instead of silently displaying another rocket', () => {
  assert.throws(() => createVehicle('unknown-model'), RangeError);
});
