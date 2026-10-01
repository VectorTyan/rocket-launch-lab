import * as THREE from 'three';
import { getInteriorSpec } from '../../interior-data.js';
import { INTERIOR_NAME, CRAFT_NOTE } from './constants.js';

// Functional cabin layouts remain separate from propulsion/tank construction.
export function buildCraftInteriors(
  { rocketId, parts, shellMeshes, meshBounds, ownMaterial, interiorMesh, interiors },
  legend,
) {
  const id = rocketId === 'cz2f' ? 'spacecraft' : rocketId === 'cz7' ? 'payload' : null;
  const part = parts.get(id);
  if (!part) return;
  const shell = new THREE.Box3();
  for (const object of shellMeshes(id, part)) shell.union(meshBounds(object, part));
  if (shell.isEmpty()) return;
  const spec = getInteriorSpec(rocketId, id);
  // Anchored to the existing model, not a new set of claimed physical sizes.
  const base = shell.min.y - (rocketId === 'cz2f' ? 0.7 : 0);
  const group = new THREE.Group();
  group.name = INTERIOR_NAME;
  group.userData = {
    partId: id,
    cutawayInterior: true,
    educational: true,
    accuracy: CRAFT_NOTE,
    interiorSpec: spec,
    visualization: 'spacecraft-functional-zones',
    visualizationNote: CRAFT_NOTE,
  };
  const metal = ownMaterial({ color: '#afbfc5', roughness: 0.64, metalness: 0.24 });
  const equipment = ownMaterial({ color: '#546e7c', roughness: 0.8, metalness: 0.1 });
  const seatMaterial = ownMaterial({ color: '#7c969f', roughness: 0.92, metalness: 0 });
  const panelMaterial = ownMaterial({ color: '#233f51', roughness: 0.72, metalness: 0.08 });
  function box(parent, size, position, material, name, role) {
    const object = interiorMesh(parent, new THREE.BoxGeometry(...size), material, name, {
      interiorRole: role,
    });
    object.position.set(...position);
    return object;
  }
  function plate(radius, y, name, role) {
    const object = interiorMesh(group, new THREE.CylinderGeometry(radius, radius, 0.055, 24), metal, name, {
      interiorRole: role,
    });
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
      propulsion: [base + 0.7, base + 2.8],
      reentry: [base + 2.8, base + 5.05],
      orbital: [base + 5.05, base + 7.0],
    };
    plate(1.1, base + 1.08, '推进舱设备安装板 · 教学示意', 'propulsion-installation-plate');
    plate(1.12, base + 2.98, '返回舱座椅安装区 · 教学示意', 'reentry-floor');
    plate(0.95, base + 5.22, '轨道舱仪器安装板 · 教学示意', 'orbital-installation-plate');
    for (const sign of [-1, 1]) {
      box(
        group,
        [0.32, 0.64, 0.3],
        [sign * 0.51, base + 1.79, -0.35],
        equipment,
        '推进舱设备功能区 · 非具体设备清单',
        'propulsion-equipment-zone',
      );
      box(
        group,
        [0.28, 0.66, 0.28],
        [sign * 0.45, base + 5.88, -0.29],
        equipment,
        '轨道舱设备功能区 · 非具体设备清单',
        'orbital-equipment-zone',
      );
    }
    for (const [index, x] of [-0.55, 0, 0.55].entries()) {
      const seat = subgroup(`返回舱无人座椅 ${index + 1}/3 · 教学摆放`, 'crew-seat', 'reentry');
      box(
        seat,
        [0.44, 0.11, 0.53],
        [x, base + 3.44, -0.12],
        seatMaterial,
        '座椅承托面 · 无人示意',
        'seat-pan',
      );
      const back = box(
        seat,
        [0.44, 0.67, 0.1],
        [x, base + 3.8, -0.35],
        seatMaterial,
        '座椅靠背 · 角度仅作示意',
        'seat-back',
      );
      back.rotation.x = -0.14;
    }
    box(
      group,
      [0.9, 0.26, 0.1],
      [0, base + 4.12, -0.81],
      panelMaterial,
      '返回舱仪表功能区 · 不复原控制面板布局',
      'instrument-panel',
    );
  } else {
    group.userData.functionalCompartments = {
      propulsion: [base + 0.2, base + 2.35],
      cargo: [base + 3.0, base + 7.55],
    };
    plate(0.93, base + 1.06, '推进舱安装隔板 · 教学示意', 'propulsion-installation-plate');
    plate(1.28, base + 3.14, '货物舱与推进舱功能分区 · 教学示意', 'cargo-floor');
    for (const side of [-1, 1]) {
      const rack = subgroup(`空置货架 ${side < 0 ? '左' : '右'} · 不对应任务货物清单`, 'cargo-rack', 'cargo');
      for (const y of [3.42, 4.42, 5.42, 6.42, 7.24]) {
        box(
          rack,
          [0.57, 0.055, 0.86],
          [side * 0.73, base + y, -0.18],
          metal,
          '空货架层板 · 教学示意',
          'cargo-shelf',
        );
      }
      for (const dx of [-0.25, 0.25])
        for (const z of [-0.57, 0.21]) {
          box(
            rack,
            [0.045, 3.9, 0.045],
            [side * 0.73 + dx, base + 5.32, z],
            metal,
            '货架支撑 · 教学示意',
            'cargo-rack-support',
          );
        }
    }
  }
  group.visible = false;
  part.add(group);
  interiors.push(group);
  legend.push({
    partId: id,
    ...spec,
    oxidizer: '不适用',
    fuel: '不适用',
    oxidizerColor: null,
    fuelColor: null,
    neutralColor: '#afbfc5',
    visualizationNote: CRAFT_NOTE,
    accuracy: CRAFT_NOTE,
  });
}
