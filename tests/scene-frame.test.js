import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FleetSimulation } from '../src/fleet-simulation.js';
import { flightPose } from '../src/flight-space.js';
import { computeFramePlacement, observerAltitude } from '../src/rendering/scene/frame-placement.js';
import { flightLighting } from '../src/rendering/scene/environment.js';

function sample(id, time) {
  const sim = new FleetSimulation(id);
  sim.seek(time);
  return sim.state;
}
const close = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} versus ${expected}`);

test('pad elevation changes the launch origin without changing published vehicle dimensions', () => {
  const state = sample('starship', -10),
    snapshot = JSON.stringify(state);
  const frame = computeFramePlacement(state, { mount: 20 });
  close(frame.primaryWorld.y, 20);
  close(frame.primaryWorld.distanceTo(frame.anchor), 0);
  assert.equal(JSON.stringify(state), snapshot, 'placement is a pure calculation');
});

test('recoverable booster tracking and studio modes choose the correct origin', () => {
  const state = sample('falcon9', 400);
  const follow = computeFramePlacement(state, { subject: 'booster' });
  assert.equal(follow.boosterActive, true);
  close(follow.anchor.distanceTo(follow.boosterWorld), 0);
  for (const mode of ['structure', 'assembly']) {
    const studio = computeFramePlacement(state, { mode, subject: 'booster' });
    assert.equal(studio.boosterActive, false);
    assert.equal(studio.isStudio, true);
    assert.deepEqual(studio.anchor.toArray(), [0, 0, 0]);
    assert.equal(studio.altitude, 0);
  }
});

test('expendable first stage starts attached and blends into its independent trajectory', () => {
  const state = sample('cz5', 400);
  const start = computeFramePlacement({ ...state, separated: true, stageSeparationElapsed: 0 }, { mount: 5 });
  close(start.primaryWorld.distanceTo(start.boosterWorld), 0);
  close(start.primaryRotation, start.boosterRotation);
  const near = computeFramePlacement(
    { ...state, separated: true, stageSeparationElapsed: 0.001 },
    { mount: 5 },
  );
  assert.ok(near.primaryWorld.distanceTo(near.boosterWorld) < 0.01, 'no initial separation teleport');
  const later = computeFramePlacement(
    { ...state, separated: true, stageSeparationElapsed: 35 },
    { mount: 5 },
  );
  const pose = flightPose(state).booster;
  close(later.boosterWorld.x, pose.x);
  close(later.boosterWorld.y, pose.y + 1.8);
  close(later.boosterWorld.z, pose.z);
});

test('atmosphere follows observer altitude even when a ground camera tracks a rocket in space', () => {
  const anchor = new THREE.Vector3(1500000, 210000, 0);
  const localGroundCamera = new THREE.Vector3(180, 40, 220).sub(anchor);
  assert.ok(observerAltitude(localGroundCamera, anchor) < 41);
  close(observerAltitude(new THREE.Vector3(0, 250000, 0), new THREE.Vector3()), 250000);
});

test('flight lighting keeps ground haze and transitions to orbital lighting for both quality levels', () => {
  const ground = flightLighting(0, 'cinema', 'desert');
  assert.equal(ground.air, 1);
  close(ground.environmentIntensity, 1.18);
  assert.equal(ground.groundColor, '#927a57');
  assert.equal(ground.fogVisible, true);
  assert.equal(ground.starOpacity, 0);
  const orbit = flightLighting(200000, 'standard', 'tropical');
  assert.equal(orbit.air, 0);
  close(orbit.exposure, 1.08);
  close(orbit.environmentIntensity, 0.06);
  assert.equal(orbit.fogVisible, false);
  close(orbit.starOpacity, 0.85);
  assert.equal(orbit.groundColor, '#365936');
});
