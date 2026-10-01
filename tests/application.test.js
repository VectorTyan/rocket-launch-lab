import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createApplication } from '../src/app/create-application.js';
import { ROCKETS, getSitesForRocket, getModules } from '../src/fleet-data.js';

function fixture(t, options = {}) {
  const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom,
    root = window.document.querySelector('#app');
  window.matchMedia = () => ({ matches: false });
  window.HTMLElement.prototype.scrollTo = function ({ top }) {
    this.scrollTop = top;
  };
  window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  let time = 0,
    serial = 0,
    hidden = false,
    callbacks;
  Object.defineProperty(window.document, 'hidden', { get: () => hidden });
  for (const [key, value] of Object.entries(options.saved || {}))
    window.localStorage.setItem(`karman.${key}`, value);
  const frames = new Map(),
    sceneCalls = [],
    audio = [],
    errors = [];
  const scene = Object.fromEntries(
    [
      'setRocket',
      'setSite',
      'setMode',
      'setView',
      'setSubject',
      'setQuality',
      'setStudioTheme',
      'setSelected',
      'setExplode',
      'setIsolated',
      'setCutaway',
      'setCutawayOffset',
      'setAssemblyState',
      'focusSelected',
      'assemblyFeedback',
      'resize',
      'dispose',
    ].map((name) => [name, (...args) => sceneCalls.push({ name, args })]),
  );
  scene.update = (...args) => sceneCalls.push({ name: 'update', args });
  scene.getAssemblyTargetScreen = () => ({ x: 80, y: 90, visible: true });
  scene.tryAssemblyDrop = () => true;
  if (options.sceneFailure === 'setup')
    scene.setSite = () => {
      throw new Error('Pad initialization failed');
    };
  const configuration = {
    root,
    window,
    now: () => time,
    requestFrame: (fn) => {
      const id = ++serial;
      frames.set(id, fn);
      return id;
    },
    cancelFrame: (id) => frames.delete(id),
    sceneFactory: (container, onSelect, rocket, handlers) => {
      if (options.sceneFailure === true) throw new Error('WebGL intentionally unavailable');
      callbacks = { onSelect, ...handlers };
      return scene;
    },
    onError: (error) => errors.push(error),
    createAudio: (src) => {
      const item = Object.assign(new window.EventTarget(), {
        src,
        paused: true,
        removed: false,
        playCalls: 0,
        async play() {
          this.paused = false;
          this.playCalls++;
          this.onplaying?.();
        },
        pause() {
          this.paused = true;
        },
        removeAttribute() {
          this.removed = true;
        },
        load() {},
      });
      audio.push(item);
      return item;
    },
    ...(options.storage !== undefined ? { storage: options.storage } : {}),
  };
  let app = createApplication(configuration);
  t.after(() => {
    app.dispose();
    window.close();
  });
  const $ = (selector) => root.querySelector(selector);
  const click = (selector) => {
    const element = $(selector);
    assert.ok(element, selector);
    element.click();
  };
  function change(selector, value, type = 'change') {
    const el = $(selector);
    el.value = value;
    el.dispatchEvent(new window.Event(type, { bubbles: true }));
  }
  function step(ms = 16) {
    time += ms;
    const jobs = [...frames.values()];
    frames.clear();
    jobs.forEach((fn) => fn(time));
  }
  return {
    get app() {
      return app;
    },
    $,
    click,
    change,
    step,
    root,
    window,
    scene,
    sceneCalls,
    audio,
    errors,
    frames,
    get callbacks() {
      return callbacks;
    },
    advanceClock(ms) {
      time += ms;
    },
    visible(value) {
      hidden = !value;
      window.document.dispatchEvent(new window.Event('visibilitychange'));
    },
    remount() {
      app.dispose();
      app = createApplication(configuration);
      return app;
    },
  };
}

test('application restores compatible preferences and legacy progress for each of the eight vehicles', (t) => {
  const f = fixture(t, {
    saved: {
      rocket: 'cz5b',
      site: 'slc40',
      quality: 'standard',
      'studio-theme': 'realistic',
      'assembly-progress': JSON.stringify({
        cz5b: { placed: ['stage1', 'stage2', 'engines1'], guided: false, selectedId: 'booster-1' },
      }),
    },
  });
  assert.equal(f.app.state.siteId, 'wenchang101');
  assert.equal(f.app.state.quality, 'standard');
  assert.deepEqual(f.app.state.assembly.placed, ['stage1', 'engines1']);
  for (const rocket of ROCKETS) {
    f.change('#rocket-choice', rocket.id);
    assert.equal(f.app.state.rocketId, rocket.id);
    assert.deepEqual(
      [...f.$('#site-choice').options].map((o) => o.value),
      getSitesForRocket(rocket.id).map((s) => s.id),
    );
    assert.equal(f.root.querySelectorAll('[data-part]').length, getModules(rocket.id).length);
    assert.equal(f.app.state.flight.status, 'ready');
  }
});

test('DOM playback, rate changes and model render use one mission timestamp', (t) => {
  const f = fixture(t);
  f.click('#launch');
  f.step(1000);
  assert.equal(f.app.state.flight.time, -9);
  f.advanceClock(500);
  f.click('[data-rate="20"]');
  assert.equal(f.app.state.flight.time, -8.5);
  f.step(1000);
  assert.equal(f.app.state.flight.time, -7.5);
  assert.equal(f.app.state.flight.rate, 1);
  assert.equal(f.app.state.flight.countdown.requestedRate, 20);
  assert.equal(f.$('#countdown-number').textContent, '5');
  assert.match(f.$('#countdown-playback-note').textContent, /恢复 20×/);
  f.step(9200);
  const frame = f.app.state.flight;
  assert.ok(Math.abs(frame.time - 11.2) < 1e-8);
  assert.equal(Number(f.$('#timeline').value), 11.2);
  assert.equal(frame.rate, 20);
  assert.equal(f.$('#launch-ceremony').hidden, true);
  assert.equal(f.$('#clock').textContent, 'T+00:11');
  assert.equal(f.sceneCalls.filter((c) => c.name === 'update').at(-1).args[0].time, frame.time);
  f.click('[data-timeline-event="stage-separation"]');
  assert.equal(f.app.state.flight.time, 148);
  assert.equal(f.app.state.flight.status, 'paused');
  assert.equal(f.$('[data-timeline-event="stage-separation"]').getAttribute('aria-current'), 'step');
  f.click('[data-rate="600"]');
  f.step(5000);
  assert.equal(f.app.state.flight.time, 148);
});

test('leaving launch and hiding the document pause time without catch-up on return', (t) => {
  const f = fixture(t);
  f.click('#launch');
  f.step(1000);
  f.click('[data-mode="structure"]');
  const paused = f.app.state.flight.time;
  f.step(100000);
  assert.equal(f.app.state.flight.time, paused);
  f.click('[data-mode="launch"]');
  assert.equal(f.app.state.flight.status, 'paused');
  f.click('#launch');
  f.step(100);
  f.visible(false);
  const hiddenTime = f.app.state.flight.time;
  f.step(300000);
  f.visible(true);
  f.step(1000);
  assert.equal(f.app.state.flight.time, hiddenTime);
  assert.equal(f.app.state.flight.status, 'paused');
});

test('assembly callbacks, undo, hint, theme persistence and completion connect to a fresh launch', (t) => {
  const f = fixture(t);
  f.click('[data-mode="assembly"]');
  const id = f.app.state.assembly.selectedId;
  f.callbacks.onAssemblyDrop(id, false);
  assert.equal(f.app.state.assembly.placed.length, 0);
  f.callbacks.onAssemblyDrop(id, true);
  assert.equal(f.$('#assembly-count').textContent, '1 / 10');
  f.change('#studio-theme-choice', 'playful');
  assert.equal(f.app.state.assembly.placed.length, 1);
  f.click('#assembly-undo');
  assert.equal(f.app.state.assembly.placed.length, 0);
  f.click('[data-assembly-part="engine2"]');
  assert.equal(f.$('#assembly-install').disabled, true);
  f.click('#assembly-hint');
  assert.equal(f.app.state.assembly.selectedId, 'stage1');
  for (let i = 0; i < 10; i++) f.click('#assembly-install');
  assert.equal(f.app.state.assembly.completed, true);
  assert.equal(f.$('#assembly-celebration').hidden, false);
  assert.equal(f.root.querySelectorAll('#assembly-confetti i').length, 42);
  f.click('#assembly-finish-launch');
  assert.equal(f.app.state.mode, 'launch');
  assert.equal(f.app.state.flight.status, 'running');
  assert.equal(f.app.state.flight.time, -10);
  assert.equal(f.app.state.rocketId, 'falcon9');
});

test('repeated rocket and mode switches keep assembly history separate and do not multiply handlers', (t) => {
  const f = fixture(t);
  f.click('[data-mode="assembly"]');
  f.click('#assembly-install');
  for (let i = 0; i < 4; i++) {
    f.change('#rocket-choice', 'cz5b');
    f.change('#rocket-choice', 'falcon9');
  }
  assert.equal(f.app.state.assembly.placed.length, 1);
  f.click('#assembly-install');
  assert.equal(f.app.state.assembly.placed.length, 2);
  f.change('#rocket-choice', 'cz5b');
  assert.equal(f.app.state.assembly.placed.length, 0);
  assert.equal(f.root.querySelector('[data-assembly-part="stage2"]'), null);
  f.click('[data-mode="launch"]');
  assert.equal(f.sceneCalls.filter((c) => c.name === 'setMode').at(-1).args[0], 'launch');
});

test('inspection owns numeric state and synchronizes clipping, isolation, selection and narration', async (t) => {
  const f = fixture(t);
  f.click('[data-mode="structure"]');
  f.change('#explode', '.7', 'input');
  f.click('[data-structure-view="cutaway"]');
  assert.equal(f.app.state.inspection.explode, 0);
  assert.equal(f.$('#explode').disabled, true);
  f.click('[data-part="stage2"]');
  f.click('#isolate-part');
  f.change('#cutaway-offset', '.6', 'input');
  assert.deepEqual(f.app.state.inspection, {
    selectedPart: 'stage2',
    view: 'cutaway',
    explode: 0,
    offset: 0.6,
    isolated: true,
  });
  assert.equal(f.$('#cutaway-offset').getAttribute('aria-label'), '模块剖面位置');
  f.click('#narration-play');
  await Promise.resolve();
  assert.equal(f.audio.length, 1);
  assert.match(f.audio[0].src, /falcon9-stage2\.wav$/);
  f.click('[data-part="engine2"]');
  assert.equal(f.audio[0].removed, true);
  f.click('[data-mode="assembly"]');
  assert.equal(f.app.state.inspection.view, 'exterior');
  assert.equal(f.app.state.inspection.isolated, false);
  assert.equal(f.$('#module-detail').hidden, true);
});

test('completion waits for the separate terminal presentation, and dismissal survives a mode round trip', (t) => {
  const f = fixture(t);
  f.click('[data-timeline-event="payload-deployment"]');
  assert.equal(f.$('#completion').hidden, true);
  for (let i = 0; i < 42; i++) f.step(100);
  assert.equal(f.$('#completion').hidden, false);
  assert.equal(f.$('#clock').textContent, 'T+56:30');
  f.click('#completion-close');
  f.click('[data-mode="structure"]');
  f.click('[data-mode="launch"]');
  f.step(100);
  assert.equal(f.$('#completion').hidden, true);
  f.click('#reset');
  assert.equal(f.app.state.flight.status, 'ready');
});

test('unsupported WebGL still provides readable lessons and cannot start flight or install parts', async (t) => {
  const f = fixture(t, { sceneFailure: true });
  assert.equal(f.errors.length, 1);
  assert.ok(f.$('.render-error'));
  assert.equal(f.$('#launch').disabled, true);
  f.click('[data-mode="assembly"]');
  assert.equal(f.$('#assembly-install').disabled, true);
  f.click('[data-mode="structure"]');
  f.click('#narration-play');
  await Promise.resolve();
  assert.equal(f.audio.length, 1);
  assert.equal(f.app.state.flight.status, 'ready');
});

test('denied storage uses in-memory progress and reports that limitation without breaking interactions', (t) => {
  const denied = {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('quota');
    },
  };
  const f = fixture(t, { storage: denied });
  f.click('[data-mode="assembly"]');
  f.click('#assembly-install');
  f.change('#rocket-choice', 'starship');
  f.change('#rocket-choice', 'falcon9');
  assert.equal(f.app.state.assembly.placed.length, 1);
  assert.match(f.$('.assembly-save-note').textContent, /页面中/);
});

test('a failed scene setup releases the allocated scene and still mounts a usable lesson interface', (t) => {
  const f = fixture(t, { sceneFailure: 'setup' });
  assert.equal(f.errors.length, 1);
  assert.ok(f.$('.render-error'));
  assert.equal(f.sceneCalls.filter((call) => call.name === 'dispose').length, 1);
  f.click('[data-mode="structure"]');
  assert.equal(f.$('#part-name').textContent, '芯一级');
  f.app.dispose();
  assert.equal(f.sceneCalls.filter((call) => call.name === 'dispose').length, 1);
});

test('unmount removes RAF and old handlers, releases audio/scene once and supports mounting again', async (t) => {
  const f = fixture(t);
  f.click('[data-mode="structure"]');
  f.click('#narration-play');
  await Promise.resolve();
  const oldButton = f.$('#narration-play'),
    staleFrame = [...f.frames.values()][0];
  f.app.dispose();
  f.app.dispose();
  assert.equal(f.frames.size, 0);
  assert.equal(f.audio[0].removed, true);
  assert.equal(f.sceneCalls.filter((c) => c.name === 'dispose').length, 1);
  const before = f.sceneCalls.length;
  staleFrame(10000);
  oldButton.click();
  assert.equal(f.sceneCalls.length, before);
  assert.equal(f.audio.length, 1);
  f.remount();
  f.window.document.dispatchEvent(
    new f.window.KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }),
  );
  assert.equal(f.app.state.flight.status, 'running');
  assert.equal(f.frames.size, 1);
});

test('keyboard shortcuts leave edited inputs and open dialogs untouched', (t) => {
  const f = fixture(t);
  const key = () =>
    f.window.document.dispatchEvent(
      new f.window.KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }),
    );
  f.$('#timeline').focus();
  key();
  assert.equal(f.app.state.flight.status, 'ready');
  f.$('#timeline').blur();
  f.click('.about-button');
  key();
  assert.equal(f.app.state.flight.status, 'ready');
  f.click('#close-about');
  key();
  assert.equal(f.app.state.flight.status, 'running');
});

test('launch ceremony plays numbers before ignition, pauses cleanly and queues faster playback', async (t) => {
  const f = fixture(t);
  f.click('[data-rate="100"]');
  f.click('#launch');
  await Promise.resolve();
  assert.equal(f.$('#launch-ceremony').hidden, false);
  assert.equal(f.$('#countdown-number').textContent, '7');
  assert.equal(f.app.state.flight.rate, 1);
  assert.equal(f.app.state.flight.countdown.requestedRate, 100);
  assert.match(f.audio[0].src, /count-7\.wav$/);
  assert.equal(f.audio[0].playCalls, 1);
  f.step(100);
  f.click('#launch');
  assert.equal(f.audio[0].paused, true);
  assert.equal(f.$('#launch-ceremony').classList.contains('paused'), true);
  f.step(3000);
  assert.equal(f.app.state.flight.time, -9.9);
  f.click('#launch');
  await Promise.resolve();
  assert.equal(f.audio[0].playCalls, 2);
  f.step(6900);
  await Promise.resolve();
  assert.equal(f.app.state.flight.time, -3);
  assert.equal(f.app.state.flight.state.firstEngineOn, true);
  assert.equal(f.$('#countdown-number').textContent, '点火');
  assert.match(f.audio.at(-1).src, /ignition\.wav$/);
  f.step(3000);
  await Promise.resolve();
  assert.equal(f.app.state.flight.time, 0);
  assert.equal(f.$('#countdown-number').textContent, '起飞');
  assert.match(f.audio.at(-1).src, /liftoff\.wav$/);
  f.step(1200);
  assert.equal(f.app.state.flight.rate, 100);
  assert.equal(f.$('#launch-ceremony').hidden, true);
});

test('countdown mute persists, mode exit and seek stop voice without queued stale announcements', async (t) => {
  const f = fixture(t);
  f.click('#launch');
  await Promise.resolve();
  f.click('#countdown-voice');
  assert.equal(f.audio[0].removed, true);
  assert.equal(f.window.localStorage.getItem('karman.countdown-voice'), 'off');
  f.step(1000);
  assert.equal(f.audio.length, 1);
  f.click('#countdown-voice');
  await Promise.resolve();
  assert.match(f.audio.at(-1).src, /count-6\.wav$/);
  f.click('[data-mode="structure"]');
  assert.equal(f.audio.at(-1).paused, true);
  assert.equal(f.$('#launch-ceremony').hidden, true);
  f.click('[data-mode="launch"]');
  f.click('[data-timeline-event="max-q"]');
  assert.equal(f.$('#launch-ceremony').hidden, true);
  assert.equal(f.app.state.flight.time, 67);
  const played = f.audio.length;
  f.click('#launch');
  f.step(500);
  assert.equal(f.audio.length, played);
});

test('module card matches the compact reference: title-side listen button, direct facts and no transcript', async (t) => {
  const f = fixture(t);
  f.click('[data-mode="structure"]');
  assert.ok(f.$('.module-heading-row #part-name'));
  assert.ok(f.$('.module-heading-row #narration-play'));
  assert.equal(f.$('.module-narration'), null);
  assert.equal(f.$('#narration-story'), null);
  assert.equal(f.$('#narration-stop'), null);
  assert.equal(f.$('#narration-slow'), null);
  assert.equal(f.$('.module-more').tagName, 'SECTION');
  assert.equal(f.$('.module-more summary'), null);
  assert.ok(f.$('#part-description').textContent.length > 20);
  assert.equal(f.$('#part-facts').children.length, 3);
  f.click('#narration-play');
  await Promise.resolve();
  assert.equal(f.$('#narration-play').textContent.trim(), '暂停讲解');
  f.click('#narration-play');
  assert.equal(f.$('#narration-play').textContent.trim(), '继续听');
  f.click('[data-part="stage2"]');
  assert.equal(f.audio[0].removed, true);
  assert.ok(f.$('#part-description').textContent.length > 20);
  assert.equal(f.$('.module-more').hidden, false);
});
