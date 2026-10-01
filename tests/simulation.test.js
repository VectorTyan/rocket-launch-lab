import test from 'node:test';
import assert from 'node:assert/strict';
import { DURATION, EVENTS, LaunchSimulation, sampleFlight } from '../src/simulation.js';

test('official example events are ordered and include the entire LEO sequence', () => {
  assert.deepEqual(EVENTS.map((event) => event.time), [-3, 0, 67, 145, 148, 156, 195, 514, 3086, 3090, 3390]);
  assert.equal(new Set(EVENTS.map((event) => event.id)).size, EVENTS.length);
  assert.equal(DURATION, 3390);
  for (const event of EVENTS) {
    assert.ok(event.label.length > 0);
    assert.ok(event.detail.length > 0);
  }
});

test('ground and final frames clamp safely at the simulation boundaries', () => {
  const initial = sampleFlight(-100);
  assert.equal(initial.time, -10);
  assert.equal(initial.altitude, 0);
  assert.equal(initial.velocity, 0);
  assert.equal(initial.firstEngineOn, false);
  assert.equal(initial.deployed, false);
  assert.equal(initial.booster.landed, false);
  const final = sampleFlight(DURATION + 100);
  assert.equal(final.time, DURATION);
  assert.equal(final.deployed, true);
  assert.equal(final.secondEngineOn, false);
  assert.equal(final.booster.landed, true);
  assert.equal(final.booster.altitude, 0);
  assert.equal(final.booster.downrange, 0);
  assert.deepEqual(sampleFlight(Infinity), final);
  assert.deepEqual(sampleFlight(-Infinity), initial);
  assert.deepEqual(sampleFlight(NaN), initial);
});

test('ignition, cutoff, separation and payload flags switch at exact event times', () => {
  const changes = [
    [-3, 'firstEngineOn', false, true],
    [145, 'firstEngineOn', true, false],
    [148, 'separated', false, true],
    [156, 'secondEngineOn', false, true],
    [195, 'fairingSeparated', false, true],
    [514, 'secondEngineOn', true, false],
    [3086, 'secondEngineOn', false, true],
    [3090, 'secondEngineOn', true, false],
    [3390, 'deployed', false, true],
  ];
  for (const [time, field, before, after] of changes) {
    assert.equal(sampleFlight(time - 0.001)[field], before, `${field} before ${time}`);
    assert.equal(sampleFlight(time)[field], after, `${field} at ${time}`);
  }
  assert.equal(sampleFlight(-0.001).altitude, 0);
  assert.ok(sampleFlight(0.001).altitude > 0);
  assert.notEqual(sampleFlight(66.999).phase, sampleFlight(67).phase);
});

test('the illustrative booster stays attached until separation and lands continuously', () => {
  for (const time of [-10, -3, 0, 100, 147.999, 148]) {
    const state = sampleFlight(time);
    assert.equal(state.booster.altitude, state.altitude);
    assert.equal(state.booster.downrange, state.downrange);
    assert.equal(state.booster.pitch, state.pitch);
  }
  for (const time of [148, 170, 180, 210, 250, 340, 365, 430, 450, 470, 480]) {
    const before = sampleFlight(time - 0.000001).booster;
    const after = sampleFlight(time + 0.000001).booster;
    assert.ok(Math.abs(after.altitude - before.altitude) < 0.01, `altitude continuous at ${time}`);
    assert.ok(Math.abs(after.downrange - before.downrange) < 0.01, `downrange continuous at ${time}`);
    assert.ok(Math.abs(after.pitch - before.pitch) < 0.001, `pitch continuous at ${time}`);
  }
  assert.equal(sampleFlight(479.999).booster.landed, false);
  assert.equal(sampleFlight(480).booster.landed, true);
  assert.equal(sampleFlight(480).booster.engineOn, false);
  assert.deepEqual(sampleFlight(480).booster, sampleFlight(DURATION).booster);
});

test('launch, pause, resume, playback speed and reset preserve expected state', () => {
  const simulation = new LaunchSimulation();
  assert.equal(simulation.time, -10);
  assert.equal(simulation.rate, 1);
  assert.equal(simulation.status, 'ready');
  simulation.update(20);
  simulation.togglePause();
  assert.equal(simulation.time, -10);
  assert.equal(simulation.status, 'ready');
  simulation.launch();
  simulation.update(10);
  assert.equal(simulation.time, 0);
  simulation.togglePause();
  simulation.update(100);
  assert.equal(simulation.status, 'paused');
  assert.equal(simulation.time, 0);
  simulation.setRate(20);
  simulation.togglePause();
  simulation.update(5);
  assert.equal(simulation.status, 'running');
  assert.equal(simulation.time, 100);
  simulation.launch();
  assert.equal(simulation.time, 100, 'repeated launch does not restart');
  simulation.reset();
  assert.equal(simulation.status, 'ready');
  assert.equal(simulation.time, -10);
  assert.equal(simulation.rate, 1);
  assert.deepEqual(simulation.events, []);
  assert.deepEqual(simulation.lastEvents, []);
});

test('seeking pauses and reconstructs flags and event history in either direction', () => {
  const simulation = new LaunchSimulation();
  simulation.launch();
  simulation.seek(200);
  assert.equal(simulation.status, 'paused');
  assert.equal(simulation.state.fairingSeparated, true);
  assert.equal(simulation.events.at(-1).id, 'fairing-separation');
  simulation.update(100);
  assert.equal(simulation.time, 200);
  simulation.seek(0);
  assert.equal(simulation.state.separated, false);
  assert.equal(simulation.state.fairingSeparated, false);
  assert.deepEqual(simulation.events.map((event) => event.id), ['ignition', 'liftoff']);
  simulation.seek(10000);
  assert.equal(simulation.time, DURATION);
  assert.equal(simulation.status, 'paused');
  simulation.launch();
  assert.equal(simulation.status, 'complete');
  simulation.seek(-1000);
  assert.equal(simulation.time, -10);
  assert.equal(simulation.status, 'paused');
});

test('one large update reports every crossed event in order and completes once', () => {
  const simulation = new LaunchSimulation();
  simulation.launch();
  const final = simulation.update(10000);
  assert.equal(simulation.status, 'complete');
  assert.equal(final.time, DURATION);
  assert.equal(final.deployed, true);
  assert.deepEqual(simulation.lastEvents, EVENTS);
  assert.deepEqual(simulation.events, EVENTS);
  simulation.update(10);
  assert.deepEqual(simulation.lastEvents, []);
  assert.equal(simulation.time, DURATION);
});

test('events on exact boundaries are emitted once and small/large steps agree', () => {
  const fine = new LaunchSimulation();
  fine.launch();
  const seen = [];
  for (let index = 0; index < 3400; index += 1) {
    fine.update(1);
    seen.push(...fine.lastEvents.map((event) => event.id));
  }
  const coarse = new LaunchSimulation();
  coarse.launch();
  coarse.update(3400);
  assert.deepEqual(seen, EVENTS.map((event) => event.id));
  assert.deepEqual(fine.state, coarse.state);
});

test('invalid deltas do not corrupt time and playback rates must be positive finite numbers', () => {
  const simulation = new LaunchSimulation();
  simulation.launch();
  for (const delta of [-1, NaN, Infinity, -Infinity, undefined, '1']) {
    simulation.update(delta);
    assert.equal(simulation.time, -10);
  }
  for (const rate of [0, -1, NaN, Infinity, undefined, '2']) {
    assert.throws(() => simulation.setRate(rate), RangeError);
  }
  simulation.setRate(0.5);
  simulation.update(2);
  assert.equal(simulation.time, -9);
  simulation.setRate(Number.MAX_VALUE);
  simulation.update(Number.MAX_VALUE);
  assert.equal(simulation.time, DURATION, 'overflowing time advance clamps to completion');
});

test('every sampled flight value is finite, nonnegative where appropriate, and in angle bounds', () => {
  for (let time = -10; time <= DURATION; time += 0.25) {
    const state = sampleFlight(time);
    for (const field of ['time', 'altitude', 'velocity', 'downrange', 'pitch']) {
      assert.ok(Number.isFinite(state[field]), `${field} finite at ${time}`);
    }
    for (const field of ['altitude', 'velocity', 'downrange', 'pitch']) {
      assert.ok(state[field] >= 0, `${field} nonnegative at ${time}`);
    }
    for (const field of ['altitude', 'downrange', 'pitch']) {
      assert.ok(Number.isFinite(state.booster[field]), `booster ${field} finite at ${time}`);
      assert.ok(state.booster[field] >= 0, `booster ${field} nonnegative at ${time}`);
    }
    assert.ok(state.pitch <= Math.PI / 2);
    assert.ok(state.booster.pitch <= Math.PI);
  }
});
