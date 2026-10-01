import * as THREE from 'three';
import { createRocket } from './rocket.js';
import { createModelMaterials } from './model-materials.js';

const TAU = Math.PI * 2;
const clamp = value => THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
const SPECS = {
  falcon9: { height: 70, diameter: 3.7, firstTop: 41.7, upperBase: 43.62 },
  'falcon-heavy': { height: 70, diameter: 3.7, firstTop: 41.7, upperBase: 43.62, boosterCount: 2 },
  starship: { height: 124.4, diameter: 9, firstTop: 71.1, upperBase: 71.1 },
  cz5: { height: 57, diameter: 5, firstTop: 32.8, upperBase: 33.1, upperBody: 36.0, fairingBase: 44.7, fairingDiameter: 5.2, boosterCount: 4, boosterDiameter: 3.35, boosterHeight: 31, firstEngines: 2, boosterEngines: 2, secondEngines: 2 },
  cz5b: { height: 53.7, diameter: 5, firstTop: 33.2, upperBase: 33.2, fairingBase: 33.2, fairingDiameter: 5.2, boosterCount: 4, boosterDiameter: 3.35, boosterHeight: 31, firstEngines: 2, boosterEngines: 2, secondEngines: 0 },
  cz7: { height: 53.1, diameter: 3.35, firstTop: 29.4, upperBase: 29.5, upperBody: 32.1, fairingBase: 40.8, fairingDiameter: 4.2, boosterCount: 4, boosterDiameter: 2.25, boosterHeight: 27, firstEngines: 2, boosterEngines: 1, secondEngines: 4 },
  cz8: { height: 50.3, diameter: 3.35, upperDiameter: 3, firstTop: 27.1, upperBase: 27.3, upperBody: 30.1, fairingBase: 38.3, fairingDiameter: 4.2, boosterCount: 2, boosterDiameter: 2.25, boosterHeight: 26, firstEngines: 2, boosterEngines: 1, secondEngines: 2 },
  cz2f: { height: 58.34, diameter: 3.35, firstTop: 25.5, upperBase: 25.6, upperBody: 28.4, fairingBase: 40.3, fairingTop: 50, fairingDiameter: 3.8, boosterCount: 4, boosterDiameter: 2.25, boosterHeight: 24.5, firstEngines: 4, boosterEngines: 1, secondEngines: 1 },
};

function builder(root = new THREE.Group(), parts = new Map()) {
  const palette = createModelMaterials();
  const geometries = new Set();
  function part(id, label = id) {
    if (!parts.has(id)) {
      const group = new THREE.Group();
      group.name = label;
      group.userData = { partId: id, educational: true };
      parts.set(id, group);
      root.add(group);
    }
    return parts.get(id);
  }
  function mesh(id, geometry, style = 'white', position = [0, 0, 0], rotation = [0, 0, 0], parent = part(id)) {
    geometries.add(geometry);
    const object = new THREE.Mesh(geometry, typeof style === 'string' ? palette.material(id, style) : style);
    object.position.set(...position); object.rotation.set(...rotation);
    object.castShadow = true; object.receiveShadow = true;
    object.userData.partId = id;
    parent.add(object);
    return object;
  }
  function instances(id, geometry, style, transforms, parent = part(id)) {
    geometries.add(geometry);
    const object = new THREE.InstancedMesh(geometry, palette.material(id, style), transforms.length);
    object.name = `${id}/${style} instances`;
    object.userData.partId = id;
    const dummy = new THREE.Object3D();
    transforms.forEach((transform, index) => {
      dummy.position.set(...(transform.position || [0, 0, 0]));
      dummy.rotation.set(...(transform.rotation || [0, 0, 0]));
      if (transform.quaternion) dummy.quaternion.copy(transform.quaternion);
      dummy.scale.set(...(transform.scale || [1, 1, 1]));
      dummy.updateMatrix(); object.setMatrixAt(index, dummy.matrix);
    });
    object.instanceMatrix.needsUpdate = true;
    object.castShadow = true; object.receiveShadow = true;
    object.computeBoundingSphere();
    parent.add(object);
    return object;
  }
  function cylinder(id, radius, low, high, style = 'white', top = radius, parent) {
    return mesh(id, new THREE.CylinderGeometry(top, radius, high - low, 80), style, [0, (low + high) / 2, 0], undefined, parent);
  }
  function lathe(id, profile, style = 'white', start = 0, length = TAU, parent) {
    return mesh(id, new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(...p)), length === TAU ? 80 : 48, start, length), style, undefined, undefined, parent);
  }
  function rings(id, radius, heights, style = 'offwhite', thickness = 0.016, parent) {
    const geometry = new THREE.TorusGeometry(radius, thickness, 6, 80);
    return instances(id, geometry, style, heights.map(y => ({ position: [0, y, 0], rotation: [Math.PI / 2, 0, 0] })), parent);
  }
  function beam(id, a, b, radius, style = 'steel', parent) {
    const first = new THREE.Vector3(...a), second = new THREE.Vector3(...b);
    const delta = second.clone().sub(first);
    const object = mesh(id, new THREE.CylinderGeometry(radius, radius, delta.length(), 10), style, first.clone().add(second).multiplyScalar(0.5).toArray(), undefined, parent);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    return object;
  }
  function tube(id, points, radius, style = 'steel', parent) {
    const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    return mesh(id, new THREE.TubeGeometry(path, points.length * 8, radius, 7, false), style, undefined, undefined, parent);
  }
  function hull(id, radius, low, high, { steel = false, bands = 7, label = null, parent } = {}) {
    cylinder(id, radius, low, high, steel ? 'steel' : 'white', radius, parent);
    const ys = Array.from({ length: bands + 1 }, (_, i) => low + (high - low) * i / bands);
    rings(id, radius + 0.008, ys, steel ? 'polished' : 'offwhite', steel ? 0.014 : 0.021, parent);
    const screws = [];
    for (const y of [low + 0.15, high - 0.16]) for (let i = 0; i < 52; i++) {
      const a = TAU * i / 52;
      screws.push({ position: [Math.sin(a) * (radius + 0.019), y, Math.cos(a) * (radius + 0.019)] });
    }
    instances(id, new THREE.IcosahedronGeometry(0.018, 0), steel ? 'darkmetal' : 'steel', screws, parent);
    for (const angle of [1.2, 3.75]) {
      const r = radius + 0.043;
      mesh(id, new THREE.BoxGeometry(steel ? 0.18 : 0.13, (high - low) * 0.88, 0.09), steel ? 'polished' : 'offwhite', [Math.sin(angle) * r, (low + high) / 2, Math.cos(angle) * r], [0, angle, 0], parent);
    }
    const dome = mesh(id, new THREE.SphereGeometry(radius * 0.95, 40, 18, 0, TAU, 0, Math.PI / 2), 'darkmetal', [0, high - 0.1, 0], undefined, parent);
    dome.scale.y = 0.22;
    if (label) textLabel(id, radius, (low + high) / 2, Math.min(9, (high - low) * 0.6), label, parent);
  }
  function textLabel(id, radius, y, height, words, parent) {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 2048;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const chinese = /[\u4e00-\u9fff]/.test(words);
    ctx.fillStyle = chinese ? '#a62926' : '#192630';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (chinese) {
      ctx.font = '700 290px "Microsoft YaHei", sans-serif';
      [...words].forEach((word, i) => ctx.fillText(word, 256, 250 + i * 360));
    } else {
      ctx.translate(256, 1024); ctx.rotate(-Math.PI / 2);
      ctx.font = '600 180px Arial, sans-serif'; ctx.fillText(words, 0, 0, 1760);
    }
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
    const mat = palette.addMaterial(id, `label-${words}-${y}`, new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
    const angle = Math.min(0.43, 0.83 / radius);
    for (const orientation of [0, Math.PI]) {
      mesh(id, new THREE.CylinderGeometry(radius + 0.011, radius + 0.011, height, 14, 1, true, orientation - angle / 2, angle), mat, [0, y, 0], undefined, parent);
    }
  }
  function engines(id, locations, { bell = 0.49, length = 2.4, bottom = 0, vacuum = false, parent } = {}) {
    const profile = [[bell, 0.045], [bell * 0.98, length * 0.1], [bell * 0.84, length * 0.34], [bell * 0.58, length * 0.58], [bell * 0.31, length * 0.76], [bell * 0.27, length * 0.86]];
    const bellGeometry = new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(...p)), vacuum ? 52 : 32);
    const poses = locations.map(([x, z]) => ({ position: [x, bottom, z] }));
    instances(id, bellGeometry, 'nozzle', poses, parent);
    const rim = new THREE.TorusGeometry(bell, 0.045, 8, 40);
    instances(id, rim, 'copper', locations.map(([x, z]) => ({ position: [x, bottom + 0.045, z], rotation: [Math.PI / 2, 0, 0] })), parent);
    const chamber = new THREE.CylinderGeometry(bell * 0.27, bell * 0.27, length * 0.26, 20);
    instances(id, chamber, 'polished', locations.map(([x, z]) => ({ position: [x, bottom + length * 0.94, z] })), parent);
    instances(id, new THREE.BoxGeometry(bell * 0.65, length * 0.22, bell * 0.7), 'darkmetal', locations.map(([x, z]) => ({ position: [x + bell * 0.42, bottom + length * 0.91, z] })), parent);
    const conduits = [];
    for (const [x, z] of locations) for (const side of [-1, 1]) conduits.push({ position: [x + side * bell * 0.43, bottom + length * 0.68, z + bell * 0.18], rotation: [0, 0, side * 0.16] });
    instances(id, new THREE.CylinderGeometry(0.035, 0.035, length * 0.63, 8), 'polished', conduits, parent);
  }
  function release({ sharedRoot = false } = {}) {
    if (!sharedRoot) geometries.forEach(geometry => geometry.dispose());
    root.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
    palette.dispose({ materials: !sharedRoot });
  }
  return { root, parts, palette, part, mesh, instances, cylinder, lathe, rings, beam, tube, hull, textLabel, engines, release };
}

function circle(count, radius, start = 0) {
  return Array.from({ length: count }, (_, i) => [Math.sin(start + TAU * i / count) * radius, Math.cos(start + TAU * i / count) * radius]);
}

/** Exact mouth centres and bell radii used by the local meshes, in vehicle metres. */
export function getNozzleLayout(rocket = 'falcon9') {
  const id = typeof rocket === 'string' ? rocket : rocket.id;
  const spec = SPECS[id];
  if (!spec) throw new RangeError(`Unknown rocket nozzle layout: ${id}`);
  const nozzles = (locations, radius, y = 0.045, kind = 'main') => locations.map(([x, z]) => ({ position: [x, y, z], radius, kind }));
  let core, upper;
  const boosters = [];
  if (id === 'falcon9' || id === 'falcon-heavy') {
    core = { id: 'core', fuel: 'kerolox', engineFamily: 'Merlin', length: 32, nozzles: nozzles([[0, 0], ...circle(8, 1.15)], 0.4, 0.04) };
    upper = { id: 'upper', fuel: 'kerolox', engineFamily: 'Merlin Vacuum', length: 24, nozzles: nozzles([[0, 0]], 1.24, 43.62) };
    if (id === 'falcon-heavy') for (const sign of [-1, 1]) {
      boosters.push({ id: `booster-${boosters.length + 1}`, fuel: 'kerolox', engineFamily: 'Merlin', length: 32,
        nozzles: nozzles([[0, 0], ...circle(8, 1.15)].map(([x, z]) => [x + sign * 4.25, z]), 0.4) });
    }
  } else if (id === 'starship') {
    core = { id: 'core', fuel: 'methalox', engineFamily: 'Raptor', length: 47,
      nozzles: nozzles([...circle(20, 3.52), ...circle(10, 2.05, Math.PI / 10), ...circle(3, 0.73)], 0.54) };
    upper = { id: 'upper', fuel: 'methalox', engineFamily: 'Raptor sea level + vacuum', length: 31,
      nozzles: [...nozzles(circle(3, 2.72), 1.04, 71.145, 'vacuum'), ...nozzles(circle(3, 1.05, Math.PI / 3), 0.59, 71.545, 'sea-level')] };
  } else {
    const radius = spec.diameter / 2;
    const coreFuel = id === 'cz5' || id === 'cz5b' ? 'hydrolox' : id === 'cz2f' ? 'hypergolic' : 'kerolox';
    const coreLocations = spec.firstEngines === 4 ? circle(4, 0.94, Math.PI / 4) : [[-radius * 0.43, 0], [radius * 0.43, 0]];
    core = { id: 'core', fuel: coreFuel, engineFamily: coreFuel === 'hydrolox' ? 'YF-77' : id === 'cz2f' ? 'YF-20 family' : 'YF-100', length: coreFuel === 'hydrolox' ? 38 : 30,
      nozzles: nozzles(coreLocations, spec.firstEngines === 4 ? 0.54 : radius > 2 ? 0.82 : 0.63) };
    const upperR = (spec.upperDiameter || spec.diameter) / 2;
    const upperLocations = !spec.secondEngines ? [] : spec.secondEngines === 1 ? [[0, 0]] : spec.secondEngines === 2 ? [[-upperR * 0.47, 0], [upperR * 0.47, 0]] : circle(4, 0.85, Math.PI / 4);
    const upperFuel = id === 'cz7' ? 'kerolox' : id === 'cz2f' ? 'hypergolic' : 'hydrolox';
    upper = { id: 'upper', fuel: upperFuel, engineFamily: id === 'cz7' ? 'YF-115' : id === 'cz2f' ? 'YF-22 main + YF-23 verniers' : id === 'cz8' ? 'YF-75' : 'YF-75D', length: 22,
      nozzles: nozzles(upperLocations, spec.secondEngines === 4 ? 0.51 : spec.secondEngines === 1 ? 0.96 : upperR > 2 ? 0.83 : 0.65, spec.upperBase + 0.045) };
    if (id === 'cz2f') upper.nozzles.push(...nozzles(circle(4, 1.19, Math.PI / 4), 0.16, spec.upperBase + 1.145, 'vernier'));
    for (let index = 0; index < spec.boosterCount; index++) {
      const boosterR = spec.boosterDiameter / 2;
      const offset = radius + boosterR + 0.06;
      const angle = spec.boosterCount === 2 ? Math.PI / 2 + index * Math.PI : Math.PI / 4 + index * Math.PI / 2;
      const local = spec.boosterEngines === 2 ? [[-0.63, 0], [0.63, 0]] : [[0, 0]];
      boosters.push({ id: `booster-${index + 1}`, fuel: id === 'cz2f' ? 'hypergolic' : 'kerolox', engineFamily: id === 'cz2f' ? 'YF-20 family' : 'YF-100', length: 27,
        nozzles: nozzles(local.map(([x, z]) => [x + Math.sin(angle) * offset, z + Math.cos(angle) * offset]), spec.boosterEngines === 2 ? 0.6 : 0.71) });
    }
  }
  return { rocketId: id, upperBase: spec.upperBase, core, upper, boosters };
}

function addGridFins(b, id, radius, y, count = 4, size = 1.5, parent) {
  const pivots = [];
  for (let i = 0; i < count; i++) {
    const angle = TAU * i / count + Math.PI / 4;
    const carrier = new THREE.Group(); carrier.position.set(Math.sin(angle) * radius, y, Math.cos(angle) * radius); carrier.rotation.y = angle;
    (parent || b.part(id)).add(carrier);
    const pivot = new THREE.Group(); carrier.add(pivot); pivots.push(pivot);
    const bars = [];
    for (let j = 0; j <= 7; j++) {
      bars.push({ position: [-size / 2 + size * j / 7, size / 2, 0], scale: [0.04, size, 0.12] });
      bars.push({ position: [0, size * j / 7, 0], scale: [size, 0.04, 0.12] });
    }
    b.instances(id, new THREE.BoxGeometry(1, 1, 1), 'darkmetal', bars, pivot);
    b.mesh(id, new THREE.CylinderGeometry(0.11, 0.11, size * 0.8, 12), 'polished', [0, 0, 0], [0, 0, Math.PI / 2], carrier);
  }
  return pivots;
}

function addLandingLegs(b, id, radius, parent) {
  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 2;
    const leg = new THREE.Group(); leg.rotation.y = angle; leg.position.set(Math.sin(angle) * (radius + 0.08), 3.4, Math.cos(angle) * (radius + 0.08));
    (parent || b.part(id)).add(leg);
    const shape = new THREE.Shape(); shape.moveTo(-0.38, 0); shape.lineTo(-0.08, 7.2); shape.lineTo(0.08, 7.2); shape.lineTo(0.38, 0); shape.closePath();
    b.mesh(id, new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false }), 'carbon', undefined, undefined, leg);
    b.beam(id, [0, 0.2, 0.15], [0, 6.1, 0.15], 0.04, 'steel', leg);
  }
}

function addFairing(b, radius, coreRadius, low, high) {
  const height = high - low;
  const shoulder = low + Math.min(2.1, height * 0.16);
  const nose = high - height * 0.39;
  const profile = [[coreRadius, low]];
  for (let i = 1; i <= 8; i++) profile.push([coreRadius + (radius - coreRadius) * Math.sin(i / 8 * Math.PI / 2), low + (shoulder - low) * i / 8]);
  profile.push([radius, nose]);
  for (let i = 1; i <= 24; i++) profile.push([i === 24 ? 0 : radius * Math.cos(i / 24 * Math.PI / 2) ** 1.08, nose + (high - nose) * i / 24]);
  for (const [id, start] of [['fairing-right', 0], ['fairing-left', Math.PI]]) {
    b.lathe(id, profile, 'white', start, Math.PI);
    b.lathe(id, profile.map(([r, y]) => [Math.max(0, r - 0.04), y]), 'interior', start, Math.PI);
    for (const y of [shoulder + 0.3, (shoulder + nose) / 2, nose - 0.2]) {
      b.tube(id, Array.from({ length: 22 }, (_, i) => { const a = start + Math.PI * i / 21; return [Math.sin(a) * (radius - 0.06), y, Math.cos(a) * (radius - 0.06)]; }), 0.025, 'offwhite');
    }
  }
}

function addSatellite(b, id, base, radius = 1.05) {
  b.cylinder(id, radius * 1.18, base, base + 1.1, 'darkmetal', radius * 0.64);
  b.mesh(id, new THREE.BoxGeometry(radius * 1.5, 2.8, radius * 1.5), 'gold', [0, base + 2.5, 0]);
  for (const x of [-1, 1]) {
    b.mesh(id, new THREE.BoxGeometry(0.06, 2.5, radius * 1.4), 'blue', [x * radius * 0.82, base + 2.5, 0]);
  }
  const dish = b.mesh(id, new THREE.SphereGeometry(radius * 0.58, 28, 12, 0, TAU, 0, Math.PI / 2), 'white', [0, base + 4.1, 0]); dish.scale.y = 0.24;
  b.beam(id, [0, base + 4.0, 0], [0, base + 4.7, 0], 0.025, 'polished');
}

function foldedSolarPanels(b, id, radial, low, high, width) {
  const height = high - low;
  b.instances(id, new THREE.BoxGeometry(0.12, height, width), 'blue', [-1, 1].map(side => ({ position: [side * radial, (low + high) / 2, 0] })));
  const seams = [], rails = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i <= 8; i++) seams.push({ position: [side * (radial + 0.065), low + height * i / 8, 0] });
    for (const z of [-width / 2, 0, width / 2]) rails.push({ position: [side * (radial + 0.065), (low + high) / 2, z] });
  }
  b.instances(id, new THREE.BoxGeometry(0.02, 0.025, width), 'steel', seams);
  b.instances(id, new THREE.BoxGeometry(0.02, height, 0.025), 'steel', rails);
}

function addLargeTeachingModule(b, base) {
  const id = 'payload';
  b.part(id, '大型教学舱段（非特定实船）').userData.payloadRole = 'generic large pressurised module';
  b.cylinder(id, 1.15, base, base + 0.2, 'darkmetal', 1.45);
  b.lathe(id, [[1.45, base + 0.2], [1.77, base + 0.55], [1.9, base + 1.15]], 'gold');
  b.cylinder(id, 1.9, base + 1.15, base + 8.1, 'white');
  b.cylinder(id, 1.9, base + 8.1, base + 12.1, 'offwhite');
  b.rings(id, 1.913, [base + 1.25, base + 4.8, base + 8.1, base + 11.95], 'steel', 0.022);
  b.lathe(id, [[1.9, base + 12.1], [1.75, base + 12.4], [1.24, base + 12.68], [0.72, base + 12.8]], 'gold');
  b.cylinder(id, 0.72, base + 12.8, base + 13, 'steel');
  b.cylinder(id, 0.55, base + 12.99, base + 13, 'darkmetal');
  foldedSolarPanels(b, id, 1.99, base + 2.8, base + 9.3, 1.34);
  const ports = [-1, 1].map(side => ({ position: [0, base + 6.1, side * 1.906], rotation: [Math.PI / 2, 0, 0] }));
  b.instances(id, new THREE.CylinderGeometry(0.32, 0.32, 0.055, 28), 'steel', ports);
}

function addTeachingCargoShip(b, base) {
  const id = 'payload';
  b.part(id, '货运飞船教学示例（非精确天舟模型）').userData.payloadRole = 'generic cargo spacecraft';
  b.cylinder(id, 0.82, base, base + 0.2, 'darkmetal', 1.08);
  b.cylinder(id, 1.08, base + 0.2, base + 2.35, 'gold');
  b.cylinder(id, 1.08, base + 2.35, base + 3.0, 'offwhite', 1.5);
  b.cylinder(id, 1.5, base + 3.0, base + 7.55, 'white');
  b.rings(id, 1.512, [base + 3.1, base + 5.3, base + 7.46], 'steel', 0.019);
  b.lathe(id, [[1.5, base + 7.55], [1.37, base + 7.88], [0.98, base + 8.15], [0.6, base + 8.38]], 'offwhite');
  b.cylinder(id, 0.6, base + 8.38, base + 8.7, 'steel');
  b.cylinder(id, 0.47, base + 8.685, base + 8.7, 'darkmetal');
  foldedSolarPanels(b, id, 1.2, base + 0.35, base + 2.2, 1.02);
  b.mesh(id, new THREE.BoxGeometry(0.4, 0.52, 0.1), 'darkmetal', [0, base + 6.7, 1.505]);
}

function addChineseBooster(b, id, spec, index) {
  const radius = spec.boosterDiameter / 2;
  const radial = spec.diameter / 2 + radius + 0.06;
  const angle = spec.boosterCount === 2 ? Math.PI / 2 + index * Math.PI : Math.PI / 4 + index * Math.PI / 2;
  const group = b.part(id, `助推器 ${index + 1}`);
  group.position.set(Math.sin(angle) * radial, 0, Math.cos(angle) * radial);
  group.userData.radial = { angle, radius: radial };
  const bodyTop = spec.boosterHeight - 4.0;
  b.hull(id, radius, 2.25, bodyTop, { bands: 7, label: index === 0 ? '中国航天' : null });
  b.cylinder(id, radius, 1.6, 2.25, 'offwhite');
  b.lathe(id, [[radius, bodyTop], [radius * 0.96, bodyTop + 0.7], [radius * 0.72, bodyTop + 2.3], [radius * 0.31, bodyTop + 3.5], [0, spec.boosterHeight]], 'white');
  b.engines(id, spec.boosterEngines === 2 ? [[-0.63, 0], [0.63, 0]] : [[0, 0]], { bell: spec.boosterEngines === 2 ? 0.6 : 0.71, length: 2.1 });
  b.rings(id, radius + 0.008, [3.0, bodyTop - 0.2], 'red', 0.06);
  const mounts = [3.3, bodyTop - 1.1].map(y => ({ position: [-Math.sin(angle) * radius, y, -Math.cos(angle) * radius], rotation: [0, angle, 0] }));
  b.instances(id, new THREE.BoxGeometry(0.4, 0.55, 0.5), 'darkmetal', mounts);
  return { id, angle, radial };
}

function addShenzhou(b, base) {
  const id = 'spacecraft';
  b.cylinder(id, 1.28, base + 0.7, base + 2.8, 'gold');
  b.lathe(id, [[1.27, base + 2.8], [1.34, base + 3.1], [1.21, base + 4.0], [0.91, base + 4.8], [0.84, base + 5.05]], 'offwhite');
  b.cylinder(id, 1.11, base + 5.05, base + 7.0, 'offwhite');
  b.cylinder(id, 0.62, base + 7.0, base + 7.5, 'steel');
  b.rings(id, 1.115, [base + 5.1, base + 6.9], 'steel', 0.034);
  for (const x of [-1, 1]) b.mesh(id, new THREE.BoxGeometry(0.09, 2.35, 1.18), 'blue', [x * 1.36, base + 1.8, 0]);
  b.mesh(id, new THREE.CylinderGeometry(0.21, 0.21, 0.04, 24), 'blue', [0, base + 6, 1.115], [Math.PI / 2, 0, 0]);
}

function addEscapeTower(b, low, high) {
  const id = 'escape-tower';
  b.cylinder(id, 0.3, low + 1.0, high - 1.0, 'white');
  b.cylinder(id, 0.3, high - 1.0, high, 'red', 0);
  b.rings(id, 0.302, [low + 1.8, low + 4.6, high - 1.0], 'red', 0.038);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    b.beam(id, [Math.sin(a) * 1.03, low - 0.2, Math.cos(a) * 1.03], [Math.sin(a) * 0.27, low + 2.8, Math.cos(a) * 0.27], 0.055, 'red');
    const nozzle = b.mesh(id, new THREE.ConeGeometry(0.16, 0.43, 16, 1, true), 'nozzle', [Math.sin(a) * 0.47, low + 3.1, Math.cos(a) * 0.47]);
    nozzle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.sin(a), -0.55, Math.cos(a)).normalize());
  }
}

function chineseVehicle(id, spec) {
  const b = builder();
  const r = spec.diameter / 2;
  b.root.name = `${id.toUpperCase()} · 1 unit = 1 metre`;
  b.hull('stage1', r, 2.8, spec.firstTop, { bands: 9, label: '中国航天' });
  b.cylinder('stage1', r, 2.2, 2.8, 'offwhite');
  const firstLocations = spec.firstEngines === 4 ? circle(4, 0.94, Math.PI / 4) : [[-r * 0.43, 0], [r * 0.43, 0]];
  b.engines('engines1', firstLocations, { bell: spec.firstEngines === 4 ? 0.54 : r > 2 ? 0.82 : 0.63, length: 2.55 });
  const boosters = Array.from({ length: spec.boosterCount }, (_, i) => addChineseBooster(b, `booster-${i + 1}`, spec, i));
  if (spec.secondEngines) {
    b.mesh('interstage', new THREE.CylinderGeometry(r, r, spec.upperBody - spec.firstTop, 80, 1, true), 'offwhite', [0, (spec.upperBody + spec.firstTop) / 2, 0]);
    b.rings('interstage', r + 0.006, [spec.firstTop + 0.06, spec.upperBody - 0.06], 'darkmetal', 0.035);
    // Discrete dark roll markings, rather than an invented logo.
    const marks = [];
    for (let i = 0; i < 16; i++) { const angle = i * TAU / 16; marks.push({ position: [Math.sin(angle) * (r + 0.008), spec.firstTop + 0.6, Math.cos(angle) * (r + 0.008)], rotation: [0, angle, 0] }); }
    b.instances('interstage', new THREE.BoxGeometry(0.15, 0.52, 0.018), 'black', marks);
    const upperR = (spec.upperDiameter || spec.diameter) / 2;
    b.hull('stage2', upperR, spec.upperBody, spec.fairingBase, { bands: 4 });
    const locations = spec.secondEngines === 1 ? [[0, 0]] : spec.secondEngines === 2 ? [[-upperR * 0.47, 0], [upperR * 0.47, 0]] : circle(4, 0.85, Math.PI / 4);
    b.engines('engine2', locations, { bell: spec.secondEngines === 4 ? 0.51 : spec.secondEngines === 1 ? 0.96 : upperR > 2 ? 0.83 : 0.65, length: spec.upperBody - spec.upperBase - 0.1, bottom: spec.upperBase, vacuum: true });
    if (id === 'cz2f') b.engines('engine2', circle(4, 1.19, Math.PI / 4), { bell: 0.16, length: 1.1, bottom: spec.upperBase + 1.1 });
  }
  addFairing(b, spec.fairingDiameter / 2, r, spec.fairingBase, spec.fairingTop || spec.height);
  if (id === 'cz2f') {
    addShenzhou(b, spec.fairingBase + 0.12);
    addEscapeTower(b, spec.fairingTop, spec.height);
  } else if (id === 'cz5b') addLargeTeachingModule(b, spec.fairingBase + 0.35);
  else if (id === 'cz7') addTeachingCargoShip(b, spec.fairingBase + 0.2);
  else addSatellite(b, 'payload', spec.fairingBase + 0.2, r > 2 ? 1.3 : 0.96);
  return finishVehicle(b, id, spec, { boosters, payloadId: id === 'cz2f' ? 'spacecraft' : 'payload' });
}

function starshipVehicle(spec) {
  const b = builder();
  b.root.name = 'Starship V3 · 124.4 m · structural illustration';
  b.hull('stage1', 4.5, 3.6, 68.5, { steel: true, bands: 30 });
  b.cylinder('stage1', 4.5, 2.95, 3.6, 'darkmetal');
  b.rings('stage1', 4.51, [3.7, 5.0, 65.4, 67.8], 'darkmetal', 0.055);
  b.engines('engines1', [...circle(20, 3.52), ...circle(10, 2.05, Math.PI / 10), ...circle(3, 0.73)], { bell: 0.54, length: 3.0 });
  b.mesh('interstage', new THREE.CylinderGeometry(4.5, 4.5, 2.6, 96, 1, true), 'darkmetal', [0, 69.8, 0]);
  const vents = [];
  for (let i = 0; i < 50; i++) { const angle = i * TAU / 50; vents.push({ position: [Math.sin(angle) * 4.505, 69.8, Math.cos(angle) * 4.505], rotation: [0, angle, 0] }); }
  b.instances('interstage', new THREE.BoxGeometry(0.31, 1.35, 0.03), 'black', vents);
  b.rings('interstage', 4.51, [68.55, 71.0], 'polished', 0.045);
  const fins = addGridFins(b, 'grid-fins', 4.56, 65.1, 3, 2.85);
  b.hull('stage2', 4.5, 74.45, 111.5, { steel: true, bands: 20 });
  const nose = [[4.5, 111.5]];
  for (let i = 1; i <= 32; i++) nose.push([i === 32 ? 0 : 4.5 * Math.cos(i / 32 * Math.PI / 2) ** 1.1, 111.5 + (spec.height - 111.5) * i / 32]);
  b.lathe('stage2', nose, 'steel');
  // Open engine skirt closes the assembled silhouette down to the hot-stage ring.
  // Both cylinders are cap-free: bottom views can still see all six Raptor bells.
  const skirtHeight = 74.45 - 71.1;
  const skirtCenter = (74.45 + 71.1) / 2;
  const skirt = b.mesh('stage2', new THREE.CylinderGeometry(4.5, 4.5, skirtHeight, 96, 1, true), 'steel', [0, skirtCenter, 0]);
  skirt.name = 'Ship open engine skirt';
  b.mesh('stage2', new THREE.CylinderGeometry(4.455, 4.455, skirtHeight, 96, 1, true), 'interior', [0, skirtCenter, 0]);
  b.rings('stage2', 4.4775, [71.1225], 'darkmetal', 0.0225);
  b.rings('stage2', 4.505, [73.85, 74.4], 'polished', 0.012);
  b.engines('engine2', circle(3, 2.72), { bell: 1.04, length: 3.35, bottom: 71.1, vacuum: true });
  b.engines('engine2', circle(3, 1.05, Math.PI / 3), { bell: 0.59, length: 2.8, bottom: 71.5 });
  // Windward (-Z) thermal protection; the shiny opposite side remains exposed.
  b.lathe('heatshield', [[4.516, 74.5], [4.516, 111.5], ...nose.slice(1).map(([r, y]) => [r + (r > 0 ? 0.016 : 0), y])], 'tile', Math.PI / 2, Math.PI);
  const tiles = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let y = 75; y < spec.height - 1.1; y += 0.44) {
    const u = clamp((y - 111.5) / (spec.height - 111.5));
    const radius = 4.5 * Math.cos(u * Math.PI / 2) ** 1.1;
    const count = Math.max(3, Math.floor(Math.PI * radius / 0.44));
    const tilt = y <= 111.5 ? 0 : 4.5 * 1.1 * Math.PI / (2 * (spec.height - 111.5)) * Math.sin(u * Math.PI / 2) * Math.cos(u * Math.PI / 2) ** 0.1;
    for (let i = 0; i < count; i++) {
      const a = Math.PI / 2 + Math.PI * (i + 0.5) / count;
      const normal = new THREE.Vector3(Math.sin(a), tilt, Math.cos(a)).normalize();
      tiles.push({ position: [Math.sin(a) * (radius + 0.036), y, Math.cos(a) * (radius + 0.036)], quaternion: new THREE.Quaternion().setFromUnitVectors(up, normal) });
    }
  }
  b.instances('heatshield', new THREE.CylinderGeometry(0.245, 0.245, 0.018, 6), 'tile', tiles);
  for (const upper of [false, true]) for (const side of [-1, 1]) {
    const y = upper ? 112.9 : 77.2;
    const length = upper ? 5.9 : 8.1;
    const span = upper ? 2.25 : 3.4;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(span, 1.7); shape.lineTo(span * 0.73, length * 0.76); shape.lineTo(0, length); shape.closePath();
    const flap = b.mesh('flaps', new THREE.ExtrudeGeometry(shape, { depth: 0.19, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.045, bevelSegments: 1 }), 'steel', [side * (upper ? 3.7 : 4.38), y, -0.8]);
    flap.scale.x = side;
    const shield = b.mesh('flaps', new THREE.ShapeGeometry(shape), 'tile', [side * (upper ? 3.7 : 4.38), y, -0.812]); shield.scale.x = side; shield.material.side = THREE.DoubleSide;
    b.beam('flaps', [side * (upper ? 3.7 : 4.38), y + 0.6, -0.64], [side * (upper ? 3.7 : 4.38), y + length - 0.6, -0.64], 0.11, 'polished');
  }
  addSatellite(b, 'payload', 108, 1.35);
  const result = finishVehicle(b, 'starship', spec, { fins, noPayloadDeployment: true });
  b.root.userData.thermalProtectionSide = 'windward (-Z)';
  b.root.userData.variant = 'V3';
  return result;
}

function finishVehicle(b, id, spec, { boosters = [], fins = [], payloadId = 'payload', noPayloadDeployment = false } = {}) {
  const { root, parts } = b;
  const baselines = new Map([...parts].map(([key, part]) => [key, { position: part.position.clone(), quaternion: part.quaternion.clone() }]));
  const firstIds = new Set(['stage1', 'engines1', 'interstage', 'grid-fins', 'landing-legs']);
  root.userData = { ...root.userData, rocketId: id, heightMetres: spec.height, coreDiameterMetres: spec.diameter, structuralDetails: 'Educational approximation of published external dimensions' };
  for (const [key, part] of parts) part.traverse(object => { object.userData.partId = key; });
  let fairingStart = null, boosterStart = null, escapeStart = null, deploymentStart = null, lastTime = -Infinity;
  function reset() {
    for (const [key, part] of parts) { part.position.copy(baselines.get(key).position); part.quaternion.copy(baselines.get(key).quaternion); part.visible = true; }
    fins.forEach(pivot => { pivot.rotation.x = id === 'starship' ? Math.PI / 2 : 0; });
  }
  function setExplode(amount = 0) {
    reset(); const a = clamp(amount);
    const lift = spec.height / 70;
    const offsets = { engines1: -7, interstage: 7, engine2: 11, stage2: 17, spacecraft: 26, payload: 25, 'escape-tower': 32, flaps: 18, heatshield: 18, 'grid-fins': 3 };
    for (const [key, value] of Object.entries(offsets)) if (parts.has(key)) parts.get(key).position.y += value * lift * a;
    for (const [key, sign] of [['fairing-left', -1], ['fairing-right', 1]]) if (parts.has(key)) { parts.get(key).position.x += sign * 8 * a; parts.get(key).position.y += 24 * lift * a; }
    for (const booster of boosters) parts.get(booster.id).position.add(new THREE.Vector3(Math.sin(booster.angle) * 5 * a, -3 * a, Math.cos(booster.angle) * 5 * a));
    if (parts.has('heatshield')) parts.get('heatshield').position.z -= 7 * a;
    if (parts.has('flaps')) parts.get('flaps').position.z += 5 * a;
    fins.forEach(pivot => { pivot.rotation.x = id === 'starship' ? Math.PI / 2 : a * Math.PI * 0.3; });
    fairingStart = boosterStart = escapeStart = deploymentStart = null; lastTime = -Infinity;
  }
  function setFlight(state = {}) {
    reset();
    const time = Number(state.time) || 0;
    if (time < lastTime) fairingStart = boosterStart = escapeStart = deploymentStart = null;
    lastTime = time;
    const recoverable = id === 'starship' || id.startsWith('falcon');
    const stageOnly = Boolean(state.boosterOnly || state.detachedStageOnly);
    for (const [key, part] of parts) {
      if (stageOnly) part.visible = (recoverable || Boolean(state.detachedStageOnly)) && firstIds.has(key);
      else if (state.separated && firstIds.has(key) && id !== 'cz5b') part.visible = false;
    }
    fins.forEach(pivot => { pivot.rotation.x = id === 'starship' ? Math.PI / 2 : clamp(state.gridFinsDeployed) * Math.PI / 2; });
    if (!state.boostersSeparated) boosterStart = null;
    else if (boosterStart === null) boosterStart = time;
    for (const booster of boosters) {
      const part = parts.get(booster.id);
      if (stageOnly) { part.visible = false; continue; }
      if (!state.boostersSeparated) continue;
      const elapsed = Math.max(0, Number(state.boosterSeparationElapsed ?? (time - boosterStart)) || 0);
      part.visible = elapsed < 30;
      const drift = elapsed * 0.7 + elapsed * elapsed * 0.018;
      part.position.add(new THREE.Vector3(Math.sin(booster.angle) * drift, -elapsed * 0.6 - elapsed * elapsed * 0.04, Math.cos(booster.angle) * drift));
      const tilt = Math.min(elapsed * 0.016, 0.55);
      part.rotation.z = -Math.sin(booster.angle) * tilt;
      part.rotation.x = Math.cos(booster.angle) * tilt;
    }
    if (!state.fairingSeparated) fairingStart = null;
    else if (fairingStart === null) fairingStart = time;
    if (state.fairingSeparated && !stageOnly) {
      const elapsed = Math.max(0, Number(state.fairingElapsed ?? (time - fairingStart)) || 0);
      const pivot = ((spec.fairingTop || spec.height) + (spec.fairingBase || spec.height * 0.8)) / 2;
      for (const [key, sign] of [['fairing-left', -1], ['fairing-right', 1]]) if (parts.has(key)) {
        const part = parts.get(key), angle = -sign * elapsed * 0.025;
        part.visible = elapsed < 20;
        part.position.set(sign * elapsed * 1.45 + pivot * Math.sin(angle), -elapsed * 0.7 - elapsed * elapsed * 0.03 + pivot * (1 - Math.cos(angle)), elapsed * 0.12);
        part.rotation.z = angle;
      }
    }
    if (!state.escapeTowerJettisoned) escapeStart = null;
    else if (escapeStart === null) escapeStart = time;
    if (state.escapeTowerJettisoned && parts.has('escape-tower') && !stageOnly) {
      const elapsed = Math.max(0, Number(state.escapeTowerElapsed ?? state.escapeTowerJettisonElapsed ?? (time - escapeStart)) || 0);
      const tower = parts.get('escape-tower'); tower.visible = elapsed < 20;
      tower.position.y += elapsed * 4 + elapsed * elapsed * 0.11; tower.position.x += elapsed * 0.7;
    }
    if (!state.deployed) deploymentStart = null;
    else if (deploymentStart === null) deploymentStart = time;
    if (state.deployed && parts.has(payloadId) && !noPayloadDeployment && !stageOnly) {
      const elapsed = Math.max(0, Number(state.deploymentElapsed ?? (time - deploymentStart)) || 0);
      parts.get(payloadId).position.y += Math.min(24, elapsed * 0.3);
    }
  }
  function selectPart(partId = null) { b.palette.select(partId); root.userData.selectedPart = parts.has(partId) ? partId : null; }
  let disposed = false;
  function dispose() { if (disposed) return; disposed = true; b.release(); }
  setExplode(0);
  return { root, parts, setExplode, selectPart, setFlight, dispose, height: spec.height, upperBase: spec.upperBase, firstTop: spec.firstTop, nozzleLayout: getNozzleLayout(id) };
}

function falconHeavy(spec) {
  const core = createRocket();
  const sideBuilder = builder(core.root, core.parts);
  const sideIds = ['booster-1', 'booster-2'];
  for (const [index, id] of sideIds.entries()) {
    const group = sideBuilder.part(id, index === 0 ? '左侧助推芯级' : '右侧助推芯级');
    sideBuilder.hull(id, 1.85, 2.65, 41.6, { bands: 9 });
    sideBuilder.cylinder(id, 1.85, 41.6, 43.1, 'black');
    sideBuilder.lathe(id, [[1.85, 43.1], [1.75, 43.8], [1.32, 45.1], [0.65, 46.4], [0, 47.2]], 'white');
    sideBuilder.engines(id, [[0, 0], ...circle(8, 1.15)], { bell: 0.4, length: 2.05 });
    addGridFins(sideBuilder, id, 1.92, 39.6, 4, 1.4, group);
    addLandingLegs(sideBuilder, id, 1.85, group);
    group.position.x = index === 0 ? -4.25 : 4.25;
    group.traverse(object => { object.userData.partId = id; });
  }
  let boosterStart = null, previousTime = -Infinity;
  function setExplode(amount = 0) {
    core.setExplode(amount); const a = clamp(amount);
    sideIds.forEach((id, i) => { const side = core.parts.get(id); side.position.set((i === 0 ? -1 : 1) * (4.25 + a * 5), -a * 3, 0); side.visible = true; });
    boosterStart = null; previousTime = -Infinity;
  }
  function setFlight(state = {}) {
    const stageOnly = Boolean(state.boosterOnly || state.detachedStageOnly);
    core.setFlight({ ...state, boosterOnly: stageOnly });
    const time = Number(state.time) || 0;
    if (time < previousTime) boosterStart = null;
    previousTime = time;
    if (!state.boostersSeparated) boosterStart = null;
    else if (boosterStart === null) boosterStart = time;
    const elapsed = Math.max(0, Number(state.boosterSeparationElapsed ?? (time - boosterStart)) || 0);
    sideIds.forEach((id, i) => {
      const side = core.parts.get(id), sign = i === 0 ? -1 : 1;
      side.position.set(sign * 4.25, 0, 0);
      side.visible = !stageOnly;
      if (state.boostersSeparated && !stageOnly) {
        side.visible = elapsed < 30;
        side.position.x += sign * (elapsed * 0.85 + elapsed * elapsed * 0.018);
        side.position.y -= elapsed * 0.65 + elapsed * elapsed * 0.035;
        side.rotation.z = -sign * Math.min(0.6, elapsed * 0.018);
      }
    });
  }
  function selectPart(id = null) { core.selectPart(id); sideBuilder.palette.select(id); }
  let disposed = false;
  function dispose() { if (disposed) return; disposed = true; core.dispose(); sideBuilder.release({ sharedRoot: true }); }
  core.root.userData.rocketId = 'falcon-heavy';
  core.root.userData.heightMetres = 70;
  setExplode(0);
  return { root: core.root, parts: core.parts, setExplode, setFlight, selectPart, dispose, height: spec.height, upperBase: spec.upperBase, firstTop: spec.firstTop, nozzleLayout: getNozzleLayout('falcon-heavy') };
}

/** Vehicle identity may be its fleet-data object or stable id. */
export function createVehicle(rocket = 'falcon9') {
  const id = typeof rocket === 'string' ? rocket : rocket.id;
  const spec = SPECS[id];
  if (!spec) throw new RangeError(`Unknown rocket model: ${id}`);
  if (id === 'falcon9') {
    const vehicle = createRocket(); vehicle.root.userData.rocketId = id;
    return { ...vehicle,
      setFlight(state = {}) { vehicle.setFlight({ ...state, boosterOnly: Boolean(state.boosterOnly || state.detachedStageOnly) }); },
      height: 70, upperBase: 43.62, firstTop: 41.7, nozzleLayout: getNozzleLayout(id) };
  }
  if (id === 'falcon-heavy') return falconHeavy(spec);
  if (id === 'starship') return starshipVehicle(spec);
  return chineseVehicle(id, spec);
}
