import test from 'node:test';
import assert from 'node:assert/strict';
import { timelineProgress, timelineTime, timelinePresentation, missionAnimationTimes, MissionClock } from '../src/mission-timeline.js';
import { FleetSimulation, getMission } from '../src/fleet-simulation.js';
import { LaunchSimulation, sampleFlight, EVENTS } from '../src/simulation.js';
import { createVehicle } from '../src/fleet-model.js';

const IDS = ['falcon9', 'falcon-heavy', 'starship', 'cz5', 'cz5b', 'cz7', 'cz8', 'cz2f'];
function close(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
}

test('timeline position and inverse use the exact same linear countdown-to-completion scale', () => {
  for (const id of IDS) {
    const mission = getMission(id);
    assert.equal(timelineProgress(-10, mission.duration), 0);
    assert.equal(timelineProgress(mission.duration, mission.duration), 1);
    assert.equal(timelineProgress(-Infinity, mission.duration), 0);
    assert.equal(timelineProgress(Infinity, mission.duration), 1);
    assert.equal(timelineProgress(NaN, mission.duration), 0);
    for (const event of mission.events) {
      close(timelineTime(timelineProgress(event.time, mission.duration), mission.duration), event.time);
    }
  }
});

test('Falcon 9 early markers stay near the start rather than being uniformly spread across its 56-minute mission', () => {
  const presentation = timelinePresentation(getMission('falcon9'), 148);
  const position = id => presentation.markers.find(marker => marker.id === id).percent;
  close(position('max-q'), 77 / 3400 * 100);
  close(position('stage-separation'), 158 / 3400 * 100);
  close(position('fairing-separation'), 205 / 3400 * 100);
  close(position('recovery-landing'), 490 / 3400 * 100);
  assert.equal(position('payload-deployment'), 100);
  close(presentation.percent, position('stage-separation'));
  assert.equal(presentation.currentEvent.id, 'stage-separation');
  assert.equal(presentation.nextEvent.id, 'ses-1');
});

test('recovery markers are sorted at their actual illustrative time and are not duplicated for Falcon Heavy', () => {
  for (const id of IDS) {
    const mission = getMission(id);
    const snapshot = timelinePresentation(mission, 480);
    const recovery = snapshot.markers.filter(marker => marker.kind === 'recovery');
    assert.equal(recovery.length, mission.hasRecovery ? 1 : 0);
    if (mission.hasRecovery) {
      assert.equal(recovery[0].time, mission.recoveryTime);
      assert.equal(recovery[0].target, 'booster');
      assert.ok(snapshot.markers.indexOf(recovery[0]) < snapshot.markers.length - 1);
    }
    assert.ok(snapshot.markers.every((marker, index) => index === 0 || marker.time >= snapshot.markers[index - 1].time));
  }
});

test('current, next and passed event states derive from one time snapshot and reverse correctly after seeking', () => {
  for (const id of IDS) {
    const mission = getMission(id);
    const before = timelinePresentation(mission, -10);
    assert.equal(before.currentEvent, null);
    assert.equal(before.nextEvent.id, mission.events[0].id);
    const final = timelinePresentation(mission, mission.duration);
    assert.equal(final.percent, 100);
    assert.equal(final.nextEvent, null);
    assert.equal(final.currentEvent.time, mission.duration);
    for (const event of mission.events) {
      const at = timelinePresentation(mission, event.time);
      assert.ok(at.passedEventIds.includes(event.id));
      const prior = timelinePresentation(mission, event.time - .001);
      assert.ok(!prior.passedEventIds.includes(event.id));
      assert.ok(at.markers.filter(marker => marker.passed).every(marker => marker.time <= at.time));
    }
    assert.deepEqual(timelinePresentation(mission, -10), before);
  }
});

test('timeline presentation never alters mission definitions or public Falcon event dates', () => {
  const before = JSON.stringify(EVENTS);
  const mission = getMission('falcon9');
  const snapshot = timelinePresentation(mission, 1000);
  snapshot.markers[0].label = 'changed returned copy';
  snapshot.markers.reverse();
  assert.equal(JSON.stringify(EVENTS), before);
  assert.deepEqual(EVENTS.map(event => event.time), [-3,0,67,145,148,156,195,514,3086,3090,3390]);
});

test('a between-frame rate click settles old elapsed time at its old speed before using the new multiplier', () => {
  for (const Simulation of [FleetSimulation, LaunchSimulation]) {
    const sim = new Simulation();
    sim.launch();
    const clock = new MissionClock(sim, 0);
    clock.setRate(600, 40); // Forty milliseconds at 1× happened before the click.
    close(sim.time, -9.96);
    clock.advance(50); // Only the following ten milliseconds run at 600×.
    close(sim.time, -3.96);
    clock.setRate(1, 80); // Thirty milliseconds still belong to 600×.
    close(sim.time, 14.04);
    clock.advance(100);
    close(sim.time, 14.06);
    assert.deepEqual(clock.drainEvents().map(event => event.id), ['ignition', 'liftoff']);
    assert.deepEqual(clock.drainEvents(), []);
  }
});

test('mixed playback speeds cross event boundaries once and do not restart the clock or animations', () => {
  const sim = new FleetSimulation();
  sim.seek(130); sim.launch();
  const clock = new MissionClock(sim, 0);
  clock.advance(16);
  clock.setRate(600, 25);
  clock.advance(50);
  clock.setRate(20, 53);
  clock.advance(120);
  clock.setRate(1, 150);
  clock.advance(300);
  close(sim.time, 148.915);
  close(sim.state.stageSeparationElapsed, .915);
  assert.deepEqual(clock.drainEvents().map(event => event.id), ['meco', 'stage-separation']);
  const snapshot = timelinePresentation(sim.mission, sim.time);
  assert.equal(snapshot.currentEvent.id, 'stage-separation');
});

test('a slow render frame at 600× advances the full wall duration and reports every crossed event', () => {
  const sim = new FleetSimulation();
  sim.launch(); sim.setRate(600);
  const clock = new MissionClock(sim, 0);
  const first = clock.advance(250);
  close(first.realDeltaSeconds, .25);
  close(first.missionDeltaSeconds, 150);
  close(sim.time, 140);
  clock.advance(1000);
  close(sim.time, 590);
  assert.deepEqual(clock.drainEvents(), sim.mission.events.filter(event => event.time <= 590));
  clock.advance(100000);
  assert.equal(sim.status, 'complete');
  assert.equal(sim.time, sim.mission.duration);
});

test('paused/inactive periods and rebases never accumulate a hidden catch-up interval', () => {
  const sim = new FleetSimulation();
  const clock = new MissionClock(sim, 0);
  clock.advance(100);
  assert.equal(sim.time, -10);
  sim.launch(); clock.advance(200);
  close(sim.time, -9.9);
  clock.advance(10000, false);
  close(sim.time, -9.9);
  clock.advance(10100);
  close(sim.time, -9.8);
  sim.togglePause(); clock.advance(20000);
  close(sim.time, -9.8);
  sim.seek(195); clock.rebase(30000); sim.launch();
  clock.advance(30100);
  close(sim.time, 195.1);
  assert.deepEqual(clock.drainEvents(), []);
});

test('clock handles a first timestamp and ignores reversed or invalid timestamps without double advancing', () => {
  const sim = new FleetSimulation(); sim.launch();
  const clock = new MissionClock(sim);
  clock.advance(1000);
  assert.equal(sim.time, -10);
  clock.advance(900); clock.advance(NaN); clock.advance(Infinity);
  assert.equal(sim.time, -10);
  clock.advance(1100);
  close(sim.time, -9.9);
  assert.throws(() => clock.setRate(0, 5000), RangeError);
  clock.advance(1200);
  close(sim.time, -9.8);
});

test('animation elapsed aliases are based on mission events rather than the first rendered frame', () => {
  const mission = getMission('cz2f');
  const elapsed = missionAnimationTimes(mission, 130);
  assert.equal(elapsed.escapeElapsed, 14);
  assert.equal(elapsed.escapeTowerElapsed, 14);
  assert.equal(elapsed.escapeTowerJettisonElapsed, 14);
  assert.equal(elapsed.fairingElapsed, 0);
  const before = missionAnimationTimes(mission, 115);
  assert.equal(before.escapeTowerElapsed, 0);
  assert.equal(missionAnimationTimes(getMission('cz5b'), 620).stageSeparationElapsed, 0);
  const ship = missionAnimationTimes(getMission('starship'), 900);
  assert.equal(ship.fairingElapsed, 0);
  assert.equal(ship.deploymentElapsed, 0);
});

test('late first observation of a CZ-2F escape-tower event matches a continuously observed model', t => {
  const sim = new FleetSimulation('cz2f');
  const direct = createVehicle('cz2f'), stepped = createVehicle('cz2f');
  t.after(() => { direct.dispose(); stepped.dispose(); });
  sim.seek(116); stepped.setFlight(sim.state);
  sim.seek(130); stepped.setFlight(sim.state); direct.setFlight(sim.state);
  assert.equal(sim.state.escapeTowerElapsed, 14);
  assert.deepEqual(direct.parts.get('escape-tower').position.toArray(), stepped.parts.get('escape-tower').position.toArray());
  assert.ok(direct.parts.get('escape-tower').position.y > 70);
});

test('the original Falcon sampler provides deterministic fairing elapsed time after a fast jump or fresh model', t => {
  const model = createVehicle('falcon9');
  t.after(() => model.dispose());
  const state = sampleFlight(218);
  assert.equal(state.fairingElapsed, 23);
  model.setFlight(state);
  assert.equal(model.parts.get('fairing-left').visible, false);
  assert.equal(model.parts.get('fairing-right').visible, false);
  model.setFlight(sampleFlight(195));
  assert.equal(model.parts.get('fairing-left').visible, true);
  model.setFlight(sampleFlight(194));
  assert.equal(model.parts.get('fairing-left').rotation.z, 0);
});
