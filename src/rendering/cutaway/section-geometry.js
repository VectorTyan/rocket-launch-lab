import * as THREE from 'three';
import { TAU } from './constants.js';

// A meridian profile intersected with the moving plane. These polygons close
// only the cut surface, rather than replacing hollow hardware with solid blocks.
function profileSlices(profile, plane) {
  const horizontal = Math.hypot(plane.normal.x, plane.normal.z);
  if (horizontal < 1e-7) return [];
  const nx = plane.normal.x / horizontal,
    nz = plane.normal.z / horizontal;
  const distance = (y) => -(plane.constant + plane.normal.y * y) / horizontal;
  const runs = [];
  let run = [];
  for (let i = 1; i < profile.length; i++) {
    const [r0, y0] = profile[i - 1],
      [r1, y1] = profile[i];
    let start = 0,
      end = 1;
    // r >= abs(distance) is the intersection of two linear inequalities.
    for (const sign of [-1, 1]) {
      const a = r0 + sign * distance(y0),
        b = r1 + sign * distance(y1);
      if (a < 0 && b < 0) {
        end = -1;
        break;
      }
      if (a < 0) start = Math.max(start, a / (a - b));
      else if (b < 0) end = Math.min(end, a / (a - b));
    }
    if (end < start) {
      if (run.length > 1) runs.push(run);
      run = [];
      continue;
    }
    for (let j = 0; j <= 8; j++) {
      const t = start + ((end - start) * j) / 8;
      const r = THREE.MathUtils.lerp(r0, r1, t),
        y = THREE.MathUtils.lerp(y0, y1, t);
      const d = distance(y),
        half = Math.sqrt(Math.max(0, r * r - d * d));
      const sample = { r, y, d, half, nx, nz };
      const previous = run.at(-1);
      if (!previous || Math.abs(previous.y - y) + Math.abs(previous.r - r) > 1e-8) run.push(sample);
    }
    if (end < 1 - 1e-8) {
      if (run.length > 1) runs.push(run);
      run = [];
    }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

function profilePoint(sample, half, sign = 1) {
  return new THREE.Vector3(
    sample.nx * sample.d - sample.nz * half * sign,
    sample.y,
    sample.nz * sample.d + sample.nx * half * sign,
  );
}

export function sectionVertices(profile, plane, thickness = null, phiStart = 0, phiLength = TAU) {
  const positions = [];
  const append = (...points) => {
    for (let i = 0; i + 2 < points.length; i += 3) {
      const a = points[i],
        b = points[i + 1],
        c = points[i + 2];
      // Dome tips and coincident shell edges can collapse to a line. Such
      // triangles have zero normals, which can contaminate HDR bloom with NaN.
      const area = b.clone().sub(a).cross(c.clone().sub(a)).lengthSq();
      if (!Number.isFinite(area) || area < 1e-18) continue;
      for (const point of [a, b, c]) positions.push(point.x, point.y, point.z);
    }
  };
  const angleInside = (point) => {
    if (phiLength >= TAU - 1e-5) return true;
    const angle = (((Math.atan2(point.x, point.z) - phiStart) % TAU) + TAU) % TAU;
    return angle <= phiLength + 1e-6 || angle > TAU - 1e-6;
  };
  for (const run of profileSlices(profile, plane)) {
    if (thickness !== null) {
      for (let i = 1; i < run.length; i++)
        for (const sign of [-1, 1]) {
          const a = run[i - 1],
            b = run[i];
          const oa = profilePoint(a, a.half, sign),
            ob = profilePoint(b, b.half, sign);
          if (!angleInside(oa.clone().add(ob).multiplyScalar(0.5))) continue;
          const inner = (sample) =>
            Math.sqrt(Math.max(0, Math.max(0, sample.r - thickness) ** 2 - sample.d ** 2));
          const ia = profilePoint(a, inner(a), sign),
            ib = profilePoint(b, inner(b), sign);
          append(oa, ob, ib, oa, ib, ia);
        }
    } else {
      // Projection into the cut plane preserves concave common-dome profiles.
      const points = [
        ...run.map((sample) => profilePoint(sample, sample.half)),
        ...run
          .slice()
          .reverse()
          .map((sample) => profilePoint(sample, sample.half, -1)),
      ];
      const axisX = new THREE.Vector3(-run[0].nz, 0, run[0].nx);
      const axisY = new THREE.Vector3().crossVectors(plane.normal, axisX).normalize();
      const compact = points.filter((point, i) => i === 0 || point.distanceToSquared(points[i - 1]) > 1e-14);
      if (compact.length > 2 && compact[0].distanceToSquared(compact.at(-1)) < 1e-14) compact.pop();
      const contour = compact.map((point) => new THREE.Vector2(point.dot(axisX), point.dot(axisY)));
      for (const face of THREE.ShapeUtils.triangulateShape(contour, []))
        append(...face.map((i) => compact[i]));
    }
  }
  return positions;
}

export function shellProfile(object) {
  const p = object.geometry.parameters;
  if (!p) return null;
  if (object.geometry.type === 'CylinderGeometry')
    return {
      profile: [
        [p.radiusBottom, -p.height / 2],
        [p.radiusTop, p.height / 2],
      ],
      phiStart: p.thetaStart,
      phiLength: p.thetaLength,
    };
  if (object.geometry.type === 'LatheGeometry')
    return {
      profile: p.points.map((point) => [point.x, point.y]),
      phiStart: p.phiStart,
      phiLength: p.phiLength,
    };
  if (object.geometry.type === 'SphereGeometry')
    return {
      profile: Array.from({ length: 25 }, (_, i) => {
        const theta = p.thetaStart + (p.thetaLength * i) / 24;
        return [p.radius * Math.sin(theta), p.radius * Math.cos(theta)];
      }),
      phiStart: p.phiStart,
      phiLength: p.phiLength,
    };
  return null;
}
