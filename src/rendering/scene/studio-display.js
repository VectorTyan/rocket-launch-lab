import * as THREE from 'three';
import { disposeObjectResources } from './lifecycle.js';

/** Owns the neutral floor/platform/grid; it never changes vehicle materials. */
export function createStudioDisplay(scene) {
  const group = new THREE.Group();
  group.name = 'Structure and assembly studio';
  scene.add(group);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(2200, 2200),
    new THREE.MeshStandardMaterial({ color: '#859ead', roughness: 0.78 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.4;
  floor.receiveShadow = true;
  group.add(floor);
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(21, 21, 1, 32),
    new THREE.MeshStandardMaterial({ color: '#172b39', metalness: 0.6, roughness: 0.4 }),
  );
  platform.position.y = -0.8;
  platform.castShadow = true;
  platform.receiveShadow = true;
  group.add(platform);
  const rings = [10, 23, 34, 50, 72].map((radius) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius, radius + 0.06, 128),
      new THREE.MeshBasicMaterial({
        color: '#34576a',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.25;
    group.add(ring);
    return ring;
  });
  const grid = new THREE.GridHelper(240, 48, '#294652', '#182c36');
  grid.position.y = -0.3;
  group.add(grid);
  let disposed = false;
  function setTheme(theme) {
    if (disposed) return;
    floor.material.color.set(theme.ground);
    platform.material.color.set(theme.platform);
    rings.forEach((ring) => ring.material.color.set(theme.gridCenter));
    const template = new THREE.GridHelper(240, 48, theme.gridCenter, theme.grid);
    grid.geometry.attributes.color.copy(template.geometry.attributes.color);
    grid.geometry.attributes.color.needsUpdate = true;
    disposeObjectResources(template);
  }
  return {
    group,
    setTheme,
    update({ visible, explode = 0 }) {
      if (disposed) return;
      group.visible = visible;
      group.position.y = -9 * explode;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      disposeObjectResources(group);
    },
  };
}
