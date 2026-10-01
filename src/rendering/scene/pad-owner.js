import { createLaunchPad } from '../../launch-pads.js';
import { disposeObjectResources } from './lifecycle.js';

/** Tower meshes borrow detail materials; their owner releases those exactly once. */
export function createPadOwner(scene, { createPad = createLaunchPad } = {}) {
  let current = null,
    disposed = false;
  function release() {
    if (!current) return;
    const pad = current;
    current = null;
    scene.remove(pad.group);
    pad.group.remove(pad.terrain.group, pad.details.group);
    disposeObjectResources(pad.group, new Set([pad.details.concreteMaterial, pad.details.roadMaterial]));
    pad.terrain.dispose();
    pad.details.dispose();
  }
  return {
    get current() {
      return current;
    },
    setSite(site, rocket) {
      if (disposed) return null;
      release();
      current = createPad(site, rocket);
      scene.add(current.group);
      return current;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      release();
    },
  };
}
