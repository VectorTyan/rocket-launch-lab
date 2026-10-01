import * as THREE from 'three';

function noise(x, y, seed) {
  let value = Math.imul(x + seed, 374761393) ^ Math.imul(y, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

/** Per-vehicle, locally generated PBR surfaces. No downloaded imagery or logos. */
export function createModelMaterials() {
  const textures = new Map();
  const modules = new Map();
  function texture(kind) {
    if (textures.has(kind)) return textures.get(kind);
    const size = kind.startsWith('steel') ? 1024 : 512;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const grain = noise(x, y, 78);
      if (kind.endsWith('rough')) {
        const value = 173 + grain * 30 + Math.sin(y * 0.91) * 9;
        data[i] = data[i + 1] = data[i + 2] = value;
      } else {
        const brushed = kind.startsWith('steel');
        data[i] = 128 + (grain - 0.5) * (brushed ? 8 : 5);
        data[i + 1] = 128 + (brushed ? Math.sin(y * 1.91) * 10 + (grain - 0.5) * 6 : (noise(x, y, 21) - 0.5) * 5);
        data[i + 2] = 254;
      }
      data[i + 3] = 255;
    }
    const result = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    result.wrapS = result.wrapT = THREE.RepeatWrapping;
    result.magFilter = THREE.LinearFilter;
    result.minFilter = THREE.LinearMipmapLinearFilter;
    result.generateMipmaps = true;
    result.anisotropy = 8;
    result.needsUpdate = true;
    textures.set(kind, result);
    return result;
  }
  const styles = {
    white: { color: 0xecefeb, roughness: 0.56, metalness: 0.2 },
    offwhite: { color: 0xd9dfdc, roughness: 0.62, metalness: 0.15 },
    black: { color: 0x172027, roughness: 0.69, metalness: 0.18 },
    carbon: { color: 0x282c2e, roughness: 0.8, metalness: 0.08 },
    steel: { color: 0xbac5c9, roughness: 0.44, metalness: 0.96 },
    polished: { color: 0xd6dfdd, roughness: 0.27, metalness: 0.96 },
    darkmetal: { color: 0x454e54, roughness: 0.47, metalness: 0.84 },
    nozzle: { color: 0x535252, roughness: 0.49, metalness: 0.8, side: THREE.DoubleSide },
    copper: { color: 0x896854, roughness: 0.46, metalness: 0.8 },
    red: { color: 0xad2d2d, roughness: 0.55, metalness: 0.12 },
    blue: { color: 0x123b61, roughness: 0.28, metalness: 0.59 },
    gold: { color: 0xb59a55, roughness: 0.44, metalness: 0.8 },
    tile: { color: 0x161b21, roughness: 0.9, metalness: 0.08 },
    interior: { color: 0xa5adaa, roughness: 0.86, metalness: 0.06, side: THREE.BackSide },
  };
  function material(id, style = 'white') {
    if (!modules.has(id)) modules.set(id, new Map());
    const cache = modules.get(id);
    if (!cache.has(style)) {
      const metallic = ['steel', 'polished', 'darkmetal', 'nozzle', 'copper'].includes(style);
      const mat = new THREE.MeshStandardMaterial({
        ...styles[style], normalMap: texture(metallic ? 'steel-normal' : 'paint-normal'),
        normalScale: new THREE.Vector2(metallic ? 0.13 : 0.1, metallic ? 0.2 : 0.1),
        ...(metallic ? { roughnessMap: texture('steel-rough') } : {}),
      });
      mat.name = `${id}/${style}`;
      cache.set(style, mat);
    }
    return cache.get(style);
  }
  function addMaterial(id, key, mat) {
    if (!modules.has(id)) modules.set(id, new Map());
    modules.get(id).set(key, mat);
    if (mat.map) textures.set(`${id}/${key}`, mat.map);
    return mat;
  }
  function select(id) {
    for (const [moduleId, materials] of modules) for (const mat of materials.values()) {
      mat.emissive.setHex(moduleId === id ? 0x167f98 : 0);
      mat.emissiveIntensity = moduleId === id ? 0.4 : 1;
    }
  }
  function dispose({ materials = true } = {}) {
    if (materials) for (const cache of modules.values()) for (const mat of cache.values()) mat.dispose();
    for (const value of new Set(textures.values())) value.dispose();
  }
  return { material, addMaterial, select, dispose };
}
