import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAppShell, icon, formatTime, coordinate, CAMERA_MODES } from '../src/ui/shell.js';
import { escapeHtml } from '../src/ui/formatters.js';
import { PLAYBACK_RATES } from '../src/ui/config.js';
import { ICONS } from '../src/ui/icons.js';
import { ROCKETS, SITES, getModules, getSitesForRocket } from '../src/fleet-data.js';
import { getMission } from '../src/fleet-simulation.js';
import { STUDIO_THEMES } from '../src/studio-themes.js';

function optionsFor(rocket) {
  return {
    rocket,
    modules: getModules(rocket.id),
    mission: getMission(rocket.id),
    site: getSitesForRocket(rocket.id).at(-1),
    studioThemeId: 'technology',
  };
}

function idsIn(html) {
  return [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
}
function dataValues(html, key) {
  return [...html.matchAll(new RegExp(`\\bdata-${key}="([^"]*)"`, 'g'))].map((match) => match[1]);
}
function selectOptions(html, id) {
  const content = html.match(new RegExp(`<select id="${id}">([\\s\\S]*?)<\\/select>`))?.[1];
  assert.ok(content, `${id} is present`);
  return [...content.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map((match) => ({
    value: match[1].match(/\bvalue="([^"]+)"/)?.[1],
    selected: /\bselected(?:\s|$)/.test(match[1]),
    text: match[2],
  }));
}

const requiredIds = [
  'rocket-choice',
  'site-choice',
  'site-map',
  'studio-theme-choice',
  'launch-panel',
  'structure-panel',
  'assembly-panel',
  'viewport',
  'launch',
  'reset',
  'next-event',
  'timeline',
  'timeline-markers',
  'timeline-current-event',
  'timeline-next-event',
  'telemetry',
  'engine-status',
  'explode',
  'assemble',
  'focus-part',
  'isolate-part',
  'cutaway-offset',
  'section-front',
  'module-detail',
  'interior-details',
  'narration-play',
  'narration-stop',
  'narration-slow',
  'narration-replay',
  'narration-story',
  'assembly-palette',
  'assembly-coach',
  'assembly-hint',
  'assembly-install',
  'assembly-undo',
  'assembly-reset',
  'assembly-target-label',
  'assembly-launch',
  'assembly-celebration',
  'assembly-finish-launch',
  'assembly-again',
  'assembly-admire',
  'flight-console',
  'explore-console',
  'assembly-console',
  'completion',
  'about-dialog',
  'close-about',
];
let commonIds;

for (const rocket of ROCKETS) {
  test(`${rocket.id}: pure app shell has unique IDs, all interaction controls and only compatible launch sites`, () => {
    const options = optionsFor(rocket);
    const before = JSON.stringify(options);
    const html = renderAppShell(options);
    const ids = idsIn(html);
    assert.equal(new Set(ids).size, ids.length, 'duplicated IDs break event binding and accessibility');
    assert.ok(requiredIds.every((id) => ids.includes(id)));
    if (!commonIds) commonIds = [...ids].sort();
    assert.deepEqual([...ids].sort(), commonIds, 'all models retain the same control contract');
    assert.equal(JSON.stringify(options), before, 'rendering must not mutate app state');
    assert.ok(html.includes(escapeHtml(rocket.shortName)));
    assert.deepEqual(dataValues(html, 'part'), rocket.moduleIds);
    assert.deepEqual(
      dataValues(html, 'camera'),
      CAMERA_MODES.map((mode) => mode[0]),
    );
    assert.deepEqual(dataValues(html, 'rate').map(Number), PLAYBACK_RATES);
    assert.deepEqual(dataValues(html, 'mode'), ['launch', 'structure', 'assembly']);
    assert.deepEqual(dataValues(html, 'structure-view'), ['exterior', 'cutaway']);
    const sites = selectOptions(html, 'site-choice');
    assert.deepEqual(
      sites.map((site) => site.value),
      getSitesForRocket(rocket.id).map((site) => site.id),
    );
    assert.deepEqual(
      sites.filter((site) => site.selected).map((site) => site.value),
      [options.site.id],
    );
    assert.deepEqual(
      selectOptions(html, 'rocket-choice').map((option) => option.value),
      ROCKETS.map((entry) => entry.id),
    );
    assert.deepEqual(
      selectOptions(html, 'studio-theme-choice').map((option) => option.value),
      STUDIO_THEMES.map((theme) => theme.id),
    );
    assert.match(html, new RegExp(`id="timeline"[^>]*max="${options.mission.duration}"`));
    assert.ok(
      html.includes(`0 / ${options.modules.length}</strong>`),
      'initial assembly count matches selected model',
    );
    if (!options.mission.hasRecovery) assert.equal(dataValues(html, 'jump').length, 0);
  });
}

test('an incompatible persisted site is replaced by the selected rocket first compatible site', () => {
  const rocket = ROCKETS.find((entry) => entry.id === 'cz2f');
  const html = renderAppShell({ ...optionsFor(rocket), site: SITES.find((site) => site.id === 'slc40') });
  assert.deepEqual(
    selectOptions(html, 'site-choice').map((site) => site.value),
    ['jiuquan921'],
  );
  assert.equal(selectOptions(html, 'site-choice')[0].selected, true);
  assert.ok(html.includes('酒泉'));
  assert.equal(/id="site-map"[^>]*query=28\.56/.test(html), false);
});

test('template fragments remain balanced HTML and each label targets an existing control', () => {
  const html = renderAppShell(optionsFor(ROCKETS[0]));
  const ids = new Set(idsIn(html));
  for (const label of html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)) assert.ok(ids.has(label[1]), label[1]);
  const stack = [];
  const voidElements = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
  ]);
  for (const token of html.matchAll(/<\/?([a-zA-Z][\w:-]*)(?:\s[^<>]*?)?\s*\/?>/g)) {
    const name = token[1].toLowerCase();
    if (token[0].startsWith('</'))
      assert.equal(stack.pop(), name, `mismatched fragment boundary at ${token[0]}`);
    else if (!voidElements.has(name) && !token[0].endsWith('/>')) stack.push(name);
  }
  assert.deepEqual(stack, []);
});

test('data-driven text and attribute values are escaped while trusted icons remain SVG', () => {
  const original = optionsFor(ROCKETS[0]);
  const malicious = '<script>alert("x")</script> & example';
  const options = {
    ...original,
    rocket: { ...original.rocket, shortName: malicious, description: malicious },
    modules: original.modules.map((module, index) => (index ? module : { ...module, name: malicious })),
    mission: {
      ...original.mission,
      label: malicious,
      events: original.mission.events.map((event) => ({ ...event, detail: malicious })),
    },
  };
  const html = renderAppShell(options);
  assert.equal(html.includes('<script>'), false);
  assert.ok(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; example'));
  assert.ok(html.includes('title="&lt;script&gt;'));
  assert.ok(html.includes('<svg viewBox="0 0 24 24"'));
});

test('camera and playback configuration is shared, stable and immutable', () => {
  assert.equal(new Set(CAMERA_MODES.map((mode) => mode[0])).size, CAMERA_MODES.length);
  assert.ok(CAMERA_MODES.every((mode) => mode.length === 3 && Object.hasOwn(ICONS, mode[1]) && mode[2]));
  assert.ok(Object.isFrozen(CAMERA_MODES));
  assert.ok(CAMERA_MODES.every(Object.isFrozen));
  assert.ok(Object.isFrozen(PLAYBACK_RATES));
  assert.deepEqual(PLAYBACK_RATES, [1, 5, 20, 100, 600]);
});

test('shared formatters preserve countdown boundaries and geographic hemisphere labels', () => {
  assert.equal(formatTime(-10), 'T−00:10');
  assert.equal(formatTime(-0.1), 'T−00:00');
  assert.equal(formatTime(0), 'T+00:00');
  assert.equal(formatTime(67.9), 'T+01:07');
  assert.equal(formatTime(3390), 'T+56:30');
  assert.equal(coordinate(-80.58, 'E', 'W'), '80.58°W');
  assert.equal(coordinate(19.61, 'N', 'S'), '19.61°N');
  assert.equal(coordinate(0, 'E', 'W'), '0.00°E');
  assert.equal(icon('missing'), icon('target'));
  assert.equal(icon('constructor'), icon('target'));
});

test('shell fails clearly for missing mission data or unsupported rocket IDs', () => {
  assert.throws(() => renderAppShell(), TypeError);
  assert.throws(() => renderAppShell({ ...optionsFor(ROCKETS[0]), mission: { events: [] } }), TypeError);
  assert.throws(
    () => renderAppShell({ ...optionsFor(ROCKETS[0]), rocket: { ...ROCKETS[0], id: 'unknown' } }),
    RangeError,
  );
});
