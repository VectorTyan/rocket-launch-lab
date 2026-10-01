import test from 'node:test';
import assert from 'node:assert/strict';
import { createMissionController } from '../src/features/launch/mission-controller.js';
import { createCountdownState, LIFTOFF_HOLD_SECONDS } from '../src/features/launch/countdown-state.js';
import { getMission } from '../src/fleet-simulation.js';

function fixture(id = 'falcon9') {
  let time = 0;
  const mission = createMissionController(id, { now: () => time });
  return {
    mission,
    set(ms) {
      time = ms;
    },
    tick(ms, renderDelta = 0.1) {
      time = ms;
      return mission.tick(time, renderDelta);
    },
  };
}

function close(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
}

const START_COUNTS = {
  falcon9: 7,
  'falcon-heavy': 6,
  starship: 4,
  cz5: 5,
  cz5b: 5,
  cz7: 6,
  cz8: 6,
  cz2f: 7,
};

for (const [id, expectedCount] of Object.entries(START_COUNTS)) {
  test(`${id}: countdown ends at its unchanged ignition event and holds 1x through liftoff plus 1.2 seconds`, () => {
    const f = fixture(id);
    const definition = getMission(id);
    const originalEvents = JSON.stringify(definition.events);
    const ignition = definition.events.find((event) => event.id === 'ignition').time;
    const liftoff = definition.events.find((event) => event.id === 'liftoff').time;
    f.mission.setRate(100);
    assert.equal(f.mission.frame().rate, 100);
    assert.equal(f.mission.frame().countdown.visible, false);
    assert.equal(f.mission.frame().countdown.cueId, null);
    f.mission.toggle();
    const revision = f.mission.frame().countdown.revision;
    for (let second = 0; second < expectedCount; second++) {
      const frame = f.tick(second * 1000);
      close(frame.time, -10 + second);
      assert.equal(frame.countdown.visible, true);
      assert.equal(frame.countdown.phase, 'count');
      assert.equal(frame.countdown.number, expectedCount - second);
      assert.equal(frame.countdown.cueId, `count-${expectedCount - second}`);
      assert.equal(frame.countdown.running, true);
      assert.equal(frame.countdown.paused, false);
      assert.equal(frame.countdown.revision, revision);
      assert.equal(frame.countdown.requestedRate, 100);
      assert.equal(frame.countdown.effectiveRate, 1);
      assert.equal(frame.rate, 1);
      assert.equal(frame.state.firstEngineOn, false);
    }
    const ignitionFrame = f.tick((ignition + 10) * 1000);
    assert.equal(ignitionFrame.time, ignition);
    assert.equal(ignitionFrame.countdown.ignitionTime, ignition);
    assert.equal(ignitionFrame.countdown.phase, 'ignition');
    assert.equal(ignitionFrame.countdown.cueId, 'ignition');
    assert.equal(ignitionFrame.countdown.number, null);
    assert.equal(ignitionFrame.state.firstEngineOn, true);
    assert.equal(ignitionFrame.timeline.currentEvent.id, 'ignition');
    const launchFrame = f.tick((liftoff + 10) * 1000);
    assert.equal(launchFrame.time, liftoff);
    assert.equal(launchFrame.countdown.liftoffTime, liftoff);
    assert.equal(launchFrame.countdown.phase, 'liftoff');
    assert.equal(launchFrame.countdown.cueId, 'liftoff');
    assert.equal(launchFrame.rate, 1);
    assert.equal(launchFrame.timeline.currentEvent.id, 'liftoff');
    assert.equal(f.tick(11199).countdown.visible, true);
    const released = f.tick(11200);
    close(released.time, liftoff + LIFTOFF_HOLD_SECONDS);
    assert.equal(released.rate, 100);
    assert.equal(released.countdown.visible, false);
    assert.equal(released.countdown.cueId, null);
    assert.ok(released.countdown.revision > revision);
    close(f.tick(11250).time, 6.2);
    assert.equal(
      JSON.stringify(definition.events),
      originalEvents,
      'the ceremony never rewrites mission events',
    );
  });
}

test('a slow frame crossing the release boundary splits elapsed time between 1x and 600x', () => {
  const f = fixture();
  f.mission.setRate(600);
  f.mission.toggle();
  const result = f.tick(11350);
  close(result.time, 1.2 + 0.15 * 600);
  assert.equal(result.rate, 600);
  assert.equal(result.countdown.visible, false);
  assert.ok(result.timeline.passedEventIds.includes('max-q'));
  assert.equal(result.state.time, result.time);
  assert.equal(result.timeline.time, result.time);
});

test('rate selections during counting, ignition and liftoff only change the requested post-ceremony rate', () => {
  const f = fixture();
  f.mission.setRate(600);
  f.mission.toggle();
  f.set(2500);
  f.mission.setRate(20);
  close(f.mission.frame().time, -7.5);
  assert.equal(f.mission.frame().rate, 1);
  assert.equal(f.mission.frame().countdown.requestedRate, 20);
  f.set(8500);
  f.mission.setRate(5);
  close(f.mission.frame().time, -1.5);
  assert.equal(f.mission.frame().countdown.phase, 'ignition');
  assert.equal(f.mission.frame().rate, 1);
  f.set(10900);
  f.mission.setRate(20);
  close(f.mission.frame().time, 0.9);
  assert.equal(f.mission.frame().countdown.phase, 'liftoff');
  const released = f.tick(11300);
  close(released.time, 1.2 + 0.1 * 20);
  assert.equal(released.countdown.requestedRate, 20);
  assert.equal(released.rate, 20);
});

test('a rate click just after release settles the preceding interval at the previously requested multiplier', () => {
  const f = fixture();
  f.mission.setRate(20);
  f.mission.toggle();
  f.tick(11000);
  f.set(11250);
  f.mission.setRate(100);
  close(f.mission.frame().time, 1.2 + 0.05 * 20);
  assert.equal(f.mission.frame().rate, 100);
  close(f.tick(11300).time, 7.2);
});

test('a pause just before the release boundary preserves only its remaining normal-speed interval', () => {
  const f = fixture();
  f.mission.setRate(600);
  f.mission.toggle();
  f.set(11000);
  f.mission.toggle();
  close(f.mission.frame().time, 1);
  f.tick(60000);
  f.mission.toggle();
  close(f.tick(60050).time, 1.05);
  assert.equal(f.mission.frame().rate, 1);
  close(f.tick(60250).time, 31.2);
  assert.equal(f.mission.frame().rate, 600);
});

test('pausing retains the current cue without advancing, rerunning or changing ceremony identity', () => {
  const f = fixture();
  f.mission.setRate(100);
  f.mission.toggle();
  f.set(2400);
  f.mission.toggle();
  const paused = f.mission.frame();
  close(paused.time, -7.6);
  assert.equal(paused.countdown.number, 5);
  assert.equal(paused.countdown.paused, true);
  assert.equal(paused.countdown.running, false);
  assert.equal(paused.countdown.visible, true);
  f.tick(60000);
  close(f.mission.frame().time, paused.time);
  assert.equal(f.mission.frame().countdown.revision, paused.countdown.revision);
  f.mission.setRate(600);
  assert.equal(f.mission.frame().rate, 1);
  f.mission.toggle();
  const resumed = f.tick(60250);
  close(resumed.time, -7.35);
  assert.equal(resumed.countdown.revision, paused.countdown.revision);
  assert.equal(resumed.countdown.cueId, paused.countdown.cueId);
  assert.equal(resumed.countdown.requestedRate, 600);
});

test('leaving launch hides and pauses the ceremony; returning requires an explicit resume without catch-up', () => {
  const f = fixture();
  f.mission.setRate(20);
  f.mission.toggle();
  f.set(600);
  f.mission.setMode('structure');
  const paused = f.mission.frame();
  close(paused.time, -9.4);
  assert.equal(paused.countdown.visible, false);
  assert.equal(paused.countdown.paused, true);
  f.tick(30000);
  f.mission.setMode('assembly');
  f.tick(90000);
  f.mission.setMode('launch');
  assert.equal(f.mission.frame().status, 'paused');
  close(f.mission.frame().time, paused.time);
  assert.equal(f.mission.frame().countdown.visible, true);
  assert.equal(f.mission.frame().countdown.revision, paused.countdown.revision);
  f.mission.toggle();
  close(f.tick(90600).time, -8.8);
  assert.equal(f.mission.frame().rate, 1);
});

test('background suspension pauses a pending ignition and never catches up or resumes automatically', () => {
  const f = fixture();
  f.mission.toggle();
  f.set(6500);
  assert.equal(f.mission.setVisible(false), false);
  const paused = f.mission.frame();
  close(paused.time, -3.5);
  assert.equal(paused.countdown.number, 1);
  assert.equal(paused.countdown.visible, false);
  f.tick(120000);
  assert.equal(f.mission.setVisible(true), true);
  assert.equal(f.mission.setVisible(true), false);
  assert.equal(f.mission.frame().status, 'paused');
  close(f.tick(180000).time, -3.5);
  f.mission.toggle();
  const ignition = f.tick(180500);
  close(ignition.time, -3);
  assert.equal(ignition.countdown.cueId, 'ignition');
  assert.equal(ignition.countdown.revision, paused.countdown.revision);
});

test('seeking cancels cues and restores the selected speed even when the seek returns to T-10', () => {
  const f = fixture();
  f.mission.setRate(20);
  f.mission.toggle();
  const revision = f.mission.frame().countdown.revision;
  f.mission.seek(-10);
  const sought = f.mission.frame();
  assert.equal(sought.status, 'paused');
  assert.equal(sought.rate, 20);
  assert.equal(sought.countdown.visible, false);
  assert.equal(sought.countdown.phase, null);
  assert.equal(sought.countdown.cueId, null);
  assert.ok(sought.countdown.revision > revision);
  f.mission.toggle();
  const replayFromSeek = f.tick(500);
  close(replayFromSeek.time, 0);
  assert.equal(replayFromSeek.countdown.visible, false, 'timeline scrubbing is not a fresh ready launch');
  assert.equal(replayFromSeek.countdown.cueId, null);
});

test('jump and next-event navigation cancel the ceremony, while unknown navigation does not disturb it', () => {
  const f = fixture();
  f.mission.setRate(600);
  f.mission.toggle();
  const before = f.mission.frame();
  assert.equal(f.mission.jump('missing'), null);
  assert.deepEqual(f.mission.frame().countdown, before.countdown);
  assert.equal(f.mission.nextEvent().id, 'ignition');
  assert.equal(f.mission.frame().time, -3);
  assert.equal(f.mission.frame().rate, 600);
  assert.equal(f.mission.frame().countdown.cueId, null);
  f.mission.reset();
  f.mission.setRate(100);
  f.mission.toggle();
  assert.equal(f.mission.jump('liftoff').id, 'liftoff');
  assert.equal(f.mission.frame().rate, 100);
  assert.equal(f.mission.frame().status, 'paused');
  assert.equal(f.mission.frame().countdown.visible, false);
});

test('reset and rocket changes clear the ceremony and pending speed, and invalid rocket selection remains atomic', () => {
  const f = fixture();
  f.mission.setRate(600);
  f.mission.toggle();
  const initialRevision = f.mission.frame().countdown.revision;
  f.mission.reset();
  assert.equal(f.mission.frame().status, 'ready');
  assert.equal(f.mission.frame().rate, 1);
  assert.equal(f.mission.frame().countdown.requestedRate, 1);
  assert.equal(f.mission.frame().countdown.visible, false);
  assert.ok(f.mission.frame().countdown.revision > initialRevision);
  f.mission.setRate(100);
  f.mission.toggle();
  f.mission.setRocket('starship');
  assert.equal(f.mission.frame().time, -10);
  assert.equal(f.mission.frame().status, 'ready');
  assert.equal(f.mission.frame().countdown.ignitionTime, -6);
  assert.equal(f.mission.frame().countdown.requestedRate, 1);
  f.mission.toggle();
  assert.equal(f.mission.frame().countdown.number, 4);
  const beforeInvalid = f.mission.frame();
  assert.throws(() => f.mission.setRocket('missing'), RangeError);
  assert.deepEqual(f.mission.frame(), beforeInvalid);
});

test('completion replay starts a new ceremony from ready and later restores the previously selected speed', () => {
  const f = fixture();
  f.mission.setRate(600);
  f.mission.seek(f.mission.mission.duration);
  const completed = f.mission.frame();
  assert.equal(completed.status, 'complete');
  f.mission.toggle();
  const replay = f.mission.frame();
  assert.equal(replay.status, 'running');
  assert.equal(replay.time, -10);
  assert.equal(replay.rate, 1);
  assert.equal(replay.countdown.number, 7);
  assert.equal(replay.countdown.requestedRate, 600);
  assert.ok(replay.countdown.revision > completed.countdown.revision);
  assert.equal(replay.showCompletion, false);
  close(f.tick(11250).time, 31.2);
  assert.equal(f.mission.frame().rate, 600);
});

test('invalid rate input neither consumes wall time nor corrupts the armed requested rate', () => {
  const f = fixture();
  f.mission.setRate(20);
  f.mission.toggle();
  f.set(1000);
  for (const rate of [0, -1, Infinity, NaN, '600']) assert.throws(() => f.mission.setRate(rate), RangeError);
  assert.equal(f.mission.frame().time, -10);
  assert.equal(f.mission.frame().rate, 1);
  assert.equal(f.mission.frame().countdown.requestedRate, 20);
  close(f.tick(1000).time, -9);
});

test('the countdown descriptor is a repeatable snapshot driven only by authoritative mission time', () => {
  const countdown = createCountdownState(getMission('falcon9'), 20);
  countdown.arm();
  const args = { time: -8.3, status: 'running', active: true, effectiveRate: 1 };
  const first = countdown.snapshot(args);
  assert.deepEqual(countdown.snapshot(args), first);
  first.number = 999;
  assert.equal(countdown.snapshot(args).number, 6);
  const paused = countdown.snapshot({ ...args, status: 'paused' });
  assert.equal(paused.revision, first.revision);
  assert.equal(paused.cueId, 'count-6');
  countdown.cancel();
  assert.equal(countdown.snapshot(args).cueId, null);
  assert.equal(countdown.requestedRate, 20);
  assert.throws(() => createCountdownState({ events: [] }), TypeError);
});
