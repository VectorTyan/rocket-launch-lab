import * as THREE from 'three';
import { getInteriorSpec } from './interior-data.js';

const INTERIOR_NAME = 'educational-cutaway-interior';
const SHELL_IDS = new Set(['stage1', 'stage2', 'interstage', 'fairing-left', 'fairing-right', 'heatshield']);
const LAYOUT_NOTE = '教学示意：储箱上下位置、容积比例、舱壁和供给管路不是内部工程复原；颜色仅区分功能。';
const OXIDIZER_COLOR = '#59b7e7';
const FUEL_COLOR = '#efa866';
const CRAFT_NOTE = '依据公开舱段功能的教学摆放，非批次实装；设备外形、数量细节与安装坐标不作工程复原。';
const TAU = Math.PI * 2;

function isBooster(id) { return /^booster(?:-\d+)?s?$/.test(id); }
function isShellPart(id) { return SHELL_IDS.has(id) || isBooster(id); }

// A meridian profile intersected with the moving plane. These polygons close
// only the cut surface, rather than replacing hollow hardware with solid blocks.
function profileSlices(profile, plane) {
  const horizontal = Math.hypot(plane.normal.x, plane.normal.z);
  if (horizontal < 1e-7) return [];
  const nx = plane.normal.x / horizontal, nz = plane.normal.z / horizontal;
  const distance = y => -(plane.constant + plane.normal.y * y) / horizontal;
  const runs = [];
  let run = [];
  for (let i = 1; i < profile.length; i++) {
    const [r0, y0] = profile[i - 1], [r1, y1] = profile[i];
    let start = 0, end = 1;
    // r >= abs(distance) is the intersection of two linear inequalities.
    for (const sign of [-1, 1]) {
      const a = r0 + sign * distance(y0), b = r1 + sign * distance(y1);
      if (a < 0 && b < 0) { end = -1; break; }
      if (a < 0) start = Math.max(start, a / (a - b));
      else if (b < 0) end = Math.min(end, a / (a - b));
    }
    if (end < start) { if (run.length > 1) runs.push(run); run = []; continue; }
    for (let j = 0; j <= 8; j++) {
      const t = start + (end - start) * j / 8;
      const r = THREE.MathUtils.lerp(r0, r1, t), y = THREE.MathUtils.lerp(y0, y1, t);
      const d = distance(y), half = Math.sqrt(Math.max(0, r * r - d * d));
      const sample = { r, y, d, half, nx, nz };
      const previous = run.at(-1);
      if (!previous || Math.abs(previous.y - y) + Math.abs(previous.r - r) > 1e-8) run.push(sample);
    }
    if (end < 1 - 1e-8) { if (run.length > 1) runs.push(run); run = []; }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

function profilePoint(sample, half, sign = 1) {
  return new THREE.Vector3(sample.nx * sample.d - sample.nz * half * sign,
    sample.y, sample.nz * sample.d + sample.nx * half * sign);
}

function sectionVertices(profile, plane, thickness = null, phiStart = 0, phiLength = TAU) {
  const positions = [];
  const append = (...points) => {
    for(let i=0;i+2<points.length;i+=3){
      const a=points[i],b=points[i+1],c=points[i+2];
      // Dome tips and coincident shell edges can collapse to a line. Such
      // triangles have zero normals, which can contaminate HDR bloom with NaN.
      const area=b.clone().sub(a).cross(c.clone().sub(a)).lengthSq();
      if(!Number.isFinite(area)||area<1e-18)continue;
      for(const point of [a,b,c])positions.push(point.x,point.y,point.z);
    }
  };
  const angleInside = point => {
    if (phiLength >= TAU - 1e-5) return true;
    const angle = ((Math.atan2(point.x, point.z) - phiStart) % TAU + TAU) % TAU;
    return angle <= phiLength + 1e-6 || angle > TAU - 1e-6;
  };
  for (const run of profileSlices(profile, plane)) {
    if (thickness !== null) {
      for (let i = 1; i < run.length; i++) for (const sign of [-1, 1]) {
        const a = run[i - 1], b = run[i];
        const oa = profilePoint(a, a.half, sign), ob = profilePoint(b, b.half, sign);
        if (!angleInside(oa.clone().add(ob).multiplyScalar(.5))) continue;
        const inner = sample => Math.sqrt(Math.max(0, Math.max(0, sample.r - thickness) ** 2 - sample.d ** 2));
        const ia = profilePoint(a, inner(a), sign), ib = profilePoint(b, inner(b), sign);
        append(oa, ob, ib, oa, ib, ia);
      }
    } else {
      // Projection into the cut plane preserves concave common-dome profiles.
      const points = [...run.map(sample => profilePoint(sample, sample.half)),
        ...run.slice().reverse().map(sample => profilePoint(sample, sample.half, -1))];
      const axisX = new THREE.Vector3(-run[0].nz, 0, run[0].nx);
      const axisY = new THREE.Vector3().crossVectors(plane.normal, axisX).normalize();
      const compact = points.filter((point, i) => i === 0 || point.distanceToSquared(points[i - 1]) > 1e-14);
      if (compact.length > 2 && compact[0].distanceToSquared(compact.at(-1)) < 1e-14) compact.pop();
      const contour = compact.map(point => new THREE.Vector2(point.dot(axisX), point.dot(axisY)));
      for (const face of THREE.ShapeUtils.triangulateShape(contour, [])) append(...face.map(i => compact[i]));
    }
  }
  return positions;
}

/**
 * Selective material clipping plus illustrative interiors. The caller enables
 * renderer.localClippingEnabled and assembles the model before enabling this.
 * Call update after changing the vehicle root transform or part highlighting.
 * Dispose this controller BEFORE disposing the vehicle itself.
 */
export function createCutaway(vehicle, rocket = {}) {
  if (!vehicle?.root?.isObject3D || !(vehicle.parts instanceof Map)) {
    throw new TypeError('Cutaway requires a vehicle root and parts Map.');
  }
  const { root, parts } = vehicle;
  const rocketId = typeof rocket === 'string' ? rocket : rocket.id ?? root.userData.rocketId ?? '';
  const diameter = typeof rocket === 'object' ? rocket.diameter : undefined;
  const coreRadius = Math.max(0.1, Number(diameter) / 2 || Number(root.userData.coreDiameterMetres) / 2 || 1.85);
  const localPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  const worldPlane = localPlane.clone();
  const replacements = new Map();
  const interiors = [];
  const envelopes = new Map();
  const ownedGeometries = new Set();
  const ownedMaterials = new Set();
  const releasedMaterials = new WeakSet();
  const geometryBounds = new WeakMap();
  const sections = [];
  const metadataKeys = ['cutawayLegend', 'cutawayEnabled', 'cutawayOffset'];
  const metadataBefore = new Map(metadataKeys.map(key => [key, { existed: Object.hasOwn(root.userData, key), value: root.userData[key] }]));
  let enabled = false;
  let disposed = false;
  let built = false;
  let offset = 0;
  let focusPartId = null;

  function isTeachingCraft(id) {
    return rocketId === 'cz2f' && id === 'spacecraft' || rocketId === 'cz7' && id === 'payload';
  }

  function baseBounds(geometry) {
    if (!geometryBounds.has(geometry)) {
      const bounds = new THREE.Box3();
      if (geometry.attributes.position) bounds.setFromBufferAttribute(geometry.attributes.position);
      geometryBounds.set(geometry, bounds);
    }
    return geometryBounds.get(geometry);
  }

  // Exact geometry bounds in the requested ancestor's coordinates. This neither
  // writes boundingBox into original geometries nor relies on world-axis boxes.
  function meshBounds(object, ancestor) {
    const relative = new THREE.Matrix4().copy(ancestor.matrixWorld).invert().multiply(object.matrixWorld);
    const result = new THREE.Box3();
    const original = baseBounds(object.geometry);
    if (object.isInstancedMesh) {
      const instance = new THREE.Matrix4(), combined = new THREE.Matrix4();
      for (let index = 0; index < object.count; index++) {
        object.getMatrixAt(index, instance);
        combined.multiplyMatrices(relative, instance);
        result.union(original.clone().applyMatrix4(combined));
      }
    } else result.copy(original).applyMatrix4(relative);
    return result;
  }

  function protectedEngine(object, id, part) {
    if (object.userData.cutawayRole === 'internal') return true;
    if (object.userData.cutawayRole === 'shell') return false;
    const names = [object.name, ...[object.material].flat().map(material => material?.name ?? '')].join(' ');
    if (/nozzle|engine|chamber|turbopump|喷管|发动机/i.test(names)) return true;
    // Booster modules include complete engines in the same part. Protect their
    // rims, chambers and plumbing as well as meshes explicitly named "nozzle".
    return isBooster(id) && meshBounds(object, part).max.y <= 2.5;
  }

  function shellMeshes(id, part) {
    const result = [];
    const craft = isTeachingCraft(id);
    if (!isShellPart(id) && !craft) return result;
    part.traverse(object => {
      if (!object.isMesh || object.userData.cutawayInterior || !object.material) return;
      if (craft) {
        // Only the two selected teaching spacecraft have cabin cutaways. Keep
        // their folded solar panels, windows and exterior equipment complete.
        const type = object.geometry.type;
        if (!['CylinderGeometry', 'LatheGeometry', 'TorusGeometry'].includes(type)) return;
        if (type === 'CylinderGeometry'
          && Math.max(object.geometry.parameters.radiusTop, object.geometry.parameters.radiusBottom) < .4) return;
      }
      if (!protectedEngine(object, id, part)) result.push(object);
    });
    return result;
  }

  function tankEnvelope(id, part, objects) {
    const candidates = [];
    for (const object of objects) {
      if (object.isInstancedMesh || object.geometry.type !== 'CylinderGeometry') continue;
      const bounds = meshBounds(object, part);
      const size = bounds.getSize(new THREE.Vector3());
      const radius = Math.min(size.x, size.z) / 2;
      // Restrict tanks to the straight main barrels, excluding thin skirts,
      // nozzle plumbing, reinforcement rings and the tapering payload nose.
      if (radius < coreRadius * (isBooster(id) ? .25 : .52)
        || size.y < radius * 1.15
        || Math.max(size.x, size.z) > radius * 2.2) continue;
      candidates.push({ bounds, radius, size });
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.size.y - a.size.y);
    const barrel = candidates[0];
    const center = barrel.bounds.getCenter(new THREE.Vector3());
    const bounds = barrel.bounds.clone();
    for (const candidate of candidates.slice(1)) {
      const other = candidate.bounds.getCenter(new THREE.Vector3());
      if (Math.hypot(other.x - center.x, other.z - center.z) < barrel.radius * .15
        && candidate.radius >= barrel.radius * .80 && candidate.radius <= barrel.radius * 1.15) bounds.union(candidate.bounds);
    }
    const endMargin = Math.max(.35, barrel.radius * .16);
    let low = bounds.min.y + endMargin;
    let high = bounds.max.y - endMargin;
    if (id === 'stage2') {
      // Ship's barrel also contains the teaching payload: reserve that bay.
      for (const payloadId of ['payload', 'spacecraft']) {
        const payload = parts.get(payloadId);
        if (!payload) continue;
        let payloadLow = Infinity;
        payload.traverse(object => {
          if (object.isMesh && !object.userData.cutawayInterior) payloadLow = Math.min(payloadLow, meshBounds(object, part).min.y);
        });
        if (payloadLow > low && payloadLow < high) high = payloadLow - .30;
      }
    }
    if (high - low < 1.2) return null;
    return { x: center.x, z: center.z, low, high, radius: Math.max(.1, barrel.radius * .90 - .035), shellRadius: barrel.radius };
  }

  function ownMaterial(options) {
    const material = new THREE.MeshStandardMaterial({
      roughness: .60, metalness: .12, side: THREE.DoubleSide,
      clippingPlanes: [worldPlane], clipShadows: true,
      ...options,
    });
    ownedMaterials.add(material);
    return material;
  }

  function interiorMesh(group, geometry, material, label, data = {}) {
    ownedGeometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = label;
    mesh.userData = { ...group.userData, ...data };
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function addSection(source, parent, profile, { color = '#ccd4d8', thickness = null,
    kind = 'wall', phiStart = 0, phiLength = TAU, opacity = 1, sourceIds = [] } = {}) {
    const material = ownMaterial({ color, metalness: kind === 'propellant' ? 0 : .24,
      roughness: .68, transparent: true, opacity, depthWrite: false,
      clippingPlanes: ([source.material].flat()[0]?.clippingPlanes || []).filter(plane => plane !== worldPlane),
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    material.name = `educational-${kind}-section`;
    const mesh = interiorMesh(parent, new THREE.BufferGeometry(), material,
      kind === 'propellant' ? '推进剂功能截面 · 非实时液位' : kind === 'unknown-region'
        ? '未核实舱区剖面 · 中性示意' : '剖切壁厚与层边 · 厚度放大示意',
      { cutawayRole: 'internal', cutawaySection: true, sectionKind: kind,
        interiorRole: `${kind}-section`, sourceIds, propellant: source.userData.propellant });
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = kind === 'propellant' ? 2 : kind === 'unknown-region' ? 1 : 4;
    mesh.visible = false;
    sections.push({ source, mesh, parent, profile, thickness, phiStart, phiLength, lastPlane: null });
    return mesh;
  }

  function updateSections() {
    root.updateWorldMatrix(true, true);
    for (const section of sections) {
      const { source, mesh, parent, profile, thickness, phiStart, phiLength } = section;
      const local = worldPlane.clone().applyMatrix4(source.matrixWorld.clone().invert());
      mesh.matrix.copy(parent.matrixWorld).invert().multiply(source.matrixWorld);
      mesh.matrixWorldNeedsUpdate = true;
      const previous = section.lastPlane;
      if (previous && previous.normal.distanceToSquared(local.normal) < 1e-16
        && Math.abs(previous.constant - local.constant) < 1e-8) continue;
      section.lastPlane = local.clone();
      const points = sectionVertices(profile, local, thickness, phiStart, phiLength);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      ownedGeometries.delete(mesh.geometry);
      mesh.geometry.dispose();
      mesh.geometry = geometry;
      ownedGeometries.add(geometry);
      mesh.visible = points.length >= 9;
    }
  }

  function groupForPart(id, note) {
    let group = interiors.find(entry => entry.userData.partId === id);
    if (group) return group;
    group = new THREE.Group();
    group.name = INTERIOR_NAME;
    group.userData = { partId: id, cutawayInterior: true, educational: true,
      accuracy: note, interiorSpec: getInteriorSpec(rocketId, id) };
    group.visible = false;
    parts.get(id).add(group);
    interiors.push(group);
    return group;
  }

  function shellProfile(object) {
    const p = object.geometry.parameters;
    if (!p) return null;
    if (object.geometry.type === 'CylinderGeometry') return {
      profile: [[p.radiusBottom, -p.height / 2], [p.radiusTop, p.height / 2]],
      phiStart: p.thetaStart, phiLength: p.thetaLength,
    };
    if (object.geometry.type === 'LatheGeometry') return {
      profile: p.points.map(point => [point.x, point.y]), phiStart: p.phiStart, phiLength: p.phiLength,
    };
    if (object.geometry.type === 'SphereGeometry') return {
      profile: Array.from({ length: 25 }, (_, i) => {
        const theta = p.thetaStart + p.thetaLength * i / 24;
        return [p.radius * Math.sin(theta), p.radius * Math.cos(theta)];
      }), phiStart: p.phiStart, phiLength: p.phiLength,
    };
    return null;
  }

  function addShellSections() {
    for (const [id, part] of parts) {
      for (const object of shellMeshes(id, part)) {
        if (object.isInstancedMesh) continue;
        const material = [object.material].flat()[0];
        if (material.side === THREE.BackSide) continue;
        const description = shellProfile(object);
        if (!description || description.phiLength < 1.2) continue;
        const radius = Math.max(...description.profile.map(point => point[0]));
        if (radius < coreRadius * .20) continue;
        const group = groupForPart(id, '只封闭剖开的薄壁边缘；中心空间保留为空腔。壁厚为可读性示意。');
        const thickness = Math.min(.075, Math.max(.025, radius * .022));
        addSection(object, group, description.profile, { ...description, thickness,
          kind: id.startsWith('fairing-') ? 'fairing-shell' : 'shell-wall',
          color: id.startsWith('fairing-') ? '#c8bb94' : '#c8d0d4', sourceIds: getInteriorSpec(rocketId, id).sourceIds });
        if (id.startsWith('fairing-') && rocketId.startsWith('falcon')) {
          addSection(object, group, description.profile.map(([r, y]) => [Math.max(0, r - thickness), y]),
            { ...description, thickness: thickness * .7, kind: 'fairing-liner', color: '#e1d9c5', sourceIds: ['int-falcon-2025'] });
        }
      }
    }
  }

  function addStructuralInteriors() {
    const part = parts.get('interstage');
    if (part) {
      const bounds = new THREE.Box3();
      for (const object of shellMeshes('interstage', part)) bounds.union(meshBounds(object, part));
      if (!bounds.isEmpty()) {
        const group = groupForPart('interstage', '级间承力环与支撑是功能示意，杆件数量、截面和安装点并非工程图复原。');
        const center = bounds.getCenter(new THREE.Vector3());
        const radius = Math.min(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) * .44;
        const low = bounds.min.y + .12, high = bounds.max.y - .12;
        const metal = ownMaterial({ color: '#9daeb8', metalness: .6, roughness: .5 });
        for (const y of [low, high]) {
          const ring = interiorMesh(group, new THREE.TorusGeometry(radius, Math.min(.085, radius * .035), 8, 40), metal,
            '级间环框 · 截面与尺寸为示意', { interiorRole: 'interstage-frame-ring' });
          ring.rotation.x = Math.PI / 2; ring.position.set(center.x, y, center.z);
        }
        if (high > low && rocketId !== 'starship') for (let index = 0; index < 4; index++) {
          const angle = index * Math.PI / 2 + Math.PI / 4;
          const support = interiorMesh(group, new THREE.CylinderGeometry(.045, .045, high - low, 8), metal,
            '周边承力支撑 · 数量位置为示意', { interiorRole: 'interstage-support' });
          support.position.set(center.x + Math.sin(angle) * radius, (low + high) / 2, center.z + Math.cos(angle) * radius);
          addSection(support, group, [[.045, -(high - low) / 2], [.045, (high - low) / 2]], { kind: 'support', color: '#aebbc2' });
        }
      }
    }
    for (const id of ['engines1', 'engine2']) {
      const engine = parts.get(id);
      if (!engine) continue;
      const bounds = new THREE.Box3();
      engine.traverse(object => { if (object.isMesh && !object.userData.cutawayInterior) bounds.union(meshBounds(object, engine)); });
      if (bounds.isEmpty()) continue;
      const spec = getInteriorSpec(rocketId, id);
      const group = groupForPart(id, '液体发动机供给系统的代表性功能示意，不表示实际泵组数量、循环形式或安装坐标。');
      const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
      const radius = Math.min(.22, size.x * .10, size.y * .09);
      const y = bounds.max.y - radius * 2.2;
      const metal = ownMaterial({ color: '#a4bac3', metalness: .55, roughness: .5 });
      const copper = ownMaterial({ color: '#b09369', metalness: .48, roughness: .57 });
      const pump = interiorMesh(group, new THREE.CylinderGeometry(radius, radius, radius * 2.2, 24), metal,
        '代表性供给泵功能组件 · 非实装泵组清单', { interiorRole: 'pump-functional-example', sourceIds: spec.sourceIds });
      pump.position.set(center.x + radius * 1.65, y, center.z - radius * .9);
      pump.rotation.z = Math.PI / 2;
      const hub = interiorMesh(group, new THREE.TorusGeometry(radius * .72, radius * .13, 6, 24), copper,
        '泵壳连接边 · 形状示意', { interiorRole: 'pump-housing-rim' });
      hub.position.copy(pump.position); hub.rotation.y = Math.PI / 2;
      for (const sign of [-1, 1]) {
        const path = new THREE.CatmullRomCurve3([
          new THREE.Vector3(center.x + radius * 1.65, y + sign * radius * .4, center.z - radius * .9),
          new THREE.Vector3(center.x + sign * radius * 2.2, y - radius * .9, center.z - radius * .6),
          new THREE.Vector3(center.x + sign * radius * .9, y - radius * 2.8, center.z),
        ]);
        interiorMesh(group, new THREE.TubeGeometry(path, 12, radius * .17, 8, false), metal,
          '推进剂供给连接 · 流路功能示意', { interiorRole: 'engine-feed-example', sourceIds: spec.sourceIds });
      }
    }
  }

  function addTank(group, envelope, low, high, label, color, role, { openLow = false, openHigh = false } = {}) {
    const { radius, x, z } = envelope;
    const cap = Math.min(radius * .38, (high - low) * .17);
    const commonCap = radius * .24;
    const profile = [
      ...(openLow ? [[0, low + commonCap], [radius * .50, low + commonCap * .866], [radius * .866, low + commonCap * .50], [radius, low]]
        : [[0, low], [radius * .50, low + cap * .20], [radius * .87, low + cap * .55], [radius, low + cap]]),
      ...(openHigh ? [[radius, high], [radius * .866, high + commonCap * .50], [radius * .50, high + commonCap * .866], [0, high + commonCap]]
        : [[radius, high - cap], [radius * .87, high - cap * .55], [radius * .50, high - cap * .20], [0, high]]),
    ];
    const material = ownMaterial({ color, transparent: true, opacity: .67, depthWrite: false });
    material.name = `educational-${role}-tank`;
    const tank = interiorMesh(group, new THREE.LatheGeometry(profile.map(point => new THREE.Vector2(...point)), 24), material,
      `${label} · 储箱教学示意`, { cutawayRole: 'internal', interiorRole: role, propellant: label });
    tank.position.set(x, 0, z);
    addSection(tank, group, profile, { color, kind: 'propellant', opacity: .86,
      sourceIds: group.userData.interiorSpec.sourceIds });
    addSection(tank, group, profile, { color: '#d2dde0', thickness: Math.max(.024, radius * .020), kind: 'tank-wall' });
    return tank;
  }

  function addCraftInteriors(legend) {
    const id = rocketId === 'cz2f' ? 'spacecraft' : rocketId === 'cz7' ? 'payload' : null;
    const part = parts.get(id);
    if (!part) return;
    const shell = new THREE.Box3();
    for (const object of shellMeshes(id, part)) shell.union(meshBounds(object, part));
    if (shell.isEmpty()) return;
    const spec = getInteriorSpec(rocketId, id);
    // Anchored to the existing model, not a new set of claimed physical sizes.
    const base = shell.min.y - (rocketId === 'cz2f' ? .7 : 0);
    const group = new THREE.Group();
    group.name = INTERIOR_NAME;
    group.userData = {
      partId: id, cutawayInterior: true, educational: true,
      accuracy: CRAFT_NOTE, interiorSpec: spec,
      visualization: 'spacecraft-functional-zones', visualizationNote: CRAFT_NOTE,
    };
    const metal = ownMaterial({ color: '#afbfc5', roughness: .64, metalness: .24 });
    const equipment = ownMaterial({ color: '#546e7c', roughness: .8, metalness: .1 });
    const seatMaterial = ownMaterial({ color: '#7c969f', roughness: .92, metalness: 0 });
    const panelMaterial = ownMaterial({ color: '#233f51', roughness: .72, metalness: .08 });
    function box(parent, size, position, material, name, role) {
      const object = interiorMesh(parent, new THREE.BoxGeometry(...size), material, name, { interiorRole: role });
      object.position.set(...position);
      return object;
    }
    function plate(radius, y, name, role) {
      const object = interiorMesh(group, new THREE.CylinderGeometry(radius, radius, .055, 24), metal, name, { interiorRole: role });
      object.position.y = y;
      return object;
    }
    function subgroup(name, role, compartment) {
      const child = new THREE.Group();
      child.name = name;
      child.userData = { ...group.userData, interiorRole: role, compartment };
      group.add(child);
      return child;
    }
    if (rocketId === 'cz2f') {
      group.userData.functionalCompartments = {
        propulsion: [base + .7, base + 2.8],
        reentry: [base + 2.8, base + 5.05],
        orbital: [base + 5.05, base + 7.0],
      };
      plate(1.10, base + 1.08, '推进舱设备安装板 · 教学示意', 'propulsion-installation-plate');
      plate(1.12, base + 2.98, '返回舱座椅安装区 · 教学示意', 'reentry-floor');
      plate(.95, base + 5.22, '轨道舱仪器安装板 · 教学示意', 'orbital-installation-plate');
      for (const sign of [-1, 1]) {
        box(group, [.32, .64, .30], [sign * .51, base + 1.79, -.35], equipment,
          '推进舱设备功能区 · 非具体设备清单', 'propulsion-equipment-zone');
        box(group, [.28, .66, .28], [sign * .45, base + 5.88, -.29], equipment,
          '轨道舱设备功能区 · 非具体设备清单', 'orbital-equipment-zone');
      }
      for (const [index, x] of [-.55, 0, .55].entries()) {
        const seat = subgroup(`返回舱无人座椅 ${index + 1}/3 · 教学摆放`, 'crew-seat', 'reentry');
        box(seat, [.44, .11, .53], [x, base + 3.44, -.12], seatMaterial,
          '座椅承托面 · 无人示意', 'seat-pan');
        const back = box(seat, [.44, .67, .10], [x, base + 3.80, -.35], seatMaterial,
          '座椅靠背 · 角度仅作示意', 'seat-back');
        back.rotation.x = -.14;
      }
      box(group, [.90, .26, .10], [0, base + 4.12, -.81], panelMaterial,
        '返回舱仪表功能区 · 不复原控制面板布局', 'instrument-panel');
    } else {
      group.userData.functionalCompartments = {
        propulsion: [base + .2, base + 2.35],
        cargo: [base + 3.0, base + 7.55],
      };
      plate(.93, base + 1.06, '推进舱安装隔板 · 教学示意', 'propulsion-installation-plate');
      plate(1.28, base + 3.14, '货物舱与推进舱功能分区 · 教学示意', 'cargo-floor');
      for (const side of [-1, 1]) {
        const rack = subgroup(`空置货架 ${side < 0 ? '左' : '右'} · 不对应任务货物清单`, 'cargo-rack', 'cargo');
        for (const y of [3.42, 4.42, 5.42, 6.42, 7.24]) {
          box(rack, [.57, .055, .86], [side * .73, base + y, -.18], metal,
            '空货架层板 · 教学示意', 'cargo-shelf');
        }
        for (const dx of [-.25, .25]) for (const z of [-.57, .21]) {
          box(rack, [.045, 3.90, .045], [side * .73 + dx, base + 5.32, z], metal,
            '货架支撑 · 教学示意', 'cargo-rack-support');
        }
      }
    }
    group.visible = false;
    part.add(group);
    interiors.push(group);
    legend.push({ partId: id, ...spec, oxidizer: '不适用', fuel: '不适用',
      oxidizerColor: null, fuelColor: null, neutralColor: '#afbfc5',
      visualizationNote: CRAFT_NOTE, accuracy: CRAFT_NOTE });
  }

  function buildInteriors() {
    if (built) return;
    built = true;
    root.updateWorldMatrix(true, true);
    const legend = [];
    for (const [id, part] of parts) {
      if (id !== 'stage1' && id !== 'stage2' && !isBooster(id)) continue;
      const envelope = tankEnvelope(id, part, shellMeshes(id, part));
      if (!envelope) continue;
      envelopes.set(part, envelope);
      const spec = getInteriorSpec(rocketId, id);
      if (spec.fuelLabel === '不适用') continue;
      const fluids = { oxidizer: spec.oxidizerLabel, fuel: spec.fuelLabel };
      const knownOrder = spec.order === 'oxidizer-top' || spec.order === 'fuel-top';
      const hasEquipmentBay = spec.features.some(feature => /仪器舱|仪器接口/.test(feature));
      const hasCommonDome = spec.features.some(feature => /共底穹顶/.test(feature));
      const hasDoubleFeed = spec.features.some(feature => /双壁输氧管/.test(feature));
      const hasFuelFeed = spec.features.some(feature => /输送燃料/.test(feature));
      const visualizationNote = knownOrder
        ? '推进剂上下顺序依据公开资料；分界高度、箱长及壁厚仍为教学近似。'
        : '箱体分界与上下顺序未核实，仅展示中性推进剂舱区范围，不推定两个箱的排列。';
      const group = new THREE.Group();
      group.name = INTERIOR_NAME;
      group.userData = {
        partId: id, cutawayInterior: true, educational: true, accuracy: LAYOUT_NOTE,
        shellEnvelope: { ...envelope }, interiorSpec: spec,
        visualization: knownOrder ? 'confirmed-tank-order' : 'unresolved-propellant-region',
        visualizationNote,
      };
      const span = envelope.high - envelope.low;
      const equipmentHeight = hasEquipmentBay ? Math.min(.8, span * .065) : 0;
      const tankHigh = envelope.high - equipmentHeight;
      const divider = envelope.low + (tankHigh - envelope.low) * .46;
      const gap = hasCommonDome ? 0 : Math.min(.25, span * .028);
      if (knownOrder) {
        const lowerRole = spec.order === 'oxidizer-top' ? 'fuel' : 'oxidizer';
        const upperRole = lowerRole === 'fuel' ? 'oxidizer' : 'fuel';
        const color = role => role === 'oxidizer' ? OXIDIZER_COLOR : FUEL_COLOR;
        addTank(group, envelope, envelope.low, divider - gap / 2, fluids[lowerRole], color(lowerRole), lowerRole, { openHigh: hasCommonDome });
        addTank(group, envelope, divider + gap / 2, tankHigh, fluids[upperRole], color(upperRole), upperRole, { openLow: hasCommonDome });
      } else {
        const neutral = ownMaterial({ color: '#a7b4bd', transparent: true, opacity: .24, depthWrite: false });
        neutral.name = 'educational-unresolved-propellant-region';
        const region = interiorMesh(group,
          new THREE.CylinderGeometry(envelope.radius, envelope.radius, tankHigh - envelope.low, 24, 1, true), neutral,
          '推进剂舱区范围 · 箱体分界与上下顺序未核实', { interiorRole: 'propellant-region', order: 'unknown' });
        region.position.set(envelope.x, (envelope.low + tankHigh) / 2, envelope.z);
        addSection(region, group, [[envelope.radius, -(tankHigh - envelope.low) / 2], [envelope.radius, (tankHigh - envelope.low) / 2]],
          { kind: 'unknown-region', color: '#a7b4bd', opacity: .30, sourceIds: spec.sourceIds });
      }
      const metal = ownMaterial({ color: '#c2cbd0', roughness: .48, metalness: .48 });
      metal.name = 'educational-bulkhead-and-feed-line';
      for (const height of [envelope.low + .04, ...(knownOrder ? [divider] : []), tankHigh - .04]) {
        const ring = interiorMesh(group, new THREE.TorusGeometry(envelope.radius * .96, Math.min(.055, envelope.radius * .04), 6, 24), metal,
          '舱壁加强环 · 教学示意', { interiorRole: 'bulkhead' });
        ring.rotation.x = Math.PI / 2;
        ring.position.set(envelope.x, height, envelope.z);
      }
      if (hasCommonDome) {
        const dome = interiorMesh(group, new THREE.SphereGeometry(envelope.radius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), metal,
          '共底隔离穹顶 · 曲率和分界高度为示意', { interiorRole: 'common-bulkhead' });
        dome.scale.y = .24;
        dome.position.set(envelope.x, divider, envelope.z);
        const domeProfile = Array.from({ length: 17 }, (_, i) => {
          const angle = i / 16 * Math.PI / 2;
          return [envelope.radius * Math.cos(angle), envelope.radius * Math.sin(angle)];
        });
        addSection(dome, group, domeProfile, { thickness: .045, kind: 'common-bulkhead', sourceIds: spec.sourceIds });
      }
      if (hasDoubleFeed || hasFuelFeed) {
        const pipeLow = envelope.low + .02, pipeHigh = divider + envelope.radius * .28;
        const pipe = interiorMesh(group,
          new THREE.CylinderGeometry(envelope.radius * .065, envelope.radius * .065, pipeHigh - pipeLow, 12, 1, true), metal,
          hasDoubleFeed ? '穿过下部燃料箱的双壁输氧管 · 走向示意' : '向发动机输送燃料的供给管 · 走向示意',
          { interiorRole: 'feed-line', sourceIds: spec.sourceIds });
        pipe.position.set(envelope.x, (pipeLow + pipeHigh) / 2, envelope.z);
        addSection(pipe, group, [[envelope.radius * .065, -(pipeHigh - pipeLow) / 2], [envelope.radius * .065, (pipeHigh - pipeLow) / 2]],
          { thickness: envelope.radius * .013, kind: 'feed-wall', sourceIds: spec.sourceIds });
        if (hasDoubleFeed) {
          const inner = interiorMesh(group,
            new THREE.CylinderGeometry(envelope.radius * .041, envelope.radius * .041, pipeHigh - pipeLow, 12, 1, true),
            ownMaterial({ color: OXIDIZER_COLOR, metalness: .28 }),
            '双壁输氧管内管 · 教学示意', { interiorRole: 'feed-line-inner' });
          inner.position.copy(pipe.position);
        }
      }
      if (hasEquipmentBay) {
        const bayY = tankHigh + equipmentHeight / 2;
        for (const sign of [-1, 1]) {
          const equipment = interiorMesh(group,
            new THREE.BoxGeometry(envelope.radius * .28, equipmentHeight * .55, envelope.radius * .24),
            metal, '仪器安装区 · 设备外形与位置为教学示意', { interiorRole: 'equipment-bay' });
          equipment.position.set(envelope.x + sign * envelope.radius * .45, bayY, envelope.z - envelope.radius * .35);
        }
      }
      group.visible = false;
      part.add(group);
      interiors.push(group);
      legend.push({ partId: id, ...fluids, ...spec,
        oxidizerColor: knownOrder ? OXIDIZER_COLOR : null, fuelColor: knownOrder ? FUEL_COLOR : null,
        neutralColor: knownOrder ? null : '#a7b4bd', visualizationNote, accuracy: LAYOUT_NOTE });
    }
    const interstage = parts.get('interstage');
    if (interstage && rocketId.startsWith('falcon')) {
      const spec = getInteriorSpec(rocketId, 'interstage');
      const bounds = new THREE.Box3();
      for (const object of shellMeshes('interstage', interstage)) bounds.union(meshBounds(object, interstage));
      if (!bounds.isEmpty()) {
        const center = bounds.getCenter(new THREE.Vector3());
        const top = Math.min(bounds.max.y - .3, Number(vehicle.upperBase) + 1.55 || bounds.max.y - .3);
        const radius = Math.min(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) * .43;
        const group = new THREE.Group();
        group.name = INTERIOR_NAME;
        group.userData = {
          partId: 'interstage', cutawayInterior: true, educational: true,
          interiorSpec: spec, accuracy: '锁扣与气动推杆的数量依据公开说明；位置、尺寸和安装细节为教学示意。',
        };
        const metal = ownMaterial({ color: '#b7c4cc', metalness: .58, roughness: .43 });
        const dark = ownMaterial({ color: '#617079', metalness: .46, roughness: .62 });
        for (let index = 0; index < 3; index++) {
          const angle = index * Math.PI * 2 / 3;
          const latch = interiorMesh(group, new THREE.BoxGeometry(.20, .24, .24), dark,
            `级间机械锁扣 ${index + 1}/3 · 位置尺寸示意`, { interiorRole: 'separation-latch' });
          latch.position.set(center.x + Math.sin(angle) * radius, top, center.z + Math.cos(angle) * radius);
          latch.rotation.y = angle;
        }
        for (let index = 0; index < 4; index++) {
          const angle = index * Math.PI / 2 + Math.PI / 4;
          const x = center.x + Math.sin(angle) * radius;
          const z = center.z + Math.cos(angle) * radius;
          const actuator = interiorMesh(group, new THREE.CylinderGeometry(.068, .068, 1.05, 10), dark,
            `气动分离推杆 ${index + 1}/4 · 位置尺寸示意`, { interiorRole: 'separation-pusher' });
          actuator.position.set(x, top - .77, z);
          const rod = interiorMesh(group, new THREE.CylinderGeometry(.035, .035, .42, 8), metal,
            '推杆伸出段 · 教学示意', { interiorRole: 'separation-pusher-rod' });
          rod.position.set(x, top - .22, z);
        }
        group.visible = false;
        interstage.add(group);
        interiors.push(group);
      }
    }
    addCraftInteriors(legend);
    addStructuralInteriors();
    addShellSections();
    root.userData.cutawayLegend = legend;
  }

  function releaseMaterial(material) {
    if (releasedMaterials.has(material)) return;
    releasedMaterials.add(material);
    // Shared maps, normal maps and roughness maps belong to the original model.
    material.dispose();
  }

  function update() {
    if (disposed) return;
    root.updateWorldMatrix(true, false);
    let centerZ = 0, sectionRadius = coreRadius;
    const focusedPart = parts.get(focusPartId);
    if (focusedPart) {
      focusedPart.updateWorldMatrix(true, true);
      const envelope = envelopes.get(focusedPart);
      let localCenter;
      if (envelope) {
        localCenter = new THREE.Vector3(envelope.x, (envelope.low + envelope.high) / 2, envelope.z);
        sectionRadius = envelope.shellRadius;
      } else {
        // Original meshes are used irrespective of their current visible flags.
        const bounds = new THREE.Box3();
        focusedPart.traverse(object => {
          if (object.isMesh && !object.userData.cutawayInterior) bounds.union(meshBounds(object, focusedPart));
        });
        if (!bounds.isEmpty()) {
          localCenter = bounds.getCenter(new THREE.Vector3());
          const size = bounds.getSize(new THREE.Vector3());
          sectionRadius = Math.max(.1, Math.min(size.x, size.z) / 2);
        }
      }
      if (localCenter) {
        const partToRoot = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(focusedPart.matrixWorld);
        centerZ = localCenter.applyMatrix4(partToRoot).z;
        // Include any explicit local part scale, but not root/world scaling.
        sectionRadius *= new THREE.Vector3().setFromMatrixScale(partToRoot).z;
      }
    }
    localPlane.constant = centerZ + offset * sectionRadius;
    worldPlane.copy(localPlane).applyMatrix4(root.matrixWorld);
    if (!enabled) return;
    updateSections();
    for (const { original, clones } of replacements.values()) {
      const materials = Array.isArray(original) ? original : [original];
      materials.forEach((material, index) => {
        if (material.emissive && clones[index].emissive) clones[index].emissive.copy(material.emissive);
        if ('emissiveIntensity' in material) clones[index].emissiveIntensity = material.emissiveIntensity;
      });
    }
  }

  function setEnabled(value) {
    if (disposed) return false;
    const next = Boolean(value);
    if (next === enabled) { update(); return enabled; }
    if (next) {
      buildInteriors();
      root.updateWorldMatrix(true, true);
      for (const [id, part] of parts) for (const object of shellMeshes(id, part)) {
        const original = object.material;
        const clones = (Array.isArray(original) ? original : [original]).map(material => {
          const clone = material.clone();
          clone.name = `${material.name || id} · cutaway shell`;
          clone.side = THREE.DoubleSide;
          clone.clippingPlanes = [...(material.clippingPlanes ?? []), worldPlane];
          clone.clipIntersection = false;
          clone.clipShadows = true;
          const cylinder = object.geometry.type === 'CylinderGeometry' ? object.geometry.parameters : null;
          if (cylinder && !cylinder.openEnded && cylinder.height > Math.max(cylinder.radiusTop, cylinder.radiusBottom) * 1.15) {
            // Closed cylinders are an external modelling shortcut: their end
            // caps at arbitrary panel seams must not masquerade as tank walls.
            const originalHook = material.onBeforeCompile;
            clone.onBeforeCompile = function (shader, renderer) {
              originalHook.call(material, shader, renderer);
              shader.vertexShader = `varying float vCutawayShellCap;\n${shader.vertexShader}`
                .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCutawayShellCap = abs(normal.y);');
              shader.fragmentShader = `varying float vCutawayShellCap;\n${shader.fragmentShader}`
                .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vCutawayShellCap > 0.98) discard;');
            };
            clone.customProgramCacheKey = () => `${material.customProgramCacheKey()}/cutaway-open-cylinder-caps-v1`;
            clone.userData.cutawayRemoveShellCaps = true;
          }
          clone.needsUpdate = true;
          return clone;
        });
        replacements.set(object, { original, clones });
        object.material = Array.isArray(original) ? clones : clones[0];
      }
    } else {
      for (const [object, { original, clones }] of replacements) {
        object.material = original;
        clones.forEach(releaseMaterial);
      }
      replacements.clear();
    }
    enabled = next;
    interiors.forEach(group => { group.visible = enabled; });
    root.userData.cutawayEnabled = enabled;
    root.userData.cutawayOffset = offset;
    update();
    return enabled;
  }

  function setOffset(value) {
    if (disposed) return offset;
    offset = THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, -.8, .8);
    root.userData.cutawayOffset = offset;
    update();
    return offset;
  }

  function setFocusPart(partId = null) {
    if (disposed) return null;
    focusPartId = parts.has(partId) ? partId : null;
    update();
    return focusPartId;
  }

  function dispose() {
    if (disposed) return;
    setEnabled(false);
    disposed = true;
    for (const group of interiors) group.removeFromParent();
    ownedGeometries.forEach(geometry => geometry.dispose());
    ownedMaterials.forEach(releaseMaterial);
    for (const [key, previous] of metadataBefore) {
      if (previous.existed) root.userData[key] = previous.value;
      else delete root.userData[key];
    }
  }

  return { setEnabled, setOffset, setFocusPart, update, dispose };
}
