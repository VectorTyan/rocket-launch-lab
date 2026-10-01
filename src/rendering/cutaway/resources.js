import * as THREE from 'three';

/**
 * Registry for geometry and materials created by one cutaway subsystem.
 * Textures and clipping planes are borrowed. Never traverse/dispose the vehicle.
 */
export function createCutawayResources(worldPlane) {
  const geometries = new Set();
  const materials = new Set();
  let disposed = false;

  function assertActive() {
    if (disposed) throw new Error('Cutaway resources have been disposed.');
  }

  function ownMaterial(options) {
    assertActive();
    const material = new THREE.MeshStandardMaterial({
      roughness: 0.6,
      metalness: 0.12,
      side: THREE.DoubleSide,
      clippingPlanes: [worldPlane],
      clipShadows: true,
      ...options,
    });
    materials.add(material);
    return material;
  }

  function interiorMesh(group, geometry, material, label, data = {}) {
    assertActive();
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = label;
    mesh.userData = { ...group.userData, ...data };
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  /** A moving section can replace only geometry owned by this registry. */
  function replaceGeometry(mesh, geometry) {
    assertActive();
    if (!geometries.has(mesh.geometry)) throw new Error('Cannot replace borrowed cutaway geometry.');
    if (mesh.geometry === geometry) return;
    geometries.delete(mesh.geometry);
    mesh.geometry.dispose();
    mesh.geometry = geometry;
    geometries.add(geometry);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    geometries.clear();
    materials.clear();
  }

  return { ownMaterial, interiorMesh, replaceGeometry, dispose };
}
