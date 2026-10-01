import * as THREE from 'three';
import { getInteriorSpec } from '../../interior-data.js';
import { INTERIOR_NAME, LAYOUT_NOTE, OXIDIZER_COLOR, FUEL_COLOR } from './constants.js';
import { isBooster } from './model-inspection.js';
import { shellProfile } from './section-geometry.js';
import { createCutawayResources } from './resources.js';
import { buildCraftInteriors } from './craft-interiors.js';

/** Lazy, per-vehicle content builder. No renderer or public mode state lives here. */
export function createInteriorBuilder({ vehicle, rocketId, coreRadius, worldPlane, inspector, sections }) {
  const { root, parts } = vehicle;
  const { meshBounds, shellMeshes, tankEnvelope } = inspector;
  const resources = createCutawayResources(worldPlane);
  const { ownMaterial, interiorMesh } = resources;
  const addSection = sections.add;
  const interiors = [];
  const envelopes = new Map();
  let built = false,
    disposed = false,
    legendResult = [];

  function groupForPart(id, note) {
    let group = interiors.find((entry) => entry.userData.partId === id);
    if (group) return group;
    group = new THREE.Group();
    group.name = INTERIOR_NAME;
    group.userData = {
      partId: id,
      cutawayInterior: true,
      educational: true,
      accuracy: note,
      interiorSpec: getInteriorSpec(rocketId, id),
    };
    group.visible = false;
    parts.get(id).add(group);
    interiors.push(group);
    return group;
  }

  function addShellSections() {
    for (const [id, part] of parts) {
      for (const object of shellMeshes(id, part)) {
        if (object.isInstancedMesh) continue;
        const material = [object.material].flat()[0];
        if (material.side === THREE.BackSide) continue;
        const description = shellProfile(object);
        if (!description || description.phiLength < 1.2) continue;
        const radius = Math.max(...description.profile.map((point) => point[0]));
        if (radius < coreRadius * 0.2) continue;
        const group = groupForPart(id, '只封闭剖开的薄壁边缘；中心空间保留为空腔。壁厚为可读性示意。');
        const thickness = Math.min(0.075, Math.max(0.025, radius * 0.022));
        addSection(object, group, description.profile, {
          ...description,
          thickness,
          kind: id.startsWith('fairing-') ? 'fairing-shell' : 'shell-wall',
          color: id.startsWith('fairing-') ? '#c8bb94' : '#c8d0d4',
          sourceIds: getInteriorSpec(rocketId, id).sourceIds,
        });
        if (id.startsWith('fairing-') && rocketId.startsWith('falcon')) {
          addSection(
            object,
            group,
            description.profile.map(([r, y]) => [Math.max(0, r - thickness), y]),
            {
              ...description,
              thickness: thickness * 0.7,
              kind: 'fairing-liner',
              color: '#e1d9c5',
              sourceIds: ['int-falcon-2025'],
            },
          );
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
        const group = groupForPart(
          'interstage',
          '级间承力环与支撑是功能示意，杆件数量、截面和安装点并非工程图复原。',
        );
        const center = bounds.getCenter(new THREE.Vector3());
        const radius = Math.min(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) * 0.44;
        const low = bounds.min.y + 0.12,
          high = bounds.max.y - 0.12;
        const metal = ownMaterial({ color: '#9daeb8', metalness: 0.6, roughness: 0.5 });
        for (const y of [low, high]) {
          const ring = interiorMesh(
            group,
            new THREE.TorusGeometry(radius, Math.min(0.085, radius * 0.035), 8, 40),
            metal,
            '级间环框 · 截面与尺寸为示意',
            { interiorRole: 'interstage-frame-ring' },
          );
          ring.rotation.x = Math.PI / 2;
          ring.position.set(center.x, y, center.z);
        }
        if (high > low && rocketId !== 'starship')
          for (let index = 0; index < 4; index++) {
            const angle = (index * Math.PI) / 2 + Math.PI / 4;
            const support = interiorMesh(
              group,
              new THREE.CylinderGeometry(0.045, 0.045, high - low, 8),
              metal,
              '周边承力支撑 · 数量位置为示意',
              { interiorRole: 'interstage-support' },
            );
            support.position.set(
              center.x + Math.sin(angle) * radius,
              (low + high) / 2,
              center.z + Math.cos(angle) * radius,
            );
            addSection(
              support,
              group,
              [
                [0.045, -(high - low) / 2],
                [0.045, (high - low) / 2],
              ],
              { kind: 'support', color: '#aebbc2' },
            );
          }
      }
    }
    for (const id of ['engines1', 'engine2']) {
      const engine = parts.get(id);
      if (!engine) continue;
      const bounds = new THREE.Box3();
      engine.traverse((object) => {
        if (object.isMesh && !object.userData.cutawayInterior) bounds.union(meshBounds(object, engine));
      });
      if (bounds.isEmpty()) continue;
      const spec = getInteriorSpec(rocketId, id);
      const group = groupForPart(
        id,
        '液体发动机供给系统的代表性功能示意，不表示实际泵组数量、循环形式或安装坐标。',
      );
      const size = bounds.getSize(new THREE.Vector3()),
        center = bounds.getCenter(new THREE.Vector3());
      const radius = Math.min(0.22, size.x * 0.1, size.y * 0.09);
      const y = bounds.max.y - radius * 2.2;
      const metal = ownMaterial({ color: '#a4bac3', metalness: 0.55, roughness: 0.5 });
      const copper = ownMaterial({ color: '#b09369', metalness: 0.48, roughness: 0.57 });
      const pump = interiorMesh(
        group,
        new THREE.CylinderGeometry(radius, radius, radius * 2.2, 24),
        metal,
        '代表性供给泵功能组件 · 非实装泵组清单',
        { interiorRole: 'pump-functional-example', sourceIds: spec.sourceIds },
      );
      pump.position.set(center.x + radius * 1.65, y, center.z - radius * 0.9);
      pump.rotation.z = Math.PI / 2;
      const hub = interiorMesh(
        group,
        new THREE.TorusGeometry(radius * 0.72, radius * 0.13, 6, 24),
        copper,
        '泵壳连接边 · 形状示意',
        { interiorRole: 'pump-housing-rim' },
      );
      hub.position.copy(pump.position);
      hub.rotation.y = Math.PI / 2;
      for (const sign of [-1, 1]) {
        const path = new THREE.CatmullRomCurve3([
          new THREE.Vector3(center.x + radius * 1.65, y + sign * radius * 0.4, center.z - radius * 0.9),
          new THREE.Vector3(center.x + sign * radius * 2.2, y - radius * 0.9, center.z - radius * 0.6),
          new THREE.Vector3(center.x + sign * radius * 0.9, y - radius * 2.8, center.z),
        ]);
        interiorMesh(
          group,
          new THREE.TubeGeometry(path, 12, radius * 0.17, 8, false),
          metal,
          '推进剂供给连接 · 流路功能示意',
          { interiorRole: 'engine-feed-example', sourceIds: spec.sourceIds },
        );
      }
    }
  }

  function addTank(
    group,
    envelope,
    low,
    high,
    label,
    color,
    role,
    { openLow = false, openHigh = false } = {},
  ) {
    const { radius, x, z } = envelope;
    const cap = Math.min(radius * 0.38, (high - low) * 0.17);
    const commonCap = radius * 0.24;
    const profile = [
      ...(openLow
        ? [
            [0, low + commonCap],
            [radius * 0.5, low + commonCap * 0.866],
            [radius * 0.866, low + commonCap * 0.5],
            [radius, low],
          ]
        : [
            [0, low],
            [radius * 0.5, low + cap * 0.2],
            [radius * 0.87, low + cap * 0.55],
            [radius, low + cap],
          ]),
      ...(openHigh
        ? [
            [radius, high],
            [radius * 0.866, high + commonCap * 0.5],
            [radius * 0.5, high + commonCap * 0.866],
            [0, high + commonCap],
          ]
        : [
            [radius, high - cap],
            [radius * 0.87, high - cap * 0.55],
            [radius * 0.5, high - cap * 0.2],
            [0, high],
          ]),
    ];
    const material = ownMaterial({ color, transparent: true, opacity: 0.67, depthWrite: false });
    material.name = `educational-${role}-tank`;
    const tank = interiorMesh(
      group,
      new THREE.LatheGeometry(
        profile.map((point) => new THREE.Vector2(...point)),
        24,
      ),
      material,
      `${label} · 储箱教学示意`,
      { cutawayRole: 'internal', interiorRole: role, propellant: label },
    );
    tank.position.set(x, 0, z);
    addSection(tank, group, profile, {
      color,
      kind: 'propellant',
      opacity: 0.86,
      sourceIds: group.userData.interiorSpec.sourceIds,
    });
    addSection(tank, group, profile, {
      color: '#d2dde0',
      thickness: Math.max(0.024, radius * 0.02),
      kind: 'tank-wall',
    });
    return tank;
  }

  function buildInteriors() {
    if (built) return legendResult;
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
      const hasEquipmentBay = spec.features.some((feature) => /仪器舱|仪器接口/.test(feature));
      const hasCommonDome = spec.features.some((feature) => /共底穹顶/.test(feature));
      const hasDoubleFeed = spec.features.some((feature) => /双壁输氧管/.test(feature));
      const hasFuelFeed = spec.features.some((feature) => /输送燃料/.test(feature));
      const visualizationNote = knownOrder
        ? '推进剂上下顺序依据公开资料；分界高度、箱长及壁厚仍为教学近似。'
        : '箱体分界与上下顺序未核实，仅展示中性推进剂舱区范围，不推定两个箱的排列。';
      const group = new THREE.Group();
      group.name = INTERIOR_NAME;
      group.userData = {
        partId: id,
        cutawayInterior: true,
        educational: true,
        accuracy: LAYOUT_NOTE,
        shellEnvelope: { ...envelope },
        interiorSpec: spec,
        visualization: knownOrder ? 'confirmed-tank-order' : 'unresolved-propellant-region',
        visualizationNote,
      };
      const span = envelope.high - envelope.low;
      const equipmentHeight = hasEquipmentBay ? Math.min(0.8, span * 0.065) : 0;
      const tankHigh = envelope.high - equipmentHeight;
      const divider = envelope.low + (tankHigh - envelope.low) * 0.46;
      const gap = hasCommonDome ? 0 : Math.min(0.25, span * 0.028);
      if (knownOrder) {
        const lowerRole = spec.order === 'oxidizer-top' ? 'fuel' : 'oxidizer';
        const upperRole = lowerRole === 'fuel' ? 'oxidizer' : 'fuel';
        const color = (role) => (role === 'oxidizer' ? OXIDIZER_COLOR : FUEL_COLOR);
        addTank(
          group,
          envelope,
          envelope.low,
          divider - gap / 2,
          fluids[lowerRole],
          color(lowerRole),
          lowerRole,
          { openHigh: hasCommonDome },
        );
        addTank(
          group,
          envelope,
          divider + gap / 2,
          tankHigh,
          fluids[upperRole],
          color(upperRole),
          upperRole,
          { openLow: hasCommonDome },
        );
      } else {
        const neutral = ownMaterial({
          color: '#a7b4bd',
          transparent: true,
          opacity: 0.24,
          depthWrite: false,
        });
        neutral.name = 'educational-unresolved-propellant-region';
        const region = interiorMesh(
          group,
          new THREE.CylinderGeometry(envelope.radius, envelope.radius, tankHigh - envelope.low, 24, 1, true),
          neutral,
          '推进剂舱区范围 · 箱体分界与上下顺序未核实',
          { interiorRole: 'propellant-region', order: 'unknown' },
        );
        region.position.set(envelope.x, (envelope.low + tankHigh) / 2, envelope.z);
        addSection(
          region,
          group,
          [
            [envelope.radius, -(tankHigh - envelope.low) / 2],
            [envelope.radius, (tankHigh - envelope.low) / 2],
          ],
          { kind: 'unknown-region', color: '#a7b4bd', opacity: 0.3, sourceIds: spec.sourceIds },
        );
      }
      const metal = ownMaterial({ color: '#c2cbd0', roughness: 0.48, metalness: 0.48 });
      metal.name = 'educational-bulkhead-and-feed-line';
      for (const height of [envelope.low + 0.04, ...(knownOrder ? [divider] : []), tankHigh - 0.04]) {
        const ring = interiorMesh(
          group,
          new THREE.TorusGeometry(envelope.radius * 0.96, Math.min(0.055, envelope.radius * 0.04), 6, 24),
          metal,
          '舱壁加强环 · 教学示意',
          { interiorRole: 'bulkhead' },
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.set(envelope.x, height, envelope.z);
      }
      if (hasCommonDome) {
        const dome = interiorMesh(
          group,
          new THREE.SphereGeometry(envelope.radius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
          metal,
          '共底隔离穹顶 · 曲率和分界高度为示意',
          { interiorRole: 'common-bulkhead' },
        );
        dome.scale.y = 0.24;
        dome.position.set(envelope.x, divider, envelope.z);
        const domeProfile = Array.from({ length: 17 }, (_, i) => {
          const angle = ((i / 16) * Math.PI) / 2;
          return [envelope.radius * Math.cos(angle), envelope.radius * Math.sin(angle)];
        });
        addSection(dome, group, domeProfile, {
          thickness: 0.045,
          kind: 'common-bulkhead',
          sourceIds: spec.sourceIds,
        });
      }
      if (hasDoubleFeed || hasFuelFeed) {
        const pipeLow = envelope.low + 0.02,
          pipeHigh = divider + envelope.radius * 0.28;
        const pipe = interiorMesh(
          group,
          new THREE.CylinderGeometry(
            envelope.radius * 0.065,
            envelope.radius * 0.065,
            pipeHigh - pipeLow,
            12,
            1,
            true,
          ),
          metal,
          hasDoubleFeed ? '穿过下部燃料箱的双壁输氧管 · 走向示意' : '向发动机输送燃料的供给管 · 走向示意',
          { interiorRole: 'feed-line', sourceIds: spec.sourceIds },
        );
        pipe.position.set(envelope.x, (pipeLow + pipeHigh) / 2, envelope.z);
        addSection(
          pipe,
          group,
          [
            [envelope.radius * 0.065, -(pipeHigh - pipeLow) / 2],
            [envelope.radius * 0.065, (pipeHigh - pipeLow) / 2],
          ],
          { thickness: envelope.radius * 0.013, kind: 'feed-wall', sourceIds: spec.sourceIds },
        );
        if (hasDoubleFeed) {
          const inner = interiorMesh(
            group,
            new THREE.CylinderGeometry(
              envelope.radius * 0.041,
              envelope.radius * 0.041,
              pipeHigh - pipeLow,
              12,
              1,
              true,
            ),
            ownMaterial({ color: OXIDIZER_COLOR, metalness: 0.28 }),
            '双壁输氧管内管 · 教学示意',
            { interiorRole: 'feed-line-inner' },
          );
          inner.position.copy(pipe.position);
        }
      }
      if (hasEquipmentBay) {
        const bayY = tankHigh + equipmentHeight / 2;
        for (const sign of [-1, 1]) {
          const equipment = interiorMesh(
            group,
            new THREE.BoxGeometry(envelope.radius * 0.28, equipmentHeight * 0.55, envelope.radius * 0.24),
            metal,
            '仪器安装区 · 设备外形与位置为教学示意',
            { interiorRole: 'equipment-bay' },
          );
          equipment.position.set(
            envelope.x + sign * envelope.radius * 0.45,
            bayY,
            envelope.z - envelope.radius * 0.35,
          );
        }
      }
      group.visible = false;
      part.add(group);
      interiors.push(group);
      legend.push({
        partId: id,
        ...fluids,
        ...spec,
        oxidizerColor: knownOrder ? OXIDIZER_COLOR : null,
        fuelColor: knownOrder ? FUEL_COLOR : null,
        neutralColor: knownOrder ? null : '#a7b4bd',
        visualizationNote,
        accuracy: LAYOUT_NOTE,
      });
    }
    const interstage = parts.get('interstage');
    if (interstage && rocketId.startsWith('falcon')) {
      const spec = getInteriorSpec(rocketId, 'interstage');
      const bounds = new THREE.Box3();
      for (const object of shellMeshes('interstage', interstage))
        bounds.union(meshBounds(object, interstage));
      if (!bounds.isEmpty()) {
        const center = bounds.getCenter(new THREE.Vector3());
        const top = Math.min(bounds.max.y - 0.3, Number(vehicle.upperBase) + 1.55 || bounds.max.y - 0.3);
        const radius = Math.min(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) * 0.43;
        const group = new THREE.Group();
        group.name = INTERIOR_NAME;
        group.userData = {
          partId: 'interstage',
          cutawayInterior: true,
          educational: true,
          interiorSpec: spec,
          accuracy: '锁扣与气动推杆的数量依据公开说明；位置、尺寸和安装细节为教学示意。',
        };
        const metal = ownMaterial({ color: '#b7c4cc', metalness: 0.58, roughness: 0.43 });
        const dark = ownMaterial({ color: '#617079', metalness: 0.46, roughness: 0.62 });
        for (let index = 0; index < 3; index++) {
          const angle = (index * Math.PI * 2) / 3;
          const latch = interiorMesh(
            group,
            new THREE.BoxGeometry(0.2, 0.24, 0.24),
            dark,
            `级间机械锁扣 ${index + 1}/3 · 位置尺寸示意`,
            { interiorRole: 'separation-latch' },
          );
          latch.position.set(center.x + Math.sin(angle) * radius, top, center.z + Math.cos(angle) * radius);
          latch.rotation.y = angle;
        }
        for (let index = 0; index < 4; index++) {
          const angle = (index * Math.PI) / 2 + Math.PI / 4;
          const x = center.x + Math.sin(angle) * radius;
          const z = center.z + Math.cos(angle) * radius;
          const actuator = interiorMesh(
            group,
            new THREE.CylinderGeometry(0.068, 0.068, 1.05, 10),
            dark,
            `气动分离推杆 ${index + 1}/4 · 位置尺寸示意`,
            { interiorRole: 'separation-pusher' },
          );
          actuator.position.set(x, top - 0.77, z);
          const rod = interiorMesh(
            group,
            new THREE.CylinderGeometry(0.035, 0.035, 0.42, 8),
            metal,
            '推杆伸出段 · 教学示意',
            { interiorRole: 'separation-pusher-rod' },
          );
          rod.position.set(x, top - 0.22, z);
        }
        group.visible = false;
        interstage.add(group);
        interiors.push(group);
      }
    }
    buildCraftInteriors(
      { rocketId, parts, shellMeshes, meshBounds, ownMaterial, interiorMesh, interiors },
      legend,
    );
    addStructuralInteriors();
    addShellSections();
    legendResult = legend;
    return legend;
  }

  function setVisible(value) {
    for (const group of interiors) group.visible = Boolean(value);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const group of interiors) group.removeFromParent();
    resources.dispose();
    interiors.length = 0;
    envelopes.clear();
  }
  return { build: buildInteriors, setVisible, getEnvelope: (part) => envelopes.get(part), dispose };
}
