import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreferences, browserStorage } from '../src/app/preferences.js';
import { createScope, createDom, setPressed } from '../src/app/lifecycle.js';
import { createFrameLoop } from '../src/app/frame-loop.js';
import { createAssemblyProgressStore } from '../src/features/assembly/progress-store.js';
import { createMissionController } from '../src/features/launch/mission-controller.js';
import { createEngineSound } from '../src/features/audio/engine-sound.js';

class MemoryStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
  }
  getItem(key) {
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

function scheduledCallbacks() {
  let nextId = 0;
  const pending = new Map();
  return {
    pending,
    schedule(callback) {
      const id = ++nextId;
      pending.set(id, callback);
      return id;
    },
    cancel(id) {
      pending.delete(id);
    },
    fireNext(time) {
      const entry = pending.entries().next().value;
      assert.ok(entry, 'a callback is scheduled');
      pending.delete(entry[0]);
      entry[1](time);
    },
  };
}

function manualClock(start = 0) {
  let time = start;
  return {
    now: () => time,
    set: (value) => {
      time = value;
    },
    advance: (value) => {
      time += value;
      return time;
    },
  };
}

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
}

test('preferences read and write the existing karman storage format without disturbing unrelated keys', () => {
  const storage = new MemoryStorage({
    'karman.rocket': 'cz5b',
    'karman.quality': 'standard',
    'another.app': 'leave me',
  });
  const preferences = createPreferences(storage);
  assert.equal(preferences.get('rocket'), 'cz5b');
  assert.equal(preferences.get('missing', 'default'), 'default');
  assert.equal(preferences.set('studio-theme', 'playful'), true);
  const reloaded = createPreferences(storage);
  assert.equal(reloaded.get('studio-theme'), 'playful');
  assert.equal(storage.getItem('another.app'), 'leave me');
  assert.equal(storage.getItem('rocket'), null, 'the legacy namespace remains authoritative');
});

test('denied browser storage falls back to the current session without losing new preferences', () => {
  const window = Object.defineProperty({}, 'localStorage', {
    get() {
      throw new Error('blocked');
    },
  });
  assert.equal(browserStorage(window), null);
  const storage = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('quota exceeded');
    },
  };
  const preferences = createPreferences(storage);
  assert.equal(preferences.get('rocket', 'falcon9'), 'falcon9');
  assert.equal(preferences.persistent, false);
  assert.equal(preferences.set('rocket', 'cz8'), false);
  assert.equal(preferences.get('rocket'), 'cz8');
  const memoryOnly = createPreferences(null);
  assert.equal(memoryOnly.set('quality', 'standard'), false);
  assert.equal(memoryOnly.get('quality'), 'standard');
});

test('malformed and non-object preference documents yield an empty record', () => {
  for (const saved of ['{broken', 'null', '[]', '42', 'true', '"text"', '']) {
    const preferences = createPreferences(new MemoryStorage({ 'karman.assembly-progress': saved }));
    assert.deepEqual(preferences.object('assembly-progress'), {}, saved);
    assert.equal(createAssemblyProgressStore(preferences).get('falcon9').progress, 0);
  }
});

test('legacy assembly progress restores legal steps and selection, then saves a reloadable current snapshot', () => {
  const storage = new MemoryStorage({
    'karman.assembly-progress': JSON.stringify({
      falcon9: { placed: ['stage1', 'engines1', 'interstage'], guided: false, selectedId: 'stage2' },
      cz5b: { placed: ['stage1'], guided: true },
    }),
  });
  const progress = createAssemblyProgressStore(createPreferences(storage));
  const game = progress.get('falcon9');
  assert.deepEqual([...game.placed], ['stage1', 'engines1', 'interstage']);
  assert.equal(game.guided, false);
  assert.equal(game.selectedId, 'stage2');
  assert.equal(game.place().ok, true);
  assert.equal(progress.save(game), true);
  const reloaded = createAssemblyProgressStore(createPreferences(storage));
  assert.ok(reloaded.get('falcon9').placed.has('stage2'));
  assert.deepEqual([...reloaded.get('cz5b').placed], ['stage1'], 'saving one rocket retains other rockets');
  assert.equal(reloaded.get('falcon9').undo().partId, 'stage2', 'restored history still supports undo');
});

test('hostile snapshots cannot inject rockets, modules, completion flags or prototype properties', () => {
  const saved =
    '{"__proto__":{"polluted":true},"constructor":{"placed":["stage1"]},"fake-rocket":{"placed":["stage1"]},"falcon9":{"rocketId":"starship","placed":["<img src=x>",null,{},"stage2","stage1","stage1","engines1"],"selectedId":"__proto__","completed":true,"progress":1,"total":1}}';
  const storage = new MemoryStorage({ 'karman.assembly-progress': saved });
  const progress = createAssemblyProgressStore(createPreferences(storage));
  const game = progress.get('falcon9');
  assert.equal(game.rocketId, 'falcon9');
  assert.deepEqual([...game.placed], ['stage1', 'engines1']);
  assert.equal(game.completed, false);
  assert.ok(game.progress > 0 && game.progress < 1);
  assert.equal(game.selectedId, 'interstage');
  assert.equal(Object.prototype.polluted, undefined);
  for (const id of ['__proto__', 'constructor', 'fake-rocket'])
    assert.throws(() => progress.get(id), RangeError);
  progress.save(game);
  const clean = JSON.parse(storage.getItem('karman.assembly-progress'));
  assert.deepEqual(Object.keys(clean), ['falcon9']);
  assert.equal(clean.falcon9.completed, false);
});

test('restoration skips steps whose prerequisites are missing and never adds a second stage to CZ-5B', () => {
  const storage = new MemoryStorage({
    'karman.assembly-progress': JSON.stringify({
      falcon9: {
        placed: ['stage2', 'stage1', 'payload', 'engines1', 'interstage', 'engine2', 'fairing-left'],
        guided: false,
      },
      cz5b: {
        placed: ['stage2', 'engine2', 'interstage', 'stage1', 'engines1', 'payload'],
        guided: false,
        selectedId: 'stage2',
      },
    }),
  });
  const progress = createAssemblyProgressStore(createPreferences(storage));
  assert.deepEqual([...progress.get('falcon9').placed], ['stage1', 'engines1', 'interstage']);
  const single = progress.get('cz5b');
  assert.deepEqual([...single.placed], ['stage1', 'engines1', 'payload']);
  for (const absent of ['stage2', 'engine2', 'interstage']) {
    assert.equal(single.placed.has(absent), false);
    assert.equal(single.canPlace(absent), false);
    assert.notEqual(single.selectedId, absent);
  }
});

test('damaged per-rocket records are harmless and progress remains usable when persistence is denied', () => {
  for (const record of [null, 7, 'bad', [], { placed: 'stage1' }, { placed: [null, {}, 'missing'] }]) {
    const preferences = createPreferences(
      new MemoryStorage({ 'karman.assembly-progress': JSON.stringify({ cz5b: record }) }),
    );
    assert.equal(createAssemblyProgressStore(preferences).get('cz5b').placed.size, 0);
  }
  const preferences = createPreferences(null),
    progress = createAssemblyProgressStore(preferences);
  const game = progress.get('cz5b');
  while (!game.completed) assert.equal(game.place(game.hint().partId).ok, true);
  assert.equal(progress.save(game), false);
  const restored = createAssemblyProgressStore(preferences).get('cz5b');
  assert.equal(restored.completed, true);
  assert.equal(restored.placed.size, restored.plan.total);
});

test('scope disposal removes all feature listeners and pending timers, including queued stale callbacks', () => {
  const queue = scheduledCallbacks();
  const scope = createScope({
    setTimeout: (callback) => queue.schedule(callback),
    clearTimeout: (id) => queue.cancel(id),
  });
  const target = new EventTarget();
  let clicks = 0,
    timerRuns = 0,
    ownedReleased = 0;
  scope.on(target, 'click', () => clicks++);
  scope.on(target, 'click', () => clicks++);
  scope.later(() => timerRuns++, 10);
  scope.later(() => timerRuns++, 20);
  scope.own(() => ownedReleased++);
  target.dispatchEvent(new Event('click'));
  assert.equal(clicks, 2);
  const stale = [...queue.pending.values()];
  scope.dispose();
  scope.dispose();
  assert.equal(queue.pending.size, 0);
  target.dispatchEvent(new Event('click'));
  for (const callback of stale) callback();
  assert.equal(clicks, 2);
  assert.equal(timerRuns, 0);
  assert.equal(ownedReleased, 1);
  scope.on(target, 'click', () => clicks++);
  scope.later(() => timerRuns++, 1);
  scope.own(() => ownedReleased++);
  assert.equal(queue.pending.size, 0);
  assert.equal(ownedReleased, 2, 'resources registered after unloading are released immediately');
  target.dispatchEvent(new Event('click'));
  assert.equal(clicks, 2);
});

test('scope timers can fire or cancel independently and all cleanup still runs after one disposer throws', () => {
  const queue = scheduledCallbacks();
  const scope = createScope({
    setTimeout: (callback) => queue.schedule(callback),
    clearTimeout: (id) => queue.cancel(id),
  });
  let runs = 0,
    releases = 0;
  const cancel = scope.later(() => runs++, 1);
  cancel();
  cancel();
  assert.equal(queue.pending.size, 0);
  scope.later(() => runs++, 1);
  queue.fireNext();
  assert.equal(runs, 1);
  scope.own(() => releases++);
  scope.own(() => {
    throw new Error('cleanup failed');
  });
  scope.own(() => releases++);
  assert.throws(() => scope.dispose(), AggregateError);
  assert.equal(releases, 2);
  assert.equal(scope.disposed, true);
  assert.doesNotThrow(() => scope.dispose());
  assert.equal(runs, 1);
});

test('DOM helpers stay within their mount and keep pressed state and visible active state aligned', () => {
  const button = () => ({
    attributes: new Map(),
    classes: new Set(),
    setAttribute(key, value) {
      this.attributes.set(key, value);
    },
    classList: { toggle() {} },
  });
  const a = button(),
    b = button();
  for (const element of [a, b])
    element.classList.toggle = (name, active) =>
      active ? element.classes.add(name) : element.classes.delete(name);
  const root = (element) => ({
    ownerDocument: {},
    querySelector: () => element,
    querySelectorAll: () => [element],
  });
  const first = createDom(root(a)),
    second = createDom(root(b));
  assert.equal(first.one('button'), a);
  assert.equal(second.one('button'), b);
  setPressed([...first.all('button'), ...second.all('button')], (element) => element === b);
  assert.equal(a.attributes.get('aria-pressed'), 'false');
  assert.equal(a.classes.has('active'), false);
  assert.equal(b.attributes.get('aria-pressed'), 'true');
  assert.equal(b.classes.has('active'), true);
});

test('frame loop runs one chain, limits rendering delta and rebases after a deliberate stop/restart', () => {
  const queue = scheduledCallbacks(),
    clock = manualClock(),
    frames = [];
  const loop = createFrameLoop({
    requestFrame: (callback) => queue.schedule(callback),
    cancelFrame: (id) => queue.cancel(id),
    now: clock.now,
    onFrame: (time, delta) => frames.push({ time, delta }),
  });
  loop.start();
  loop.start();
  assert.equal(queue.pending.size, 1);
  clock.set(50);
  queue.fireNext(50);
  close(frames.at(-1).delta, 0.05);
  clock.set(2500);
  queue.fireNext(2500);
  close(frames.at(-1).delta, 0.1);
  assert.equal(queue.pending.size, 1);
  loop.stop();
  assert.equal(queue.pending.size, 0);
  clock.set(90000);
  loop.start();
  clock.set(90020);
  queue.fireNext(90020);
  close(frames.at(-1).delta, 0.02);
  loop.dispose();
});

test('a disposed frame loop cannot run queued work or be started again', () => {
  const queue = scheduledCallbacks();
  let frames = 0;
  const loop = createFrameLoop({
    requestFrame: (callback) => queue.schedule(callback),
    cancelFrame: (id) => queue.cancel(id),
    now: () => 0,
    onFrame: () => frames++,
  });
  loop.start();
  const stale = [...queue.pending.values()][0];
  loop.dispose();
  loop.dispose();
  stale(1000);
  loop.start();
  assert.equal(frames, 0);
  assert.equal(queue.pending.size, 0, 'unloading is terminal, unlike a temporary stop');
});

test('disposing inside a frame callback does not schedule a successor frame', () => {
  const queue = scheduledCallbacks();
  let frames = 0;
  const loop = createFrameLoop({
    requestFrame: (callback) => queue.schedule(callback),
    cancelFrame: (id) => queue.cancel(id),
    now: () => 0,
    onFrame() {
      frames++;
      loop.dispose();
    },
  });
  loop.start();
  queue.fireNext(16);
  assert.equal(frames, 1);
  assert.equal(queue.pending.size, 0);
});

test('mission speed clicks settle the preceding interval at the old speed', () => {
  const clock = manualClock(),
    mission = createMissionController('falcon9', { now: clock.now });
  mission.toggle();
  clock.set(1200);
  mission.setRate(20);
  close(mission.frame().time, -8.8);
  clock.set(1700);
  close(mission.tick(clock.now(), 0.1).time, 1.2);
  clock.set(1800);
  mission.toggle();
  close(mission.frame().time, 3.2);
  assert.equal(mission.frame().status, 'paused');
  clock.set(5000);
  close(mission.tick(clock.now(), 0.1).time, 3.2);
});

test('entering structure or assembly pauses the mission and returning to launch never catches up old time', () => {
  const clock = manualClock(),
    mission = createMissionController('falcon9', { now: clock.now });
  mission.toggle();
  clock.set(2000);
  mission.setMode('structure');
  close(mission.frame().time, -8);
  assert.equal(mission.frame().status, 'paused');
  clock.set(120000);
  mission.tick(clock.now(), 0.1);
  mission.setMode('assembly');
  clock.set(200000);
  mission.tick(clock.now(), 0.1);
  mission.setMode('launch');
  clock.set(201000);
  close(mission.tick(clock.now(), 0.1).time, -8);
  assert.equal(mission.frame().status, 'paused');
  mission.toggle();
  clock.set(202000);
  close(mission.tick(clock.now(), 0.1).time, -7);
});

test('background suspension settles active time, pauses, and emits one return notice without auto-resume', () => {
  const clock = manualClock(),
    mission = createMissionController('falcon9', { now: clock.now });
  mission.toggle();
  clock.set(1500);
  assert.equal(mission.setVisible(false), false);
  close(mission.frame().time, -8.5);
  assert.equal(mission.frame().status, 'paused');
  clock.set(120000);
  mission.tick(clock.now(), 0.1);
  assert.equal(mission.setVisible(true), true);
  assert.equal(mission.setVisible(true), false);
  clock.set(121000);
  close(mission.tick(clock.now(), 0.1).time, -8.5);
  mission.toggle();
  clock.set(122000);
  close(mission.tick(clock.now(), 0.1).time, -7.5);
});

test('mission reset and rocket changes clear recovery selection, speed and completion presentation', () => {
  const clock = manualClock(),
    mission = createMissionController('falcon9', { now: clock.now });
  assert.equal(mission.setSubject('booster'), 'vehicle');
  const recovery = mission.frame().timeline.markers.find((marker) => marker.kind === 'recovery');
  assert.ok(recovery);
  mission.jump(recovery.id);
  assert.equal(mission.frame().subject, 'booster');
  mission.setRate(100);
  mission.setRocket('cz5b');
  const changed = mission.frame();
  assert.equal(changed.state.rocketId, 'cz5b');
  assert.equal(changed.subject, 'vehicle');
  assert.equal(changed.rate, 1);
  assert.equal(changed.time, -10);
  assert.equal(changed.status, 'ready');
  assert.equal(changed.timeline.end, mission.mission.duration);
  assert.equal(changed.presentationTime, 0);
  assert.equal(changed.showCompletion, false);
  assert.equal(mission.setSubject('booster'), 'vehicle');
  assert.equal(mission.jump('not-an-event'), null);
  mission.seek(mission.mission.duration);
  mission.reset();
  assert.equal(mission.frame().status, 'ready');
  assert.equal(mission.frame().state.deployed, false);
  assert.throws(() => mission.setRocket('missing'), RangeError);
  assert.equal(
    mission.frame().state.rocketId,
    'cz5b',
    'a rejected selection leaves the current mission intact',
  );
});

test('payload completion gets a separate viewing interval while authoritative mission time stays at the endpoint', () => {
  const clock = manualClock(),
    mission = createMissionController('falcon9', { now: clock.now });
  const endpoint = mission.mission.duration;
  mission.seek(endpoint);
  assert.equal(mission.frame().status, 'complete');
  assert.equal(mission.frame().showCompletion, false);
  for (let i = 0; i < 20; i++) mission.tick(clock.advance(100), 0.1);
  const halfway = mission.frame();
  assert.ok(halfway.renderState.deploymentElapsed > 0);
  assert.equal(halfway.showCompletion, false);
  mission.setMode('structure');
  for (let i = 0; i < 100; i++) mission.tick(clock.advance(100), 0.1);
  close(mission.frame().presentationTime, halfway.presentationTime);
  mission.setMode('launch');
  for (let i = 0; i < 30; i++) mission.tick(clock.advance(100), 0.1);
  assert.equal(mission.frame().showCompletion, true);
  assert.equal(mission.frame().time, endpoint);
  assert.equal(mission.frame().timeline.percent, 100);
  mission.dismissCompletion();
  mission.tick(clock.advance(100), 0.1);
  assert.equal(mission.frame().showCompletion, false);
  mission.setRocket('starship');
  mission.seek(mission.mission.duration);
  assert.equal(mission.frame().state.deployed, false);
  assert.equal(mission.frame().state.fairingSeparated, false);
  assert.equal(
    mission.frame().showCompletion,
    true,
    'the suborbital demonstration does not wait for fictitious payload release',
  );
});

class AudioNode {
  constructor() {
    this.connections = [];
    this.disconnects = 0;
    this.starts = 0;
    this.stops = 0;
  }
  connect(node) {
    this.connections.push(node);
    return node;
  }
  disconnect() {
    this.connections = [];
    this.disconnects++;
  }
  start() {
    this.starts++;
  }
  stop() {
    this.stops++;
  }
}

class FakeAudioContext {
  constructor(resume = () => Promise.resolve()) {
    this.sampleRate = 4;
    this.currentTime = 1;
    this.destination = new AudioNode();
    this.source = new AudioNode();
    this.filter = new AudioNode();
    this.filter.frequency = { value: 0 };
    this.gain = new AudioNode();
    this.targets = [];
    this.gain.gain = { value: 0, setTargetAtTime: (value) => this.targets.push(value) };
    this.resumeEffect = resume;
    this.resumes = 0;
    this.closes = 0;
  }
  createBuffer(_channels, samples) {
    const values = new Float32Array(samples);
    return { getChannelData: () => values };
  }
  createBufferSource() {
    return this.source;
  }
  createBiquadFilter() {
    return this.filter;
  }
  createGain() {
    return this.gain;
  }
  resume() {
    this.resumes++;
    return this.resumeEffect();
  }
  close() {
    this.closes++;
    return Promise.resolve();
  }
}

function audioFrame({
  status = 'running',
  subject = 'vehicle',
  first = true,
  second = false,
  boosters = false,
  returning = false,
} = {}) {
  return {
    status,
    subject,
    state: {
      firstEngineOn: first,
      secondEngineOn: second,
      boostersEngineOn: boosters,
      booster: { engineOn: returning },
    },
  };
}

test('engine audio is created only by user toggle and follows mode, playback and the selected active engines', async () => {
  const context = new FakeAudioContext(),
    changes = [];
  let creations = 0;
  const sound = createEngineSound({
    createContext: () => {
      creations++;
      return context;
    },
    onChange: (value) => changes.push(value),
    random: () => 0.5,
  });
  sound.update('launch', audioFrame());
  sound.update('structure', audioFrame());
  assert.equal(creations, 0);
  assert.equal(sound.enabled, false);
  await sound.toggle();
  assert.equal(creations, 1);
  assert.equal(sound.enabled, true);
  sound.update('launch', audioFrame());
  assert.ok(context.targets.at(-1) > 0);
  for (const mode of ['structure', 'assembly']) {
    sound.update(mode, audioFrame());
    assert.equal(context.targets.at(-1), 0);
  }
  sound.update('launch', audioFrame({ status: 'paused' }));
  assert.equal(context.targets.at(-1), 0);
  sound.update('launch', audioFrame({ first: false, second: false, boosters: true }));
  assert.ok(context.targets.at(-1) > 0);
  sound.update('launch', audioFrame({ subject: 'booster', first: true, returning: false }));
  assert.equal(context.targets.at(-1), 0);
  sound.update('launch', audioFrame({ subject: 'booster', first: false, returning: true }));
  assert.ok(context.targets.at(-1) > 0);
  await sound.toggle();
  sound.update('launch', audioFrame());
  assert.equal(context.targets.at(-1), 0);
  assert.deepEqual(changes, [true, false]);
  sound.dispose();
  sound.dispose();
  assert.equal(context.source.stops, 1);
  assert.equal(context.source.disconnects, 1);
  assert.equal(context.filter.disconnects, 1);
  assert.equal(context.gain.disconnects, 1);
  assert.equal(context.closes, 1);
});

test('an asynchronous audio resume cannot revive disposed sound or notify an unmounted interface', async () => {
  let resolve;
  const pending = new Promise((done) => {
    resolve = done;
  });
  const context = new FakeAudioContext(() => pending),
    changes = [],
    errors = [];
  let creations = 0;
  const sound = createEngineSound({
    createContext: () => {
      creations++;
      return context;
    },
    onChange: (value) => changes.push(value),
    onError: (error) => errors.push(error),
    random: () => 0.5,
  });
  const opening = sound.toggle();
  await sound.toggle();
  assert.equal(creations, 1, 'concurrent toggles share one pending activation');
  sound.dispose();
  resolve();
  await opening;
  await sound.toggle();
  sound.update('launch', audioFrame());
  assert.equal(sound.enabled, false);
  assert.equal(creations, 1);
  assert.deepEqual(changes, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(context.targets, []);
  assert.equal(context.source.stops, 1);
  assert.equal(context.closes, 1);
});

test('a rejected audio resume releases its graph and a later user request may create a fresh one', async () => {
  const failed = new FakeAudioContext(() => Promise.reject(new Error('not allowed'))),
    next = new FakeAudioContext();
  const changes = [],
    errors = [];
  let creations = 0;
  const sound = createEngineSound({
    createContext: () => (++creations === 1 ? failed : next),
    onChange: (value) => changes.push(value),
    onError: (error) => errors.push(error),
    random: () => 0.5,
  });
  await sound.toggle();
  assert.equal(sound.enabled, false);
  assert.equal(errors.length, 1);
  assert.equal(failed.source.stops, 1);
  assert.equal(failed.closes, 1);
  await sound.toggle();
  assert.equal(sound.enabled, true);
  assert.equal(creations, 2);
  assert.deepEqual(changes, [false, true]);
  sound.dispose();
  assert.equal(next.source.stops, 1);
  assert.equal(next.closes, 1);
});

test('a resume rejection after disposal is silent and does not release the graph twice', async () => {
  let reject;
  const pending = new Promise((_resolve, fail) => {
    reject = fail;
  });
  const context = new FakeAudioContext(() => pending),
    notifications = [];
  const sound = createEngineSound({
    createContext: () => context,
    onChange: (value) => notifications.push(value),
    onError: (error) => notifications.push(error),
    random: () => 0.5,
  });
  const opening = sound.toggle();
  sound.dispose();
  reject(new Error('late rejection'));
  await opening;
  assert.deepEqual(notifications, []);
  assert.equal(context.closes, 1);
  assert.equal(context.source.stops, 1);
});
