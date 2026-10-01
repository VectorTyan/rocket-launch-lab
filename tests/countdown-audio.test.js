import test from 'node:test';
import assert from 'node:assert/strict';
import { createCountdownAudio } from '../src/features/launch/countdown-audio.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

class FakeAudio {
  constructor(url) {
    this.src = url;
    this.originalUrl = url;
  }
  listeners = new Map();
  requests = [];
  pauseCalls = 0;
  loadCalls = 0;
  currentTime = 0;
  paused = true;
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }
  removeEventListener(type, callback) {
    this.listeners.get(type)?.delete(callback);
  }
  play() {
    this.paused = false;
    const request = deferred();
    this.requests.push(request);
    return request.promise;
  }
  pause() {
    this.pauseCalls++;
    this.paused = true;
  }
  load() {
    this.loadCalls++;
  }
  removeAttribute(name) {
    if (name === 'src') this.src = '';
  }
  emit(type, event = { type }) {
    for (const callback of [...(this.listeners.get(type) || [])]) callback(event);
  }
  resolve(index = this.requests.length - 1) {
    // Deliberately emulate a platform starting playback after pause/unload.
    this.paused = false;
    this.requests[index].resolve();
  }
  reject(error = new Error('play denied'), index = this.requests.length - 1) {
    this.requests[index].reject(error);
  }
  get listenerCount() {
    return [...this.listeners.values()].reduce((count, callbacks) => count + callbacks.size, 0);
  }
}

const cue = (number = 10, extra = {}) => ({
  visible: true,
  phase: 'count',
  number,
  cueId: `count-${number}`,
  running: true,
  paused: false,
  revision: 1,
  ...extra,
});
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
function fixture(t, options = {}) {
  const audios = [],
    errors = [];
  const player = createCountdownAudio({
    createAudio: (url) => {
      const audio = new FakeAudio(url);
      audios.push(audio);
      return audio;
    },
    onError: (error) => errors.push(error),
    ...options,
  });
  t.after(() => player.dispose());
  return { player, audios, errors };
}

test('factory is explicit and only recognized local cue URLs can be requested', (t) => {
  assert.equal(typeof document, 'undefined');
  assert.throws(() => createCountdownAudio(), TypeError);
  const f = fixture(t);
  for (const cueId of ['count-0', 'count-11', '../outside', 'https://elsewhere/audio.wav', '', null]) {
    f.player.update(cue(10, { cueId }));
  }
  assert.equal(f.audios.length, 0);
  f.player.update(cue(10));
  assert.equal(f.audios[0].originalUrl, '/assets/countdown/count-10.wav');
  assert.equal(f.audios[0].preload, 'auto');
  assert.equal(f.audios[0].autoplay, false);
  assert.equal(f.audios[0].loop, false);
});

test('the first play call stays synchronous with launch and repeated frames never restart it', async (t) => {
  const f = fixture(t);
  const snapshot = f.player.update(cue(10));
  assert.equal(f.audios.length, 1);
  assert.equal(f.audios[0].requests.length, 1, 'play was invoked before update returned');
  assert.equal(snapshot.status, 'starting');
  for (let i = 0; i < 20; i++) f.player.update(cue(10));
  assert.equal(f.audios[0].requests.length, 1);
  f.audios[0].resolve();
  await settle();
  assert.equal(f.player.state.status, 'playing');
  f.player.update(cue(10));
  assert.equal(f.audios[0].requests.length, 1);
});

test('new cues interrupt old audio and late resolutions cannot revive a stale clip', async (t) => {
  const f = fixture(t);
  f.player.update(cue(10));
  const old = f.audios[0],
    oldEnded = [...old.listeners.get('ended')][0];
  f.player.update(cue(9));
  const current = f.audios[1];
  assert.equal(old.paused, true);
  assert.equal(old.src, '');
  assert.equal(old.listenerCount, 0);
  assert.equal(old.loadCalls, 1);
  current.resolve();
  await settle();
  old.resolve();
  oldEnded();
  await settle();
  assert.equal(old.paused, true);
  assert.equal(current.paused, false);
  assert.equal(f.player.state.cueId, 'count-9');
  assert.equal(f.player.state.status, 'playing');
  assert.equal(f.errors.length, 0);
});

test('fast progression drops skipped numbers and never queues speech behind ignition or liftoff', (t) => {
  const f = fixture(t);
  f.player.update(cue(10));
  f.player.update(cue(4));
  f.player.update(cue(null, { phase: 'ignition', cueId: 'ignition' }));
  f.player.update(cue(null, { phase: 'liftoff', cueId: 'liftoff' }));
  assert.deepEqual(
    f.audios.map((audio) => audio.originalUrl),
    [
      '/assets/countdown/count-10.wav',
      '/assets/countdown/count-4.wav',
      '/assets/countdown/ignition.wav',
      '/assets/countdown/liftoff.wav',
    ],
  );
  assert.ok(f.audios.slice(0, -1).every((audio) => audio.paused && audio.listenerCount === 0));
  assert.equal(f.player.state.cueId, 'liftoff');
});

test('pause preserves the current clip and playhead; resume continues it once', async (t) => {
  const f = fixture(t);
  f.player.update(cue(6));
  const audio = f.audios[0];
  audio.resolve();
  await settle();
  audio.currentTime = 0.37;
  f.player.update(cue(6, { running: false, paused: true }));
  assert.equal(audio.currentTime, 0.37);
  assert.equal(audio.paused, true);
  assert.equal(audio.loadCalls, 0);
  assert.equal(f.player.state.status, 'paused');
  f.player.update(cue(6, { running: false, paused: true }));
  assert.equal(audio.pauseCalls, 1);
  f.player.update(cue(6));
  assert.equal(f.audios.length, 1);
  assert.equal(audio.requests.length, 2);
  assert.equal(audio.currentTime, 0.37);
  audio.resolve();
  await settle();
  assert.equal(f.player.state.status, 'playing');
});

test('late play completion after a pause cannot unpause the clip', async (t) => {
  const f = fixture(t);
  f.player.update(cue(5));
  const audio = f.audios[0];
  audio.currentTime = 0.2;
  f.player.update(cue(5, { running: false, paused: true }));
  audio.resolve();
  await settle();
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 0.2);
  assert.equal(f.player.state.status, 'paused');
  assert.equal(f.errors.length, 0);
});

test('a stale pre-pause request cannot pause or reject a newer resume request on the same audio', async (t) => {
  const f = fixture(t);
  f.player.update(cue(5));
  const audio = f.audios[0];
  f.player.update(cue(5, { running: false, paused: true }));
  f.player.update(cue(5));
  assert.equal(audio.requests.length, 2);
  audio.resolve(0);
  await settle();
  assert.equal(audio.paused, false);
  assert.equal(f.player.state.status, 'starting');
  assert.equal(f.player.state.pending, true);
  audio.resolve(1);
  await settle();
  assert.equal(f.player.state.status, 'playing');
  assert.equal(f.errors.length, 0);
});

test('a paused new cue does not pre-play and discards the old cue rather than resuming it', (t) => {
  const f = fixture(t);
  f.player.update(cue(8));
  const old = f.audios[0];
  f.player.update(cue(7, { running: false, paused: true }));
  assert.equal(old.paused, true);
  assert.equal(old.loadCalls, 1);
  assert.equal(f.audios.length, 1);
  f.player.update(cue(7));
  assert.equal(f.audios.length, 2);
  assert.equal(f.player.state.cueId, 'count-7');
});

test('ended cues are consumed once per revision, while a new revision permits the same cue', async (t) => {
  const f = fixture(t);
  f.player.update(cue(10));
  const first = f.audios[0];
  first.resolve();
  await settle();
  first.emit('ended');
  assert.equal(f.player.state.status, 'ended');
  assert.equal(first.listenerCount, 0);
  for (let i = 0; i < 5; i++) f.player.update(cue(10));
  assert.equal(f.audios.length, 1);
  f.player.update(cue(9));
  f.player.update(cue(10));
  assert.equal(f.audios.length, 2, 'same-revision rewind does not replay consumed speech');
  f.player.update(cue(10, { revision: 2 }));
  assert.equal(f.audios.length, 3);
  assert.equal(f.player.state.cueId, 'count-10');
});

test('hidden and manual-seek frames are silent and invalidate pending playback and queued events', async (t) => {
  const f = fixture(t);
  f.player.update(cue(10, { visible: false }));
  assert.equal(f.audios.length, 0);
  f.player.update(cue(10));
  const old = f.audios[0],
    oldError = [...old.listeners.get('error')][0];
  f.player.update(cue(10, { visible: false }));
  old.resolve();
  oldError({ type: 'error' });
  await settle();
  assert.equal(old.paused, true);
  assert.equal(f.errors.length, 0);
  assert.equal(f.player.state.status, 'idle');
  f.player.update(cue(10));
  assert.equal(f.audios.length, 1, 'returning to the old cue does not resurrect it');
  f.player.update(cue(7, { visible: false, running: false }));
  assert.equal(f.audios.length, 1);
  f.player.update(cue(6));
  assert.equal(f.audios.length, 2);
  assert.equal(f.player.state.cueId, 'count-6');
});

test('a minimal hidden update stops speech without inventing a new mission revision', (t) => {
  const f = fixture(t);
  f.player.update(cue(7, { revision: 12 }));
  f.player.update({ visible: false });
  assert.equal(f.player.state.revision, 12);
  assert.equal(f.audios[0].paused, true);
  f.player.update(cue(7, { revision: 12 }));
  assert.equal(f.audios.length, 1);
});

test('muting stops audio and unmuting plays only the latest still-valid cue', async (t) => {
  const f = fixture(t);
  f.player.update(cue(10));
  const old = f.audios[0];
  f.player.setEnabled(false);
  assert.equal(old.paused, true);
  assert.equal(f.player.state.status, 'muted');
  f.player.update(cue(9));
  f.player.update(cue(8));
  assert.equal(f.audios.length, 1);
  f.player.setEnabled(true);
  assert.equal(f.audios.length, 2);
  assert.equal(f.player.state.cueId, 'count-8');
  f.player.setEnabled(true);
  assert.equal(f.audios.length, 2);
  f.audios[1].resolve();
  old.resolve();
  await settle();
  assert.equal(old.paused, true);
  assert.equal(f.audios[1].paused, false);
  f.player.setEnabled(false);
  f.player.update(cue(7, { running: false, paused: true }));
  f.player.setEnabled(true);
  assert.equal(f.audios.length, 2, 'unmuting while paused waits for resume');
  f.player.update(cue(7));
  assert.equal(f.audios.length, 3);
});

test('play rejection and resource errors notify once per revision without retries or blocking later cues', async (t) => {
  const f = fixture(t);
  f.player.update(cue(10));
  const first = f.audios[0];
  const failed = [...first.listeners.get('error')][0];
  first.reject();
  await settle();
  failed({ type: 'error' });
  assert.equal(f.errors.length, 1);
  assert.equal(f.errors[0].reason, 'play-rejected');
  assert.equal(f.errors[0].cueId, 'count-10');
  f.player.update(cue(10));
  assert.equal(f.audios.length, 1);
  f.player.update(cue(9));
  f.audios[1].emit('error');
  assert.equal(f.errors.length, 1);
  f.player.update(cue(10, { revision: 2 }));
  f.audios[2].emit('error');
  assert.equal(f.errors.length, 2);
  assert.equal(f.errors[1].revision, 2);
  assert.equal(f.errors[1].reason, 'resource-error');
  f.player.update(cue(9, { revision: 2 }));
  f.audios[3].resolve();
  await settle();
  assert.equal(f.player.state.status, 'playing');
});

test('stale play rejection after pause or revision reset is ignored', async (t) => {
  const f = fixture(t);
  f.player.update(cue(3));
  const first = f.audios[0];
  f.player.update(cue(3, { running: false, paused: true }));
  first.reject(new Error('interrupted by pause'));
  await settle();
  assert.equal(f.errors.length, 0);
  assert.equal(f.player.state.status, 'paused');
  f.player.update(cue(3));
  const pendingResume = first.requests.length - 1;
  f.player.update(cue(3, { revision: 2 }));
  first.reject(new Error('old revision'), pendingResume);
  await settle();
  assert.equal(f.errors.length, 0);
  assert.equal(f.player.state.revision, 2);
  assert.equal(f.player.state.status, 'starting');
});

test('synchronous factory, play and notification failures cannot escape into simulation updates', async (t) => {
  let attempts = 0,
    notifications = 0;
  const f = fixture(t, {
    createAudio: (url) => {
      attempts++;
      if (attempts === 1) throw new Error('Audio unavailable');
      const audio = new FakeAudio(url);
      audio.play = () => {
        throw new Error('play failed');
      };
      return audio;
    },
    onError() {
      notifications++;
      throw new Error('notification failed');
    },
  });
  assert.doesNotThrow(() => f.player.update(cue(10)));
  assert.equal(f.player.state.status, 'error');
  f.player.update(cue(10));
  assert.equal(attempts, 1);
  assert.doesNotThrow(() => f.player.update(cue(9)));
  assert.equal(attempts, 2);
  assert.equal(notifications, 1);
  await settle();
});

test('ready frames never speak and external snapshot mutation cannot change the pending cue', (t) => {
  const f = fixture(t),
    input = cue(10, { running: false });
  f.player.update(input);
  assert.equal(f.audios.length, 0);
  input.running = true;
  f.player.setEnabled(false);
  f.player.setEnabled(true);
  assert.equal(f.audios.length, 0);
  f.player.update(input);
  assert.equal(f.audios.length, 1);
  assert.ok(Object.isFrozen(f.player.state));
});

test('dispose is idempotent, detaches listeners and silences late promise/event work', async (t) => {
  const f = fixture(t);
  f.player.update(cue(4));
  const audio = f.audios[0],
    ended = [...audio.listeners.get('ended')][0];
  f.player.dispose();
  const pauseCalls = audio.pauseCalls;
  f.player.dispose();
  assert.equal(audio.pauseCalls, pauseCalls);
  assert.equal(audio.loadCalls, 1);
  assert.equal(audio.listenerCount, 0);
  assert.equal(audio.src, '');
  audio.resolve();
  ended();
  await settle();
  assert.equal(audio.paused, true);
  assert.equal(f.player.state.status, 'disposed');
  assert.equal(f.errors.length, 0);
  f.player.update(cue(3, { revision: 9 }));
  f.player.setEnabled(true);
  assert.equal(f.audios.length, 1);
});
