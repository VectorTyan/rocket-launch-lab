import * as THREE from 'three';

/** Reversible, per-mesh shell overrides; original materials/maps remain borrowed. */
export function createShellMaterials({ parts, shellMeshes, worldPlane }) {
  const replacements = new Map();
  const releasedMaterials = new WeakSet();
  let enabled = false,
    disposed = false;

  function releaseMaterial(material) {
    if (releasedMaterials.has(material)) return;
    releasedMaterials.add(material);
    // Shared maps, normal maps and roughness maps belong to the original model.
    material.dispose();
  }

  function enable() {
    if (enabled || disposed) return;
    for (const [id, part] of parts)
      for (const object of shellMeshes(id, part)) {
        const original = object.material;
        const clones = (Array.isArray(original) ? original : [original]).map((material) => {
          const clone = material.clone();
          clone.name = `${material.name || id} · cutaway shell`;
          clone.side = THREE.DoubleSide;
          clone.clippingPlanes = [...(material.clippingPlanes ?? []), worldPlane];
          clone.clipIntersection = false;
          clone.clipShadows = true;
          const cylinder = object.geometry.type === 'CylinderGeometry' ? object.geometry.parameters : null;
          if (
            cylinder &&
            !cylinder.openEnded &&
            cylinder.height > Math.max(cylinder.radiusTop, cylinder.radiusBottom) * 1.15
          ) {
            // Closed cylinders are an external modelling shortcut: their end
            // caps at arbitrary panel seams must not masquerade as tank walls.
            const originalHook = material.onBeforeCompile;
            clone.onBeforeCompile = function (shader, renderer) {
              originalHook.call(material, shader, renderer);
              shader.vertexShader = `varying float vCutawayShellCap;\n${shader.vertexShader}`.replace(
                '#include <begin_vertex>',
                '#include <begin_vertex>\nvCutawayShellCap = abs(normal.y);',
              );
              shader.fragmentShader = `varying float vCutawayShellCap;\n${shader.fragmentShader}`.replace(
                '#include <clipping_planes_fragment>',
                '#include <clipping_planes_fragment>\nif (vCutawayShellCap > 0.98) discard;',
              );
            };
            clone.customProgramCacheKey = () =>
              `${material.customProgramCacheKey()}/cutaway-open-cylinder-caps-v1`;
            clone.userData.cutawayRemoveShellCaps = true;
          }
          clone.needsUpdate = true;
          return clone;
        });
        replacements.set(object, { original, clones });
        object.material = Array.isArray(original) ? clones : clones[0];
      }
    enabled = true;
  }

  function syncHighlight() {
    if (!enabled || disposed) return;
    for (const { original, clones } of replacements.values()) {
      const materials = Array.isArray(original) ? original : [original];
      materials.forEach((material, index) => {
        if (material.emissive && clones[index].emissive) clones[index].emissive.copy(material.emissive);
        if ('emissiveIntensity' in material) clones[index].emissiveIntensity = material.emissiveIntensity;
      });
    }
  }

  function disable() {
    for (const [object, { original, clones }] of replacements) {
      object.material = original;
      clones.forEach(releaseMaterial);
    }
    replacements.clear();
    enabled = false;
  }

  function dispose() {
    if (disposed) return;
    disable();
    disposed = true;
  }

  return { enable, disable, syncHighlight, dispose };
}
