import * as THREE from 'three';
import { TAU } from './constants.js';
import { sectionVertices } from './section-geometry.js';
import { createCutawayResources } from './resources.js';

/** Owns only cut-face meshes/resources. Sources and shared textures stay borrowed. */
export function createSectionManager({ root, worldPlane }) {
  const sections = [];
  const resources = createCutawayResources(worldPlane);
  const { ownMaterial, interiorMesh } = resources;
  let disposed = false;
  function add(
    source,
    parent,
    profile,
    {
      color = '#ccd4d8',
      thickness = null,
      kind = 'wall',
      phiStart = 0,
      phiLength = TAU,
      opacity = 1,
      sourceIds = [],
    } = {},
  ) {
    if (disposed) throw new Error('Section manager has been disposed.');
    const material = ownMaterial({
      color,
      metalness: kind === 'propellant' ? 0 : 0.24,
      roughness: 0.68,
      transparent: true,
      opacity,
      depthWrite: false,
      clippingPlanes: ([source.material].flat()[0]?.clippingPlanes || []).filter(
        (plane) => plane !== worldPlane,
      ),
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    material.name = `educational-${kind}-section`;
    const mesh = interiorMesh(
      parent,
      new THREE.BufferGeometry(),
      material,
      kind === 'propellant'
        ? '推进剂功能截面 · 非实时液位'
        : kind === 'unknown-region'
          ? '未核实舱区剖面 · 中性示意'
          : '剖切壁厚与层边 · 厚度放大示意',
      {
        cutawayRole: 'internal',
        cutawaySection: true,
        sectionKind: kind,
        interiorRole: `${kind}-section`,
        sourceIds,
        propellant: source.userData.propellant,
      },
    );
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = kind === 'propellant' ? 2 : kind === 'unknown-region' ? 1 : 4;
    mesh.visible = false;
    sections.push({ source, mesh, parent, profile, thickness, phiStart, phiLength, lastPlane: null });
    return mesh;
  }

  function update() {
    if (disposed) return;
    root.updateWorldMatrix(true, true);
    for (const section of sections) {
      const { source, mesh, parent, profile, thickness, phiStart, phiLength } = section;
      const local = worldPlane.clone().applyMatrix4(source.matrixWorld.clone().invert());
      mesh.matrix.copy(parent.matrixWorld).invert().multiply(source.matrixWorld);
      mesh.matrixWorldNeedsUpdate = true;
      const previous = section.lastPlane;
      if (
        previous &&
        previous.normal.distanceToSquared(local.normal) < 1e-16 &&
        Math.abs(previous.constant - local.constant) < 1e-8
      )
        continue;
      section.lastPlane = local.clone();
      const points = sectionVertices(profile, local, thickness, phiStart, phiLength);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      resources.replaceGeometry(mesh, geometry);
      mesh.visible = points.length >= 9;
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const section of sections) section.mesh.removeFromParent();
    resources.dispose();
    sections.length = 0;
  }
  return { add, update, dispose };
}
