import * as THREE from 'three';

const CORNERS = [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
const EPSILON = 1e-7;
const vertexShader = 'void main(){gl_Position=vec4(position.xy,0.0,1.0);}';
const fragmentShader = `uniform vec3 color; uniform float opacity;
void main(){gl_FragColor=vec4(color,opacity);
#include <colorspace_fragment>
}`;

function visibleMaterial(material) {
  return material && material.visible !== false && (!material.transparent || material.opacity > 0);
}

function clippedPolygon(points, plane) {
  const result = [];
  for (let i = 0; i < points.length; i++) {
    const from = points[i], to = points[(i + 1) % points.length];
    const da = plane.distanceToPoint(from), db = plane.distanceToPoint(to);
    const aInside = da >= -EPSILON, bInside = db >= -EPSILON;
    if (aInside) result.push(from);
    if (aInside !== bInside) result.push(from.clone().lerp(to, da / (da - db)));
  }
  return result;
}

function boxCorners(box, matrix = null) {
  return CORNERS.map(([x,y,z]) => {
    const point = new THREE.Vector3(x ? box.max.x : box.min.x, y ? box.max.y : box.min.y, z ? box.max.z : box.min.z);
    return matrix ? point.applyMatrix4(matrix) : point;
  });
}

/**
 * Read-only, clipping-aware selection feedback. Add group to the SCENE, never to
 * the vehicle root: these screen-space marks are not part of the rocket model.
 * Update after cutaway.update() and before the standard/cinematic render call.
 * No rocket geometry, coating, material or clipping state is changed here.
 */
export function createSelectionView(vehicle) {
  if (!vehicle?.root?.isObject3D || !(vehicle.parts instanceof Map)) throw new TypeError('Selection view requires a vehicle root and parts Map.');
  const group = new THREE.Group();
  group.name = 'Structure selection · screen-space brackets';
  group.visible = false;
  group.userData = { selectionOverlay: true, ignoreVehicleBounds: true, ignoreRaycast: true };
  group.raycast = () => {};
  const owned = [];
  let selectedId = null, enabled = false, disposed = false;
  let signature = '', worldBounds = new THREE.Box3(), lastRect = null, dimOpacity = .105;
  const boundsCache = new WeakMap();
  const sourcePoints = new WeakMap();
  const instance = new THREE.Matrix4(), transform = new THREE.Matrix4();

  function layer(name, color, opacity, order) {
    const geometry = new THREE.BufferGeometry();
    const attribute = new THREE.BufferAttribute(new Float32Array(2048 * 3), 3);
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', attribute); geometry.setDrawRange(0, 0);
    const material = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: opacity } },
      vertexShader, fragmentShader, transparent: true, depthTest: false, depthWrite: false,
      toneMapped: false, fog: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name; mesh.frustumCulled = false; mesh.renderOrder = order;
    mesh.raycast = () => {};
    mesh.userData = { selectionOverlay: true, ignoreVehicleBounds: true, ignoreRaycast: true };
    group.add(mesh); owned.push({ geometry, material });
    return mesh;
  }
  const scrim = layer('Quiet surround', '#000000', dimOpacity, 9900);
  const outer = layer('Selection white underlay', '#f5fbff', .9, 9901);
  const border = layer('Selection dark outline', '#123246', 1, 9902);
  const accent = layer('Selection accent', '#0ebde9', 1, 9903);

  function geometryBounds(geometry) {
    const attribute = geometry.attributes.position;
    let cached = boundsCache.get(geometry);
    if (!cached || cached.version !== attribute.version) {
      cached = { version: attribute.version, box: new THREE.Box3().setFromBufferAttribute(attribute) };
      boundsCache.set(geometry, cached);
    }
    return cached.box;
  }
  function geometryPoints(geometry) {
    const attribute = geometry.attributes.position;
    let cached = sourcePoints.get(geometry);
    if (!cached || cached.version !== attribute.version) {
      cached = { version: attribute.version, points: Array.from({ length: attribute.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(attribute, i)) };
      sourcePoints.set(geometry, cached);
    }
    return cached.points;
  }
  function collectMeshes(part) {
    const result = [];
    function walk(object) {
      if (!object.visible || object.userData.selectionOverlay) return;
      if (object.isMesh && object.geometry?.attributes.position && [object.material].flat().some(visibleMaterial)) result.push(object);
      object.children.forEach(walk);
    }
    walk(part);
    return result;
  }
  function materialKey(material) {
    if (!material) return '-';
    const planes = material.clippingPlanes || [];
    return `${material.uuid}:${material.visible}:${material.opacity}:${material.clipIntersection}:${Boolean(material.userData.cutawayRemoveShellCaps)}:${planes.map(plane => [...plane.normal.toArray(), plane.constant].join(',')).join(';')}`;
  }
  function meshKey(object) {
    return `${object.uuid}:${object.geometry.uuid}:${object.geometry.attributes.position.version}:${object.geometry.index?.version}:${object.instanceMatrix?.version}:${object.count}:${object.geometry.drawRange.start}:${object.geometry.drawRange.count}:${object.matrixWorld.elements.join(',')}:${[object.material].flat().map(materialKey).join('|')}`;
  }
  function addGeometryBounds(object, matrix, result) {
    const geometry = object.geometry;
    const materials = [object.material].flat();
    const hasClipping = materials.some(mat => mat?.clippingPlanes?.length);
    const allVisible = materials.every(visibleMaterial);
    if (!hasClipping && allVisible && !Array.isArray(object.material)) {
      result.union(geometryBounds(geometry).clone().applyMatrix4(matrix)); return;
    }
    const points = geometryPoints(geometry);
    const count = geometry.index?.count ?? points.length;
    const start = Math.max(0, geometry.drawRange.start), end = Math.min(count, start + geometry.drawRange.count);
    const ranges = Array.isArray(object.material) ? geometry.groups.map(range => ({ ...range, material: materials[range.materialIndex] })) : [{ start, count: end - start, material: materials[0] }];
    let transformed = null;
    for (const range of ranges) {
      const material = range.material;
      if (!visibleMaterial(material)) continue;
      const planes = material.clippingPlanes || [];
      // Almost all heat-shield instances are wholly kept or removed. Avoid
      // expanding their individual triangles unless a plane actually cuts one.
      if (planes.length && !Array.isArray(object.material)) {
        const corners = boxCorners(geometryBounds(geometry), matrix);
        const statuses = planes.map(plane => {
          const values = corners.map(point => plane.distanceToPoint(point));
          return { kept: values.every(value => value >= -EPSILON), removed: values.every(value => value < -EPSILON) };
        });
        const allKept = material.clipIntersection ? statuses.some(status => status.kept) : statuses.every(status => status.kept);
        const allRemoved = material.clipIntersection ? statuses.every(status => status.removed) : statuses.some(status => status.removed);
        if (allRemoved) continue;
        if (allKept) { corners.forEach(point => result.expandByPoint(point)); continue; }
      }
      if (!transformed) transformed = points.map(point => point.clone().applyMatrix4(matrix));
      const from = Math.max(start, range.start), to = Math.min(end, range.start + range.count);
      for (let index = from; index + 2 < to; index += 3) {
        const indices = [0, 1, 2].map(delta => geometry.index ? geometry.index.getX(index + delta) : index + delta);
        if (material.userData.cutawayRemoveShellCaps && geometry.attributes.normal && indices.every(i => Math.abs(geometry.attributes.normal.getY(i)) > .98)) continue;
        const triangle = indices.map(i => transformed[i]);
        if (!planes.length) { triangle.forEach(point => result.expandByPoint(point)); continue; }
        if (material.clipIntersection) {
          for (const plane of planes) clippedPolygon(triangle, plane).forEach(point => result.expandByPoint(point));
        } else {
          let polygon = triangle;
          for (const plane of planes) { polygon = clippedPolygon(polygon, plane); if (!polygon.length) break; }
          polygon.forEach(point => result.expandByPoint(point));
        }
      }
    }
  }
  function retainedBounds(objects) {
    const result = new THREE.Box3();
    for (const object of objects) {
      if (object.isInstancedMesh) for (let index = 0; index < object.count; index++) {
        object.getMatrixAt(index, instance); transform.multiplyMatrices(object.matrixWorld, instance);
        addGeometryBounds(object, transform, result);
      } else addGeometryBounds(object, object.matrixWorld, result);
    }
    return result;
  }
  function projectedRect(box, camera, width, height) {
    const inverse = camera.matrixWorldInverse;
    const project = boxCorners(box).filter(point => point.clone().applyMatrix4(inverse).z < -camera.near).map(point => point.project(camera));
    if (!project.length) return null;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const point of project) {
      const x = (point.x * .5 + .5) * width, y = (-point.y * .5 + .5) * height;
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (right < 0 || left > width || bottom < 0 || top > height) return null;
    const cx = (left + right) / 2, cy = (top + bottom) / 2;
    const halfWidth = Math.max(15, (right - left) / 2 + 8), halfHeight = Math.max(15, (bottom - top) / 2 + 8);
    left = Math.max(7, cx - halfWidth); right = Math.min(width - 7, cx + halfWidth);
    top = Math.max(7, cy - halfHeight); bottom = Math.min(height - 7, cy + halfHeight);
    return right > left && bottom > top ? { left, right, top, bottom } : null;
  }
  function writer(mesh, width, height) {
    const attribute = mesh.geometry.attributes.position;
    let cursor = 0;
    function point(x, y) { attribute.array[cursor++] = x / width * 2 - 1; attribute.array[cursor++] = 1 - y / height * 2; attribute.array[cursor++] = 0; }
    function quad(a,b,c,d) { for (const p of [a,b,c,a,c,d]) point(...p); }
    return {
      rectangle(x1,y1,x2,y2) { if (x2 > x1 && y2 > y1) quad([x1,y1],[x2,y1],[x2,y2],[x1,y2]); },
      line(x1,y1,x2,y2,thickness) {
        const length = Math.hypot(x2-x1,y2-y1); if (!length) return;
        const x = -(y2-y1) / length * thickness / 2, y = (x2-x1) / length * thickness / 2;
        quad([x1+x,y1+y],[x2+x,y2+y],[x2-x,y2-y],[x1-x,y1-y]);
      },
      dot(x,y,radius) { for(let i=0;i<16;i++){point(x,y);point(x+Math.cos(i*Math.PI/8)*radius,y+Math.sin(i*Math.PI/8)*radius);point(x+Math.cos((i+1)*Math.PI/8)*radius,y+Math.sin((i+1)*Math.PI/8)*radius);} },
      finish() { attribute.needsUpdate = true; mesh.geometry.setDrawRange(0,cursor/3); },
    };
  }
  function draw(rect, width, height, isolated) {
    const {left,right,top,bottom} = rect;
    const length = THREE.MathUtils.clamp(Math.min(right-left,bottom-top)*.2,12,29);
    const segments = [[left,top,left+length,top],[left,top,left,top+length],[right-length,top,right,top],[right,top,right,top+length],[left,bottom,left+length,bottom],[left,bottom-length,left,bottom],[right-length,bottom,right,bottom],[right,bottom-length,right,bottom]];
    const markerX = Math.min(width-7,right+9), markerY = (top+bottom)/2;
    for (const [mesh, thickness, radius] of [[outer,7.5,6],[border,5.5,4.7],[accent,2.7,2.7]]) {
      const out = writer(mesh,width,height);
      for (const segment of segments) out.line(...segment,thickness);
      if(right+15<width){out.line(right,markerY,markerX,markerY,thickness*.65);out.dot(markerX,markerY,radius);}
      out.finish();
    }
    const dim = writer(scrim,width,height);
    dim.rectangle(0,0,width,top-5); dim.rectangle(0,bottom+5,width,height);
    dim.rectangle(0,top-5,left-5,bottom+5); dim.rectangle(right+5,top-5,width,bottom+5); dim.finish();
    scrim.material.uniforms.opacity.value = isolated ? 0 : dimOpacity;
  }
  function setSelected(id = null) {
    const next = vehicle.parts.has(id) ? id : null;
    if (next !== selectedId) { selectedId = next; signature = ''; lastRect = null; worldBounds.makeEmpty(); }
    if (!selectedId) group.visible = false;
    return selectedId;
  }
  function setEnabled(value) { enabled = Boolean(value); if (!enabled) { group.visible = false; lastRect = null; } return enabled; }
  function setTheme(theme = 'technology') {
    const id = typeof theme === 'string' ? theme : theme?.id;
    accent.material.uniforms.color.value.set(id === 'space' ? '#ffd084' : id === 'playful' ? '#eb8739' : '#06b6e5');
    dimOpacity = id === 'space' ? .12 : .105;
  }
  function update({camera,width,height,isolated=false} = {}) {
    if (disposed || !enabled || !selectedId || !camera?.isCamera || !(width>20 && height>20)) { group.visible = false; return false; }
    const part = vehicle.parts.get(selectedId);
    for (let node=part; node; node=node.parent) if (!node.visible) { group.visible=false;lastRect=null;return false; }
    vehicle.root.updateWorldMatrix(true,true); camera.updateMatrixWorld();
    const objects = collectMeshes(part);
    const nextSignature = `${selectedId}|${objects.map(meshKey).join('!')}`;
    if (nextSignature !== signature) { signature = nextSignature; worldBounds = retainedBounds(objects); }
    lastRect = worldBounds.isEmpty() ? null : projectedRect(worldBounds,camera,width,height);
    if (!lastRect) { group.visible=false;return false; }
    draw(lastRect,width,height,isolated); group.visible=true; return true;
  }
  function getInfo() {
    return { selectedId, visible:group.visible, bounds:worldBounds.isEmpty()?null:{min:worldBounds.min.toArray(),max:worldBounds.max.toArray()}, rect:lastRect?{...lastRect}:null };
  }
  function dispose() {
    if (disposed) return; disposed=true;group.visible=false;group.removeFromParent();
    for (const {geometry,material} of owned) { geometry.dispose();material.dispose(); }
    signature='';lastRect=null;worldBounds.makeEmpty();
  }
  return {group,setSelected,setEnabled,setTheme,update,getInfo,dispose};
}
