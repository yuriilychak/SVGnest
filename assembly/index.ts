// The entry file of your WebAssembly module.

import Point from "./point";
import Polygon from "./polygon";
import Rect from "./rect";
import { almostEqual, POLYGON_CONFIG_SIZE, TOLEARANCE } from "./util";

function checkIntersection(a: f32, b: f32, c: f32): boolean {
  const offset: f32 = f32(Math.abs(a - b));

  return offset >= TOLEARANCE && Math.abs(2 * c - a - b) <= offset;
}

// returns the intersection of AB and EF
// or null if there are no intersections or other numerical error
// if the infinite flag is set, AE and EF describe infinite lines without endpoints, they are finite line segments otherwise
export function lineIntersect(
  importA: Float32Array,
  importB: Float32Array,
  importE: Float32Array,
  importF: Float32Array,
  infinite: boolean = false
): boolean {
  const a: Point = Point.import(importA);
  const b: Point = Point.import(importB);
  const e: Point = Point.import(importE);
  const f: Point = Point.import(importF);
  const a1: f32 = b.y - a.y;
  const b1: f32 = a.x - b.x;
  const c1: f32 = b.x * a.y - a.x * b.y;
  const a2: f32 = f.y - e.y;
  const b2: f32 = e.x - f.x;
  const c2: f32 = f.x * e.y - e.x * f.y;
  const denom: f32 = a1 * b2 - a2 * b1;
  const result: Point = new Point(
    (b1 * c2 - b2 * c1) / denom,
    (a2 * c1 - a1 * c2) / denom
  );

  return !(
    !Number.isFinite(result.x) ||
    !Number.isFinite(result.y) ||
    (!infinite &&
      (checkIntersection(a.x, b.x, result.x) ||
        checkIntersection(a.y, b.y, result.y) ||
        checkIntersection(e.x, f.x, result.x) ||
        checkIntersection(e.y, f.y, result.y)))
  );
}

function pointDistance(
  p: Point,
  s1: Point,
  s2: Point,
  normal: Point,
  infinite: boolean = false
): f32 {
  const localNormal: Point = Point.normalizeVector(normal);
  const dir: Point = Point.normal(localNormal);
  const pDot: f32 = dir.dot(p);
  const s1Dot: f32 = dir.dot(s1);
  const s2Dot: f32 = dir.dot(s2);
  const pDotNorm: f32 = localNormal.dot(p);
  const s1DotNorm: f32 = localNormal.dot(s1);
  const s2DotNorm: f32 = localNormal.dot(s2);
  const diffNorm1: f32 = pDotNorm - s1DotNorm;
  const diffNorm2: f32 = pDotNorm - s2DotNorm;
  const diff1: f32 = pDot - s1Dot;
  const diff2: f32 = pDot - s2Dot;

  if (!infinite) {
    if (
      (diff1 < TOLEARANCE && diff2 < TOLEARANCE) ||
      (diff1 > -TOLEARANCE && diff2 > -TOLEARANCE)
    ) {
      return -1; // dot doesn't collide with segment, or lies directly on the vertex
    }

    if (
      almostEqual(pDot, s1Dot) &&
      almostEqual(pDot, s2Dot) &&
      diffNorm1 > 0 &&
      diffNorm2 > 0
    ) {
      return f32(Math.min(diffNorm1, diffNorm2));
    }
    if (
      almostEqual(pDot, s1Dot) &&
      almostEqual(pDot, s2Dot) &&
      diffNorm1 < 0 &&
      diffNorm1 < 0
    ) {
      return f32(Math.max(diffNorm1, diffNorm2));
    }
  }

  return ((s1DotNorm - s2DotNorm) * diff1) / (s1Dot - s2Dot) - diffNorm1;
}

export function segmentDistance(
  inputA: Float32Array,
  inputB: Float32Array,
  inputE: Float32Array,
  inputF: Float32Array,
  inputDirection: Float32Array
): f64 {
  const a: Point = Point.import(inputA);
  const b: Point = Point.import(inputB);
  const e: Point = Point.import(inputE);
  const f: Point = Point.import(inputF);
  const direction: Point = Point.import(inputDirection);
  const normal: Point = Point.normal(direction);
  const reverse: Point = Point.reverse(direction);
  const dotA: f32 = normal.dot(a);
  const dotB: f32 = normal.dot(b);
  const dotE: f32 = normal.dot(e);
  const dotF: f32 = normal.dot(f);
  const crossA: f32 = direction.cross(a);
  const crossB: f32 = direction.cross(b);
  const crossE: f32 = direction.cross(e);
  const crossF: f32 = direction.cross(f);
  const minAB: f32 = f32(Math.min(dotA, dotB));
  const maxAB: f32 = f32(Math.max(dotA, dotB));
  const maxEF: f32 = f32(Math.max(dotE, dotF));
  const minEF: f32 = f32(Math.min(dotE, dotF));
  const offsetAB: Point = Point.sub(a, b);
  const offsetEF: Point = Point.sub(e, f);

  // segments that will merely touch at one point
  // segments miss eachother completely
  if (
    almostEqual(maxAB, minEF) ||
    almostEqual(minAB, maxEF) ||
    maxAB < minEF ||
    minAB > maxEF
  ) {
    return Number.NaN;
  }

  let overlap: f32 = 1;
  const maxOffset: f32 = maxAB - maxEF;
  const minOffset: f32 = minAB - minEF;

  if (Math.abs(maxOffset + minOffset) >= Math.abs(maxOffset - minOffset)) {
    const minMax: f32 = f32(Math.min(maxAB, maxEF));
    const maxMin: f32 = f32(Math.max(minAB, minEF));

    const maxMax: f32 = f32(Math.max(maxAB, maxEF));
    const minMin: f32 = f32(Math.min(minAB, minEF));

    overlap = (minMax - maxMin) / (maxMax - minMin);
  }

  const offsetEA: Point = Point.sub(a, e);
  const offsetFA: Point = Point.sub(a, f);
  const crossABE: f32 = offsetEA.cross(offsetAB, -1);
  const crossABF: f32 = offsetFA.cross(offsetAB, -1);

  // lines are colinear
  if (almostEqual(crossABE, 0) && almostEqual(crossABF, 0)) {
    const normalAB: Point = Point.normal(offsetAB);
    const normalEF: Point = Point.normal(offsetEF);

    normalAB.scale(1 / normalAB.length);
    normalEF.scale(1 / normalEF.length);

    // segment normals must point in opposite directions
    if (
      Math.abs(normalAB.cross(normalEF, -1)) < TOLEARANCE &&
      normalAB.dot(normalEF) < 0
    ) {
      // normal of AB segment must point in same direction as given direction vector
      const normalDot: f32 = direction.dot(normalAB);
      // the segments merely slide along eachother
      if (almostEqual(normalDot, 0)) {
        return Number.NaN;
      }
      if (normalDot < 0) {
        return 0;
      }
    }
    return Number.NaN;
  }

  const distances: f32[] = [];
  let d: f64 = Number.NaN;
  let delat: f32 = 0;

  // coincident points
  if (almostEqual(dotA, dotE)) {
    distances.push(crossA - crossE);
  } else if (almostEqual(dotA, dotF)) {
    distances.push(crossA - crossF);
  } else if (dotA > minEF && dotA < maxEF) {
    d = pointDistance(a, e, f, reverse);

    if (!Number.isNaN(d) && Math.abs(d) < TOLEARANCE) {
      //  A currently touches EF, but AB is moving away from EF
      delat = pointDistance(b, e, f, reverse, true);
      if (delat < 0 || Math.abs(delat * overlap) < TOLEARANCE) {
        d = Number.NaN;
      }
    }

    if (!Number.isNaN(d)) {
      distances.push(f32(d));
    }
  }

  if (almostEqual(dotB, dotE)) {
    distances.push(crossB - crossE);
  } else if (almostEqual(dotB, dotF)) {
    distances.push(crossB - crossF);
  } else if (dotB > minEF && dotB < maxEF) {
    d = pointDistance(b, e, f, reverse);

    if (!Number.isNaN(d) && Math.abs(d) < TOLEARANCE) {
      // crossA>crossB A currently touches EF, but AB is moving away from EF
      delat = pointDistance(a, e, f, reverse, true);
      if (delat < 0 || Math.abs(delat * overlap) < TOLEARANCE) {
        d = Number.NaN;
      }
    }
    if (!Number.isNaN(d)) {
      distances.push(f32(d));
    }
  }

  if (dotE > minAB && dotE < maxAB) {
    d = pointDistance(e, a, b, direction);
    if (!Number.isNaN(d) && Math.abs(d) < TOLEARANCE) {
      // crossF<crossE A currently touches EF, but AB is moving away from EF
      delat = pointDistance(f, a, b, direction, true);
      if (delat < 0 || Math.abs(delat * overlap) < TOLEARANCE) {
        d = Number.NaN;
      }
    }
    if (!Number.isNaN(d)) {
      distances.push(f32(d));
    }
  }

  if (dotF > minAB && dotF < maxAB) {
    d = pointDistance(f, a, b, direction);
    if (!Number.isNaN(d) && Math.abs(d) < TOLEARANCE) {
      // && crossE<crossF A currently touches EF, but AB is moving away from EF
      delat = pointDistance(e, a, b, direction, true);
      if (delat < 0 || Math.abs(delat * overlap) < TOLEARANCE) {
        d = Number.NaN;
      }
    }
    if (!Number.isNaN(d)) {
      distances.push(f32(d));
    }
  }

  if (distances.length !== 0) {
    let result: f64 = distances[0];
    let i: u32 = 0;
    const distancesCount: u32 = distances.length;

    for (i = 1; i < distancesCount; ++i) {
      result = Math.min(result, distances[i]);
    }

    return result;
  } else {
    return Number.NaN;
  }
}

// returns an interior NFP for the special case where A is a rectangle
export function noFitPolygonRectangle(
  dataA: Float32Array,
  dataB: Float32Array
): Float32Array {
  const a: Polygon = new Polygon(dataA);
  const b: Polygon = new Polygon(dataB);
  const firstB: Point = b.firstPoint as Point;
  const minA: Point = a.min;
  const maxA: Point = a.max;
  const minB: Point = b.min;
  const maxB: Point = b.max;
  const offsetA: Point = Point.sub(minA, maxA);
  const offsetB: Point = Point.sub(minB, maxB);

  if (offsetB.x > offsetA.x || offsetB.y > offsetA.y) {
    return new Float32Array(0);
  }

  const minABSum: Point = Point.add(minA, firstB);
  const maxABSum: Point = Point.add(maxA, firstB);
  const size: u16 = POLYGON_CONFIG_SIZE + 8;
  const result = new Float32Array(size);

  result[0] = size;
  result[1] = -1; //  id
  result[2] = -1; //  source
  result[3] = 0; //   hole
  result[4] = 0; //   rotation
  result[5] = 0; //   x
  result[6] = 0; //   y
  result[7] = 0; //   width
  result[8] = 0; //   height
  result[9] = 0; //   offset x
  result[10] = 0; //  offset y
  result[11] = 4; //  point count
  result[12] = 0; //  has parent
  result[13] = 0; //  child count

  // Points
  result[14] = minABSum.x - minB.x;
  result[15] = minABSum.y - minB.y;
  result[16] = maxABSum.x - maxB.x;
  result[17] = minABSum.y - minB.y;
  result[18] = maxABSum.x - maxB.x;
  result[19] = maxABSum.y - maxB.y;
  result[20] = minABSum.x - minB.x;
  result[21] = maxABSum.y - maxB.y;

  return result;
}

export function isRectangle(data: Float32Array): boolean {
  const polygon: Polygon = new Polygon(data);

  if (!polygon.isValid) {
    return false;
  }

  const pointCount: u16 = polygon.length;
  const boundRect: Rect = polygon.bound as Rect;
  const bottomLeft: Point = boundRect.bottomLeft;
  const topRight: Point = boundRect.topRight;
  let i: u16 = 0;
  let point: Point;

  for (i = 0; i < pointCount; ++i) {
    point = polygon.at(i) as Point;

    if (
      (!almostEqual(point.x, bottomLeft.x) &&
        !almostEqual(point.x, topRight.x)) ||
      (!almostEqual(point.y, bottomLeft.y) && !almostEqual(point.y, topRight.y))
    ) {
      return false;
    }
  }

  return true;
}
