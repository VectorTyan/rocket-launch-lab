import * as THREE from 'three';

// All coordinates use the existing launch pad's local origin and metre scale.
// This module owns its geometry, materials and textures, including the two
// returned surface materials used by the parent pad. Detach before disposing.
export function createPadDetails(site) {
  const group = new THREE.Group();
  group.name = 'launch-pad-details';
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const batches = [];
  let disposed = false;
  let seed = site?.terrain === 'west' ? 3719 : site?.id === 'lc39a' ? 8291 : 4217;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  function surfaceTexture(kind) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const pixels = ctx.createImageData(512, 512);
    const concrete = kind === 'concrete';
    for (let y = 0; y < 512; y += 1) {
      for (let x = 0; x < 512; x += 1) {
        const i = (y * 512 + x) * 4;
        const broad = Math.sin(x * 0.036) * Math.sin(y * 0.028) * (concrete ? 3 : 1.5);
        const grain = (random() - 0.5) * (concrete ? 17 : 23);
        const base = (concrete ? 157 : 57) + grain + broad;
        pixels.data[i] = base + (concrete ? 7 : 0);
        pixels.data[i + 1] = base + (concrete ? 6 : 3);
        pixels.data[i + 2] = base + (concrete ? 1 : 5);
        pixels.data[i + 3] = 255;
      }
    }
    ctx.putImageData(pixels, 0, 0);
    if (concrete) {
      // Quiet tile-to-tile variation, sealed joints and sparse weathering.
      for (let y = 0; y < 2; y += 1) {
        for (let x = 0; x < 2; x += 1) {
          ctx.fillStyle = `rgba(80, 75, 64, ${0.012 + random() * 0.035})`;
          ctx.fillRect(x * 256, y * 256, 256, 256);
        }
      }
      ctx.strokeStyle = 'rgba(65, 69, 63, 0.44)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const p of [0.5, 256.5, 511.5]) {
        ctx.moveTo(p, 0); ctx.lineTo(p, 512);
        ctx.moveTo(0, p); ctx.lineTo(512, p);
      }
      ctx.stroke();
      for (let i = 0; i < 20; i += 1) {
        const x = 18 + random() * 476, y = 18 + random() * 476;
        const radius = 3 + random() * 15;
        const stain = ctx.createRadialGradient(x, y, 0, x, y, radius);
        stain.addColorStop(0, 'rgba(80, 76, 58, 0.09)');
        stain.addColorStop(1, 'rgba(80, 76, 58, 0)');
        ctx.fillStyle = stain;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(concrete ? 6 : 4, concrete ? 4 : 16);
    texture.anisotropy = 4;
    textures.add(texture);
    return texture;
  }

  function ownMaterial(options) {
    const mat = new THREE.MeshStandardMaterial(options);
    materials.add(mat);
    return mat;
  }
  const concreteMap = surfaceTexture('concrete');
  const roadMap = surfaceTexture('road');
  const concreteMaterial = ownMaterial({ color: '#ffffff', map: concreteMap, bumpMap: concreteMap, bumpScale: 0.035, roughness: 0.96 });
  const roadMaterial = ownMaterial({ color: '#ffffff', map: roadMap, bumpMap: roadMap, bumpScale: 0.045, roughness: 0.97 });
  const painted = ownMaterial({ color: '#ffffff', roughness: 0.88 });
  const galvanized = ownMaterial({ color: '#9ca9a9', metalness: 0.45, roughness: 0.58 });
  const pipeMaterial = ownMaterial({ color: '#d1d1b8', metalness: 0.18, roughness: 0.7 });
  const cabinetMaterial = ownMaterial({ color: '#ffffff', metalness: 0.12, roughness: 0.75 });
  const recessMaterial = ownMaterial({ color: '#344044', roughness: 0.95 });
  const white = new THREE.Color('#e5dfc6');
  const yellow = new THREE.Color('#cdb453');
  const black = new THREE.Color('#424643');
  const gray = new THREE.Color('#afb6ad');
  const pale = new THREE.Color('#c4c9bb');
  const marks = [], metalBeams = [], pipes = [], cabinets = [], darkBoxes = [], tankRings = [];
  const identity = new THREE.Quaternion();
  const vertical = new THREE.Vector3(0, 1, 0);

  function cuboid(items, size, position, color, rotation = 0) {
    items.push({ size, position, color, quaternion: new THREE.Quaternion().setFromAxisAngle(vertical, rotation) });
  }
  function beam(items, start, end, radius) {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
    const direction = b.clone().sub(a);
    items.push({
      position: a.add(b).multiplyScalar(0.5).toArray(),
      size: [radius, direction.length(), radius],
      quaternion: new THREE.Quaternion().setFromUnitVectors(vertical, direction.normalize()),
    });
  }
  function makeInstances(name, geometry, mat, items, castShadow = false) {
    if (!items.length) { geometry.dispose(); return; }
    geometries.add(geometry);
    const mesh = new THREE.InstancedMesh(geometry, mat, items.length);
    mesh.name = name;
    const transform = new THREE.Object3D();
    items.forEach((item, index) => {
      transform.position.fromArray(item.position);
      transform.scale.fromArray(item.size);
      transform.quaternion.copy(item.quaternion || identity);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
      if (item.color) mesh.setColorAt(index, item.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    batches.push(mesh);
  }

  // Edge paint sits just above the original slab (whose top is at y = 0.15).
  // The access road at x = -85 and the central rocket/strongback stay clear.
  for (const x of [-96, 96]) cuboid(marks, [0.2, 0.015, 140], [x, 0.17, 0], yellow);
  cuboid(marks, [190, 0.015, 0.2], [0, 0.17, -70], yellow);
  cuboid(marks, [135, 0.015, 0.2], [28.5, 0.17, 70], yellow);
  for (let z = -55; z <= 55; z += 11) {
    cuboid(marks, [0.18, 0.015, 4.5], [65, 0.17, z], white);
  }
  // Mark one equipment-service bay with restrained yellow/charcoal hatching.
  cuboid(marks, [14, 0.015, 3], [50, 0.17, 40], black);
  for (let x = 44; x < 57; x += 1.5) {
    cuboid(marks, [0.6, 0.015, 2.5], [x, 0.19, 40], yellow, -Math.PI / 6);
  }
  // Four short warning corners around the raised launch mount; no central fill.
  for (const x of [-14, 14]) for (const z of [-15, 15]) {
    cuboid(marks, [3, 0.015, 0.3], [x, 0.17, z], yellow);
    cuboid(marks, [0.3, 0.015, 3], [x + Math.sign(x) * 1.35, 0.17, z - Math.sign(z) * 1.35], yellow);
  }

  // Chain-link perimeter: a single line batch, with all posts and rails in the
  // same cylinder instance batch as the other small galvanized structures.
  const wireVertices = [];
  function fence(start, end) {
    const a = new THREE.Vector3(start[0], 0, start[1]);
    const b = new THREE.Vector3(end[0], 0, end[1]);
    const length = a.distanceTo(b);
    const direction = b.clone().sub(a).normalize();
    const at = (distance, height) => a.clone().addScaledVector(direction, distance).setY(height).toArray();
    const posts = Math.ceil(length / 6);
    for (let i = 0; i <= posts; i += 1) beam(metalBeams, at(length * i / posts, 0.16), at(length * i / posts, 2.6), 0.045);
    for (const height of [0.35, 2.4]) beam(metalBeams, at(0, height), at(length, height), 0.027);
    // Clip both diagonal directions to a 2.05 m high panel, leaving openings.
    const height = 2.05;
    for (let d = -height; d < length; d += 0.3) {
      const from = Math.max(0, d), to = Math.min(length, d + height);
      wireVertices.push(...at(from, 0.35 + from - d), ...at(to, 0.35 + to - d));
      wireVertices.push(...at(from, 2.4 - (from - d)), ...at(to, 2.4 - (to - d)));
    }
  }
  fence([-101, -76], [101, -76]);
  fence([-101, -76], [-101, 53]);
  fence([101, -76], [101, 62]);
  fence([-54, 76], [101, 76]);
  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wireVertices, 3));
  geometries.add(wireGeometry);
  const wireMaterial = new THREE.LineBasicMaterial({ color: '#7b8984', transparent: true, opacity: 0.48, depthWrite: false });
  materials.add(wireMaterial);
  const wire = new THREE.LineSegments(wireGeometry, wireMaterial);
  wire.name = 'perimeter-chain-link';
  group.add(wire);

  // Small cabinets, bases and louvres are batched rather than individual meshes.
  for (const [x, z, width] of [[56, -38, 3.2], [63, -38, 4.2], [-59, 44, 4.5], [-67, 44, 2.8]]) {
    cuboid(darkBoxes, [width + 0.7, 0.3, 2.6], [x, 0.3, z]);
    cuboid(cabinets, [width, 2.6, 2.1], [x, 1.75, z], gray);
    cuboid(cabinets, [width + 0.16, 0.12, 2.25], [x, 3.1, z], pale);
    for (let i = 0; i < 5; i += 1) cuboid(darkBoxes, [width * 0.65, 0.065, 0.025], [x, 1.35 + i * 0.17, z + 1.065]);
    cuboid(marks, [0.24, 0.34, 0.025], [x + width * 0.31, 2.4, z + 1.08], yellow);
  }

  // Low supply pipes follow the west side, keeping the base of the rocket open.
  for (const [z, radius] of [[-31, 0.22], [-33, 0.12]]) {
    beam(pipes, [-143, 0.95, z], [-21, 0.95, z], radius);
    beam(pipes, [-21, 0.95, z], [-21, 0.95, -10], radius);
    beam(pipes, [-21, 0.95, -10], [-16, 0.95, -10], radius);
  }
  for (let x = -137; x < -24; x += 13) cuboid(darkBoxes, [0.7, 0.65, 4.1], [x, 0.46, -32]);
  for (const x of [-47, -21]) {
    beam(metalBeams, [x, 0.15, -38], [x, 1.3, -38], 0.045);
    beam(metalBeams, [x, 0.15, -35], [x, 1.3, -35], 0.045);
  }
  for (const y of [0.7, 1.3]) {
    beam(metalBeams, [-47, y, -38], [-21, y, -38], 0.04);
    beam(metalBeams, [-47, y, -35], [-21, y, -35], 0.04);
  }

  // Existing tanks have radius 5, cylinder height 22 and centres at y = 11.
  // Bands follow that diameter; top rails sit just outside the dome shoulder.
  const horizontalRing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  for (let i = 0; i < 5; i += 1) {
    const x = -140 - i * 18, z = -110;
    for (const [height, radius] of [[4.5, 5.04], [13, 5.04], [20.7, 5.04], [21.9, 5.35], [23.05, 5.35]]) {
      tankRings.push({ position: [x, height, z], size: [radius, radius, radius], quaternion: horizontalRing });
    }
    for (let j = 0; j < 12; j += 1) {
      const angle = j / 12 * Math.PI * 2;
      const px = x + Math.cos(angle) * 5.35, pz = z + Math.sin(angle) * 5.35;
      beam(metalBeams, [px, 21.8, pz], [px, 23.05, pz], 0.035);
    }
    beam(pipes, [x + 5.3, 1, z], [x + 5.3, 18, z], 0.085);
    beam(pipes, [x + 5.3, 1, z], [x + 5.3, 1, -102], 0.1);
  }
  beam(pipes, [-217, 1, -102], [-133, 1, -102], 0.18);
  beam(pipes, [-133, 1, -102], [-133, 1, -33], 0.18);

  makeInstances('painted-lines-and-signs', new THREE.BoxGeometry(1, 1, 1), painted, marks);
  makeInstances('galvanized-posts-and-rails', new THREE.CylinderGeometry(1, 1, 1, 6), galvanized, metalBeams);
  makeInstances('service-pipes', new THREE.CylinderGeometry(1, 1, 1, 10), pipeMaterial, pipes, true);
  makeInstances('equipment-cabinets', new THREE.BoxGeometry(1, 1, 1), cabinetMaterial, cabinets, true);
  makeInstances('equipment-bases-and-louvres', new THREE.BoxGeometry(1, 1, 1), recessMaterial, darkBoxes);
  makeInstances('tank-bands-and-top-rails', new THREE.TorusGeometry(1, 0.011, 4, 48), galvanized, tankRings);
  group.userData.colorPassDrawCalls = group.children.length;

  return {
    group,
    concreteMaterial,
    roadMaterial,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const mesh of batches) mesh.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const texture of textures) texture.dispose();
      for (const mat of materials) mat.dispose();
      group.clear();
      batches.length = 0;
      geometries.clear(); textures.clear(); materials.clear();
    },
  };
}
