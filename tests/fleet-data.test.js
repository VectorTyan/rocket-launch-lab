import test from 'node:test';
import assert from 'node:assert/strict';
import { ROCKETS, SITES, SOURCES, getRocket, getSitesForRocket, getModules } from '../src/fleet-data.js';
import { createVehicle } from '../src/fleet-model.js';
import { FleetSimulation, getMission } from '../src/fleet-simulation.js';

// Independent acceptance values for the selected public reference configurations.
// Core diameter is deliberately distinct from Falcon Heavy's total width.
const REFERENCES = {
  falcon9: { height: 70, diameter: 3.7, sites: ['slc40', 'lc39a', 'slc4e'] },
  'falcon-heavy': { height: 70, diameter: 3.7, sites: ['lc39a'] },
  starship: { height: 124.4, diameter: 9, sites: ['starbase'] },
  cz5: { height: 57, diameter: 5, sites: ['wenchang101'] },
  cz5b: { height: 53.7, diameter: 5, sites: ['wenchang101'] },
  cz7: { height: 53.1, diameter: 3.35, sites: ['wenchang201'] },
  cz8: { height: 50.3, diameter: 3.35, sites: ['wenchang201'] },
  cz2f: { height: 58.34, diameter: 3.35, sites: ['jiuquan921'] },
};

test('the catalogue contains exactly eight distinct reference configurations and their public dimensions', () => {
  assert.equal(ROCKETS.length, 8);
  assert.equal(new Set(ROCKETS.map(rocket => rocket.id)).size, 8);
  assert.deepEqual(new Set(ROCKETS.map(rocket => rocket.id)), new Set(Object.keys(REFERENCES)));
  for (const [id, expected] of Object.entries(REFERENCES)) {
    const rocket = getRocket(id);
    assert.equal(rocket.id, id);
    assert.equal(rocket.height, expected.height, `${id} public height`);
    assert.equal(rocket.diameter, expected.diameter, `${id} core diameter`);
    assert.ok(rocket.variant && rocket.accuracy, `${id} identifies a configuration and its accuracy limit`);
  }
  assert.equal(getRocket('falcon-heavy').totalWidth, 12.2);
  assert.equal(getRocket('cz8').upperDiameter, 3);
});

test('each rocket exposes only the approved compatible launch sites', () => {
  const siteIds = new Set(SITES.map(site => site.id));
  assert.equal(siteIds.size, SITES.length);
  const usedSiteIds = new Set();
  for (const [id, expected] of Object.entries(REFERENCES)) {
    const rocket = getRocket(id);
    assert.equal(new Set(rocket.siteIds).size, rocket.siteIds.length, `${id} has no duplicate sites`);
    assert.deepEqual(new Set(rocket.siteIds), new Set(expected.sites), `${id} compatibility matrix`);
    assert.deepEqual(new Set(getSitesForRocket(id).map(site => site.id)), new Set(expected.sites), `${id} displayed sites`);
    for (const siteId of rocket.siteIds) {
      assert.ok(siteIds.has(siteId), `${id} references an existing ${siteId}`);
      usedSiteIds.add(siteId);
    }
  }
  assert.deepEqual(usedSiteIds, siteIds, 'no unsupported launch site is silently exposed');
});

for (const id of Object.keys(REFERENCES)) {
  test(`${id}: catalogue modules exactly match selectable model parts`, () => {
    const rocket = getRocket(id);
    const modules = getModules(id);
    const model = createVehicle(rocket);
    try {
      assert.equal(new Set(modules.map(part => part.id)).size, modules.length);
      assert.deepEqual(new Set(modules.map(part => part.id)), new Set(rocket.moduleIds));
      assert.deepEqual(new Set(modules.map(part => part.id)), new Set(model.parts.keys()));
      assert.equal(model.height, rocket.height, 'model scale uses the catalogue height');
      for (const part of modules) {
        assert.ok(part.name && part.subtitle && part.description && part.accuracy, `${id}/${part.id} explanation`);
        assert.ok(Array.isArray(part.facts) && part.facts.length > 0, `${id}/${part.id} facts`);
        assert.ok(part.facts.every(fact => typeof fact === 'string' && fact.length > 0));
        assert.ok(model.parts.get(part.id).children.length > 0, `${id}/${part.id} is not an empty selectable part`);
      }
    } finally {
      model.dispose();
    }
  });
}

test('Falcon Heavy distinguishes central-core engine count from all engines at liftoff', () => {
  const rocket = getRocket('falcon-heavy');
  assert.equal(rocket.firstStageEngines, 9);
  assert.equal(rocket.boosters, 2);
  assert.equal(rocket.boosterEngines, 9);
  assert.equal(rocket.liftoffEngineCount, 27);
  assert.equal(rocket.secondStageEngines, 1);
  for (const item of ROCKETS) {
    assert.equal(item.liftoffEngineCount, item.firstStageEngines + item.boosters * item.boosterEngines, `${item.id} engine accounting`);
  }
});

test('CZ-5B is a single-core-stage vehicle with four boosters and no invented upper stage', () => {
  const rocket = getRocket('cz5b');
  const modules = new Set(getModules('cz5b').map(part => part.id));
  assert.equal(rocket.stages, 1);
  assert.equal(rocket.secondStageEngines, 0);
  assert.equal(rocket.boosters, 4);
  for (const absent of ['stage2', 'engine2', 'interstage', 'landing-legs']) assert.ok(!modules.has(absent));
  assert.ok(modules.has('payload'));
  assert.equal(getMission('cz5b').stageSeparationTime, null);
});

test('Starship has no disposable fairing and its teaching mission never deploys the cabin sample payload', () => {
  const rocket = getRocket('starship');
  const modules = new Set(getModules('starship').map(part => part.id));
  for (const absent of ['fairing-left', 'fairing-right', 'landing-legs']) assert.ok(!modules.has(absent));
  for (const present of ['stage2', 'engine2', 'flaps', 'heatshield', 'interstage']) assert.ok(modules.has(present));
  assert.equal(rocket.firstStageEngines, 33);
  assert.equal(rocket.secondStageEngines, 6);
  assert.equal(rocket.hasRecovery, true, 'catalogue describes recovery design capability');
  const simulation = new FleetSimulation('starship');
  const mission = simulation.mission;
  assert.equal(mission.hasRecovery, false, 'this mission does not implement a recovery demonstration');
  assert.equal(mission.fairingTime, null);
  assert.ok(!mission.events.some(event => /fairing|payload-deployment/.test(event.id)));
  const times = new Set([-10, 0, mission.duration, mission.duration + 100]);
  for (let time = -10; time <= mission.duration; time += 1) times.add(time);
  for (const event of mission.events) for (const offset of [-0.001, 0, 0.001]) times.add(event.time + offset);
  for (const time of times) {
    const state = simulation.seek(time);
    assert.equal(state.deployed, false, `no satellite release at ${time}`);
    assert.equal(state.fairingSeparated, false, `no fairing jettison at ${time}`);
    assert.equal(state.hasRecovery, false, `no displayed recovery at ${time}`);
  }
});

test('CZ-2F uses the crewed spacecraft and escape tower rather than a generic satellite', () => {
  const rocket = getRocket('cz2f');
  const modules = new Set(getModules('cz2f').map(part => part.id));
  for (const present of ['spacecraft', 'escape-tower', 'fairing-left', 'fairing-right']) assert.ok(modules.has(present));
  assert.ok(!modules.has('payload'));
  assert.equal(rocket.secondStageEngines, 1);
  assert.equal(rocket.vernierEngines, 4);
  assert.equal(getMission('cz2f').kind, 'crewed');
});

test('all configuration source identifiers resolve to a named HTTPS source', () => {
  const sources = new Map(SOURCES.map(source => [source.id, source]));
  assert.equal(sources.size, SOURCES.length);
  for (const rocket of ROCKETS) {
    assert.ok(rocket.sourceIds.length > 0, `${rocket.id} cites evidence`);
    for (const id of rocket.sourceIds) {
      const source = sources.get(id);
      assert.ok(source, `${rocket.id}/${id} exists`);
      assert.ok(source.title && source.note);
      assert.equal(new URL(source.url).protocol, 'https:');
    }
  }
});

test('map reference links preserve signed coordinates for American and Chinese locations', () => {
  const easternSites = new Set(['wenchang101', 'wenchang201', 'jiuquan921']);
  for (const site of SITES) {
    const url = new URL(site.mapUrl);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, 'www.google.com');
    const coordinateText = url.searchParams.get('query');
    assert.match(coordinateText, /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/);
    const [lat, lon] = coordinateText.split(',').map(Number);
    assert.equal(lat, site.lat, `${site.id} latitude`);
    assert.equal(lon, site.lon, `${site.id} longitude`);
    assert.ok(lat > 0 && lat <= 90, `${site.id} northern latitude`);
    assert.ok(Math.abs(lon) <= 180);
    assert.ok(easternSites.has(site.id) ? lon > 0 : lon < 0, `${site.id} east/west sign`);
    assert.ok(site.layoutNote, 'reference links do not replace the layout accuracy note');
  }
});
