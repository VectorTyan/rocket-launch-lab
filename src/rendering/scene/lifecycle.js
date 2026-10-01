/** Reverse-order, idempotent ownership of listeners, observers and GPU owners. */
export function createDisposalScope() {
  const callbacks = [];
  let disposed = false;
  return {
    defer(callback) {
      if (disposed) throw new Error('Cannot register resources after disposal.');
      callbacks.push(callback);
      return callback;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const errors = [];
      for (const callback of callbacks.splice(0).reverse()) {
        try {
          callback();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) throw new AggregateError(errors, 'Scene resource cleanup failed.');
    },
    get disposed() {
      return disposed;
    },
  };
}

/** For locally owned scene graphs, excluding material owners managed elsewhere. */
export function disposeObjectResources(root, externalMaterials = new Set()) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set(),
    instances = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.isInstancedMesh) instances.add(object);
    for (const material of object.material ? [object.material].flat() : []) {
      if (externalMaterials.has(material)) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  instances.forEach((object) => object.dispose());
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

export function createViewportBinding(
  container,
  renderer,
  camera,
  cinema,
  Observer = globalThis.ResizeObserver,
) {
  let disposed = false;
  function resize() {
    if (disposed) return false;
    const width = container.clientWidth,
      height = container.clientHeight;
    if (!(width > 0 && height > 0)) return false;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    cinema.resize(width, height);
    return true;
  }
  const observer = new Observer(resize);
  observer.observe(container);
  resize();
  return {
    resize,
    dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
    },
  };
}
