import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createEarthGlobe } from '../src/earth.js';
import { SITES } from '../src/fleet-data.js';

const RADIUS = 6371000;

function mockEarth(t, { throwOnLoad = false } = {}) {
  const requests = [];
  const warnings = [];
  t.mock.method(console, 'warn', (...args) => warnings.push(args));
  t.mock.method(THREE.TextureLoader.prototype, 'load', function (url, onLoad, onProgress, onError) {
    if (throwOnLoad) throw new Error('Simulated missing browser image API');
    const texture = new THREE.Texture();
    requests.push({ url, texture, resolve: value => onLoad(value ?? texture), reject: error => onError(error) });
    return texture;
  });
  const earth = createEarthGlobe();
  t.after(() => earth.dispose());
  return { earth, requests, warnings };
}

function countDisposals(resource) {
  let count = 0;
  resource.addEventListener('dispose', () => count++);
  return () => count;
}

function geographicNormal(latitude, longitude) {
  const latitudeRadians = latitude * Math.PI / 180;
  const longitudeRadians = longitude * Math.PI / 180;
  return new THREE.Vector3(
    Math.cos(latitudeRadians) * Math.cos(longitudeRadians),
    Math.sin(latitudeRadians),
    -Math.cos(latitudeRadians) * Math.sin(longitudeRadians),
  );
}

test('Earth requests only the local NASA asset and remains usable before its asynchronous load finishes', t => {
  const { earth, requests, warnings } = mockEarth(t);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /^\/assets\/earth\/nasa-blue-marble-2002-2048\.jpg$/);
  assert.equal(earth.root.userData.textureStatus, 'loading');
  assert.equal(earth.root.userData.historicalComposite, true);
  const surface = earth.root.children[0];
  assert.equal(surface.geometry.parameters.radius, RADIUS);
  assert.ok(surface.geometry.parameters.widthSegments >= 256);
  assert.ok(surface.geometry.parameters.heightSegments >= 192);
  assert.equal(surface.material.isMeshStandardMaterial, true);
  assert.equal(surface.material.map, null);
  assert.equal(surface.material.color.getHexString(), '204f71');
  assert.doesNotThrow(() => earth.setSite(SITES[0]));
  assert.equal(warnings.length, 0);
});

test('raycasting the ground point returns the expected NASA image UV for all seven launch sites', t => {
  const { earth } = mockEarth(t);
  assert.equal(SITES.length, 7);
  const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 8000000, 0), new THREE.Vector3(0, -1, 0));
  for (const site of SITES) {
    earth.setSite(site);
    earth.root.updateMatrixWorld(true);
    const hit = raycaster.intersectObject(earth.root, true)[0];
    assert.ok(hit, `${site.id}: the ground ray must intersect the globe`);
    const expectedU = (site.lon + 180) / 360;
    const expectedV = (site.lat + 90) / 180;
    // Allow interpolation error from the finite-resolution spherical triangles.
    assert.ok(Math.abs(hit.uv.x - expectedU) < 0.00002, `${site.id}: longitude UV`);
    assert.ok(Math.abs(hit.uv.y - expectedV) < 0.00002, `${site.id}: latitude UV`);
    assert.ok(Math.abs(earth.root.userData.groundUV.u - expectedU) < 1e-12);
    assert.ok(Math.abs(earth.root.userData.groundUV.v - expectedV) < 1e-12);
  }
});

test('setSite preserves caller translation and places east at +X, outward at +Y and north at -Z', t => {
  const { earth } = mockEarth(t);
  const position = new THREE.Vector3(-234000, -RADIUS - 67000, 4567);
  const step = 0.0001;
  for (const site of SITES) {
    earth.root.position.copy(position);
    earth.setSite(site);
    assert.deepEqual(earth.root.position.toArray(), position.toArray(), `${site.id}: caller-owned world origin`);
    const normal = geographicNormal(site.lat, site.lon);
    const outward = normal.clone().applyQuaternion(earth.root.quaternion);
    const east = geographicNormal(site.lat, site.lon + step).sub(normal).normalize().applyQuaternion(earth.root.quaternion);
    const north = geographicNormal(site.lat + step, site.lon).sub(normal).normalize().applyQuaternion(earth.root.quaternion);
    assert.ok(outward.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-12, `${site.id}: outward normal`);
    assert.ok(east.distanceTo(new THREE.Vector3(1, 0, 0)) < 0.000002, `${site.id}: increasing longitude moves east`);
    assert.ok(north.distanceTo(new THREE.Vector3(0, 0, -1)) < 0.000002, `${site.id}: increasing latitude moves north`);
  }
});

test('a successful local texture load applies sRGB colour and updates the material', t => {
  const { earth, requests, warnings } = mockEarth(t);
  const { texture } = requests[0];
  requests[0].resolve();
  const material = earth.root.children[0].material;
  assert.equal(earth.root.userData.textureStatus, 'loaded');
  assert.equal(material.map, texture);
  assert.equal(material.color.getHexString(), 'ffffff');
  assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
  assert.equal(texture.wrapS, THREE.RepeatWrapping);
  assert.equal(texture.wrapT, THREE.ClampToEdgeWrapping);
  assert.equal(texture.flipY, true);
  assert.equal(warnings.length, 0);
});

test('an asynchronous texture failure retains the fallback globe and does not block site changes', t => {
  const { earth, requests, warnings } = mockEarth(t);
  const error = new Error('Simulated local JPEG decode failure');
  assert.doesNotThrow(() => requests[0].reject(error));
  assert.equal(earth.root.userData.textureStatus, 'fallback');
  assert.equal(earth.root.children[0].material.map, null);
  assert.equal(earth.root.children[0].material.color.getHexString(), '204f71');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0][0], /fallback globe/);
  assert.equal(warnings[0][1], error);
  assert.doesNotThrow(() => earth.setSite(SITES.at(-1)));
  assert.equal(earth.root.userData.site.id, SITES.at(-1).id);
});

test('a synchronous TextureLoader failure also returns a usable fallback without propagating an exception', t => {
  const { earth, requests, warnings } = mockEarth(t, { throwOnLoad: true });
  assert.equal(requests.length, 0);
  assert.equal(earth.root.userData.textureStatus, 'fallback');
  assert.equal(warnings.length, 1);
  assert.doesNotThrow(() => earth.setSite(SITES[0]));
  assert.doesNotThrow(() => earth.dispose());
});

test('dispose after loading releases the shared texture, geometry and material exactly once', t => {
  const { earth, requests } = mockEarth(t);
  const parent = new THREE.Group();
  parent.add(earth.root);
  requests[0].resolve();
  const surface = earth.root.children[0];
  const textureDisposals = countDisposals(requests[0].texture);
  const geometryDisposals = countDisposals(surface.geometry);
  const materialDisposals = countDisposals(surface.material);
  earth.dispose();
  earth.dispose();
  requests[0].resolve(); // A duplicate/late callback must not re-release the texture.
  assert.equal(textureDisposals(), 1);
  assert.equal(geometryDisposals(), 1);
  assert.equal(materialDisposals(), 1);
  assert.equal(earth.root.parent, null);
  assert.equal(parent.children.length, 0);
});

test('dispose before loading releases late textures once and ignores late errors or site updates', t => {
  const { earth, requests, warnings } = mockEarth(t);
  const textureDisposals = countDisposals(requests[0].texture);
  const surface = earth.root.children[0];
  const geometryDisposals = countDisposals(surface.geometry);
  const materialDisposals = countDisposals(surface.material);
  const previousSite = { ...earth.root.userData.site };
  earth.dispose();
  requests[0].resolve();
  requests[0].resolve();
  requests[0].reject(new Error('Late failure after disposal'));
  // Defensive coverage for a loader returning a different completion texture.
  const lateTexture = new THREE.Texture();
  const lateDisposals = countDisposals(lateTexture);
  requests[0].resolve(lateTexture);
  requests[0].resolve(lateTexture);
  earth.setSite(SITES.at(-1));
  earth.dispose();
  assert.equal(textureDisposals(), 1);
  assert.equal(lateDisposals(), 1);
  assert.equal(geometryDisposals(), 1);
  assert.equal(materialDisposals(), 1);
  assert.equal(surface.material.map, null);
  assert.equal(earth.root.userData.textureStatus, 'loading');
  assert.deepEqual(earth.root.userData.site, previousSite);
  assert.equal(warnings.length, 0);
});

test('the bundled NASA JPEG matches its documented byte count and SHA-256 without any network access', async () => {
  const bytes = await readFile(new URL('../public/assets/earth/nasa-blue-marble-2002-2048.jpg', import.meta.url));
  const attribution = await readFile(new URL('../public/assets/earth/ATTRIBUTION.md', import.meta.url), 'utf8');
  const hash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(bytes.length, 266599);
  assert.equal(bytes.readUInt16BE(0), 0xffd8);
  assert.equal(hash, 'd4dc80a6ef571939d0abe04a9bed3d3d1e6cd63e59514be1c5e43a6b069e6f1e');
  assert.ok(attribution.includes(hash));
  assert.match(attribution, /historical global composite/);
});
