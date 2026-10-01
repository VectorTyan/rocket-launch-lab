import * as THREE from 'three';

// Entirely local, seeded terrain. Distances are metres and Y is up.
// Vegetation is intentionally absent from the launch and recovery infrastructure.
const LAND_MIN_X = -7000;
const LAND_LENGTH = 22000;
const SEA_SIZE = 100000;
const clamp = THREE.MathUtils.clamp;

function hash(x, y, seed = 0) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function randomGenerator(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function noise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx *= fx * (3 - 2 * fx);
  fy *= fy * (3 - 2 * fy);
  const top = THREE.MathUtils.lerp(hash(ix, iy, seed), hash(ix + 1, iy, seed), fx);
  const bottom = THREE.MathUtils.lerp(hash(ix, iy + 1, seed), hash(ix + 1, iy + 1, seed), fx);
  return THREE.MathUtils.lerp(top, bottom, fy);
}

function tiledNoise(x, y, period, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx *= fx * (3 - 2 * fx);
  fy *= fy * (3 - 2 * fy);
  const wrapped = (a, b) => hash(((a % period) + period) % period, ((b % period) + period) % period, seed);
  const top = THREE.MathUtils.lerp(wrapped(ix, iy), wrapped(ix + 1, iy), fx);
  const bottom = THREE.MathUtils.lerp(wrapped(ix, iy + 1), wrapped(ix + 1, iy + 1), fx);
  return THREE.MathUtils.lerp(top, bottom, fy);
}

function smooth(a, b, value) {
  const u = clamp((value - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
}

function makeTexture(size, sample, colorSpace = THREE.SRGBColorSpace) {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const pixel = sample(x / size, y / size, x, y);
      const offset = (y * size + x) * 4;
      pixels[offset] = clamp(pixel[0], 0, 255);
      pixels[offset + 1] = clamp(pixel[1], 0, 255);
      pixels[offset + 2] = clamp(pixel[2], 0, 255);
      pixels[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.colorSpace = colorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function terrainTexture(kind, seed) {
  const west = kind === 'west', tropical = kind === 'tropical', desert = kind === 'desert';
  const green = desert ? [154, 138, 111] : tropical ? [53, 91, 51] : west ? [115, 112, 74] : [89, 110, 69];
  const soil = desert ? [176, 155, 120] : tropical ? [84, 109, 61] : west ? [139, 133, 96] : [123, 131, 88];
  return makeTexture(512, (u, v, x, y) => {
    const patch = tiledNoise(u * 4, v * 4, 4, seed);
    const detail = tiledNoise(u * 40, v * 40, 40, seed + 18);
    const grain = hash(x, y, seed + 35);
    const dry = smooth(0.35, 0.79, patch + (detail - 0.5) * 0.15) * (tropical ? 0.38 : 0.72);
    const brightness = 0.95 + detail * 0.055 + grain * 0.035;
    // Dark and pale gravel flecks break up the ochre soil without dune stripes.
    const gravel = desert ? (grain > 0.952 ? -29 : grain < 0.036 ? 14 : (grain - 0.5) * 9) : 0;
    return green.map((value, i) => THREE.MathUtils.lerp(value, soil[i], dry) * brightness + gravel);
  });
}

function sandTexture(seed) {
  return makeTexture(512, (u, v, x, y) => {
    const broad = tiledNoise(u * 12, v * 12, 12, seed + 50);
    const ripple = Math.sin((u * 90 + tiledNoise(u * 9, v * 9, 9, seed + 2) * 3) * Math.PI) * 0.024;
    const brightness = 0.88 + broad * 0.13 + hash(x, y, seed + 6) * 0.075 + ripple;
    return [187, 176, 142].map(channel => channel * brightness);
  });
}

function normalTexture(seed) {
  return makeTexture(256, (u, v, x, y) => {
    const nx = (hash(x, y, seed) - 0.5) * 36;
    const ny = (hash(x + 17, y + 71, seed) - 0.5) * 36;
    return [128 + nx, 128 + ny, 254];
  }, THREE.NoColorSpace);
}

function stripGeometry(rows, columns, pointAt) {
  const positions = [], uvs = [], indices = [];
  for (let row = 0; row <= rows; row++) {
    const z = (row / rows - 0.5) * LAND_LENGTH;
    for (let col = 0; col <= columns; col++) {
      const point = pointAt(col / columns, z);
      positions.push(...point);
      uvs.push(point[0] / 260, z / 260);
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const a = row * (columns + 1) + col;
      const b = a + 1, c = a + columns + 1, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function grassGeometry() {
  const random = randomGenerator(5831);
  const positions = [];
  for (let i = 0; i < 7; i++) {
    const a = i * 2.399963;
    const x = Math.sin(a) * random() * 0.36;
    const z = Math.cos(a) * random() * 0.36;
    const width = 0.055 + random() * 0.055;
    const height = 0.4 + random() * 0.5;
    const dx = Math.cos(a) * width, dz = Math.sin(a) * width;
    positions.push(x - dx, 0, z - dz, x + dx, 0, z + dz, x + Math.sin(a) * 0.32, height, z + Math.cos(a) * 0.32);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function palmGeometries() {
  const trunk = new THREE.CylinderGeometry(0.16, 0.28, 8, 7, 5);
  trunk.translate(0, 4, 0);
  const trunkVertices = trunk.attributes.position;
  for (let i = 0; i < trunkVertices.count; i++) {
    const y = trunkVertices.getY(i);
    trunkVertices.setX(i, trunkVertices.getX(i) + 0.65 * (y / 8) ** 2);
  }
  trunk.computeVertexNormals();
  const positions = [], indices = [];
  const random = randomGenerator(21987);
  for (let frond = 0; frond < 9; frond++) {
    const angle = frond * Math.PI * 2 / 9 + random() * 0.18;
    const length = 3.35 + random() * 1.1;
    const start = positions.length / 3;
    for (let segment = 0; segment <= 10; segment++) {
      const u = segment / 10;
      const radius = length * u;
      const x = 0.65 + Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = 8 + Math.sin(u * Math.PI) * 1.35 - u * u * 1.35;
      const width = Math.sin(u * Math.PI) ** 0.7 * (0.31 + (frond % 3) * 0.045);
      const sideX = -Math.sin(angle) * width, sideZ = Math.cos(angle) * width;
      positions.push(x + sideX, y, z + sideZ, x, y + width * 0.24, z, x - sideX, y, z - sideZ);
      if (segment < 10) {
        const a = start + segment * 3, b = a + 3;
        indices.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
      }
    }
  }
  const crown = new THREE.BufferGeometry();
  crown.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  crown.setIndex(indices);
  crown.computeVertexNormals();
  crown.computeBoundingSphere();
  return { trunk, crown };
}

const seaVertex = /* glsl */`
  #include <common>
  #include <fog_pars_vertex>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vSeaXZ;
  varying vec3 vSeaWorld;
  void main() {
    vSeaXZ = position.xz;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vSeaWorld = worldPosition.xyz;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
  }
`;

const seaFragment = /* glsl */`
  #include <common>
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>
  uniform float uTime;
  uniform float uShorePhase;
  uniform vec3 uSunDirection;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uHorizonColor;
  varying vec2 vSeaXZ;
  varying vec3 vSeaWorld;

  float coastline(float z) {
    return 630.0 + 135.0 * sin(z * 0.00061 + uShorePhase)
      + 65.0 * sin(z * 0.00143 + 1.6)
      + 38.0 * sin(z * 0.0039 + uShorePhase);
  }

  void main() {
    #include <logdepthbuf_fragment>
    vec3 toEye = cameraPosition - vSeaWorld;
    float distanceToEye = length(toEye);
    vec3 viewDirection = normalize(toEye);
    float detail = 1.0 - smoothstep(900.0, 6500.0, distanceToEye);
    vec2 p = vSeaXZ;
    float time = uTime;
    // Analytic gradients give tiny capillary ripples and longer wind-driven waves.
    vec2 gradient = vec2(0.026, 0.014) * cos(dot(p, vec2(0.16, 0.083)) - time * 0.82);
    gradient += vec2(-0.019, 0.026) * cos(dot(p, vec2(-0.11, 0.15)) - time * 0.64);
    gradient += detail * vec2(0.021, 0.009) * cos(dot(p, vec2(0.91, 0.39)) - time * 1.43);
    gradient += detail * vec2(-0.014, 0.024) * cos(dot(p, vec2(-1.7, 2.9)) - time * 2.1);
    vec3 normal = normalize(vec3(-gradient.x, 1.0, -gradient.y));
    vec3 sunDirection = normalize(uSunDirection);
    float daylight = smoothstep(-0.08, 0.28, sunDirection.y);
    float shoreDistance = p.x - coastline(p.y);
    float depth = smoothstep(15.0, 720.0, shoreDistance);
    vec3 water = mix(uShallowColor, uDeepColor, depth);
    water *= 0.5 + 0.5 * daylight;
    float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);
    float fresnel = 0.035 + 0.965 * pow(1.0 - facing, 5.0);
    vec3 reflectedSky = mix(uHorizonColor, vec3(0.13, 0.28, 0.44), clamp(viewDirection.y * 1.7, 0.0, 1.0));
    vec3 color = mix(water, reflectedSky, fresnel * 0.83);
    vec3 halfDirection = normalize(sunDirection + viewDirection);
    float specular = pow(max(0.0, dot(normal, halfDirection)), mix(180.0, 440.0, detail));
    float glow = pow(max(0.0, dot(normal, halfDirection)), 24.0);
    color += vec3(1.0, 0.78, 0.5) * (specular * 1.75 + glow * 0.09) * daylight;

    float wash = 16.0 + sin(p.y * 0.038 - time * 0.37) * 2.4;
    float foam = exp(-pow((shoreDistance - wash) / 4.3, 2.0));
    foam *= 0.45 + 0.55 * sin(p.y * 0.77 + sin(p.x * 0.14) - time * 0.6) * sin(p.y * 0.77 + sin(p.x * 0.14) - time * 0.6);
    color = mix(color, vec3(0.69, 0.74, 0.69), foam * 0.47);
    // Soft atmospheric loss prevents the distant sea from looking like a hard plane.
    float distanceHaze = 1.0 - exp(-distanceToEye * 0.000012);
    color = mix(color, uHorizonColor, distanceHaze * 0.52);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function excluded(x, z) {
  if (Math.abs(x) < 124 && Math.abs(z) < 100) return true;
  if (Math.abs(x + 85) < 20 && z > -430 && z < 1840) return true;
  if (x > -168 && x < 50 && Math.abs(z - 85) < 18) return true;
  if (Math.hypot(x + 350, z - 200) < 36) return true;
  if (x > -228 && x < -122 && z > -128 && z < -92) return true;
  if (Math.abs(x + 250) < 47 && Math.abs(z - 100) < 30) return true;
  return false;
}

/**
 * Natural surroundings only; callers retain their launch pad, buildings and roads.
 * update({time, sunDirection}) expects seconds and a direction toward the sun.
 * sunDirection accepts a THREE.Vector3, [x,y,z], or an object with x/y/z fields.
 */
export function createTerrain(site = {}) {
  const west = site.terrain === 'west';
  const tropical = site.terrain === 'tropical';
  const desert = site.terrain === 'desert';
  const kind = desert ? 'desert' : tropical ? 'tropical' : west ? 'west' : 'coast';
  const seed = desert ? 41657 : tropical ? 63971 : west ? 10847 : 74093;
  const phase = west ? 1.35 : tropical ? 0.72 : 0.2;
  const landMinX = desert ? -14000 : LAND_MIN_X;
  const random = randomGenerator(seed);
  const group = new THREE.Group();
  group.name = desert ? 'Jiuquan dry gravel plain and distant low mountains'
    : tropical ? 'Wenchang tropical coastal vegetation and palms'
    : west ? 'Vandenberg coastal scrub and rolling hills' : 'Florida coastal grassland and shallows';
  const textures = new Set();
  const shoreline = z => 630 + 135 * Math.sin(z * 0.00061 + phase) + 65 * Math.sin(z * 0.00143 + 1.6) + 38 * Math.sin(z * 0.0039 + phase);
  const hills = Array.from({ length: desert ? 22 : 14 }, (_, index) => {
    const angle = desert ? index * Math.PI * 2 / 22 + random() * 0.19 : 0;
    const distance = desert ? 6000 + random() * 4100 : 0;
    return {
      x: desert ? Math.cos(angle) * distance : -1000 - random() * 4400,
      z: desert ? Math.sin(angle) * distance : -7200 + random() * 14400,
      radiusX: desert ? 750 + random() * 1100 : 480 + random() * 900,
      radiusZ: desert ? 1050 + random() * 1700 : 640 + random() * 1500,
      height: desert ? 95 + random() * 240 : 80 + random() * 260,
    };
  });
  function elevation(x, z) {
    if ((!west && !desert) || (west && x > -470)) return -0.15;
    const distance = Math.hypot(x, z);
    if (desert && distance < 2400) return -0.15;
    let height = 0;
    for (const hill of hills) {
      const dx = (x - hill.x) / hill.radiusX;
      const dz = (z - hill.z) / hill.radiusZ;
      height += hill.height * Math.exp(-1.5 * (dx * dx + dz * dz));
    }
    height *= desert
      ? smooth(2400, 4500, distance) * (1 - smooth(10800, 13300, distance))
      : smooth(470, 1200, -x) * (1 - smooth(6000, 7000, -x));
    height *= 0.87 + noise(x * 0.0018, z * 0.0018, seed + 43) * 0.22;
    return -0.15 + height * 0.55;
  }

  const groundMap = terrainTexture(kind, seed);
  const sandMap = desert ? null : sandTexture(seed);
  const groundNormal = normalTexture(seed);
  textures.add(groundMap); if (sandMap) textures.add(sandMap); textures.add(groundNormal);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: groundMap, normalMap: groundNormal,
    normalScale: new THREE.Vector2(desert ? 0.24 : 0.13, desert ? 0.24 : 0.13), roughness: 0.97, metalness: 0, vertexColors: true,
  });
  const landGeometry = stripGeometry(180, 100, (u, z) => {
    const x = THREE.MathUtils.lerp(landMinX, desert ? 14000 : shoreline(z) - 44, u);
    return [x, elevation(x, z), z];
  });
  const landColors = [];
  const landVertices = landGeometry.attributes.position;
  for (let i = 0; i < landVertices.count; i++) {
    const variation = noise(landVertices.getX(i) * 0.0017, landVertices.getZ(i) * 0.0017, seed + 80);
    const shade = 0.92 + variation * 0.11;
    landColors.push(shade * (desert ? 1.03 : west ? 1.02 : 0.97), shade, shade * (desert ? 0.91 : 0.95));
  }
  landGeometry.setAttribute('color', new THREE.Float32BufferAttribute(landColors, 3));
  const land = new THREE.Mesh(landGeometry, groundMaterial);
  land.name = desert ? 'Continuous dry gravel terrain and low mountains' : tropical ? 'Dense green tropical ground' : 'Continuous grassland';
  land.receiveShadow = true;
  group.add(land);

  if (desert) {
    // Replace the ocean with actual ground all the way beyond the ground-level
    // horizon. Keeping the original coast-shaped land alone exposes blue Earth.
    const plainGeometry = new THREE.PlaneGeometry(180000, 180000);
    plainGeometry.rotateX(-Math.PI / 2);
    const plainVertices = plainGeometry.attributes.position;
    const plainUV = plainGeometry.attributes.uv;
    const colors = [];
    for (let i = 0; i < plainVertices.count; i++) {
      plainUV.setXY(i, plainVertices.getX(i) / 260, plainVertices.getZ(i) / 260);
      colors.push(0.99, 0.97, 0.89);
    }
    plainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const plain = new THREE.Mesh(plainGeometry, groundMaterial);
    plain.name = 'Unbroken 180 km Gobi horizon ground';
    plain.position.y = -0.32;
    plain.receiveShadow = true;
    group.add(plain);
  }

  function surfaceHeight(x, z) {
    if (!west && !desert) return -0.15;
    // Sample the actual terrain triangles, so small shrubs do not float over hills.
    const rowValue = clamp((z / LAND_LENGTH + 0.5) * 180, 0, 179.999999);
    const row = Math.floor(rowValue), v = rowValue - row;
    const edge0 = landVertices.getX(row * 101 + 100);
    const edge1 = landVertices.getX((row + 1) * 101 + 100);
    const u = (x - landMinX) / (THREE.MathUtils.lerp(edge0, edge1, v) - landMinX);
    const column = clamp(Math.floor(u * 100), 0, 99);
    const a = row * 101 + column, b = a + 1, c = a + 101, d = c + 1;
    const weightB = (x - landVertices.getX(a) - v * (landVertices.getX(c) - landVertices.getX(a))) / (landVertices.getX(b) - landVertices.getX(a));
    if (weightB + v <= 1) {
      return landVertices.getY(a) + weightB * (landVertices.getY(b) - landVertices.getY(a)) + v * (landVertices.getY(c) - landVertices.getY(a));
    }
    const lowerWeight = 1 - v;
    const leftWeight = (landVertices.getX(d) + lowerWeight * (landVertices.getX(b) - landVertices.getX(d)) - x) / (landVertices.getX(d) - landVertices.getX(c));
    return landVertices.getY(d) + lowerWeight * (landVertices.getY(b) - landVertices.getY(d)) + leftWeight * (landVertices.getY(c) - landVertices.getY(d));
  }

  let seaMaterial = null;
  if (!desert) {
  const beach = new THREE.Mesh(stripGeometry(220, 10, (u, z) => {
    const x = shoreline(z) - 76 + u * 122;
    return [x, -0.12 - Math.pow(u, 1.4) * 1.05, z];
  }), new THREE.MeshStandardMaterial({
    color: west ? 0xd0c3a1 : 0xede4c7, map: sandMap, normalMap: groundNormal,
    normalScale: new THREE.Vector2(0.1, 0.1), roughness: 0.9,
  }));
  beach.name = 'Sloping sand shore';
  beach.receiveShadow = true;
  group.add(beach);

  seaMaterial = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uShorePhase: { value: phase },
        uSunDirection: { value: new THREE.Vector3(0.6, 0.72, 0.35).normalize() },
        uDeepColor: { value: new THREE.Color(west ? '#2c5764' : tropical ? '#176c7b' : '#1f6476') },
        uShallowColor: { value: new THREE.Color(west ? '#628d88' : tropical ? '#65b0a0' : '#6da7a0') },
        uHorizonColor: { value: new THREE.Color('#b3c2c1') },
      },
    ]),
    vertexShader: seaVertex,
    fragmentShader: seaFragment,
    fog: true,
  });
  const seaGeometry = new THREE.PlaneGeometry(SEA_SIZE, SEA_SIZE);
  seaGeometry.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(seaGeometry, seaMaterial);
  sea.name = 'Sunlit water with animated fine wave normals';
  sea.position.y = -0.8;
  sea.renderOrder = -1;
  group.add(sea);
  }

  function vegetation(count, geometry, material, kind) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    const transform = new THREE.Object3D();
    const color = new THREE.Color();
    let accepted = 0;
    for (let attempts = 0; accepted < count && attempts < count * 12; attempts++) {
      // Bias toward the near field while retaining vegetation on more distant hills.
      const near = random() < 0.68;
      const x = desert ? (near ? -1400 + random() * 2800 : -5500 + random() * 11000)
        : near ? -900 + random() * 1580 : -3600 + random() * 4300;
      const z = (random() - 0.5) * (desert ? (near ? 2800 : 12000) : near ? 2050 : 6900);
      if (excluded(x, z) || (!desert && x > shoreline(z) - 95)) continue;
      const vegetationDensity = noise(x * 0.012, z * 0.012, seed + 99);
      if (vegetationDensity < (desert ? 0.61 : tropical ? 0.26 : 0.33)) continue;
      const shrub = kind === 'shrub';
      const size = shrub ? 0.52 + random() * 1.8 : 0.7 + random() * 1.0;
      transform.position.set(x, surfaceHeight(x, z) + (shrub ? size * 0.54 : 0.035), z);
      transform.rotation.set(0, random() * Math.PI * 2, 0);
      transform.scale.set(size * (shrub ? 1.15 : 1), size * (shrub ? 0.65 : 1), size);
      transform.updateMatrix();
      mesh.setMatrixAt(accepted, transform.matrix);
      color.setHSL(desert ? 0.12 + random() * 0.035 : tropical ? 0.25 + random() * 0.055 : west ? 0.17 + random() * 0.035 : 0.21 + random() * 0.045,
        desert ? 0.12 + random() * 0.12 : tropical ? 0.32 + random() * 0.16 : 0.18 + random() * 0.16,
        tropical ? 0.16 + random() * 0.08 : 0.22 + random() * 0.10);
      mesh.setColorAt(accepted, color);
      accepted++;
    }
    mesh.count = accepted;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    mesh.name = kind === 'shrub' ? (desert ? 'Sparse dry Gobi shrubs' : 'Coastal scrub clusters') : 'Sparse grass tufts';
    group.add(mesh);
    return mesh;
  }

  const shrubGeometry = new THREE.IcosahedronGeometry(1, 1);
  const shrubVertices = shrubGeometry.attributes.position;
  for (let i = 0; i < shrubVertices.count; i++) {
    const x = shrubVertices.getX(i), y = shrubVertices.getY(i), z = shrubVertices.getZ(i);
    const irregularity = 0.9 + noise(x * 4 + 10, z * 4 + y * 2 + 10, seed + 13) * 0.23;
    shrubVertices.setXYZ(i, x * irregularity, y * irregularity, z * irregularity);
  }
  shrubGeometry.computeVertexNormals();
  const shrubs = vegetation(desert ? 260 : tropical ? 1800 : 1250, shrubGeometry, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), 'shrub');
  const grass = desert ? null : vegetation(tropical ? 4300 : 3200, grassGeometry(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide }), 'grass');
  let treeCount = 0;
  if (tropical) {
    const geometries = palmGeometries();
    const trunks = new THREE.InstancedMesh(geometries.trunk, new THREE.MeshStandardMaterial({ color: '#93836a', roughness: 1 }), 130);
    const crowns = new THREE.InstancedMesh(geometries.crown, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, side: THREE.DoubleSide }), 130);
    trunks.name = 'Instanced tropical palm trunks';
    crowns.name = 'Instanced curved tropical palm fronds';
    const transform = new THREE.Object3D(), color = new THREE.Color();
    for (let attempt = 0; treeCount < 130 && attempt < 5200; attempt++) {
      const near = random() < 0.76;
      const x = near ? -760 + random() * 1260 : -2000 + random() * 2450;
      const z = (random() - 0.5) * (near ? 2300 : 4700);
      if (x > shoreline(z) - 120 || excluded(x, z)
        || excluded(x - 8, z - 8) || excluded(x - 8, z + 8)
        || excluded(x + 8, z - 8) || excluded(x + 8, z + 8)) continue;
      const size = 0.78 + random() * 0.63;
      transform.position.set(x, surfaceHeight(x, z), z);
      transform.rotation.set(0, random() * Math.PI * 2, 0);
      transform.scale.setScalar(size);
      transform.updateMatrix();
      trunks.setMatrixAt(treeCount, transform.matrix);
      crowns.setMatrixAt(treeCount, transform.matrix);
      color.set('#3c783e').multiplyScalar(0.82 + random() * 0.30);
      crowns.setColorAt(treeCount, color);
      treeCount++;
    }
    for (const mesh of [trunks, crowns]) {
      mesh.count = treeCount;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }

  group.userData = {
    terrainSeed: seed,
    terrainKind: kind,
    educationalLandscape: true,
    vegetationInstances: shrubs.count + (grass?.count ?? 0) + treeCount,
    treeInstances: treeCount,
    hasSea: !desert,
    originGroundHeight: -0.15,
    landSizeMetres: desert ? [180000, 180000] : [Math.abs(LAND_MIN_X) + 900, LAND_LENGTH],
    source: 'Locally generated geometry and textures; no external map or imagery',
  };
  const sun = new THREE.Vector3();
  let disposed = false;
  function update({ time = 0, sunDirection } = {}) {
    if (disposed) return;
    if (seaMaterial) seaMaterial.uniforms.uTime.value = Number.isFinite(time) ? time : 0;
    if (seaMaterial && sunDirection) {
      if (Array.isArray(sunDirection)) sun.fromArray(sunDirection);
      else sun.set(sunDirection.x, sunDirection.y, sunDirection.z);
      if (Number.isFinite(sun.lengthSq()) && sun.lengthSq() > 0) seaMaterial.uniforms.uSunDirection.value.copy(sun).normalize();
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    const geometries = new Set(), materials = new Set();
    group.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) for (const material of [object.material].flat()) materials.add(material);
      if (object.isInstancedMesh) object.dispose();
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    textures.forEach(texture => texture.dispose());
  }
  return { group, update, dispose };
}
