import * as THREE from 'three';

const EARTH_RADIUS = 6371000;
const TEXTURE_URL = `${import.meta.env?.BASE_URL ?? '/'}assets/earth/nasa-blue-marble-2002-2048.jpg`;
const SOURCE_URL = 'https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/';

/**
 * A local NASA Blue Marble (2002) historical composite, not a current basemap.
 * The caller owns root.position (normally -anchor.x, -R-anchor.y, -anchor.z).
 * setSite changes orientation only; it does not move the caller's world origin.
 */
export function createEarthGlobe() {
  const root = new THREE.Group();
  root.name = 'Earth · NASA Blue Marble historical composite';
  const geometry = new THREE.SphereGeometry(EARTH_RADIUS, 384, 256);
  const material = new THREE.MeshStandardMaterial({
    name: 'NASA Blue Marble surface',
    color: '#204f71', roughness: 1, metalness: 0, envMapIntensity: 0.12,
  });
  const surface = new THREE.Mesh(geometry, material);
  surface.name = 'Earth surface · 384 × 256 sphere';
  surface.castShadow = false;
  surface.receiveShadow = false;
  root.add(surface);
  root.userData = {
    radius: EARTH_RADIUS,
    textureStatus: 'loading',
    textureUrl: TEXTURE_URL,
    sourceUrl: SOURCE_URL,
    attribution: 'NASA Goddard Space Flight Center; Reto Stöckli and Robert Simmon',
    historicalComposite: true,
    georeferenceNote: 'Spherical latitude/longitude orientation; no site survey or local-terrain image registration.',
  };

  let disposed = false;
  let texture = null;
  const releasedTextures = new Set();
  const basis = new THREE.Matrix4();
  const east = new THREE.Vector3();
  const up = new THREE.Vector3();
  const south = new THREE.Vector3();

  function releaseTexture(value) {
    if (value && !releasedTextures.has(value)) {
      releasedTextures.add(value);
      value.dispose();
    }
  }

  function textureFailed(error) {
    if (disposed) return;
    root.userData.textureStatus = 'fallback';
    material.map = null;
    material.color.set('#204f71');
    material.needsUpdate = true;
    console.warn('[Earth] Local NASA texture could not load; using the blue fallback globe.', error);
  }

  try {
    texture = new THREE.TextureLoader().load(TEXTURE_URL, loaded => {
      if (disposed) { releaseTexture(loaded); return; }
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.wrapS = THREE.RepeatWrapping;
      loaded.wrapT = THREE.ClampToEdgeWrapping;
      loaded.magFilter = THREE.LinearFilter;
      loaded.minFilter = THREE.LinearMipmapLinearFilter;
      loaded.anisotropy = 4;
      material.map = loaded;
      material.color.set('#ffffff');
      material.needsUpdate = true;
      root.userData.textureStatus = 'loaded';
    }, undefined, textureFailed);
    texture.colorSpace = THREE.SRGBColorSpace;
  } catch (error) {
    // TextureLoader requires browser image APIs. Also keep the simulation alive
    // if those APIs or the local asset are unavailable.
    textureFailed(error);
  }

  function setSite(site = {}) {
    if (disposed) return;
    const latitude = THREE.MathUtils.clamp(Number.isFinite(site.lat) ? site.lat : 0, -90, 90);
    const longitude = Number.isFinite(site.lon) ? ((site.lon + 180) % 360 + 360) % 360 - 180 : 0;
    const lat = THREE.MathUtils.degToRad(latitude);
    const lon = THREE.MathUtils.degToRad(longitude);
    const cosLat = Math.cos(lat), sinLat = Math.sin(lat);
    const cosLon = Math.cos(lon), sinLon = Math.sin(lon);

    // NASA's image runs west(-180°)→east(+180°), north→south. With Three's
    // default SphereGeometry and Texture.flipY=true, u=(lon+180)/360,
    // v=(lat+90)/180, and the matching unit normal is:
    // n=(cos(lat)cos(lon), sin(lat), -cos(lat)sin(lon)).
    up.set(cosLat * cosLon, sinLat, -cosLat * sinLon);
    east.set(-sinLon, 0, -cosLon);
    south.set(sinLat * cosLon, -cosLat, -sinLat * sinLon);
    // Project texture-space vectors onto a right-handed east/up/south frame:
    // selected site normal → +Y, east → +X, north → -Z.
    basis.makeBasis(east, up, south).transpose();
    root.quaternion.setFromRotationMatrix(basis);
    root.userData.site = { id: site.id ?? null, lat: latitude, lon: longitude };
    root.userData.groundUV = { u: (longitude + 180) / 360, v: (latitude + 90) / 180 };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    root.removeFromParent();
    releaseTexture(texture);
    releaseTexture(material.map);
    geometry.dispose();
    material.dispose();
  }

  setSite();
  return { root, setSite, dispose };
}
