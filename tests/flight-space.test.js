import test from 'node:test';
import assert from 'node:assert/strict';
import { EARTH_RADIUS, flightPose } from '../src/flight-space.js';
import { DURATION, sampleFlight } from '../src/simulation.js';

function close(actual, expected, tolerance = 1e-8, message = '') {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} differs from ${expected}`);
}

test('ground coordinates retain the launch mount and attached booster pose', () => {
  assert.equal(EARTH_RADIUS, 6371000);
  for (const time of [-10, -3, 0]) {
    const pose = flightPose(sampleFlight(time));
    assert.deepEqual(pose.vehicle, { x: 0, y: 3.2, z: 0, rotation: -0 });
    assert.deepEqual(pose.booster, pose.vehicle);
  }
});

test('the vehicle follows the stated sphere and local-vertical rotation formulas', () => {
  for (const time of [67, 148, 195, 514, 3086, DURATION]) {
    const state = sampleFlight(time);
    const pose = flightPose(state).vehicle;
    const arc = state.downrange / EARTH_RADIUS;
    const radius = EARTH_RADIUS + state.altitude;
    close(pose.x, radius * Math.sin(arc));
    close(pose.y, radius * Math.cos(arc) - EARTH_RADIUS + 3.2);
    close(pose.z, 0);
    close(pose.rotation, -(arc + state.pitch));
    close(Math.hypot(pose.x, pose.y + EARTH_RADIUS - 3.2), radius, 1e-7);
  }
});

test('ninety-degree pitch points along the local forward orbital tangent', () => {
  for (const time of [514, 1000, 2000, 3086, DURATION]) {
    const state = sampleFlight(time);
    const pose = flightPose(state).vehicle;
    const arc = state.downrange / EARTH_RADIUS;
    // Rotating model +Y around Z yields (-sin(rotation), cos(rotation)).
    const forwardX = -Math.sin(pose.rotation);
    const forwardY = Math.cos(pose.rotation);
    close(forwardX, Math.cos(arc));
    close(forwardY, -Math.sin(arc));
    close(forwardX * Math.sin(arc) + forwardY * Math.cos(arc), 0);
  }
});

test('the booster remains co-located through separation and has a continuous first detached frame', () => {
  for (const time of [100, 147.999, 148]) {
    const pose = flightPose(sampleFlight(time));
    assert.deepEqual(pose.booster, pose.vehicle);
  }
  const before = flightPose(sampleFlight(147.999)).booster;
  const exact = flightPose(sampleFlight(148)).booster;
  const after = flightPose(sampleFlight(148.001)).booster;
  for (const adjacent of [before, after]) {
    assert.ok(Math.hypot(adjacent.x - exact.x, adjacent.y - exact.y, adjacent.z - exact.z) < 3);
    assert.ok(Math.abs(adjacent.rotation - exact.rotation) < 0.001);
  }
});

test('landing offset starts at T+250 and follows smoothstep instead of a landed flag', () => {
  for (const time of [249.999, 250, 365, 480]) {
    const state = sampleFlight(time);
    const pose = flightPose(state).booster;
    const arc = state.booster.downrange / EARTH_RADIUS;
    const radius = EARTH_RADIUS + state.booster.altitude;
    const fraction = Math.min(1, Math.max(0, (time - 250) / 230));
    const blend = fraction * fraction * (3 - 2 * fraction);
    close(pose.x, radius * Math.sin(arc) - 350 * blend);
    close(pose.y, radius * Math.cos(arc) - EARTH_RADIUS + 3.2 - 2.25 * blend);
    close(pose.z, 200 * blend);
    close(pose.rotation, -(arc + state.booster.pitch));
    const toggled = { ...state, booster: { ...state.booster, landed: !state.booster.landed } };
    assert.deepEqual(flightPose(toggled), flightPose(state));
  }
});

test('the last approach frame is continuous with touchdown and the landing pose remains fixed', () => {
  const before = flightPose(sampleFlight(479.999)).booster;
  const touchdown = flightPose(sampleFlight(480)).booster;
  assert.ok(Math.hypot(before.x - touchdown.x, before.y - touchdown.y, before.z - touchdown.z) < 0.05);
  close(touchdown.x, -350);
  close(touchdown.y, 0.95);
  close(touchdown.z, 200);
  close(touchdown.rotation, 0);
  for (const time of [480.001, 514, 3086, DURATION]) {
    assert.deepEqual(flightPose(sampleFlight(time)).booster, touchdown);
  }
});

test('non-recovering stages never receive the Falcon landing offset at T+480', () => {
  const state = {
    ...sampleFlight(480),
    hasRecovery: false,
    booster: { altitude: 32000, downrange: 170000, pitch: 1.2, engineOn: false, landed: false },
  };
  const pose = flightPose(state).booster;
  const arc = state.booster.downrange / EARTH_RADIUS;
  const radius = EARTH_RADIUS + state.booster.altitude;
  close(pose.x, radius * Math.sin(arc));
  close(pose.y, radius * Math.cos(arc) - EARTH_RADIUS + 3.2);
  close(pose.z, 0);
  close(pose.rotation, -(arc + state.booster.pitch));

  const recoveryPose = flightPose({ ...state, hasRecovery: true }).booster;
  close(recoveryPose.x, pose.x - 350);
  close(recoveryPose.y, pose.y - 2.25);
  close(recoveryPose.z, pose.z + 200);
  const { hasRecovery, ...legacyState } = state;
  assert.deepEqual(flightPose(legacyState).booster, recoveryPose);
});

test('world positions and rotations remain finite throughout the entire mission', () => {
  for (let time = -10; time <= DURATION; time += 0.25) {
    const pose = flightPose(sampleFlight(time));
    for (const subject of ['vehicle', 'booster']) {
      for (const field of ['x', 'y', 'z', 'rotation']) {
        assert.ok(Number.isFinite(pose[subject][field]), `${subject}.${field} must be finite at ${time}`);
      }
    }
  }
});
