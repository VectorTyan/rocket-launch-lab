import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCutaway } from '../src/cutaway.js';
import { createVehicle } from '../src/fleet-model.js';
import { ROCKETS } from '../src/fleet-data.js';

function fixture(t, rocket) {
  const vehicle = createVehicle(rocket);
  vehicle.setExplode(0);
  const cutaway = createCutaway(vehicle, rocket);
  t.after(() => { cutaway.dispose(); vehicle.dispose(); });
  return { vehicle, cutaway };
}

function originals(root) {
  const result = new Map();
  root.traverse(object => {
    if (object.isMesh && !object.userData.cutawayInterior) result.set(object, { geometry: object.geometry, material: object.material });
  });
  return result;
}

function interiors(root) {
  const result = [];
  root.traverse(object => { if (object.name === 'educational-cutaway-interior') result.push(object); });
  return result;
}

function close(actual, expected, tolerance = 1e-7) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
}

function sameBounds(actual, expected) {
  for (const side of ['min', 'max']) for (const axis of ['x', 'y', 'z']) close(actual[side][axis], expected[side][axis], 1e-5);
}

for (const rocket of ROCKETS) {
  test(`${rocket.id}: cutaway preserves external geometry/bounds and all module keys through repeated enable/disable`, t => {
    const { vehicle, cutaway } = fixture(t, rocket);
    const keys = [...vehicle.parts.keys()];
    const before = new THREE.Box3().setFromObject(vehicle.root);
    const initial = originals(vehicle.root);
    cutaway.setEnabled(true);
    const groups = interiors(vehicle.root);
    assert.ok(groups.length >= 1);
    assert.ok(groups.every(group => group.visible));
    assert.deepEqual([...vehicle.parts.keys()], keys);
    sameBounds(new THREE.Box3().setFromObject(vehicle.root), before);
    let clonedShells = 0;
    for (const [mesh, original] of initial) {
      assert.equal(mesh.geometry, original.geometry);
      if (mesh.material !== original.material) clonedShells++;
    }
    assert.ok(clonedShells > 0);
    cutaway.setEnabled(true);
    assert.deepEqual(interiors(vehicle.root), groups, 'repeated enable does not duplicate interiors');
    cutaway.setEnabled(false);
    assert.ok(groups.every(group => !group.visible));
    for (const [mesh, original] of initial) assert.equal(mesh.material, original.material);
    sameBounds(new THREE.Box3().setFromObject(vehicle.root), before);
    cutaway.setEnabled(true);
    assert.deepEqual(interiors(vehicle.root), groups);
    cutaway.setEnabled(false);
    for (const [mesh, original] of initial) assert.equal(mesh.material, original.material);
  });
}

test('Falcon 9 clips only shell modules and keeps complete engines, payload and recovery hardware', t => {
  const { vehicle, cutaway } = fixture(t, ROCKETS.find(rocket => rocket.id === 'falcon9'));
  const initial = originals(vehicle.root);
  cutaway.setEnabled(true);
  const shellIds = new Set(['stage1', 'stage2', 'interstage', 'fairing-left', 'fairing-right']);
  for (const [mesh, original] of initial) {
    if (!shellIds.has(mesh.userData.partId) || mesh.userData.cutawayRole === 'internal') {
      assert.equal(mesh.material, original.material, `${mesh.userData.partId}/${mesh.name} stays intact`);
    } else {
      assert.notEqual(mesh.material, original.material);
      for (const material of [mesh.material].flat()) {
        assert.equal(material.side, THREE.DoubleSide);
        assert.equal(material.clipShadows, true);
        assert.ok(material.clippingPlanes.length > 0);
      }
    }
  }
});

test('all side booster nozzles and low engine assemblies remain uncut and interior coordinates remain local', t => {
  for (const rocket of ROCKETS.filter(entry => entry.boosters)) {
    const { vehicle, cutaway } = fixture(t, rocket);
    const initial = originals(vehicle.root);
    cutaway.setEnabled(true);
    let nozzleCount = 0;
    for (const [mesh, original] of initial) {
      if (/^booster-/.test(mesh.userData.partId) && [original.material].flat().some(material => /nozzle/.test(material.name))) {
        assert.equal(mesh.material, original.material);
        nozzleCount++;
      }
    }
    assert.ok(nozzleCount > 0);
    for (const group of interiors(vehicle.root).filter(entry => /^booster-/.test(entry.userData.partId))) {
      assert.equal(group.parent, vehicle.parts.get(group.userData.partId));
      close(group.position.x, 0);
      close(group.position.z, 0);
      close(group.userData.shellEnvelope.x, 0, 1e-5);
      close(group.userData.shellEnvelope.z, 0, 1e-5);
      assert.ok(group.children.every(mesh => mesh.userData.partId === group.userData.partId && mesh.userData.cutawayInterior));
    }
  }
});

test('tank envelopes avoid engine skirts, payload bays and nonexistent CZ-5B upper stages', t => {
  const cases = [
    ['falcon9', 'stage2', 46.7, 56.9],
    ['starship', 'stage2', 74.45, 108],
    ['cz5', 'stage2', 36, 44.7],
    ['cz8', 'stage2', 30.1, 38.3],
    ['cz2f', 'stage2', 28.4, 40.3],
  ];
  for (const [id, partId, low, high] of cases) {
    const { vehicle, cutaway } = fixture(t, ROCKETS.find(rocket => rocket.id === id));
    cutaway.setEnabled(true);
    const group = interiors(vehicle.root).find(entry => entry.userData.partId === partId);
    assert.ok(group, id);
    assert.ok(group.userData.shellEnvelope.low >= low, `${id}: tanks above engine skirt`);
    assert.ok(group.userData.shellEnvelope.high < high, `${id}: tanks below payload bay`);
    for (const craft of interiors(vehicle.root).filter(entry => ['payload', 'spacecraft', 'escape-tower'].includes(entry.userData.partId))) {
      assert.equal(craft.userData.visualization, 'spacecraft-functional-zones');
      assert.equal(craft.children.some(object => ['fuel', 'oxidizer', 'propellant-region'].includes(object.userData.interiorRole)), false);
    }
  }
  const { vehicle, cutaway } = fixture(t, ROCKETS.find(rocket => rocket.id === 'cz5b'));
  cutaway.setEnabled(true);
  assert.equal(interiors(vehicle.root).some(group => group.userData.partId === 'stage2'), false);
});

test('confirmed Falcon and Super Heavy tank orders follow the public interior specifications', t => {
  for (const [id, partId, upperRole] of [
    ['falcon9', 'stage1', 'oxidizer'], ['falcon9', 'stage2', 'oxidizer'],
    ['falcon-heavy', 'booster-1', 'oxidizer'], ['starship', 'stage1', 'fuel'],
  ]) {
    const { vehicle, cutaway } = fixture(t, ROCKETS.find(rocket => rocket.id === id));
    cutaway.setEnabled(true);
    const group = interiors(vehicle.root).find(entry => entry.userData.partId === partId);
    const tanks = group.children.filter(object => ['fuel', 'oxidizer'].includes(object.userData.interiorRole));
    assert.equal(tanks.length, 2);
    assert.equal(group.userData.interiorSpec.confidence, 'confirmed');
    tanks.sort((a, b) => new THREE.Box3().setFromObject(a).getCenter(new THREE.Vector3()).y
      - new THREE.Box3().setFromObject(b).getCenter(new THREE.Vector3()).y);
    assert.equal(tanks[1].userData.interiorRole, upperRole, `${id}/${partId}: correct upper tank`);
    const legend = vehicle.root.userData.cutawayLegend.find(entry => entry.partId === partId);
    assert.ok(legend.sourceIds.length > 0);
    assert.equal(legend.order, upperRole === 'fuel' ? 'fuel-top' : 'oxidizer-top');
  }
});

test('unknown tank orders produce one neutral compartment region without inventing two tank locations', t => {
  for (const id of ['starship', 'cz5', 'cz5b', 'cz7', 'cz8', 'cz2f']) {
    const { vehicle, cutaway } = fixture(t, ROCKETS.find(rocket => rocket.id === id));
    cutaway.setEnabled(true);
    const groups = interiors(vehicle.root).filter(group => group.userData.visualization === 'unresolved-propellant-region');
    assert.ok(groups.length > 0);
    for (const group of groups) {
      assert.equal(group.children.some(object => ['fuel', 'oxidizer'].includes(object.userData.interiorRole)), false);
      assert.equal(group.children.filter(object => object.userData.interiorRole === 'propellant-region').length, 1);
      assert.match(group.userData.visualizationNote, /上下顺序未核实/);
      const legend = vehicle.root.userData.cutawayLegend.find(entry => entry.partId === group.userData.partId);
      assert.equal(legend.oxidizerColor, null);
      assert.equal(legend.fuelColor, null);
      assert.equal(legend.neutralColor, '#a7b4bd');
    }
    if (id === 'starship') {
      const ship = groups.find(group => group.userData.partId === 'stage2');
      assert.equal(ship.children.some(object => /header|鼻部小箱/i.test(object.name)), false);
    }
  }
});

test('text legends distinguish hydrolox cores, kerosene boosters and the CZ-2F hypergolic system', t => {
  const cases = [
    ['cz5', 'stage1', /液氢/], ['cz5', 'booster-1', /煤油/],
    ['cz5b', 'stage1', /液氢/], ['cz8', 'stage2', /液氢/],
    ['cz7', 'stage2', /煤油/], ['cz2f', 'stage1', /UDMH/],
  ];
  for (const [id, partId, fuel] of cases) {
    const { vehicle, cutaway } = fixture(t, ROCKETS.find(rocket => rocket.id === id));
    cutaway.setEnabled(true);
    const legend = vehicle.root.userData.cutawayLegend.find(entry => entry.partId === partId);
    assert.match(legend.fuel, fuel);
    assert.match(legend.oxidizer, id === 'cz2f' ? /四氧化二氮/ : /液氧/);
  }
});

test('Falcon-specific shared bulkhead, double feed line and separation hardware are not copied to unrelated vehicles', t => {
  const { vehicle, cutaway } = fixture(t, ROCKETS[0]);
  cutaway.setEnabled(true);
  const first = interiors(vehicle.root).find(group => group.userData.partId === 'stage1');
  const count = (group, role) => group.children.filter(object => object.userData.interiorRole === role).length;
  assert.equal(count(first, 'common-bulkhead'), 1);
  assert.equal(count(first, 'feed-line'), 1);
  assert.equal(count(first, 'feed-line-inner'), 1);
  const connection = interiors(vehicle.root).find(group => group.userData.partId === 'interstage');
  assert.equal(count(connection, 'separation-latch'), 3);
  assert.equal(count(connection, 'separation-pusher'), 4);
  const other = fixture(t, ROCKETS.find(rocket => rocket.id === 'cz5'));
  other.cutaway.setEnabled(true);
  for (const group of interiors(other.vehicle.root)) {
    assert.equal(count(group, 'common-bulkhead'), 0);
    assert.equal(count(group, 'feed-line-inner'), 0);
    assert.equal(count(group, 'separation-latch'), 0);
  }
});

test('only CZ-2F spacecraft and CZ-7 cargo payload shells gain cabin cutaways; generic payloads stay intact', t => {
  for (const rocket of ROCKETS) {
    const { vehicle, cutaway } = fixture(t, rocket);
    const initial = originals(vehicle.root);
    const craftId = rocket.id === 'cz2f' ? 'spacecraft' : rocket.id === 'cz7' ? 'payload' : null;
    cutaway.setEnabled(true);
    let changed = 0;
    for (const [mesh, original] of initial) {
      if (!['payload', 'spacecraft', 'escape-tower'].includes(mesh.userData.partId)) continue;
      if (mesh.material !== original.material) {
        assert.equal(mesh.userData.partId, craftId);
        assert.ok(['CylinderGeometry', 'LatheGeometry', 'TorusGeometry'].includes(mesh.geometry.type));
        changed++;
      }
      if ([original.material].flat().some(material => /\/blue$/.test(material.name))) {
        assert.equal(mesh.material, original.material, 'solar panels and windows remain whole');
      }
    }
    assert.equal(changed > 0, Boolean(craftId));
    const groups = interiors(vehicle.root).filter(group => group.userData.visualization === 'spacecraft-functional-zones');
    assert.equal(groups.length, craftId ? 1 : 0);
    for (const group of groups) {
      assert.equal(group.parent, vehicle.parts.get(craftId));
      group.traverse(object => {
        assert.equal(object.userData.cutawayInterior, true);
        assert.equal(object.userData.partId, craftId);
        assert.match(object.userData.accuracy, /依据公开舱段功能的教学摆放，非批次实装/);
        assert.ok(!['fuel', 'oxidizer', 'propellant-region'].includes(object.userData.interiorRole));
      });
    }
    cutaway.setEnabled(false);
    for (const [mesh, original] of initial) assert.equal(mesh.material, original.material);
    assert.ok(groups.every(group => !group.visible));
  }
});

test('the Shenzhou teaching cutaway has three empty seats, an instrument region and installation areas inside existing compartments', t => {
  const { vehicle, cutaway } = fixture(t, ROCKETS.find(rocket => rocket.id === 'cz2f'));
  cutaway.setEnabled(true);
  const group = interiors(vehicle.root).find(entry => entry.userData.partId === 'spacecraft');
  const seats = group.children.filter(object => object.userData.interiorRole === 'crew-seat');
  assert.equal(seats.length, 3);
  assert.ok(seats.every(seat => seat.children.length === 2));
  assert.equal(group.children.filter(object => object.userData.interiorRole === 'instrument-panel').length, 1);
  assert.equal(group.children.filter(object => object.userData.interiorRole === 'orbital-installation-plate').length, 1);
  assert.equal(group.children.filter(object => object.userData.interiorRole === 'propulsion-installation-plate').length, 1);
  const profile = [[43.22,1.27],[43.52,1.34],[44.42,1.21],[45.22,.91],[45.47,.84]];
  function radiusAt(y) {
    if (y < 43.22) return 1.28;
    if (y >= 45.47) return 1.11;
    for (let index = 1; index < profile.length; index++) {
      if (y <= profile[index][0]) {
        const [y0,r0] = profile[index - 1], [y1,r1] = profile[index];
        return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
      }
    }
    return .84;
  }
  group.updateWorldMatrix(true, true);
  const inverse = group.parent.matrixWorld.clone().invert();
  group.traverse(object => {
    if (!object.isMesh) return;
    if (object.userData.sectionKind === 'shell-wall') return; // Boundary cuts are shell, not cabin equipment.
    const transform = inverse.clone().multiply(object.matrixWorld);
    const vertices = object.geometry.attributes.position;
    for (let index = 0; index < vertices.count; index++) {
      const point = new THREE.Vector3().fromBufferAttribute(vertices, index).applyMatrix4(transform);
      assert.ok(point.y >= 41.12 && point.y <= 47.42, `${object.name}: inside a supported cabin height`);
      assert.ok(Math.hypot(point.x, point.z) < radiusAt(point.y), `${object.name}: inside the actual local shell`);
    }
  });
});

test('the CZ-7 teaching cargo cutaway has empty racks and a propulsion divider without inventing a cargo manifest', t => {
  const { vehicle, cutaway } = fixture(t, ROCKETS.find(rocket => rocket.id === 'cz7'));
  cutaway.setEnabled(true);
  const group = interiors(vehicle.root).find(entry => entry.userData.partId === 'payload');
  const racks = group.children.filter(object => object.userData.interiorRole === 'cargo-rack');
  assert.equal(racks.length, 2);
  assert.ok(racks.every(rack => rack.children.filter(object => object.userData.interiorRole === 'cargo-shelf').length === 5));
  assert.equal(group.children.filter(object => object.userData.interiorRole === 'propulsion-installation-plate').length, 1);
  assert.equal(group.children.filter(object => object.userData.interiorRole === 'cargo-floor').length, 1);
  group.updateWorldMatrix(true, true);
  const inverse = group.parent.matrixWorld.clone().invert();
  group.traverse(object => {
    if (!object.isMesh) return;
    if (object.userData.sectionKind === 'shell-wall') return;
    assert.ok(!/cargo-load|crew-seat|fuel|oxidizer/.test(object.userData.interiorRole));
    const transform = inverse.clone().multiply(object.matrixWorld);
    const vertices = object.geometry.attributes.position;
    for (let index = 0; index < vertices.count; index++) {
      const point = new THREE.Vector3().fromBufferAttribute(vertices, index).applyMatrix4(transform);
      assert.ok(point.y >= 41.2 && point.y < 48.55, `${object.name}: stays below the tapered nose`);
      assert.ok(Math.hypot(point.x, point.z) < (point.y < 43.35 ? 1.08 : 1.5));
    }
  });
});

test('section plane removes local +Z and follows translated, rotated and scaled vehicle roots', t => {
  const rocket = ROCKETS.find(entry => entry.id === 'falcon9');
  const { vehicle, cutaway } = fixture(t, rocket);
  cutaway.setEnabled(true);
  const shell = [...originals(vehicle.root).keys()].find(mesh => mesh.userData.partId === 'stage1' && mesh.material.clippingPlanes?.length);
  cutaway.setOffset(.25);
  vehicle.root.position.set(20, 30, -10);
  vehicle.root.rotation.set(.2, .45, -.1);
  vehicle.root.scale.set(2, 1.5, .8);
  cutaway.update();
  const plane = shell.material.clippingPlanes.at(-1);
  const sectionZ = rocket.diameter / 2 * .25;
  const boundary = new THREE.Vector3(0, 20, sectionZ).applyMatrix4(vehicle.root.matrixWorld);
  const front = new THREE.Vector3(0, 20, sectionZ + 1).applyMatrix4(vehicle.root.matrixWorld);
  const back = new THREE.Vector3(0, 20, sectionZ - 1).applyMatrix4(vehicle.root.matrixWorld);
  close(plane.distanceToPoint(boundary), 0);
  assert.ok(plane.distanceToPoint(front) < 0, '+Z shell is discarded');
  assert.ok(plane.distanceToPoint(back) > 0, '-Z shell is retained');
  assert.equal(cutaway.setOffset(5), .8);
  assert.equal(cutaway.setOffset(-5), -.8);
  assert.equal(cutaway.setOffset(NaN), 0);
});

test('isolated side boosters use their own centre and radius even when the parent root is transformed or parts are hidden', t => {
  const { vehicle, cutaway } = fixture(t, ROCKETS.find(rocket => rocket.id === 'cz5'));
  cutaway.setEnabled(true);
  const part = vehicle.parts.get('booster-1');
  const group = interiors(part)[0];
  const envelope = group.userData.shellEnvelope;
  let shell;
  part.traverse(object => { if (!shell && object.isMesh && !object.userData.cutawayInterior && object.material.clippingPlanes?.length) shell = object; });
  cutaway.setOffset(.3);
  assert.equal(cutaway.setFocusPart('booster-1'), 'booster-1');
  part.visible = false;
  vehicle.root.position.set(40, -80, 17);
  vehicle.root.rotation.set(.1, -.7, .3);
  vehicle.root.scale.setScalar(1.7);
  cutaway.update();
  const plane = shell.material.clippingPlanes.at(-1);
  const height = (envelope.low + envelope.high) / 2;
  const pointOnPart = new THREE.Vector3(0, height, envelope.z + envelope.shellRadius * .3);
  const boundary = pointOnPart.clone().applyMatrix4(part.matrixWorld);
  close(plane.distanceToPoint(boundary), 0);
  assert.ok(plane.distanceToPoint(pointOnPart.clone().add(new THREE.Vector3(0, 0, .2)).applyMatrix4(part.matrixWorld)) < 0);
  assert.ok(plane.distanceToPoint(pointOnPart.clone().sub(new THREE.Vector3(0, 0, .2)).applyMatrix4(part.matrixWorld)) > 0);
  part.position.z += .8;
  cutaway.update();
  close(plane.distanceToPoint(pointOnPart.clone().applyMatrix4(part.matrixWorld)), 0);
  cutaway.setFocusPart(null);
  const wholeVehicleBoundary = new THREE.Vector3(0, height, 2.5 * .3).applyMatrix4(vehicle.root.matrixWorld);
  close(plane.distanceToPoint(wholeVehicleBoundary), 0);
});

test('focus can change before enabling and restores to the full-vehicle section without changing engine materials', t => {
  const { vehicle, cutaway } = fixture(t, ROCKETS[0]);
  const initial = originals(vehicle.root);
  assert.equal(cutaway.setFocusPart('engine2'), 'engine2');
  cutaway.setEnabled(true);
  for (const [mesh, original] of initial) if (mesh.userData.partId === 'engine2') assert.equal(mesh.material, original.material);
  cutaway.setFocusPart('stage2');
  cutaway.setEnabled(false);
  cutaway.setFocusPart(null);
  cutaway.setEnabled(true);
  const shell = [...initial.keys()].find(mesh => mesh.userData.partId === 'stage1' && mesh.material.clippingPlanes?.length);
  close(shell.material.clippingPlanes.at(-1).constant, 0);
  assert.equal(cutaway.setFocusPart('unknown-part'), null);
});

test('closed shell cylinders suppress artificial panel caps only in cloned shaders', t => {
  const { vehicle, cutaway } = fixture(t, ROCKETS[0]);
  const initial = originals(vehicle.root);
  cutaway.setEnabled(true);
  const shell = [...initial.keys()].find(mesh => mesh.userData.partId === 'stage1'
    && mesh.geometry.type === 'CylinderGeometry' && mesh.geometry.parameters.height > 10);
  const original = initial.get(shell).material;
  const shader = {
    vertexShader: 'void main() {\n#include <begin_vertex>\n}',
    fragmentShader: 'void main() {\n#include <clipping_planes_fragment>\n}',
  };
  shell.material.onBeforeCompile(shader, {});
  assert.match(shader.vertexShader, /vCutawayShellCap = abs\(normal\.y\)/);
  assert.match(shader.fragmentShader, /vCutawayShellCap > 0\.98/);
  assert.notEqual(shell.material.customProgramCacheKey(), original.customProgramCacheKey());
  assert.equal(original.userData.cutawayRemoveShellCaps, undefined);
  cutaway.setEnabled(false);
  assert.equal(shell.material, original);
});

test('each shell object gets its own clone, including material arrays, while originals and shared maps are untouched', t => {
  const root = new THREE.Group(), parts = new Map();
  const originalPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 100);
  const texture = new THREE.Texture();
  const first = new THREE.MeshStandardMaterial({ map: texture, side: THREE.FrontSide, clippingPlanes: [originalPlane], clipIntersection: true, clipShadows: false });
  const second = new THREE.MeshStandardMaterial({ side: THREE.BackSide });
  const originalArray = [first, second];
  const geometry = new THREE.CylinderGeometry(2, 2, 12, 16);
  const firstShell = new THREE.Mesh(geometry, originalArray);
  firstShell.position.y = 8;
  const secondShell = new THREE.Mesh(geometry, first);
  secondShell.position.y = 24;
  for (const [id, mesh] of [['stage1', firstShell], ['stage2', secondShell]]) {
    const part = new THREE.Group(); part.add(mesh); root.add(part); parts.set(id, part);
  }
  const internal = new THREE.Mesh(new THREE.BoxGeometry(.3, .3, .3), first);
  internal.userData.cutawayRole = 'internal';
  parts.get('stage1').add(internal);
  const control = createCutaway({ root, parts }, { id: 'unknown', diameter: 4 });
  let textureDisposals = 0, originalDisposals = 0;
  texture.addEventListener('dispose', () => textureDisposals++);
  first.addEventListener('dispose', () => originalDisposals++);
  t.after(() => { control.dispose(); geometry.dispose(); internal.geometry.dispose(); first.dispose(); second.dispose(); texture.dispose(); });
  control.setEnabled(true);
  assert.ok(Array.isArray(firstShell.material));
  assert.notEqual(firstShell.material, originalArray);
  assert.notEqual(firstShell.material[0], secondShell.material);
  assert.equal(firstShell.material[0].map, texture);
  assert.equal(internal.material, first, 'explicit internal role overrides parent shell classification');
  assert.equal(first.side, THREE.FrontSide);
  assert.equal(first.clipIntersection, true);
  assert.equal(first.clipShadows, false);
  assert.deepEqual(first.clippingPlanes, [originalPlane]);
  assert.equal(second.side, THREE.BackSide);
  control.setEnabled(false);
  assert.equal(firstShell.material, originalArray);
  assert.equal(secondShell.material, first);
  assert.equal(textureDisposals, 0);
  assert.equal(originalDisposals, 0);
});

test('selection highlighting follows original shell materials while internal legend colours stay stable', t => {
  const { vehicle, cutaway } = fixture(t, ROCKETS[0]);
  const initial = originals(vehicle.root);
  cutaway.setEnabled(true);
  const internalColors = new Map();
  for (const group of interiors(vehicle.root)) group.traverse(object => {
    if (object.isMesh) internalColors.set(object.material, object.material.color.clone());
  });
  vehicle.selectPart('stage1');
  cutaway.update();
  for (const [mesh, original] of initial) {
    if (mesh.material === original.material) continue;
    for (const [index, material] of [mesh.material].flat().entries()) {
      const source = [original.material].flat()[index];
      assert.ok(material.emissive.equals(source.emissive));
      assert.equal(material.emissiveIntensity, source.emissiveIntensity);
    }
  }
  for (const [material, color] of internalColors) assert.ok(material.color.equals(color));
});

test('disabling disposes only the current clones and dispose removes owned interiors exactly once', t => {
  const { vehicle, cutaway } = fixture(t, ROCKETS[0]);
  const original = originals(vehicle.root);
  const originalMaterials = new Set([...original.values()].flatMap(entry => [entry.material].flat()));
  let originalsReleased = 0;
  for (const material of originalMaterials) material.addEventListener('dispose', () => originalsReleased++);
  cutaway.setEnabled(true);
  const resources = new Set();
  for (const group of interiors(vehicle.root)) group.traverse(object => {
    if (object.geometry) resources.add(object.geometry);
    if (object.material) for (const material of [object.material].flat()) resources.add(material);
  });
  const cloneDisposals = new Map();
  for (const [mesh, before] of original) if (mesh.material !== before.material) for (const material of [mesh.material].flat()) {
    cloneDisposals.set(material, 0);
    material.addEventListener('dispose', () => cloneDisposals.set(material, cloneDisposals.get(material) + 1));
  }
  const released = new Map([...resources].map(resource => [resource, 0]));
  for (const resource of resources) resource.addEventListener('dispose', () => released.set(resource, released.get(resource) + 1));
  cutaway.setEnabled(false);
  cutaway.setEnabled(false);
  assert.ok([...cloneDisposals.values()].every(count => count === 1));
  assert.ok([...released.values()].every(count => count === 0), 'hidden interiors remain reusable');
  cutaway.dispose(); cutaway.dispose();
  assert.equal(interiors(vehicle.root).length, 0);
  assert.ok([...released.values()].every(count => count === 1));
  assert.equal(originalsReleased, 0);
  for (const [mesh, before] of original) assert.equal(mesh.material, before.material);
  assert.equal(cutaway.setEnabled(true), false);
  assert.doesNotThrow(() => cutaway.update());
});

function sectionMeshes(root, kind, partId) {
  const found = [];
  root.traverse(object => {
    if (object.isMesh && object.userData.cutawaySection
      && (!kind || object.userData.sectionKind === kind)
      && (!partId || object.userData.partId === partId)) found.push(object);
  });
  return found;
}

function triangleArea(geometry) {
  const positions = geometry.attributes.position;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let area = 0;
  for (let i = 0; i < positions.count; i += 3) {
    a.fromBufferAttribute(positions, i); b.fromBufferAttribute(positions, i + 1); c.fromBufferAttribute(positions, i + 2);
    area += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return area;
}

test('confirmed tank sections are filled at the moving cut, retain curved ends, and narrow toward the outer wall', t => {
  const { vehicle, cutaway } = fixture(t, ROCKETS[0]);
  cutaway.setEnabled(true);
  const caps = sectionMeshes(vehicle.root, 'propellant', 'stage1');
  assert.equal(caps.length, 2);
  const initialAreas = caps.map(cap => triangleArea(cap.geometry));
  assert.ok(initialAreas.every(area => area > 5));
  assert.ok(caps.every(cap => cap.geometry.attributes.position.count > 12), 'domed profiles have a shaped section');
  vehicle.root.updateWorldMatrix(true, true);
  const lower = caps.find(cap => /煤油/.test(cap.userData.propellant));
  const center = new THREE.Box3().setFromObject(lower).getCenter(new THREE.Vector3());
  const ray = new THREE.Raycaster(center.clone().add(new THREE.Vector3(0, 0, 20)), new THREE.Vector3(0, 0, -1));
  assert.ok(ray.intersectObject(lower).length > 0, 'the middle of a propellant section is no longer an open surface');
  cutaway.setOffset(.6);
  vehicle.root.position.set(13, -8, 17);
  vehicle.root.rotation.set(.23, -.31, .14);
  vehicle.root.scale.set(1.7, .8, 1.2);
  cutaway.update(); vehicle.root.updateWorldMatrix(true, true);
  let shell;
  vehicle.parts.get('stage1').traverse(object => {
    if (!shell && object.isMesh && !object.userData.cutawayInterior && object.material.clippingPlanes?.length) shell = object;
  });
  const plane = shell.material.clippingPlanes.at(-1);
  caps.forEach((cap, index) => {
    assert.ok(triangleArea(cap.geometry) < initialAreas[index]);
    const position = cap.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(cap.matrixWorld);
      close(plane.distanceToPoint(point), 0, 1e-5);
    }
  });
  assert.ok(sectionMeshes(vehicle.root, 'tank-wall', 'stage1').length === 2);
  assert.ok(sectionMeshes(vehicle.root, 'common-bulkhead', 'stage1').length === 1);
});

test('fairing section layers leave the payload cavity empty and respect the two different half shells', t => {
  const { vehicle, cutaway } = fixture(t, ROCKETS[0]);
  cutaway.setEnabled(true);
  vehicle.root.updateWorldMatrix(true, true);
  const layers = sectionMeshes(vehicle.root).filter(cap => cap.userData.partId.startsWith('fairing-'));
  assert.ok(layers.some(cap => cap.userData.sectionKind === 'fairing-shell'));
  assert.ok(layers.some(cap => cap.userData.sectionKind === 'fairing-liner'));
  for (const x of [-1, 0, 1]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 61, 20), new THREE.Vector3(0, 0, -1));
    assert.equal(ray.intersectObjects(layers).length, 0, 'there is no solid fairing plate across the payload cavity');
  }
  for (const cap of layers) {
    const positions = cap.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(positions, i);
      assert.ok(cap.userData.partId === 'fairing-right' ? point.x >= -1e-6 : point.x <= 1e-6);
    }
  }
});

test('unresolved Chinese tanks remain a single neutral functional section without inventing fluid boundaries', t => {
  const { vehicle, cutaway } = fixture(t, ROCKETS.find(rocket => rocket.id === 'cz5'));
  cutaway.setEnabled(true);
  const region = sectionMeshes(vehicle.root, 'unknown-region', 'stage1');
  assert.equal(region.length, 1);
  assert.equal(sectionMeshes(vehicle.root, 'propellant', 'stage1').length, 0);
  assert.ok(region[0].material.opacity <= .35);
  assert.ok(triangleArea(region[0].geometry) > 0);
  const group = interiors(vehicle.root).find(item => item.userData.partId === 'stage1');
  assert.equal(group.userData.interiorSpec.order, 'unknown');
  assert.equal(group.children.some(object => object.userData.interiorRole === 'common-bulkhead'), false);
});

test('an isolated offset booster gets a section at its own plane and section geometry is reused until the plane changes', t => {
  const { vehicle, cutaway } = fixture(t, ROCKETS.find(rocket => rocket.id === 'falcon-heavy'));
  cutaway.setEnabled(true); cutaway.setFocusPart('booster-1'); cutaway.setOffset(.2);
  const cap = sectionMeshes(vehicle.root, 'propellant', 'booster-1')[0];
  const originalGeometry = cap.geometry;
  let released = 0;
  originalGeometry.addEventListener('dispose', () => released++);
  for (let i = 0; i < 20; i++) cutaway.update();
  assert.equal(cap.geometry, originalGeometry, 'unchanged frames do not allocate section geometry');
  assert.equal(released, 0);
  const part = vehicle.parts.get('booster-1');
  part.position.z += .9;
  cutaway.update(); vehicle.root.updateWorldMatrix(true, true);
  let shell;
  part.traverse(object => { if (!shell && object.isMesh && !object.userData.cutawayInterior && object.material.clippingPlanes?.length) shell = object; });
  const plane = shell.material.clippingPlanes.at(-1);
  for (let i = 0; i < cap.geometry.attributes.position.count; i++) {
    const point = new THREE.Vector3().fromBufferAttribute(cap.geometry.attributes.position, i).applyMatrix4(cap.matrixWorld);
    close(plane.distanceToPoint(point), 0, 1e-5);
  }
  cutaway.setOffset(-.35);
  assert.equal(released, 1);
  const current = cap.geometry;
  let currentReleased = 0;
  current.addEventListener('dispose', () => currentReleased++);
  cutaway.dispose(); cutaway.dispose();
  assert.equal(currentReleased, 1);
});

test('structural cutaways have hollow connection frames and illustrative engine feed components rather than solid interior plugs', t => {
  for (const rocket of ROCKETS) {
    const { vehicle, cutaway } = fixture(t, rocket);
    cutaway.setEnabled(true);
    for (const id of ['engines1', ...(rocket.stages > 1 ? ['engine2'] : [])]) {
      const group = interiors(vehicle.root).find(entry => entry.userData.partId === id);
      assert.ok(group.children.some(object => object.userData.interiorRole === 'pump-functional-example'));
      assert.equal(group.children.filter(object => object.userData.interiorRole === 'engine-feed-example').length, 2);
      assert.ok(group.userData.accuracy.includes('代表性功能示意'));
    }
    const connection = interiors(vehicle.root).find(entry => entry.userData.partId === 'interstage');
    if (rocket.id === 'cz5b') { assert.equal(connection, undefined); continue; }
    assert.equal(connection.children.filter(object => object.userData.interiorRole === 'interstage-frame-ring').length, 2);
    assert.equal(sectionMeshes(connection, 'propellant').length, 0);
  }
});

test('section triangles have finite unit normals at centre and offset cuts so HDR bloom cannot spread invalid lighting', t => {
  for(const rocket of ROCKETS){
    const{vehicle,cutaway}=fixture(t,rocket);cutaway.setEnabled(true);
    for(const offset of [0,.6,-.8]){
      cutaway.setOffset(offset);
      for(const mesh of sectionMeshes(vehicle.root)){
        const normals=mesh.geometry.attributes.normal;
        for(let i=0;i<normals.count;i++){
          const length=Math.hypot(normals.getX(i),normals.getY(i),normals.getZ(i));
          assert.ok(Number.isFinite(length)&&Math.abs(length-1)<1e-5,`${rocket.id}/${mesh.userData.partId}/${mesh.userData.sectionKind} has an invalid normal`);
        }
      }
    }
  }
});
