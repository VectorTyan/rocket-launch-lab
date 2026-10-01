import * as THREE from 'three';

/**
 * A locally generated Falcon 9 fairing configuration. One unit is one metre.
 * External envelope: 70 m high, 3.7 m core, 5.2 m fairing.
 * Fine structure and the demonstration satellite are educational approximations.
 */
export function createRocket() {
  const root = new THREE.Group();
  root.name = 'Falcon 9 · educational model · 1 unit = 1 m';
  root.userData = { heightMetres: 70, coreDiameterMetres: 3.7, fairingDiameterMetres: 5.2 };
  const parts = new Map();
  const materialSets = new Map();
  const finPivots = [];
  const legPivots = [];
  const resources = new Set();
  const TAU = Math.PI * 2;
  const descriptions = {
    stage1: '一级贮箱与箭体', engines1: '九台 Merlin 一级发动机',
    interstage: '碳纤维级间段', stage2: '二级贮箱与箭体',
    engine2: 'Merlin 真空发动机', 'fairing-left': '整流罩 · 左半罩',
    'fairing-right': '整流罩 · 右半罩', payload: '演示卫星载荷',
    'grid-fins': '四片栅格翼', 'landing-legs': '四条着陆腿',
  };
  const palette = {
    white: { color: 0xf1f2ed, roughness: 0.56, metalness: 0.16 },
    whiteAlt: { color: 0xe3e7e6, roughness: 0.61, metalness: 0.21 },
    seam: { color: 0x969fa3, roughness: 0.44, metalness: 0.7 },
    silver: { color: 0xbcc8ce, roughness: 0.28, metalness: 0.83 },
    dark: { color: 0x171b22, roughness: 0.67, metalness: 0.35 },
    carbon: { color: 0x252b32, roughness: 0.73, metalness: 0.12 },
    nozzle: { color: 0x414044, roughness: 0.48, metalness: 0.78, side: THREE.DoubleSide },
    copper: { color: 0x816958, roughness: 0.44, metalness: 0.78 },
    gold: { color: 0xb99a4b, roughness: 0.43, metalness: 0.76 },
    panel: { color: 0x203b58, roughness: 0.28, metalness: 0.64 },
    liner: { color: 0xb9bdba, roughness: 0.86, metalness: 0.06, side: THREE.BackSide },
  };

  for (const [id, label] of Object.entries(descriptions)) {
    const group = new THREE.Group();
    group.name = label;
    group.userData = { partId: id, label, educational: true };
    parts.set(id, group);
    materialSets.set(id, new Map());
    root.add(group);
  }

  function material(id, kind) {
    const cache = materialSets.get(id);
    if (!cache.has(kind)) {
      const mat = new THREE.MeshStandardMaterial(palette[kind]);
      mat.name = `${id}/${kind}`;
      cache.set(kind, mat);
    }
    return cache.get(kind);
  }

  function mesh(id, geometry, kind, position = [0, 0, 0], rotation = [0, 0, 0], parent = parts.get(id)) {
    const object = new THREE.Mesh(geometry, typeof kind === 'string' ? material(id, kind) : kind);
    object.position.set(...position);
    object.rotation.set(...rotation);
    object.castShadow = true;
    object.receiveShadow = true;
    object.userData.partId = id;
    parent.add(object);
    return object;
  }

  function cylinder(id, radius, bottom, top, kind, radiusTop = radius, parent) {
    return mesh(id, new THREE.CylinderGeometry(radiusTop, radius, top - bottom, 72), kind, [0, (bottom + top) / 2, 0], undefined, parent);
  }

  function ring(id, radius, height, thickness = 0.025, kind = 'seam', parent) {
    return mesh(id, new THREE.TorusGeometry(radius, thickness, 8, 80), kind, [0, height, 0], [Math.PI / 2, 0, 0], parent);
  }

  function tube(id, points, radius, kind, parent) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    return mesh(id, new THREE.TubeGeometry(curve, Math.max(8, points.length * 5), radius, 7, false), kind, undefined, undefined, parent);
  }

  function beam(id, a, b, width, kind, parent) {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const difference = vb.clone().sub(va);
    const object = mesh(id, new THREE.CylinderGeometry(width, width, difference.length(), 10), kind, va.clone().add(vb).multiplyScalar(0.5).toArray(), undefined, parent);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), difference.normalize());
    return object;
  }

  function cutawayRole(object, name, role) {
    object.name = name;
    object.userData.cutawayRole = role;
    object.userData.educational = true;
    return object;
  }

  // Aluminium-lithium tank sections, domes, weld bands, and external raceways.
  cylinder('stage1', 1.85, 2.65, 9.7, 'whiteAlt');
  cylinder('stage1', 1.85, 9.7, 26.8, 'white');
  cylinder('stage1', 1.85, 26.8, 41.7, 'white');
  cylinder('stage1', 1.77, 2.48, 2.7, 'dark');
  for (const y of [2.7, 3.1, 5.15, 9.7, 15.1, 20.8, 26.8, 32.2, 37.1, 41.55]) {
    ring('stage1', 1.851, y, y === 9.7 || y === 26.8 ? 0.033 : 0.013);
  }
  for (const angle of [0.72, 3.85]) {
    const r = 1.862;
    const x = Math.sin(angle) * r;
    const z = Math.cos(angle) * r;
    mesh('stage1', new THREE.BoxGeometry(0.15, 34.4, 0.1), 'whiteAlt', [x, 22.1, z], [0, angle, 0]);
    for (const y of [6, 10, 15, 20, 25, 30, 35, 39]) {
      mesh('stage1', new THREE.BoxGeometry(0.24, 0.1, 0.14), 'seam', [x, y, z], [0, angle, 0]);
    }
  }
  const tankDome = mesh('stage1', new THREE.SphereGeometry(1.76, 48, 20, 0, TAU, 0, Math.PI / 2), 'silver', [0, 41.65, 0]);
  tankDome.scale.y = 0.25;
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8;
    mesh('stage1', new THREE.BoxGeometry(0.18, 0.4, 0.06), 'silver', [Math.sin(a) * 1.86, 4.3, Math.cos(a) * 1.86], [0, a, 0]);
  }

  // A simple typography decal, generated locally rather than a copied logo.
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 2048;
    const context = canvas.getContext('2d');
    if (context) {
      context.translate(128, 1024);
      context.rotate(-Math.PI / 2);
      context.fillStyle = '#202b35';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = '600 150px Arial, sans-serif';
      context.fillText('FALCON 9', 0, 0);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      resources.add(texture);
      const decal = new THREE.MeshStandardMaterial({ map: texture, transparent: true, depthWrite: false, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -2 });
      materialSets.get('stage1').set('decal', decal);
      for (const angle of [0, Math.PI]) {
        mesh('stage1', new THREE.PlaneGeometry(1.08, 9.5), decal, [Math.sin(angle) * 1.858, 22.1, Math.cos(angle) * 1.858], [0, angle, 0]);
      }
    }
  }

  // The Octaweb arrangement: eight outer Merlin bells around a central engine.
  cylinder('engines1', 1.79, 2.08, 2.48, 'dark');
  ring('engines1', 1.8, 2.18, 0.075, 'silver');
  const engineLocations = [[0, 0], ...Array.from({ length: 8 }, (_, i) => [Math.sin(i * TAU / 8) * 1.15, Math.cos(i * TAU / 8) * 1.15])];
  for (const [x, z] of engineLocations) {
    const engine = new THREE.Group();
    engine.position.set(x, 0, z);
    engine.userData.partId = 'engines1';
    parts.get('engines1').add(engine);
    const profile = [[0.4, 0.04], [0.39, 0.18], [0.345, 0.48], [0.27, 0.8], [0.19, 1.08], [0.145, 1.29], [0.145, 1.41]].map(([r, y]) => new THREE.Vector2(r, y));
    mesh('engines1', new THREE.LatheGeometry(profile, 40), 'nozzle', undefined, undefined, engine);
    ring('engines1', 0.4, 0.04, 0.04, 'copper', engine);
    ring('engines1', 0.2, 1.02, 0.025, 'silver', engine);
    cylinder('engines1', 0.16, 1.38, 1.95, 'silver', 0.2, engine);
    mesh('engines1', new THREE.BoxGeometry(0.31, 0.45, 0.33), 'carbon', [0.23, 1.78, 0.08], undefined, engine);
    tube('engines1', [[-0.12, 2.16, -0.06], [-0.3, 1.88, -0.12], [-0.25, 1.5, -0.11], [-0.13, 1.36, -0.1]], 0.045, 'silver', engine);
    tube('engines1', [[0.05, 1.31, 0.11], [0.19, 1.2, 0.18], [0.23, 0.92, 0.17]], 0.03, 'copper', engine);
  }
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8 + Math.PI / 8;
    beam('engines1', [Math.sin(a) * 0.3, 2.05, Math.cos(a) * 0.3], [Math.sin(a) * 1.64, 2.05, Math.cos(a) * 1.64], 0.065, 'seam');
  }

  // Open-ended dark interstage, with subtle longitudinal carbon panel seams.
  mesh('interstage', new THREE.CylinderGeometry(1.85, 1.85, 3.7, 72, 1, true), 'carbon', [0, 43.55, 0]);
  for (const y of [41.74, 42.12, 45.26, 45.36]) ring('interstage', 1.851, y, 0.025, 'dark');
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12;
    mesh('interstage', new THREE.BoxGeometry(0.026, 3.45, 0.024), 'dark', [Math.sin(a) * 1.854, 43.5, Math.cos(a) * 1.854], [0, a, 0]);
  }
  for (let i = 0; i < 3; i++) {
    const a = i * TAU / 3;
    beam('interstage', [Math.sin(a) * 1.67, 44.9, Math.cos(a) * 1.67], [Math.sin(a) * 1.53, 45.85, Math.cos(a) * 1.53], 0.055, 'silver');
  }

  // Second-stage tanks and its large, thin-walled vacuum nozzle.
  cutawayRole(cylinder('stage2', 1.85, 46.7, 56.9, 'white'), 'Second-stage tank shell', 'shell');
  cutawayRole(cylinder('stage2', 1.7, 46.35, 46.75, 'silver'), 'Second-stage engine mounting bulkhead', 'internal');
  // Educational attachment detail: close the exterior gap above the 45.4 m
  // interstage rim without moving the existing vacuum-engine bell or its mouth.
  cutawayRole(mesh('stage2', new THREE.CylinderGeometry(1.85, 1.85, 1.3, 72, 1, true), 'whiteAlt', [0, 46.05, 0]), 'Second-stage open aft skirt', 'shell');
  cutawayRole(mesh('stage2', new THREE.CylinderGeometry(1.825, 1.825, 1.3, 72, 1, true), 'liner', [0, 46.05, 0]), 'Second-stage aft-skirt inner skin', 'shell');
  cutawayRole(ring('stage2', 1.8375, 45.4125, 0.0125, 'silver'), 'Second-stage aft-skirt lower lip', 'shell');
  for (const y of [46.75, 47.05, 50.35, 54.05, 56.8]) ring('stage2', 1.854, y, 0.022);
  const upperDome = mesh('stage2', new THREE.SphereGeometry(1.76, 48, 20, 0, TAU, 0, Math.PI / 2), 'silver', [0, 56.8, 0]);
  upperDome.scale.y = 0.27;
  mesh('stage2', new THREE.BoxGeometry(0.17, 7.2, 0.095), 'whiteAlt', [0, 51.5, -1.875]);
  for (const a of [Math.PI / 2, -Math.PI / 2]) {
    const pod = new THREE.Group();
    pod.position.set(Math.sin(a) * 1.82, 47.3, Math.cos(a) * 1.82);
    pod.rotation.y = a;
    parts.get('stage2').add(pod);
    mesh('stage2', new THREE.BoxGeometry(0.25, 0.47, 0.25), 'dark', undefined, undefined, pod);
    for (const y of [-0.13, 0.13]) mesh('stage2', new THREE.CylinderGeometry(0.065, 0.035, 0.15, 12), 'silver', [0, y, 0.16], [Math.PI / 2, 0, 0], pod);
  }
  const vacuumProfile = [[1.24, 43.62], [1.21, 43.85], [1.08, 44.27], [0.9, 44.74], [0.67, 45.19], [0.41, 45.64], [0.24, 45.93], [0.21, 46.15]].map(([r, y]) => new THREE.Vector2(r, y));
  cutawayRole(mesh('engine2', new THREE.LatheGeometry(vacuumProfile, 72), 'nozzle'), 'Merlin Vacuum nozzle', 'internal');
  ring('engine2', 1.24, 43.64, 0.035, 'silver');
  for (const [y, r] of [[44, 1.164], [44.3, 1.066], [44.6, 0.95], [44.9, 0.82], [45.2, 0.665]]) ring('engine2', r, y, 0.012, 'copper');
  cutawayRole(cylinder('engine2', 0.34, 46.03, 46.55, 'copper', 0.41), 'Vacuum-engine combustion chamber', 'internal');
  cutawayRole(cylinder('engine2', 0.57, 46.36, 46.58, 'silver'), 'Vacuum-engine mounting flange', 'internal');
  cutawayRole(ring('engine2', 0.42, 46.17, 0.045, 'silver'), 'Vacuum-engine chamber reinforcement', 'internal');
  cutawayRole(ring('engine2', 1.27, 46.4, 0.055, 'silver'), 'Vacuum-engine thrust attachment ring', 'internal');
  mesh('engine2', new THREE.BoxGeometry(0.38, 0.44, 0.44), 'carbon', [0.44, 46.42, 0]);
  tube('engine2', [[-0.53, 46.7, 0], [-0.55, 46.26, 0], [-0.33, 45.98, 0], [-0.25, 45.82, 0]], 0.065, 'silver');
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    cutawayRole(beam('engine2', [Math.sin(a) * 0.37, 46.1, Math.cos(a) * 0.37], [Math.sin(a) * 1.27, 46.43, Math.cos(a) * 1.27], 0.085, 'silver'), `Vacuum-engine thrust strut ${i + 1}`, 'internal');
    cutawayRole(mesh('engine2', new THREE.BoxGeometry(0.25, 0.14, 0.3), 'seam', [Math.sin(a) * 1.27, 46.44, Math.cos(a) * 1.27], [0, a, 0]), `Vacuum-engine thrust fitting ${i + 1}`, 'internal');
  }
  parts.get('engine2').userData.mountingDetail = 'Chamber, mounting flange and thrust frame are educational structural illustrations, not an engineering drawing.';

  // Each fairing half is a real curved shell with a separate interior surface.
  const fairingProfile = [];
  for (let i = 0; i <= 14; i++) {
    const u = i / 14;
    fairingProfile.push(new THREE.Vector2(1.85 + 0.75 * Math.sin(u * Math.PI / 2), 56.9 + u * 1.8));
  }
  fairingProfile.push(new THREE.Vector2(2.6, 63.9));
  for (let i = 1; i <= 32; i++) {
    const u = i / 32;
    // An ogive-like curve has a rounded shoulder and a pointed 70 m nose.
    fairingProfile.push(new THREE.Vector2(2.6 * Math.cos(u * Math.PI / 2) ** 1.08, 63.9 + u * 6.1));
  }
  fairingProfile[fairingProfile.length - 1].set(0, 70);
  for (const [id, start] of [['fairing-right', 0], ['fairing-left', Math.PI]]) {
    mesh(id, new THREE.LatheGeometry(fairingProfile, 56, start, Math.PI), 'white');
    const inner = fairingProfile.map(p => new THREE.Vector2(Math.max(0, p.x - 0.042), p.y));
    mesh(id, new THREE.LatheGeometry(inner, 56, start, Math.PI), 'liner');
    for (const phi of [start, start + Math.PI]) {
      const edge = tube(id, fairingProfile.filter(p => p.y < 69.95).map(p => [Math.sin(phi) * Math.max(0, p.x - 0.02), p.y, Math.cos(phi) * Math.max(0, p.x - 0.02)]), 0.023, 'seam');
      // Keep the narrow shell seam inside the specified 5.2 m envelope.
      const vertices = edge.geometry.attributes.position;
      for (let i = 0; i < vertices.count; i++) {
        const x = vertices.getX(i), z = vertices.getZ(i);
        const r = Math.hypot(x, z);
        if (r > 2.6) vertices.setXYZ(i, x * 2.6 / r, vertices.getY(i), z * 2.6 / r);
      }
      vertices.needsUpdate = true;
      edge.geometry.computeVertexNormals();
    }
    for (const [y, radius] of [[57.3, 2.04], [58.7, 2.55], [61, 2.55], [63.6, 2.55], [66, 2.16]]) {
      tube(id, Array.from({ length: 23 }, (_, i) => {
        const phi = start + Math.PI * i / 22;
        return [Math.sin(phi) * radius, y, Math.cos(phi) * radius];
      }), 0.027, 'whiteAlt');
    }
  }

  // Generic satellite and adapter, deliberately not a particular real payload.
  cylinder('payload', 1.26, 56.97, 58.05, 'carbon', 0.73);
  ring('payload', 1.22, 57.05, 0.05, 'silver');
  const satellite = mesh('payload', new THREE.BoxGeometry(1.57, 2.55, 1.57), 'gold', [0, 59.43, 0]);
  satellite.name = '教学示意卫星（非真实任务载荷）';
  cylinder('payload', 0.76, 60.7, 61.03, 'silver');
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const panelGroup = new THREE.Group();
    panelGroup.rotation.y = angle;
    parts.get('payload').add(panelGroup);
    mesh('payload', new THREE.BoxGeometry(1.24, 2.18, 0.055), 'panel', [0, 59.4, 0.825], undefined, panelGroup);
    for (let col = -2; col <= 2; col++) mesh('payload', new THREE.BoxGeometry(0.012, 2.17, 0.013), 'seam', [col * 0.24, 59.4, 0.86], undefined, panelGroup);
    for (let row = -3; row <= 3; row++) mesh('payload', new THREE.BoxGeometry(1.2, 0.013, 0.013), 'seam', [0, 59.4 + row * 0.3, 0.86], undefined, panelGroup);
  }
  const antenna = mesh('payload', new THREE.SphereGeometry(0.61, 28, 12, 0, TAU, 0, Math.PI / 2), 'whiteAlt', [0, 61.37, 0]);
  antenna.scale.y = 0.24;
  beam('payload', [0, 60.97, 0], [0, 62, 0], 0.045, 'silver');
  mesh('payload', new THREE.SphereGeometry(0.085, 12, 8), 'gold', [0, 62.05, 0]);

  // Four hinged titanium lattice fins. Each blade contains open grid cells.
  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 2 + Math.PI / 4;
    const carrier = new THREE.Group();
    carrier.rotation.y = angle;
    carrier.position.set(Math.sin(angle) * 1.93, 39.6, Math.cos(angle) * 1.93);
    parts.get('grid-fins').add(carrier);
    const pivot = new THREE.Group();
    carrier.add(pivot);
    finPivots.push({ carrier, pivot, angle });
    for (const x of [-0.71, 0.71]) mesh('grid-fins', new THREE.BoxGeometry(0.065, 1.68, 0.105), 'dark', [x, 0.84, 0.015], undefined, pivot);
    for (const y of [0, 1.68]) mesh('grid-fins', new THREE.BoxGeometry(1.48, 0.065, 0.105), 'dark', [0, y, 0.015], undefined, pivot);
    for (let j = 1; j < 7; j++) {
      mesh('grid-fins', new THREE.BoxGeometry(0.034, 1.62, 0.083), 'carbon', [-0.71 + j * 1.42 / 7, 0.84, 0.015], undefined, pivot);
      mesh('grid-fins', new THREE.BoxGeometry(1.4, 0.034, 0.083), 'carbon', [0, j * 1.68 / 7, 0.015], undefined, pivot);
    }
    mesh('grid-fins', new THREE.CylinderGeometry(0.105, 0.105, 1.2, 16), 'silver', [0, 0, -0.08], [0, 0, Math.PI / 2], carrier);
    mesh('grid-fins', new THREE.BoxGeometry(0.4, 0.3, 0.18), 'dark', [0, -0.05, -0.08], undefined, carrier);
  }

  // Four folded landing legs with a carbon panel, side rails, and hinge pins.
  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 2;
    const carrier = new THREE.Group();
    carrier.rotation.y = angle;
    carrier.position.set(Math.sin(angle) * 1.88, 3.42, Math.cos(angle) * 1.88);
    parts.get('landing-legs').add(carrier);
    const pivot = new THREE.Group();
    carrier.add(pivot);
    legPivots.push({ carrier, pivot, angle });
    const shape = new THREE.Shape();
    shape.moveTo(-0.42, 0);
    shape.lineTo(-0.35, 1.8);
    shape.lineTo(-0.1, 7.43);
    shape.lineTo(0.1, 7.43);
    shape.lineTo(0.35, 1.8);
    shape.lineTo(0.42, 0);
    shape.closePath();
    mesh('landing-legs', new THREE.ExtrudeGeometry(shape, { depth: 0.13, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 1, steps: 1 }), 'carbon', undefined, undefined, pivot);
    beam('landing-legs', [-0.31, 0.3, 0.15], [-0.08, 7.25, 0.15], 0.034, 'dark', pivot);
    beam('landing-legs', [0.31, 0.3, 0.15], [0.08, 7.25, 0.15], 0.034, 'dark', pivot);
    beam('landing-legs', [0, 0.4, 0.19], [0, 5.35, 0.19], 0.04, 'silver', pivot);
    mesh('landing-legs', new THREE.BoxGeometry(0.58, 0.16, 0.25), 'dark', [0, 7.32, 0.07], undefined, pivot);
    mesh('landing-legs', new THREE.CylinderGeometry(0.13, 0.13, 0.94, 16), 'silver', [0, 0, 0.03], [0, 0, Math.PI / 2], carrier);
  }

  // Mark every nested object so callers can select any surface by raycasting.
  for (const [id, group] of parts) group.traverse(object => { object.userData.partId = id; });
  const boosterIds = new Set(['stage1', 'engines1', 'interstage', 'grid-fins', 'landing-legs']);
  const explodeOffsets = {
    stage1: [0, 0, 0], engines1: [0, -7.5, 0], interstage: [0, 7.5, 0],
    stage2: [0, 15, 0], engine2: [0, 11, 0], payload: [0, 23, 0],
    'fairing-left': [-8, 23, 0], 'fairing-right': [8, 23, 0],
    'grid-fins': [0, 2.2, 0], 'landing-legs': [0, -1.6, 0],
  };
  let fairingStart = null;
  let deploymentStart = null;
  let previousTime = -Infinity;
  const clamp = value => THREE.MathUtils.clamp(Number(value) || 0, 0, 1);

  function resetTransforms() {
    for (const part of parts.values()) {
      part.position.set(0, 0, 0);
      part.rotation.set(0, 0, 0);
      part.visible = true;
    }
  }

  function poseAppendages(finAmount = 0, legAmount = 0, radialExpansion = 0) {
    for (const { carrier, pivot, angle } of finPivots) {
      carrier.position.x = Math.sin(angle) * (1.93 + radialExpansion * 3.8);
      carrier.position.z = Math.cos(angle) * (1.93 + radialExpansion * 3.8);
      pivot.rotation.x = clamp(finAmount) * Math.PI / 2;
    }
    for (const { carrier, pivot, angle } of legPivots) {
      carrier.position.x = Math.sin(angle) * (1.88 + radialExpansion * 3.2);
      carrier.position.z = Math.cos(angle) * (1.88 + radialExpansion * 3.2);
      pivot.rotation.x = clamp(legAmount) * 2.02;
    }
  }

  /** Enter museum mode and restore every part. amount is an absolute 0..1 pose. */
  function setExplode(amount = 0) {
    const a = clamp(amount);
    resetTransforms();
    for (const [id, offset] of Object.entries(explodeOffsets)) parts.get(id).position.set(...offset.map(value => value * a));
    poseAppendages(a * 0.6, a * 0.12, a);
    fairingStart = null;
    deploymentStart = null;
    previousTime = -Infinity;
  }

  /** Highlight one module without changing geometry or permanently tinting it. */
  function selectPart(id = null) {
    for (const [partId, cache] of materialSets) {
      for (const mat of cache.values()) {
        const selected = id === partId;
        mat.emissive.setHex(selected ? 0x138ea5 : 0x000000);
        mat.emissiveIntensity = selected ? 0.46 : 1;
      }
    }
    root.userData.selectedPart = parts.has(id) ? id : null;
  }

  /**
   * Apply a flight pose, leaving root world position/rotation to the caller.
   * state: time (seconds), separated, boosterOnly, fairingSeparated,
   * fairingElapsed, deployed, deploymentElapsed, gridFinsDeployed, legsDeployed.
   * Explicit event elapsed values make arbitrary timeline seeking deterministic.
   */
  function setFlight(state = {}) {
    resetTransforms();
    const time = Number(state.time ?? state.elapsed ?? 0) || 0;
    if (time < previousTime) { fairingStart = null; deploymentStart = null; }
    previousTime = time;
    if (!state.fairingSeparated) fairingStart = null;
    if (!state.deployed) deploymentStart = null;
    poseAppendages(state.gridFinsDeployed ?? 0, state.legsDeployed ?? 0);
    for (const [id, part] of parts) {
      if (state.boosterOnly) part.visible = boosterIds.has(id);
      else if (state.separated && boosterIds.has(id)) part.visible = false;
    }
    if (state.fairingSeparated && !state.boosterOnly) {
      if (fairingStart === null) fairingStart = time;
      const elapsed = Math.max(0, Number(state.fairingElapsed ?? (time - fairingStart)) || 0);
      for (const [id, sign] of [['fairing-left', -1], ['fairing-right', 1]]) {
        const part = parts.get(id);
        part.visible = elapsed < 20;
        const angle = -sign * elapsed * 0.025;
        part.position.set(sign * (0.12 + elapsed * 1.45) + 63 * Math.sin(angle), -elapsed * 0.7 - elapsed * elapsed * 0.03 + 63 * (1 - Math.cos(angle)), elapsed * 0.12);
        part.rotation.z = angle;
      }
    }
    if (state.deployed && !state.boosterOnly) {
      if (deploymentStart === null) deploymentStart = time;
      const elapsed = Math.max(0, Number(state.deploymentElapsed ?? (time - deploymentStart)) || 0);
      parts.get('payload').position.y = Math.min(20, elapsed * 0.3);
      parts.get('payload').rotation.y = Math.min(elapsed, 60) * 0.006;
    }
  }

  function dispose() {
    const geometries = new Set();
    const materials = new Set();
    root.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) for (const mat of [object.material].flat()) materials.add(mat);
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(mat => mat.dispose());
    resources.forEach(texture => texture.dispose());
  }

  setExplode(0);
  return { root, parts, setExplode, selectPart, setFlight, dispose };
}
