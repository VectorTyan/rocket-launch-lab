import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { sectionVertices, shellProfile } from '../src/rendering/cutaway/section-geometry.js';

const cylinder = [
  [2, 0],
  [2, 10],
];
const planeAt = (z) => new THREE.Plane(new THREE.Vector3(0, 0, -1), z);

function triangles(vertices) {
  assert.equal(vertices.length % 9, 0);
  assert.ok(vertices.every(Number.isFinite));
  const result = [];
  for (let i = 0; i < vertices.length; i += 9) {
    const points = [0, 3, 6].map((offset) => new THREE.Vector3().fromArray(vertices, i + offset));
    const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
    assert.ok(normal.lengthSq() >= 1e-18, 'every emitted triangle has a usable finite normal');
    result.push({ points, area: normal.length() / 2 });
  }
  return result;
}

function area(vertices) {
  return triangles(vertices).reduce((sum, triangle) => sum + triangle.area, 0);
}
function close(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
}

test('a cylindrical cut follows the analytic chord area on both sides of its centre', () => {
  for (const offset of [0, 0.5, -0.5, 1.7, -1.7, 1.999999]) {
    const plane = planeAt(offset);
    const vertices = sectionVertices(cylinder, plane);
    close(area(vertices), 20 * Math.sqrt(4 - offset * offset));
    for (const triangle of triangles(vertices))
      for (const point of triangle.points) close(plane.distanceToPoint(point), 0);
  }
});

test('tangent, outside, empty and unsupported horizontal sections produce no degenerate faces', () => {
  for (const offset of [2, -2, 2.001, -2.001])
    assert.deepEqual(sectionVertices(cylinder, planeAt(offset)), []);
  assert.deepEqual(sectionVertices([], planeAt(0)), []);
  assert.deepEqual(sectionVertices([[2, 0]], planeAt(0)), []);
  // Vertical meridian slicing deliberately has no horizontal-plane approximation.
  assert.deepEqual(sectionVertices(cylinder, new THREE.Plane(new THREE.Vector3(0, 1, 0), -5)), []);
});

test('thin shell sections preserve the cavity and their two angular halves partition the same wall', () => {
  const full = sectionVertices(cylinder, planeAt(0), 0.1);
  const right = sectionVertices(cylinder, planeAt(0), 0.1, 0, Math.PI);
  const left = sectionVertices(cylinder, planeAt(0), 0.1, Math.PI, Math.PI);
  close(area(full), 2);
  close(area(right), 1);
  close(area(left), 1);
  for (const triangle of triangles(full))
    for (const point of triangle.points) assert.ok(Math.abs(point.x) >= 1.9 - 1e-8);
  for (const triangle of triangles(right)) for (const point of triangle.points) assert.ok(point.x >= 0);
  for (const triangle of triangles(left)) for (const point of triangle.points) assert.ok(point.x <= 0);
  assert.deepEqual(
    sectionVertices(cylinder, planeAt(0), 0),
    [],
    'zero thickness does not create zero-normal triangles',
  );
});

test('domes with duplicate tips and tilted cuts remain finite without mutating their inputs', () => {
  const profile = [
    [0, 0],
    [0, 0],
    [1, 0.4],
    [2, 1],
    [2, 4],
    [2, 4],
    [1, 4.7],
    [0, 5],
    [0, 5],
  ];
  const original = structuredClone(profile);
  const plane = new THREE.Plane(new THREE.Vector3(0.3, 0.12, -0.9).normalize(), -0.2);
  const normal = plane.normal.clone(),
    constant = plane.constant;
  for (const thickness of [null, 0.05]) {
    const faces = triangles(sectionVertices(profile, plane, thickness));
    assert.ok(faces.length > 0);
    for (const face of faces) for (const point of face.points) close(plane.distanceToPoint(point), 0);
  }
  assert.deepEqual(profile, original);
  assert.ok(plane.normal.equals(normal));
  assert.equal(plane.constant, constant);
});

test('separate profile intersections do not form a plate across a neck outside the cutting plane', () => {
  const profile = [
    [0, 0],
    [2, 1],
    [2, 3],
    [0.3, 4],
    [2, 5],
    [2, 7],
    [0, 8],
  ];
  const faces = triangles(sectionVertices(profile, planeAt(1)));
  assert.ok(faces.some((face) => face.points.every((point) => point.y < 4)));
  assert.ok(faces.some((face) => face.points.every((point) => point.y > 4)));
  assert.ok(
    faces.every((face) => {
      const ys = face.points.map((point) => point.y);
      return Math.max(...ys) < 4 || Math.min(...ys) > 4;
    }),
    'a clipped-out interval stays empty',
  );
});

test('shell profile extraction keeps angular coverage and copies lathe coordinates', () => {
  const points = [new THREE.Vector2(2, 0), new THREE.Vector2(2.5, 3), new THREE.Vector2(0, 7)];
  const geometry = new THREE.LatheGeometry(points, 12, Math.PI, Math.PI);
  const mesh = new THREE.Mesh(geometry);
  try {
    const profile = shellProfile(mesh);
    assert.deepEqual(profile.profile, [
      [2, 0],
      [2.5, 3],
      [0, 7],
    ]);
    assert.equal(profile.phiStart, Math.PI);
    assert.equal(profile.phiLength, Math.PI);
    profile.profile[0][0] = 100;
    assert.equal(points[0].x, 2, 'inspection cannot edit the model geometry');
    assert.equal(shellProfile({ geometry: { type: 'BoxGeometry', parameters: {} } }), null);
  } finally {
    geometry.dispose();
    mesh.material.dispose();
  }
});
