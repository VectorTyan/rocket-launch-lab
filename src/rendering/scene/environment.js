import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createAtmosphere } from '../../atmosphere.js';
import { createEarthGlobe } from '../../earth.js';
import { EARTH_RADIUS } from '../../flight-space.js';
import { getStudioTheme } from '../../studio-themes.js';
import { createStudioDisplay } from './studio-display.js';
import { createDisposalScope, disposeObjectResources } from './lifecycle.js';

export function flightLighting(altitude, quality, terrain) {
  const air = 1 - THREE.MathUtils.smoothstep(altitude, 18000, 100000);
  return {
    air,
    exposure: 0.9 + 0.18 * (1 - air),
    environmentIntensity: quality === 'cinema' ? 0.28 + 0.9 * air : 0.06 + 0.3 * air,
    starOpacity: THREE.MathUtils.clamp((altitude - 45000) / 110000, 0, 0.85),
    fogDensity: Math.max(0.000038 * Math.exp(-altitude / 8500), altitude < 24000 ? 0.000022 : 0),
    fogVisible: altitude < 50000,
    hemisphereIntensity: 0.6 + 1.1 * air,
    groundColor:
      terrain === 'desert'
        ? '#927a57'
        : terrain === 'tropical'
          ? '#365936'
          : terrain === 'west'
            ? '#76634d'
            : '#536343',
  };
}

function starfield() {
  const positions = [];
  for (let i = 0; i < 1800; i++) {
    const y = 1 - (2 * (i + 0.5)) / 1800,
      angle = i * 2.399963,
      radial = Math.sqrt(1 - y * y);
    positions.push(radial * Math.cos(angle) * 8000000, y * 8000000, radial * Math.sin(angle) * 8000000);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: '#c2d9ed',
      size: 1.3,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
    }),
  );
}

/** Owns scene-wide environment resources, separate from rocket/pad lifecycles. */
export function createSceneEnvironment({ renderer, scene, camera, cinema }) {
  const scope = createDisposalScope();
  let environmentTarget = null,
    site = null,
    theme = getStudioTheme(),
    time = 0;
  try {
    const atmosphere = createAtmosphere(renderer);
    scene.add(atmosphere.group);
    scope.defer(() => atmosphere.dispose());
    const earthGlobe = createEarthGlobe(),
      earth = earthGlobe.root;
    scene.add(earth);
    scope.defer(() => earthGlobe.dispose());
    const generator = new THREE.PMREMGenerator(renderer);
    scope.defer(() => generator.dispose());
    const room = new RoomEnvironment();
    let studioEnvironment;
    try {
      studioEnvironment = generator.fromScene(room, 0.025, 0.1, 100);
    } finally {
      room.dispose();
    }
    scope.defer(() => studioEnvironment.dispose());
    const lightSky = new Sky();
    lightSky.scale.setScalar(10000);
    lightSky.material.uniforms.rayleigh.value = 2;
    lightSky.material.uniforms.turbidity.value = 3;
    lightSky.material.uniforms.mieCoefficient.value = 0.006;
    const lightScene = new THREE.Scene();
    lightScene.add(lightSky);
    scope.defer(() => disposeObjectResources(lightScene));
    scope.defer(() => environmentTarget?.dispose());
    const display = createStudioDisplay(scene);
    scope.defer(() => display.dispose());
    const stars = starfield();
    scene.add(stars);
    scope.defer(() => {
      stars.removeFromParent();
      disposeObjectResources(stars);
    });
    const hemi = new THREE.HemisphereLight('#c1d9f2', '#787363', 1.7);
    const sun = new THREE.DirectionalLight('#ffe0ba', 4.5);
    sun.position.set(150, 160, 100);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -90;
    sun.shadow.camera.right = 90;
    sun.shadow.camera.top = 100;
    sun.shadow.camera.bottom = -90;
    sun.shadow.camera.far = 700;
    sun.shadow.normalBias = 0.04;
    const rim = new THREE.DirectionalLight('#8fbcdd', 0.7);
    rim.position.set(-100, 60, -90);
    const fill = new THREE.DirectionalLight('#e8f4ff', 0);
    fill.position.set(0, 35, 160);
    scene.add(hemi, sun, sun.target, rim, fill);
    scope.defer(() => {
      sun.shadow.dispose();
      scene.remove(hemi, sun, sun.target, rim, fill);
    });
    const fog = new THREE.FogExp2('#bad1dc', 0.000038);
    function setTheme(id) {
      theme = getStudioTheme(id);
      display.setTheme(theme);
      return theme;
    }
    function setSite(next) {
      if (scope.disposed) return;
      site = next;
      earthGlobe.setSite(next);
      atmosphere.setSite(next);
      lightSky.material.uniforms.sunPosition.value.copy(atmosphere.sunDirection);
      environmentTarget?.dispose();
      environmentTarget = generator.fromScene(lightScene, 0.025, 0.1, 20000);
      scene.environment = environmentTarget.texture;
    }
    function setQuality(quality) {
      if (scope.disposed) return;
      if (site) atmosphere.setSite(site);
      const size = quality === 'cinema' ? 4096 : 2048;
      if (sun.shadow.mapSize.x !== size) {
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
        sun.shadow.mapSize.set(size, size);
        sun.shadow.needsUpdate = true;
      }
    }
    function update({ mode, view, state, dt, anchor, cameraAltitude, pad, explode }) {
      if (scope.disposed) return;
      const studio = mode === 'structure' || mode === 'assembly';
      display.update({ visible: studio, explode: mode === 'structure' ? explode : 0 });
      earth.visible = !studio;
      earth.position.set(-anchor.x, -EARTH_RADIUS - anchor.y, -anchor.z);
      sun.target.position.set(0, 25, 0);
      stars.position.copy(camera.position);
      if (studio) {
        scene.background.set(theme.background);
        scene.fog = null;
        stars.material.opacity = theme.showStars ? 0.45 : 0;
        renderer.toneMappingExposure = theme.exposure;
        scene.environmentIntensity = theme.environmentIntensity;
        hemi.color.set(theme.hemisphereSky);
        hemi.groundColor.set(theme.hemisphereGround);
        hemi.intensity = theme.hemisphereIntensity;
        sun.color.set(theme.keyColor);
        sun.position.set(150, 160, 100);
        sun.intensity = theme.keyIntensity;
        rim.color.set(theme.rimColor);
        rim.intensity = theme.rimIntensity;
        fill.color.set(theme.fillColor);
        fill.intensity = theme.fillIntensity;
      } else scene.background.set('#030911');
      if (cinema.quality === 'cinema' && cinema.hdrReady) atmosphere.setSunDirection(cinema.sunDirection);
      atmosphere.update({
        camera,
        anchor,
        altitude: cameraAltitude,
        missionTime: state.time,
        deltaTime: dt,
        isStructure: studio,
      });
      pad.group.visible = !studio && cameraAltitude < 24000;
      if (!studio) {
        const lighting = flightLighting(cameraAltitude, cinema.quality, site?.terrain);
        renderer.toneMappingExposure = lighting.exposure;
        scene.environmentIntensity = lighting.environmentIntensity;
        stars.material.opacity = lighting.starOpacity;
        fog.color.copy(atmosphere.fogColor);
        fog.density = lighting.fogDensity;
        scene.fog = lighting.fogVisible ? fog : null;
        hemi.color.set('#b8d4f4');
        hemi.groundColor.set(lighting.groundColor);
        hemi.intensity = lighting.hemisphereIntensity;
        if (view === 'pad') sun.target.position.copy(pad.group.position).add(new THREE.Vector3(0, 25, 0));
        const direction =
          cinema.quality === 'cinema' && cinema.hdrReady ? cinema.sunDirection : atmosphere.sunDirection;
        sun.color.set('#fff0d6');
        sun.intensity = 3.4;
        sun.position.copy(direction).multiplyScalar(300).add(sun.target.position);
        rim.color.set('#8fbcdd');
        rim.intensity = 0.5;
        fill.intensity = 0;
        time += Math.max(0, Math.min(0.1, dt));
        pad.terrain.update({ time, sunDirection: direction });
      }
    }
    setTheme(theme.id);
    return {
      setTheme,
      setSite,
      setQuality,
      update,
      get theme() {
        return theme;
      },
      get time() {
        return time;
      },
      get standardEnvironment() {
        return environmentTarget?.texture;
      },
      get studioEnvironment() {
        return studioEnvironment.texture;
      },
      dispose() {
        try {
          scope.dispose();
        } finally {
          scene.environment = null;
        }
      },
    };
  } catch (error) {
    scope.dispose();
    throw error;
  }
}
