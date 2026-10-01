import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

const EARTH_RADIUS = 6371000;
const SPACE_COLOR = new THREE.Color('#02050b');

// Visual presets, not weather observations. Colours are authored in sRGB and
// THREE.Color converts them to linear values before they reach shader uniforms.
const LOOKS = {
  coast: {
    rayleigh: 2.5, turbidity: 2.15, mie: 0.0035,
    fog: '#bdd4e1', zenith: '#287bc0', horizon: '#b1d1e3',
    coverage: 0.53, density: 1.38, upperCoverage: 0.70,
    sun: [0.30, 0.22, -0.90], cloudTint: '#fffdf5',
  },
  west: {
    rayleigh: 2.7, turbidity: 1.7, mie: 0.0028,
    fog: '#b7d1e2', zenith: '#277fc6', horizon: '#a8cce2',
    coverage: 0.67, density: 0.90, upperCoverage: 0.76,
    sun: [0.34, 0.23, -0.91], cloudTint: '#f5f8f7',
  },
  tropical: {
    rayleigh: 2.5, turbidity: 2.65, mie: 0.0040,
    fog: '#bed7df', zenith: '#287fbe', horizon: '#b7d7e3',
    coverage: 0.50, density: 1.48, upperCoverage: 0.66, hazeFalloff: 17,
    sun: [0.29, 0.25, -0.90], cloudTint: '#fffef5',
  },
  desert: {
    rayleigh: 2.2, turbidity: 2.9, mie: 0.0042,
    fog: '#d6d0bd', zenith: '#3d82b8', horizon: '#d3d1be',
    coverage: 0.77, density: 0.62, upperCoverage: 0.85, hazeFalloff: 16,
    sun: [0.34, 0.24, -0.91], cloudTint: '#fff7e8',
  },
};

const CLOUD_VERTEX = /* glsl */`
  varying vec3 vDirection;
  void main() {
    // Use the dome direction directly: subtracting two distant world positions
    // introduces precision noise when the floating flight origin moves.
    vDirection = mat3(modelMatrix) * position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position.z = gl_Position.w;
  }
`;

const CLOUD_FRAGMENT = /* glsl */`
  precision highp float;
  varying vec3 vDirection;
  uniform vec3 uUp;
  uniform vec3 uEast;
  uniform vec3 uNorth;
  uniform vec3 uSun;
  uniform vec2 uCameraPlane;
  uniform float uCameraHeight;
  uniform float uTime;
  uniform float uBase;
  uniform float uThickness;
  uniform float uScale;
  uniform float uCoverage;
  uniform float uDensity;
  uniform float uOpacity;
  uniform float uSeed;
  uniform vec3 uLitColor;
  uniform vec3 uShadowColor;
  uniform vec3 uHazeColor;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float hash13(vec3 p) {
    p = fract(p * .1031);
    p += dot(p, p.yzx + 31.32);
    return fract((p.x + p.y) * p.z);
  }

  float noise2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x),
      mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x),
          mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x),
          mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }

  float weather(vec2 p) {
    return noise2(p) * .65 + noise2(p * 2.07 + 17.2) * .25
      + noise2(p * 4.11 - 9.4) * .10;
  }

  float ellipsoid(vec3 p, vec3 center, vec3 radius) {
    vec3 q = (p - center) / radius;
    return 1.0 - dot(q, q);
  }

  float cloudBank(vec3 p, vec2 center, vec2 radius, float heightScale) {
    vec3 q = vec3((p.x - center.x) / radius.x,
      (p.y - uBase) / (uThickness * heightScale), (p.z - center.y) / radius.y);
    if (abs(q.x) > 1.05 || abs(q.z) > .90 || q.y < .05 || q.y > .99) return 0.0;
    // Each bank is a union of genuine 3D ellipsoids: every lobe tapers on the
    // sides AND top. No extruded two-dimensional footprint can form a column.
    float body = ellipsoid(q, vec3(0.0, .32, 0.0), vec3(1.0, .25, .88));
    body = max(body, ellipsoid(q, vec3(-.37, .49, .06), vec3(.49, .36, .56)));
    body = max(body, ellipsoid(q, vec3(.20, .59, -.06), vec3(.48, .39, .57)));
    body = max(body, ellipsoid(q, vec3(.64, .36, .10), vec3(.40, .27, .46)));
    return max(0.0, body);
  }

  float scatteredBanks(vec3 p) {
    // Low, separated fair-weather clouds leave their complete silhouettes in
    // the launch camera's 5-15 degree sky band, with generous blue intervals.
    float bank = cloudBank(p, vec2(-4500, -8200), vec2(1230, 960), .84);
    bank = max(bank, cloudBank(p, vec2(5300, -8900), vec2(1260, 990), 1.0));
    bank = max(bank, cloudBank(p, vec2(-8500, -4900), vec2(1440, 1020), .92));
    bank = max(bank, cloudBank(p, vec2(1500, -10900), vec2(1140, 900), .74));
    bank = max(bank, cloudBank(p, vec2(-1600, -15800), vec2(1800, 1110), 1.0));
    bank = max(bank, cloudBank(p, vec2(7600, -4700), vec2(1260, 1020), .79));
    bank = max(bank, cloudBank(p, vec2(8200, 5900), vec2(1380, 1050), .93));
    bank = max(bank, cloudBank(p, vec2(-7600, 6600), vec2(1320, 930), .87));
    bank = max(bank, cloudBank(p, vec2(-800, 9300), vec2(1140, 900), .76));
    return bank;
  }

  float cloudDensity(vec3 point) {
    vec2 wind = vec2(.65, .21) * uTime;
    vec2 horizontal = point.xz - wind + vec2(uSeed * 714.0, uSeed * 283.0);
    float vertical = (point.y - uBase) / uThickness;
    // Fair-weather cumulus: a relatively flat base and lobed, tapering tops.
    float heightProfile = smoothstep(0.0, .10, vertical)
      * (1.0 - smoothstep(.72, 1.0, vertical));
    if (heightProfile < .001) return 0.0;
    float region;
    float bank = 0.0;
    if (uSeed > 3.0) {
      bank = scatteredBanks(vec3(point.x - wind.x, point.y, point.z - wind.y));
      region = bank;
    } else {
      float cover = weather(horizontal * uScale * .34);
      region = smoothstep(uCoverage - .13, uCoverage + .10, cover);
    }
    if (region < .008) return 0.0;
    vec3 p = vec3(horizontal.x * uScale, vertical * 2.1, horizontal.y * uScale);
    float billow = noise3(p) * .66 + noise3(p * 2.04 + 9.7) * .24
      + noise3(p * 4.13 - 13.1) * .10;
    float shape = region * .65 + billow * .76 - .57 - pow(max(vertical, 0.0), 1.6) * .12;
    // High-frequency erosion breaks the silhouette without blurring the cloud.
    float erosion = noise3(p * 7.5 + vec3(21.3, 7.1, 3.7));
    shape -= (1.0 - erosion) * .115 * (1.0 - region * .4);
    if (uSeed > 3.0) {
      // Three-dimensional noise erodes the ellipsoid silhouette itself rather
      // than merely painting texture on an opaque slab.
      shape = bank + (billow - .5) * .34 - (1.0 - erosion) * .17
        - .11 - (uCoverage - .53) * .72;
      return smoothstep(.01, .34, shape) * uDensity;
    }
    return smoothstep(.015, .19, shape) * heightProfile * uDensity;
  }

  void main() {
    vec3 ray = normalize(vDirection);
    float verticalRay = dot(ray, uUp);
    if (abs(verticalRay) < .025 || uOpacity < .005) discard;
    float lowT = (uBase - uCameraHeight) / verticalRay;
    float highT = (uBase + uThickness - uCameraHeight) / verticalRay;
    float startT = max(0.0, min(lowT, highT));
    float endT = min(42000.0, max(lowT, highT));
    if (endT <= startT) discard;

    float horizonFade = smoothstep(.025, .072, abs(verticalRay));
    float distanceFade = 1.0 - smoothstep(24000.0, 42000.0, startT);
    float stepLength = (endT - startT) / float(CLOUD_STEPS);
    vec3 planarRay = vec3(dot(ray, uEast), verticalRay, dot(ray, uNorth));
    vec3 origin = vec3(uCameraPlane.x, uCameraHeight, uCameraPlane.y);
    vec3 sunInLayer = vec3(dot(uSun, uEast), dot(uSun, uUp), dot(uSun, uNorth));
    vec3 accumulated = vec3(0.0);
    float alpha = 0.0;
    // Per-pixel stratification removes the parallel contour bands produced by
    // taking exactly the same depth fraction on every neighbouring sightline.
    float jitter = hash12(gl_FragCoord.xy + vec2(17.3, 61.9));

    for (int i = 0; i < CLOUD_STEPS; i++) {
      float t = startT + (float(i) + .20 + jitter * .60) * stepLength;
      vec3 point = origin + planarRay * t;
      float density = cloudDensity(point);
      if (density > .006) {
        // A short light probe gives shaded bases, bright lobes and silver edges.
        float towardsSun = cloudDensity(point + sunInLayer * 310.0);
        float light = exp(-towardsSun * .90);
        float topLight = smoothstep(.10, .8, (point.y - uBase) / uThickness);
        vec3 shade = mix(uShadowColor, uLitColor, clamp(.29 + light * .64 + topLight * .23, 0.0, 1.0));
        float silver = pow(max(0.0, dot(ray, uSun)), 28.0) * .24 * (1.0 - min(density, 1.0));
        shade += uLitColor * silver;
        shade = mix(shade, uHazeColor, smoothstep(9000.0, 34000.0, t) * .35);
        float sampleAlpha = 1.0 - exp(-density * stepLength * .0015);
        accumulated += (1.0 - alpha) * sampleAlpha * shade;
        alpha += (1.0 - alpha) * sampleAlpha;
        if (alpha > .97) break;
      }
    }

    if (alpha < .004) discard;
    gl_FragColor = vec4(accumulated / max(alpha, .001), alpha * uOpacity * horizonFade * distanceFade);
    // This is a background cloud volume, not foreground fog. Writing the far
    // depth works with logarithmic-depth scenes and keeps rockets/towers intact.
    #ifdef USE_LOGARITHMIC_DEPTH_BUFFER
      gl_FragDepth = 1.0;
    #endif
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function cloudLayer(geometry, { base, thickness, scale, opacity, seed, steps }) {
  const uniforms = {
    uUp: { value: new THREE.Vector3(0, 1, 0) },
    uEast: { value: new THREE.Vector3(1, 0, 0) },
    uNorth: { value: new THREE.Vector3(0, 0, 1) },
    uSun: { value: new THREE.Vector3() },
    uCameraPlane: { value: new THREE.Vector2() },
    uCameraHeight: { value: 0 }, uTime: { value: 0 },
    uBase: { value: base }, uThickness: { value: thickness },
    uScale: { value: scale }, uCoverage: { value: .5 },
    uDensity: { value: 1.3 }, uOpacity: { value: opacity },
    uSeed: { value: seed }, uLitColor: { value: new THREE.Color('#fff9ed') },
    uShadowColor: { value: new THREE.Color('#718b9d') },
    uHazeColor: { value: new THREE.Color('#bdd4e1') },
  };
  const material = new THREE.ShaderMaterial({
    name: 'LayeredCumulusSky', uniforms,
    defines: { CLOUD_STEPS: steps },
    vertexShader: CLOUD_VERTEX, fragmentShader: CLOUD_FRAGMENT,
    side: THREE.BackSide, transparent: true, depthWrite: false,
    depthTest: true, depthFunc: THREE.LessEqualDepth,
    toneMapped: true, fog: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -990 + seed;
  mesh.userData.baseOpacity = opacity;
  return mesh;
}

/**
 * Add `group` directly to the scene, outside any translated launch-pad group.
 * Call update AFTER camera controls and floating-origin updates, BEFORE render.
 * The caller may copy fogColor to scene.fog.color and use sunDirection for its
 * directional light. No renderer colour-space or tone-mapping setting is changed.
 */
export function createAtmosphere(renderer) {
  const group = new THREE.Group();
  group.name = 'Procedural daylight atmosphere';
  group.renderOrder = -10000;
  const sunDirection = new THREE.Vector3();
  const fogColor = new THREE.Color();
  const groundFog = new THREE.Color();
  const worldCamera = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const east = new THREE.Vector3();
  const north = new THREE.Vector3();
  const zero = new THREE.Vector3();
  let elapsed = 0;
  let disposed = false;
  let look = LOOKS.coast;

  const sky = new Sky();
  sky.name = 'Clear blue atmospheric scattering';
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  sky.material.depthTest = false;
  sky.material.depthWrite = false;
  sky.material.fog = false;
  sky.material.uniforms.uCameraAltitude = { value: 0 };
  sky.material.uniforms.uHazeFalloff = { value: 20 };
  sky.material.uniforms.uZenithColor = { value: new THREE.Color() };
  sky.material.uniforms.uHorizonColor = { value: new THREE.Color() };
  sky.material.uniforms.uSkyBrightness = { value: renderer?.toneMapping === THREE.NoToneMapping ? .83 : 1.0 };
  // Keep the official scattering and solar disc, with a clear-day colour grade.
  // Direction is independent of the camera/floating-origin translation.
  sky.material.vertexShader = sky.material.vertexShader.replace(
    'vWorldPosition = worldPosition.xyz;',
    'vWorldPosition = mat3( modelMatrix ) * position;',
  );
  sky.material.fragmentShader = `
    uniform float uCameraAltitude;
    uniform float uHazeFalloff;
    uniform float uSkyBrightness;
    uniform vec3 uZenithColor;
    uniform vec3 uHorizonColor;
    ${sky.material.fragmentShader}
  `.replace(
    'normalize( vWorldPosition - cameraPosition )',
    'normalize( vWorldPosition )',
  ).replace(
    'gl_FragColor = vec4( retColor, 1.0 );',
    /* glsl */`
      float elevation = max(0.0, dot(direction, up));
      float horizonHaze = exp(-elevation * uHazeFalloff);
      vec3 clearBlue = mix(uZenithColor, uHorizonColor, horizonHaze);
      // ACES exposure suitable for the rocket would otherwise bleach the stock
      // Sky shader. Retain scattering directionality without a grey-white dome.
      vec3 compressedScatter = retColor * .22 / (vec3(1.0) + retColor * .22);
      vec3 daylight = mix(clearBlue, compressedScatter, .08) * uSkyBrightness;
      float sunCos = max(0.0, dot(direction, vSunDirection));
      float softHalo = pow(sunCos, 28.0) * .030 + pow(sunCos, 460.0) * .075;
      daylight += vec3(1.0, .85, .64) * softHalo;
      daylight += vec3(1.0, .94, .82) * sundisk * 10.0;
      float air = exp(-max(0.0, uCameraAltitude) / 14500.0);
      air *= 1.0 - smoothstep(65000.0, 110000.0, uCameraAltitude);
      vec3 space = vec3(.0006, .0011, .0024);
      vec3 colour = mix(space, daylight, air);
      // The direct sun remains visible above the atmosphere; the broad halo does not.
      colour += vec3(1.0, .92, .78) * sundisk * (1.0 - air) * 10.0;
      gl_FragColor = vec4(colour, 1.0);
    `,
  );
  group.add(sky);

  const cloudGeometry = new THREE.BoxGeometry(1, 1, 1);
  // Render the distant, thinner layer first; both stay behind all solid geometry.
  const highClouds = cloudLayer(cloudGeometry, { base: 4700, thickness: 700, scale: .00050, opacity: .16, seed: 2, steps: 6 });
  const lowClouds = cloudLayer(cloudGeometry, { base: 1000, thickness: 800, scale: .00125, opacity: .94, seed: 5, steps: 18 });
  group.add(highClouds, lowClouds);
  const clouds = [highClouds, lowClouds];

  function setSunDirection(direction) {
    sunDirection.copy(direction).normalize();
    sky.material.uniforms.sunPosition.value.copy(sunDirection).multiplyScalar(450000);
    for (const cloud of clouds) cloud.material.uniforms.uSun.value.copy(sunDirection);
  }

  function setSite(site) {
    look = Object.hasOwn(LOOKS, site?.terrain) ? LOOKS[site.terrain] : LOOKS.coast;
    sunDirection.set(...look.sun).normalize();
    const uniforms = sky.material.uniforms;
    uniforms.sunPosition.value.copy(sunDirection).multiplyScalar(450000);
    uniforms.rayleigh.value = look.rayleigh;
    uniforms.turbidity.value = look.turbidity;
    uniforms.mieCoefficient.value = look.mie;
    uniforms.mieDirectionalG.value = .80;
    uniforms.uZenithColor.value.set(look.zenith);
    uniforms.uHorizonColor.value.set(look.horizon);
    uniforms.uHazeFalloff.value = look.hazeFalloff ?? 20;
    groundFog.set(look.fog);
    fogColor.copy(groundFog);
    for (const cloud of clouds) {
      const cloudUniforms = cloud.material.uniforms;
      cloudUniforms.uSun.value.copy(sunDirection);
      cloudUniforms.uCoverage.value = cloud === highClouds ? look.upperCoverage : look.coverage;
      cloudUniforms.uDensity.value = cloud === highClouds ? look.density * .57 : look.density;
      cloudUniforms.uLitColor.value.set(look.cloudTint);
      cloudUniforms.uHazeColor.value.copy(groundFog);
    }
    group.userData.terrainKind = Object.hasOwn(LOOKS, site?.terrain) ? site.terrain : 'coast';
  }

  function update({ camera, anchor = zero, altitude = 0, missionTime = 0, deltaTime = 0, isStructure = false } = {}) {
    if (disposed) return;
    group.visible = !isStructure;
    if (isStructure || !camera) return;
    if (Number.isFinite(deltaTime)) elapsed += Math.min(.25, Math.max(0, deltaTime));
    camera.getWorldPosition(worldCamera);
    group.position.copy(worldCamera);
    // The actual camera can stay at the pad while the selected vehicle is in orbit.
    // Its position plus the floating origin is authoritative for sky appearance.
    worldCamera.add(anchor);
    radial.copy(worldCamera);
    radial.y += EARTH_RADIUS;
    const radius = radial.length();
    const cameraAltitude = Number.isFinite(radius)
      ? Math.max(0, radius - EARTH_RADIUS)
      : Math.max(0, Number.isFinite(altitude) ? altitude : 0);
    if (radius > 1 && Number.isFinite(radius)) radial.multiplyScalar(1 / radius);
    else radial.set(0, 1, 0);
    east.set(1, 0, 0).addScaledVector(radial, -radial.x);
    if (east.lengthSq() < .001) east.set(0, 0, 1).addScaledVector(radial, -radial.z);
    east.normalize();
    north.crossVectors(east, radial).normalize();
    sky.material.uniforms.up.value.copy(radial);
    sky.material.uniforms.uCameraAltitude.value = cameraAltitude;

    // Enclose the camera without depending on far-away launch coordinates.
    // The vertex shaders explicitly place both backgrounds at far depth.
    const domeSize = Math.min(1000000, Math.max(1000, (camera.far || 1000000) * .5));
    sky.scale.setScalar(domeSize);
    for (const cloud of clouds) {
      cloud.scale.setScalar(domeSize * .99);
      const uniforms = cloud.material.uniforms;
      uniforms.uUp.value.copy(radial);
      uniforms.uEast.value.copy(east);
      uniforms.uNorth.value.copy(north);
      uniforms.uCameraPlane.value.set(worldCamera.dot(east), worldCamera.dot(north));
      uniforms.uCameraHeight.value = cameraAltitude;
      uniforms.uTime.value = elapsed;
      uniforms.uOpacity.value = cloud.userData.baseOpacity
        * (1 - THREE.MathUtils.smoothstep(cameraAltitude, 7000, 15000));
      cloud.visible = uniforms.uOpacity.value > .005;
    }
    fogColor.copy(groundFog).lerp(SPACE_COLOR, 1 - Math.exp(-cameraAltitude / 17000));
    // Diagnostic values also make the selected camera altitude easy to inspect.
    group.userData.cameraAltitude = cameraAltitude;
    group.userData.missionTime = missionTime;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    sky.geometry.dispose();
    sky.material.dispose();
    cloudGeometry.dispose();
    for (const cloud of clouds) cloud.material.dispose();
  }

  setSite(null);
  return { group, sunDirection, fogColor, setSite, setSunDirection, update, dispose };
}
