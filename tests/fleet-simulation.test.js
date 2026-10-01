import test from 'node:test';
import assert from 'node:assert/strict';
import { getMission, FleetSimulation } from '../src/fleet-simulation.js';
import { EVENTS, DURATION, sampleFlight, LaunchSimulation } from '../src/simulation.js';
import { flightPose } from '../src/flight-space.js';

const IDS = ['falcon9', 'falcon-heavy', 'starship', 'cz5', 'cz5b', 'cz7', 'cz8', 'cz2f'];
const close = (left, right, tolerance = 1e-7) => assert.ok(Math.abs(left - right) < tolerance, `${left} is not close to ${right}`);

test('each vehicle has its own ordered mission and explicit accuracy metadata', () => {
  for (const id of IDS) {
    const mission = getMission(id);
    assert.equal(mission.id, id);
    assert.equal(new Set(mission.events.map((entry) => entry.id)).size, mission.events.length);
    assert.equal(mission.events.at(-1).time, mission.duration);
    assert.ok(mission.events.every((entry, index) => index === 0 || entry.time >= mission.events[index - 1].time));
    assert.ok(mission.label && mission.description && mission.accuracy && mission.completionLabel);
    if (id !== 'falcon9') {
      assert.ok(mission.duration >= 600 && mission.duration <= 1200);
      assert.match(mission.accuracy, /教学编排/);
      assert.ok(mission.events.every((entry) => /不是实飞任务记录/.test(entry.detail)));
      assert.notDeepEqual(mission.events.map((entry) => entry.time), EVENTS.map((entry) => entry.time));
    }
  }
});

test('Falcon 9 exactly preserves every original sampled field, event and duration', () => {
  const fleet = new FleetSimulation();
  assert.equal(fleet.mission.duration, DURATION);
  assert.equal(fleet.mission.events, EVENTS);
  for (let time = -10; time <= DURATION; time += 3.5) {
    fleet.seek(time);
    const original = sampleFlight(time);
    const inherited = Object.fromEntries(Object.keys(original).map((key) => [key, fleet.state[key]]));
    assert.deepEqual(inherited, original);
  }
  const original = new LaunchSimulation();
  fleet.reset();
  for (const simulation of [fleet, original]) {
    simulation.launch(); simulation.setRate(20); simulation.update(8); simulation.togglePause(); simulation.update(100);
  }
  assert.equal(fleet.time, original.time);
  assert.equal(fleet.status, original.status);
  assert.deepEqual(fleet.events, original.events);
});

test('large advances complete every mission without dropping events or inventing a Starship payload', () => {
  for (const id of IDS) {
    const simulation = new FleetSimulation(id);
    simulation.launch();
    const state = simulation.update(100000);
    assert.equal(simulation.status, 'complete');
    assert.equal(state.time, simulation.mission.duration);
    assert.equal(state.rocketId, id);
    assert.equal(state.deployed, id !== 'starship');
    assert.equal(state.firstEngineOn, false);
    assert.equal(state.secondEngineOn, false);
    assert.deepEqual(simulation.lastEvents, simulation.mission.events);
    assert.deepEqual(simulation.events, simulation.mission.events);
    assert.equal(state.completionLabel, simulation.mission.completionLabel);
    simulation.update(1);
    assert.deepEqual(simulation.lastEvents, []);
  }
});

test('backwards seeking reconstructs separation, fairing, escape and deployed states', () => {
  for (const id of IDS) {
    const simulation = new FleetSimulation(id);
    const initial = simulation.state;
    simulation.seek(Infinity);
    assert.equal(simulation.status, 'paused');
    simulation.seek(300);
    const middle = simulation.state;
    simulation.seek(0);
    assert.equal(simulation.state.deployed, false);
    assert.equal(simulation.state.separated, false);
    assert.equal(simulation.state.boostersSeparated, false);
    assert.equal(simulation.state.fairingSeparated, false);
    assert.equal(simulation.state.escapeTowerJettisoned, false);
    simulation.seek(300);
    assert.deepEqual(simulation.state, middle);
    simulation.seek(-10);
    assert.deepEqual(simulation.state, initial);
    assert.deepEqual(simulation.events, []);
  }
});

test('vehicle changes and reset clear playback but retain the selected mission', () => {
  const simulation = new FleetSimulation('cz5');
  simulation.launch(); simulation.setRate(50); simulation.update(15);
  simulation.setRocket('cz2f');
  assert.equal(simulation.rocketId, 'cz2f');
  assert.equal(simulation.mission.id, 'cz2f');
  assert.equal(simulation.time, -10);
  assert.equal(simulation.rate, 1);
  assert.equal(simulation.status, 'ready');
  assert.deepEqual(simulation.events, []);
  assert.deepEqual(simulation.lastEvents, []);
  simulation.launch(); simulation.update(660); simulation.reset();
  assert.equal(simulation.rocketId, 'cz2f');
  assert.equal(simulation.time, -10);
  assert.equal(simulation.status, 'ready');
  assert.throws(() => simulation.setRocket('missing'), RangeError);
  assert.equal(simulation.rocketId, 'cz2f', 'invalid selection does not partly mutate the mission');
  assert.throws(() => getMission('__proto__'), RangeError);
});

test('pause, resume, rates, invalid deltas and clamped seeks share the original playback contract', () => {
  const simulation = new FleetSimulation('cz8');
  simulation.togglePause(); simulation.update(10);
  assert.equal(simulation.status, 'ready');
  assert.equal(simulation.time, -10);
  simulation.launch(); simulation.setRate(5); simulation.update(2);
  assert.equal(simulation.time, 0);
  simulation.togglePause(); simulation.update(100);
  assert.equal(simulation.time, 0);
  simulation.togglePause(); simulation.update(2);
  assert.equal(simulation.time, 10);
  for (const delta of [-1, NaN, Infinity, undefined, '10']) simulation.update(delta);
  assert.equal(simulation.time, 10);
  for (const rate of [0, -1, NaN, Infinity, '2']) assert.throws(() => simulation.setRate(rate), RangeError);
  simulation.seek(-Infinity);
  assert.equal(simulation.time, -10);
  simulation.seek(Infinity);
  assert.equal(simulation.time, simulation.mission.duration);
  assert.equal(simulation.status, 'paused');
  simulation.launch();
  assert.equal(simulation.status, 'complete');
});

test('Falcon Heavy side boosters separate while the central core is still attached and firing', () => {
  const simulation = new FleetSimulation('falcon-heavy');
  const { boosterTime, stageSeparationTime } = simulation.mission;
  assert.ok(boosterTime < stageSeparationTime);
  simulation.seek(boosterTime - .001);
  assert.equal(simulation.state.boostersSeparated, false);
  simulation.seek(boosterTime);
  assert.equal(simulation.state.boostersSeparated, true);
  assert.equal(simulation.state.boosterSeparationElapsed, 0);
  assert.equal(simulation.state.separated, false);
  assert.equal(simulation.state.firstEngineOn, true);
  simulation.seek(stageSeparationTime);
  assert.equal(simulation.state.separated, true);
  close(simulation.state.booster.altitude, simulation.state.altitude);
  close(simulation.state.booster.downrange, simulation.state.downrange);
  close(simulation.state.booster.pitch, simulation.state.pitch);
  simulation.seek(480);
  assert.equal(simulation.state.booster.landed, true);
  assert.equal(simulation.state.booster.engineOn, false);
  assert.match(simulation.mission.accuracy, /独立的假设教学情景/);
});

test('side-booster engines use their own ignition and cutoff boundaries for every vehicle', () => {
  const starts = { 'falcon-heavy': -4, cz5: -5, cz5b: -5, cz7: -4, cz8: -4, cz2f: -3 };
  for (const id of IDS) {
    const simulation = new FleetSimulation(id);
    assert.equal(typeof simulation.state.boostersEngineOn, 'boolean');
    if (id === 'falcon9' || id === 'starship') {
      for (const time of [-10, -6, -5, -4, -3, 0, 100, 150, 175, 500, simulation.mission.duration]) {
        simulation.seek(time);
        assert.equal(simulation.state.boostersEngineOn, false, `${id} has no side boosters`);
      }
      continue;
    }
    const cutoff = simulation.mission.events.find((entry) => entry.id === 'booster-cutoff')?.time ?? simulation.mission.boosterTime;
    simulation.seek(starts[id] - .001);
    assert.equal(simulation.state.boostersEngineOn, false, `${id} before ignition`);
    simulation.seek(starts[id]);
    assert.equal(simulation.state.boostersEngineOn, true, `${id} at ignition`);
    simulation.seek(cutoff - .001);
    assert.equal(simulation.state.boostersEngineOn, true, `${id} before cutoff`);
    simulation.seek(cutoff);
    assert.equal(simulation.state.boostersEngineOn, false, `${id} at cutoff`);
    if (cutoff < simulation.mission.boosterTime) assert.equal(simulation.state.boostersSeparated, false);
    simulation.seek(simulation.mission.duration);
    assert.equal(simulation.state.boostersEngineOn, false);
    simulation.seek(starts[id]);
    assert.equal(simulation.state.boostersEngineOn, true, `${id} backwards seek restores engines`);
    simulation.reset();
    assert.equal(simulation.state.boostersEngineOn, false);
  }
});

test('Falcon Heavy keeps its central core burning during the side-booster cutoff-to-separation interval', () => {
  const simulation = new FleetSimulation('falcon-heavy');
  for (const time of [150, 152, 154.999]) {
    simulation.seek(time);
    assert.equal(simulation.state.boostersEngineOn, false);
    assert.equal(simulation.state.boostersSeparated, false);
    assert.equal(simulation.state.firstEngineOn, true);
  }
  simulation.seek(155);
  assert.equal(simulation.state.boostersSeparated, true);
  assert.equal(simulation.state.boostersEngineOn, false);
  simulation.seek(149);
  assert.equal(simulation.state.boostersEngineOn, true);
  assert.equal(simulation.state.boostersSeparated, false);
});

test('Starship ignites Ship before separation and never adds fairing, deployment or landing events', () => {
  const simulation = new FleetSimulation('starship');
  simulation.seek(171);
  assert.equal(simulation.state.firstEngineOn, true);
  assert.equal(simulation.state.secondEngineOn, true);
  assert.equal(simulation.state.separated, false);
  simulation.seek(simulation.mission.stageSeparationTime);
  assert.equal(simulation.state.separated, true);
  assert.equal(simulation.state.secondEngineOn, true);
  assert.equal(simulation.state.firstEngineOn, false);
  assert.equal(simulation.mission.fairingTime, null);
  assert.equal(simulation.mission.recoveryTime, null);
  assert.equal(simulation.mission.kind, 'suborbital');
  assert.ok(!simulation.mission.events.some((entry) => /fairing|payload|recovery|landing/.test(entry.id)));
  for (let time = -10; time <= simulation.mission.duration; time += 5) {
    simulation.seek(time);
    assert.equal(simulation.state.fairingSeparated, false);
    assert.equal(simulation.state.deployed, false);
    assert.equal(simulation.state.hasRecovery, false);
    assert.equal(simulation.state.booster.landed, false);
    assert.equal(simulation.state.boostersSeparated, false);
  }
  simulation.seek(Infinity);
  assert.match(simulation.state.completionLabel, /亚轨道/);
  assert.doesNotMatch(simulation.state.completionLabel, /入轨|部署/);
});

test('CZ-5B uses one core, separates lateral boosters, and never invents an upper-stage ignition', () => {
  const simulation = new FleetSimulation('cz5b');
  assert.equal(simulation.mission.stageSeparationTime, null);
  assert.ok(!simulation.mission.events.some((entry) => /stage-separation|ses-|seco-/.test(entry.id)));
  for (let time = -10; time <= simulation.mission.duration; time += 2) {
    simulation.seek(time);
    assert.equal(simulation.state.isSingleStage, true);
    assert.equal(simulation.state.separated, false);
    assert.equal(simulation.state.secondEngineOn, false);
    assert.equal(simulation.state.stageSeparationElapsed, 0);
  }
  simulation.seek(simulation.mission.boosterTime);
  assert.equal(simulation.state.boostersSeparated, true);
  assert.equal(simulation.state.firstEngineOn, true);
  simulation.seek(Infinity);
  assert.equal(simulation.state.deployed, true);
  const twoStage = new FleetSimulation('cz5');
  twoStage.seek(500);
  assert.equal(twoStage.state.isSingleStage, false);
  assert.equal(twoStage.state.separated, true);
  assert.equal(twoStage.state.secondEngineOn, true);
});

test('CZ-2F jettisons its escape tower before fairing and crew spacecraft separation', () => {
  const simulation = new FleetSimulation('cz2f');
  const tower = simulation.mission.events.find((entry) => entry.id === 'escape-tower-jettison');
  assert.ok(tower.time < simulation.mission.fairingTime);
  assert.equal(simulation.mission.kind, 'crewed');
  simulation.seek(tower.time - .001);
  assert.equal(simulation.state.escapeTowerJettisoned, false);
  simulation.seek(tower.time);
  assert.equal(simulation.state.escapeTowerJettisoned, true);
  assert.equal(simulation.state.escapeElapsed, 0);
  assert.equal(simulation.state.fairingSeparated, false);
  simulation.seek(tower.time + 3);
  assert.equal(simulation.state.escapeElapsed, 3);
  simulation.seek(Infinity);
  assert.equal(simulation.state.deployed, true);
  assert.match(simulation.state.completionLabel, /载人飞船分离/);
  assert.equal(simulation.mission.events.at(-1).id, 'spacecraft-separation');
});

test('only the two Falcon missions permit a recovery; no Long March mission reports a landing', () => {
  for (const id of IDS) {
    const simulation = new FleetSimulation(id);
    const expected = ['falcon9', 'falcon-heavy'].includes(id);
    assert.equal(simulation.mission.hasRecovery, expected);
    assert.equal(simulation.mission.recoveryTime === null, !expected);
    for (let time = -10; time <= simulation.mission.duration; time += 11) {
      simulation.seek(time);
      assert.equal(simulation.state.hasRecovery, expected);
      if (!expected) assert.equal(simulation.state.booster.landed, false);
    }
  }
});

test('optional event elapsed values start at their own boundaries and remain nonnegative', () => {
  for (const id of IDS) {
    const simulation = new FleetSimulation(id);
    const pairs = [['boosterTime','boostersSeparated','boosterSeparationElapsed'], ['stageSeparationTime','separated','stageSeparationElapsed'], ['fairingTime','fairingSeparated','fairingElapsed']];
    for (const [timeField, flagField, elapsedField] of pairs) {
      const time = simulation.mission[timeField];
      if (time === null) continue;
      simulation.seek(time - .001);
      assert.equal(simulation.state[flagField], false);
      assert.equal(simulation.state[elapsedField], 0);
      simulation.seek(time);
      assert.equal(simulation.state[flagField], true);
      assert.equal(simulation.state[elapsedField], 0);
      simulation.seek(time + 2);
      close(simulation.state[elapsedField], 2);
    }
  }
});

test('small and large advances produce the same endpoint and exact-once event sequence for every vehicle', () => {
  for (const id of IDS) {
    const fine = new FleetSimulation(id), coarse = new FleetSimulation(id);
    fine.launch(); coarse.launch();
    const seen = [];
    for (let time = -10; time < fine.mission.duration; time += 1) {
      fine.update(1); seen.push(...fine.lastEvents.map((entry) => entry.id));
    }
    coarse.update(100000);
    assert.deepEqual(fine.state, coarse.state);
    assert.deepEqual(seen, fine.mission.events.map((entry) => entry.id));
  }
});

test('all vehicles retain finite, nonnegative continuous trajectories and compatibility with flightPose', () => {
  for (const id of IDS) {
    const simulation = new FleetSimulation(id);
    for (let time = -10; time <= simulation.mission.duration; time += .5) {
      simulation.seek(time);
      const state = simulation.state;
      for (const field of ['altitude','velocity','downrange','pitch','boosterSeparationElapsed','stageSeparationElapsed','fairingElapsed','escapeElapsed']) {
        assert.ok(Number.isFinite(state[field]) && state[field] >= 0, `${id}: ${field} at ${time}`);
      }
      for (const field of ['altitude','downrange','pitch']) {
        assert.ok(Number.isFinite(state.booster[field]) && state.booster[field] >= 0, `${id}: booster.${field} at ${time}`);
      }
      const pose = flightPose(state);
      for (const subject of ['vehicle','booster']) {
        assert.ok(Object.values(pose[subject]).every(Number.isFinite), `${id}: finite ${subject} world pose at ${time}`);
      }
    }
    for (const entry of simulation.mission.events) {
      simulation.seek(entry.time - .000001);
      const before = simulation.state;
      simulation.seek(entry.time + .000001);
      const after = simulation.state;
      for (const field of ['altitude','velocity','downrange','pitch']) {
        close(before[field], after[field], .1);
      }
      for (const field of ['altitude','downrange','pitch']) close(before.booster[field], after.booster[field], .1);
    }
  }
});
