/*!
 * General purpose geometry functions for polygon/Bezier calculations
 * Copyright 2015 Jack Qiao
 * Licensed under the MIT license
 */

import FloatPoint from "../float-point";
import { ArrayPolygon, Point } from "../interfaces";
import { pointInPolygon } from "./geometry-utils-ported";
import { almostEqual } from "../util";

// private shared variables/methods

// floating point comparison tolerance
const TOL: number = Math.pow(10, -9); // Floating point error is likely to be above 1 epsilon

// normalize vector into a unit vector
function _normalizeVector(v: Point): FloatPoint {
  if (almostEqual(v.x * v.x + v.y * v.y, 1)) {
    return FloatPoint.from(v); // given vector was already a unit vector
  }

  const len: number = Math.sqrt(v.x * v.x + v.y * v.y);
  const inverse: number = 1 / len;

  return new FloatPoint(v.x * inverse, v.y * inverse);
}

// returns true if p lies on the line segment defined by AB, but not at any endpoints
// may need work!
function _onSegment(a: Point, b: Point, p: Point): boolean {
  // vertical line
  if (almostEqual(a.x, b.x) && almostEqual(p.x, a.x)) {
    return (
      !almostEqual(p.y, b.y) &&
      !almostEqual(p.y, a.y) &&
      p.y < Math.max(b.y, a.y) &&
      p.y > Math.min(b.y, a.y)
    );
  }

  // horizontal line
  if (almostEqual(a.y, b.y) && almostEqual(p.y, a.y)) {
    return (
      !almostEqual(p.x, b.x) &&
      !almostEqual(p.x, a.x) &&
      p.x < Math.max(b.x, a.x) &&
      p.x > Math.min(b.x, a.x)
    );
  }

  const offset: FloatPoint = FloatPoint.sub(a, b);
  const pOffset: FloatPoint = FloatPoint.sub(a, p);

  //range check
  if (
    Math.abs(pOffset.x) < Math.abs(offset.x) ||
    Math.abs(pOffset.y) < Math.abs(offset.y)
  ) {
    return false;
  }

  // exclude end points
  if (FloatPoint.almostEqual(p, a) || FloatPoint.almostEqual(p, b)) {
    return false;
  }

  const cross: number = pOffset.cross(offset, -1);

  if (Math.abs(cross) > TOL) {
    return false;
  }

  const dot: number = pOffset.dot(offset);

  if (dot < 0 || almostEqual(dot, 0)) {
    return false;
  }

  const len2: number = offset.squareLength;

  return !(dot > len2 || almostEqual(dot, len2));
}

function checkIntersection(a: number, b: number, c: number): boolean {
  const offset: number = Math.abs(a - b);

  return offset >= Math.pow(10, -9) && Math.abs(2 * c - a - b) <= offset;
}

// returns the intersection of AB and EF
// or null if there are no intersections or other numerical error
// if the infinite flag is set, AE and EF describe infinite lines without endpoints, they are finite line segments otherwise
export function lineIntersect(
  A: Point,
  B: Point,
  E: Point,
  F: Point,
  infinite: boolean = false
): Point | null {
  const a1: number = B.y - A.y;
  const b1: number = A.x - B.x;
  const c1: number = B.x * A.y - A.x * B.y;
  const a2: number = F.y - E.y;
  const b2: number = E.x - F.x;
  const c2: number = F.x * E.y - E.x * F.y;
  const denom: number = a1 * b2 - a2 * b1;
  const result: FloatPoint = new FloatPoint(
    (b1 * c2 - b2 * c1) / denom,
    (a2 * c1 - a1 * c2) / denom
  );

  if (
    !isFinite(result.x) ||
    !isFinite(result.y) ||
    (!infinite &&
      (checkIntersection(A.x, B.x, result.x) ||
        checkIntersection(A.y, B.y, result.y) ||
        checkIntersection(E.x, F.x, result.x) ||
        checkIntersection(E.y, F.y, result.y)))
  ) {
    return null;
  }

  return result;
}

function checkPolygon(
  polygon1: ArrayPolygon,
  polygon2: ArrayPolygon,
  point1: FloatPoint,
  point2: FloatPoint,
  index: number,
  indexOffset: number,
  pointOffset: Point
): boolean {
  const size: number = polygon1.length;
  let pointIndex: number = (index + indexOffset + size) % size;

  if (
    pointIndex === index ||
    FloatPoint.almostEqual(polygon1[pointIndex], polygon1[index])
  ) {
    pointIndex = (pointIndex + indexOffset + size) % size;
  }

  point1.set(polygon1[pointIndex]).add(pointOffset);

  return pointInPolygon(point1, polygon2) !== pointInPolygon(point2, polygon2);
}

// todo: swap this for a more efficient sweep-line implementation
// returnEdges: if set, return all edges on A that have intersections

export function intersect(A: ArrayPolygon, B: ArrayPolygon): boolean {
  const offsetA: FloatPoint = new FloatPoint(A.offsetx || 0, A.offsety || 0);
  const offsetB: FloatPoint = new FloatPoint(B.offsetx || 0, B.offsety || 0);
  const aSize: number = A.length;
  const bSize: number = A.length;
  const a1: FloatPoint = new FloatPoint();
  const a2: FloatPoint = new FloatPoint();
  const b1: FloatPoint = new FloatPoint();
  const b2: FloatPoint = new FloatPoint();
  const point: FloatPoint = new FloatPoint();
  let i: number = 0;
  let j: number = 0;

  for (i = 0; i < aSize - 1; ++i) {
    a1.set(A[i]).add(offsetA);
    a2.set(A[i + 1]).add(offsetA);

    for (j = 0; j < bSize - 1; ++j) {
      b1.set(B[j]).add(offsetB);
      b2.set(B[j + 1]).add(offsetB);

      if (b1.onSegment(a1, a2) || FloatPoint.almostEqual(a1, b1)) {
        // if a point is on a segment, it could intersect or it could not. Check via the neighboring points
        if (checkPolygon(B, A, point, b2, j, -1, offsetB)) {
          return true;
        } else {
          continue;
        }
      }

      if (b2.onSegment(a1, a2) || FloatPoint.almostEqual(a2, b2)) {
        // if a point is on a segment, it could intersect or it could not. Check via the neighboring points
        if (checkPolygon(B, A, point, b1, j + 1, 1, offsetB)) {
          return true;
        } else {
          continue;
        }
      }

      if (a1.onSegment(b1, b2) || FloatPoint.almostEqual(b2, a1)) {
        // if a point is on a segment, it could intersect or it could not. Check via the neighboring points
        if (checkPolygon(A, B, point, a2, i, -1, offsetA)) {
          return true;
        } else {
          continue;
        }
      }

      if (a2.onSegment(b1, b2) || FloatPoint.almostEqual(a2, b1)) {
        // if a point is on a segment, it could intersect or it could not. Check via the neighboring points
        if (checkPolygon(A, B, point, a1, i + 1, 1, offsetA)) {
          return true;
        } else {
          continue;
        }
      }

      if (lineIntersect(b1, b2, a1, a2) !== null) {
        return true;
      }
    }
  }

  return false;
}

export function pointDistance(
  p: Point,
  s1: Point,
  s2: Point,
  normal: Point,
  infinite: boolean = false
): number {
  const localNormal: FloatPoint = _normalizeVector(normal);
  const dir: FloatPoint = FloatPoint.normal(localNormal);
  const pDot: number = dir.dot(p);
  const s1Dot: number = dir.dot(s1);
  const s2Dot: number = dir.dot(s2);
  const pDotNorm: number = localNormal.dot(p);
  const s1DotNorm: number = localNormal.dot(s1);
  const s2DotNorm: number = localNormal.dot(s2);
  const diffNorm1: number = pDotNorm - s1DotNorm;
  const diffNorm2: number = pDotNorm - s2DotNorm;
  const diff1: number = pDot - s1Dot;
  const diff2: number = pDot - s2Dot;

  if (!infinite) {
    if ((diff1 < TOL && diff2 < TOL) || (diff1 > -TOL && diff2 > -TOL)) {
      return -1; // dot doesn't collide with segment, or lies directly on the vertex
    }

    if (
      almostEqual(pDot, s1Dot) &&
      almostEqual(pDot, s2Dot) &&
      diffNorm1 > 0 &&
      diffNorm2 > 0
    ) {
      return Math.min(diffNorm1, diffNorm2);
    }
    if (
      almostEqual(pDot, s1Dot) &&
      almostEqual(pDot, s2Dot) &&
      diffNorm1 < 0 &&
      diffNorm1 < 0
    ) {
      return Math.max(diffNorm1, diffNorm2);
    }
  }

  return ((s1DotNorm - s2DotNorm) * diff1) / (s1Dot - s2Dot) - diffNorm1;
}

export function segmentDistance(
  A: FloatPoint,
  B: FloatPoint,
  E: FloatPoint,
  F: FloatPoint,
  direction: FloatPoint
): number | null {
  const normal: FloatPoint = FloatPoint.normal(direction);
  const reverse: FloatPoint = FloatPoint.reverse(direction);
  const dotA: number = normal.dot(A);
  const dotB: number = normal.dot(B);
  const dotE: number = normal.dot(E);
  const dotF: number = normal.dot(F);
  const crossA: number = direction.cross(A);
  const crossB: number = direction.cross(B);
  const crossE: number = direction.cross(E);
  const crossF: number = direction.cross(F);
  const minAB: number = Math.min(dotA, dotB);
  const maxAB: number = Math.max(dotA, dotB);
  const maxEF: number = Math.max(dotE, dotF);
  const minEF: number = Math.min(dotE, dotF);
  const offsetAB: FloatPoint = FloatPoint.sub(A, B);
  const offsetEF: FloatPoint = FloatPoint.sub(E, F);

  // segments that will merely touch at one point
  // segments miss eachother completely
  if (
    almostEqual(maxAB, minEF) ||
    almostEqual(minAB, maxEF) ||
    maxAB < minEF ||
    minAB > maxEF
  ) {
    return null;
  }

  let overlap: number = 1;
  const maxOffset: number = maxAB - maxEF;
  const minOffset: number = minAB - minEF;

  if (Math.abs(maxOffset + minOffset) >= Math.abs(maxOffset - minOffset)) {
    const minMax: number = Math.min(maxAB, maxEF);
    const maxMin: number = Math.max(minAB, minEF);

    const maxMax: number = Math.max(maxAB, maxEF);
    const minMin: number = Math.min(minAB, minEF);

    overlap = (minMax - maxMin) / (maxMax - minMin);
  }

  const offsetEA: FloatPoint = FloatPoint.sub(A, E);
  const offsetFA: FloatPoint = FloatPoint.sub(A, F);
  const crossABE: number = offsetEA.cross(offsetAB, -1);
  const crossABF: number = offsetFA.cross(offsetAB, -1);

  // lines are colinear
  if (almostEqual(crossABE, 0) && almostEqual(crossABF, 0)) {
    const normalAB: FloatPoint = FloatPoint.normal(offsetAB);
    const normalEF: FloatPoint = FloatPoint.normal(offsetEF);

    normalAB.scale(1 / normalAB.length);
    normalEF.scale(1 / normalEF.length);

    // segment normals must point in opposite directions
    if (
      Math.abs(normalAB.cross(normalEF, -1)) < TOL &&
      normalAB.dot(normalEF) < 0
    ) {
      // normal of AB segment must point in same direction as given direction vector
      const normalDot: number = direction.dot(normalAB);
      // the segments merely slide along eachother
      if (almostEqual(normalDot, 0)) {
        return null;
      }
      if (normalDot < 0) {
        return 0;
      }
    }
    return null;
  }

  const distances: Array<number> = [];
  let d: number | null = null;
  let delat: number = 0;

  // coincident points
  if (almostEqual(dotA, dotE)) {
    distances.push(crossA - crossE);
  } else if (almostEqual(dotA, dotF)) {
    distances.push(crossA - crossF);
  } else if (dotA > minEF && dotA < maxEF) {
    d = pointDistance(A, E, F, reverse);

    if (d !== null && Math.abs(d) < TOL) {
      //  A currently touches EF, but AB is moving away from EF
      delat = pointDistance(B, E, F, reverse, true);
      if (delat < 0 || Math.abs(delat * overlap) < TOL) {
        d = null;
      }
    }

    if (d !== null) {
      distances.push(d);
    }
  }

  if (almostEqual(dotB, dotE)) {
    distances.push(crossB - crossE);
  } else if (almostEqual(dotB, dotF)) {
    distances.push(crossB - crossF);
  } else if (dotB > minEF && dotB < maxEF) {
    d = pointDistance(B, E, F, reverse);

    if (d !== null && Math.abs(d) < TOL) {
      // crossA>crossB A currently touches EF, but AB is moving away from EF
      delat = pointDistance(A, E, F, reverse, true);
      if (delat < 0 || Math.abs(delat * overlap) < TOL) {
        d = null;
      }
    }
    if (d !== null) {
      distances.push(d);
    }
  }

  if (dotE > minAB && dotE < maxAB) {
    d = pointDistance(E, A, B, direction);
    if (d !== null && Math.abs(d) < TOL) {
      // crossF<crossE A currently touches EF, but AB is moving away from EF
      delat = pointDistance(F, A, B, direction, true);
      if (delat < 0 || Math.abs(delat * overlap) < TOL) {
        d = null;
      }
    }
    if (d !== null) {
      distances.push(d);
    }
  }

  if (dotF > minAB && dotF < maxAB) {
    d = pointDistance(F, A, B, direction);
    if (d !== null && Math.abs(d) < TOL) {
      // && crossE<crossF A currently touches EF, but AB is moving away from EF
      delat = pointDistance(E, A, B, direction, true);
      if (delat < 0 || Math.abs(delat * overlap) < TOL) {
        d = null;
      }
    }
    if (d !== null) {
      distances.push(d);
    }
  }

  return distances.length ? Math.min(...distances) : null;
}

export function polygonSlideDistance(
  A: ArrayPolygon,
  B: ArrayPolygon,
  direction: Point,
  ignoreNegative: boolean
): number {
  const a1: FloatPoint = new FloatPoint();
  const a2: FloatPoint = new FloatPoint();
  const b1: FloatPoint = new FloatPoint();
  const b2: FloatPoint = new FloatPoint();
  const offsetA: FloatPoint = new FloatPoint(A.offsetx || 0, A.offsety || 0);
  const offsetB: FloatPoint = new FloatPoint(B.offsetx || 0, B.offsety || 0);
  const dir: FloatPoint = _normalizeVector(direction);
  const edgeA: ArrayPolygon = A.slice(0) as ArrayPolygon;
  const edgeB: ArrayPolygon = B.slice(0) as ArrayPolygon;
  let sizeA: number = edgeA.length;
  let sizeB: number = edgeB.length;
  let result: number | null = null;
  let distance: number | null = null;
  let i: number = 0;
  let j: number = 0;

  // close the loop for polygons
  if (edgeA[0] != edgeA[sizeA - 1]) {
    edgeA.push(edgeA[0]);
  }

  if (edgeB[0] != edgeB[sizeB - 1]) {
    ++sizeB;
    edgeB.push(edgeB[0]);
  }

  for (i = 0; i < sizeB - 1; ++i) {
    b1.set(edgeB[i]).add(offsetB);
    b2.set(edgeB[i + 1]).add(offsetB);

    if (FloatPoint.almostEqual(b1, b2)) {
      continue;
    }

    for (j = 0; j < sizeA - 1; ++j) {
      a1.set(edgeA[j]).add(offsetA);
      a2.set(edgeA[j + 1]).add(offsetA);

      if (FloatPoint.almostEqual(a1, a2)) {
        continue; // ignore extremely small lines
      }

      distance = segmentDistance(a1, a2, b1, b2, dir);

      if (
        distance !== null &&
        (result === null || distance < result) &&
        (!ignoreNegative || distance > 0 || almostEqual(distance, 0))
      ) {
        result = distance;
      }
    }
  }

  return result;
}

// project each point of B onto A in the given direction, and return the
export function polygonProjectionDistance(
  A: ArrayPolygon,
  B: ArrayPolygon,
  direction: Point
): number | null {
  const offsetA = new FloatPoint(A.offsetx || 0, A.offsety || 0);
  const offsetB = new FloatPoint(B.offsetx || 0, B.offsety || 0);
  const edgeA: ArrayPolygon = A.slice(0) as ArrayPolygon;
  const edgeB: ArrayPolygon = B.slice(0) as ArrayPolygon;
  const p: FloatPoint = new FloatPoint();
  const s1: FloatPoint = new FloatPoint();
  const s2: FloatPoint = new FloatPoint();
  let result: number | null = null;
  let distance: number | null = null;
  let sizeA: number = edgeA.length;
  let sizeB: number = edgeB.length;
  let minProjection: number | null = null;
  let i: number = 0;
  let j: number = 0;

  // close the loop for polygons
  if (edgeA[0] != edgeA[sizeA - 1]) {
    ++sizeA;
    edgeA.push(edgeA[0]);
  }

  if (edgeB[0] != edgeB[sizeB - 1]) {
    edgeB.push(edgeB[0]);
  }

  for (i = 0; i < sizeB; ++i) {
    // the shortest/most negative projection of B onto A
    minProjection = null;
    p.set(edgeB[i]).add(offsetB);

    for (j = 0; j < sizeA - 1; ++j) {
      s1.set(edgeA[j]).add(offsetA);
      s2.set(edgeA[j + 1]).add(offsetA);

      if (
        almostEqual((s2.y - s1.y) * direction.x, (s2.x - s1.x) * direction.y)
      ) {
        continue;
      }

      // project point, ignore edge boundaries
      distance = pointDistance(p, s1, s2, direction);

      if (
        distance !== null &&
        (minProjection === null || distance < minProjection)
      ) {
        minProjection = distance;
      }
    }

    if (minProjection !== null && (result === null || minProjection > result)) {
      result = minProjection;
    }
  }

  return result;
}

// searches for an arrangement of A and B such that they do not overlap
// if an NFP is given, only search for startpoints that have not already been traversed in the given NFP
export function searchStartPoint(
  A: ArrayPolygon,
  B: ArrayPolygon,
  inside: boolean,
  NFP: Array<Array<Point>> = []
): FloatPoint | null {
  // clone arrays
  const edgeA: ArrayPolygon = A.slice() as ArrayPolygon;
  const edgeB: ArrayPolygon = B.slice() as ArrayPolygon;
  const offset: FloatPoint = new FloatPoint();
  const point: FloatPoint = new FloatPoint();
  let i: number = 0;
  let j: number = 0;
  let k: number = 0;
  let projectionDistance1: number = 0;
  let projectionDistance2: number = 0;
  let vectorDistance: number = 0;
  let distance: number = 0;
  let sizeA: number = edgeA.length;
  let sizeB: number = edgeB.length;

  // close the loop for polygons
  if (edgeA[0] != edgeA[sizeA - 1]) {
    ++sizeA;
    edgeA.push(edgeA[0]);
  }

  if (edgeB[0] != edgeB[sizeB - 1]) {
    ++sizeB;
    edgeB.push(edgeB[0]);
  }

  for (i = 0; i < sizeA - 1; ++i) {
    if (!edgeA[i].marked) {
      edgeA[i].marked = true;
      for (j = 0; j < sizeB; ++j) {
        offset.set(edgeA[i]).sub(edgeB[j]);
        edgeB.offsetx = offset.x;
        edgeB.offsety = offset.y;

        for (k = 0; k < sizeB; ++k) {
          if (pointInPolygon(point.set(edgeB[k]).add(offset), edgeA)) {
            // A and B are the same
            return null;
          }
        }

        if (!inside && !intersect(edgeA, edgeB) && !inNfp(offset, NFP)) {
          return offset.clone();
        }

        // slide B along vector
        point.set(edgeA[i + 1]).sub(edgeA[i]);
        projectionDistance1 = polygonProjectionDistance(edgeA, edgeB, point);
        projectionDistance2 = polygonProjectionDistance(
          edgeB,
          edgeA,
          FloatPoint.reverse(point)
        );

        // todo: clean this up
        if (projectionDistance1 === null && projectionDistance2 === null) {
          continue;
        }

        projectionDistance1 =
          projectionDistance1 === null
            ? projectionDistance2
            : projectionDistance1;

        projectionDistance2 =
          projectionDistance2 === null
            ? projectionDistance1
            : projectionDistance2;

        distance = Math.min(projectionDistance1, projectionDistance2);

        // only slide until no longer negative
        // todo: clean this up
        if (Math.abs(distance) < TOL || distance <= 0) {
          continue;
        }

        vectorDistance = point.length;

        if (distance - vectorDistance < -TOL) {
          point.scale(distance / vectorDistance);
        }

        offset.add(point);
        edgeB.offsetx = offset.x;
        edgeB.offsety = offset.y;

        for (k = 0; k < sizeB; ++k) {
          if (pointInPolygon(point.set(edgeB[k]).add(offset), edgeA)) {
            break;
          }

          if (!inside && !intersect(edgeA, edgeB) && !inNfp(offset, NFP)) {
            return offset.clone();
          }
        }
      }
    }

    return null;
  }

  // returns true if point already exists in the given nfp
  function inNfp(p: Point, nfp: Array<Array<Point>> = []): boolean {
    if (nfp.length == 0) {
      return false;
    }

    const rootSize: number = nfp.length;
    let nfpCount: number = 0;
    let i: number = 0;
    let j: number = 0;
    let nfpItem: Array<Point>;

    for (i = 0; i < rootSize; ++i) {
      nfpItem = nfp[i];
      nfpCount = nfpItem.length;

      for (j = 0; j < nfpCount; ++j) {
        if (FloatPoint.almostEqual(p, nfpItem[j])) {
          return true;
        }
      }
    }

    return false;
  }

  return null;
}

// returns an interior NFP for the special case where A is a rectangle
export function noFitPolygonRectangle(
  A: ArrayPolygon,
  B: ArrayPolygon
): Array<Array<Point>> {
  const minA: FloatPoint = FloatPoint.from(A[0]);
  const maxA: FloatPoint = FloatPoint.from(A[0]);
  const minB: FloatPoint = FloatPoint.from(B[0]);
  const maxB: FloatPoint = FloatPoint.from(B[0]);
  let i: number = 0;

  for (i = 1; i < A.length; ++i) {
    minA.min(A[i]);
    maxA.max(A[i]);
  }

  for (i = 1; i < B.length; ++i) {
    minB.min(B[i]);
    maxB.max(B[i]);
  }

  const offsetA: FloatPoint = FloatPoint.sub(minA, maxA);
  const offsetB: FloatPoint = FloatPoint.sub(minB, maxB);

  if (
    Math.abs(offsetB.x) > Math.abs(offsetA.x) ||
    Math.abs(offsetB.y) > Math.abs(offsetA.y)
  ) {
    return null;
  }

  return [
    [
      new FloatPoint(minA.x - minB.x + B[0].x, minA.y - minB.y + B[0].y),
      new FloatPoint(maxA.x - maxB.x + B[0].x, minA.y - minB.y + B[0].y),
      new FloatPoint(maxA.x - maxB.x + B[0].x, maxA.y - maxB.y + B[0].y),
      new FloatPoint(minA.x - minB.x + B[0].x, maxA.y - maxB.y + B[0].y)
    ]
  ];
}

// given a static polygon A and a movable polygon B, compute a no fit polygon by orbiting B about A
// if the inside flag is set, B is orbited inside of A rather than outside
// if the searchEdges flag is set, all edges of A are explored for NFPs - multiple
export function noFitPolygon(
  A: ArrayPolygon,
  B: ArrayPolygon,
  inside: boolean,
  searchEdges: boolean
) {
  if (A.length < 3 || B.length < 3) {
    return null;
  }

  A.offsetx = 0;
  A.offsety = 0;

  const sizeA: number = A.length;
  const sizeB: number = B.length;
  let i: number = 0;
  let j: number = 0;
  let minA: number = A[0].y;
  let minAIndex: number = 0;

  let maxB: number = B[0].y;
  let maxBIndex: number = 0;

  for (i = 1; i < sizeA; ++i) {
    A[i].marked = false;

    if (A[i].y < minA) {
      minA = A[i].y;
      minAIndex = i;
    }
  }

  for (i = 1; i < sizeB; ++i) {
    B[i].marked = false;

    if (B[i].y > maxB) {
      maxB = B[i].y;
      maxBIndex = i;
    }
  }

  let startPoint: FloatPoint | null = !inside
    ? // shift B such that the bottom-most point of B is at the top-most point of A. This guarantees an initial placement with no intersections
      FloatPoint.sub(B[maxBIndex], A[minAIndex])
    : // no reliable heuristic for inside
      searchStartPoint(A, B, true);
  let reference: FloatPoint = new FloatPoint();
  let start: FloatPoint = new FloatPoint();
  let offset: FloatPoint = new FloatPoint();
  let point1: FloatPoint = new FloatPoint();
  let point2: FloatPoint = new FloatPoint();
  let counter: number = 0;
  // maintain a list of touching points/edges
  let touching: Array<{ A: number; B: number; type: number }>;
  let vectors: Array<Point>;
  let vectorA1: Point;
  let vectorA2: Point;
  let vectorB1: Point;
  let vectorB2: Point;

  var NFPlist = [];

  while (startPoint !== null) {
    offset.set(startPoint);
    B.offsetx = offset.x;
    B.offsety = offset.y;

    var prevvector = null; // keep track of previous vector
    var NFP = [FloatPoint.add(B[0], startPoint)];

    reference.set(B[0]).add(startPoint);
    start.set(reference);
    counter = 0;

    while (counter < 10 * (sizeA + sizeB)) {
      // sanity check, prevent infinite loop
      touching = [];
      // find touching vertices/edges
      for (i = 0; i < sizeA; ++i) {
        var nexti = i == sizeA - 1 ? 0 : i + 1;
        for (j = 0; j < sizeB; ++j) {
          var nextj = j == sizeB - 1 ? 0 : j + 1;
          point1.set(B[j]).add(offset);
          point2.set(B[nextj]).add(offset);

          if (FloatPoint.almostEqual(A[i], point1)) {
            touching.push({ type: 0, A: i, B: j });
          } else if (point1.onSegment(A[i], A[nexti])) {
            touching.push({ type: 1, A: nexti, B: j });
          } else if (_onSegment(point1, point2, A[i])) {
            touching.push({ type: 2, A: i, B: nextj });
          }
        }
      }

      // generate translation vectors from touching vertices/edges
      vectors = [];

      for (i = 0; i < touching.length; ++i) {
        var vertexA = A[touching[i].A];
        vertexA.marked = true;

        // adjacent A vertices
        var prevAindex = touching[i].A - 1;
        var nextAindex = touching[i].A + 1;

        prevAindex = prevAindex < 0 ? A.length - 1 : prevAindex; // loop
        nextAindex = nextAindex >= A.length ? 0 : nextAindex; // loop

        var prevA = A[prevAindex];
        var nextA = A[nextAindex];

        // adjacent B vertices
        var vertexB = B[touching[i].B];

        var prevBindex = touching[i].B - 1;
        var nextBindex = touching[i].B + 1;

        prevBindex = prevBindex < 0 ? B.length - 1 : prevBindex; // loop
        nextBindex = nextBindex >= B.length ? 0 : nextBindex; // loop

        var prevB = B[prevBindex];
        var nextB = B[nextBindex];

        if (touching[i].type == 0) {
          vectorA1 = FloatPoint.sub(vertexA, prevA);
          vectorA2 = FloatPoint.sub(vertexA, nextA);
          // B vectors need to be inverted
          vectorB1 = FloatPoint.sub(prevB, vertexB);
          vectorB2 = FloatPoint.sub(nextB, vertexB);

          (vectorA1.start = vertexA), (vectorA1.end = prevA);
          (vectorA2.start = vertexA), (vectorA2.end = nextA);
          (vectorB1.start = prevB), (vectorB1.end = vertexB);
          (vectorB2.start = nextB), (vectorB2.end = vertexB);

          vectors.push(vectorA1);
          vectors.push(vectorA2);
          vectors.push(vectorB1);
          vectors.push(vectorB2);
        } else if (touching[i].type == 1) {
          vectors.push({
            x: vertexA.x - (vertexB.x + offset.x),
            y: vertexA.y - (vertexB.y + offset.y),
            start: prevA,
            end: vertexA
          });

          vectors.push({
            x: prevA.x - (vertexB.x + offset.x),
            y: prevA.y - (vertexB.y + offset.y),
            start: vertexA,
            end: prevA
          });
        } else if (touching[i].type == 2) {
          vectors.push({
            x: vertexA.x - (vertexB.x + offset.x),
            y: vertexA.y - (vertexB.y + offset.y),
            start: prevB,
            end: vertexB
          });

          vectors.push({
            x: vertexA.x - (prevB.x + offset.x),
            y: vertexA.y - (prevB.y + offset.y),
            start: vertexB,
            end: prevB
          });
        }
      }

      // todo: there should be a faster way to reject vectors that will cause immediate intersection. For now just check them all

      var translate = null;
      var maxd = 0;

      for (i = 0; i < vectors.length; ++i) {
        if (vectors[i].x == 0 && vectors[i].y == 0) {
          continue;
        }

        // if this vector points us back to where we came from, ignore it.
        // ie cross product = 0, dot product < 0
        if (
          prevvector &&
          vectors[i].y * prevvector.y + vectors[i].x * prevvector.x < 0
        ) {
          // compare magnitude with unit vectors
          var vectorlength = Math.sqrt(
            vectors[i].x * vectors[i].x + vectors[i].y * vectors[i].y
          );
          var unitv = FloatPoint.from(vectors[i]).scale(1 / vectorlength);

          var prevlength = Math.sqrt(
            prevvector.x * prevvector.x + prevvector.y * prevvector.y
          );
          var prevunit = FloatPoint.from(prevvector).scale(1 / prevlength);

          // we need to scale down to unit vectors to normalize vector length. Could also just do a tan here
          if (Math.abs(unitv.y * prevunit.x - unitv.x * prevunit.y) < 0.0001) {
            continue;
          }
        }

        var d = polygonSlideDistance(A, B, vectors[i], true);
        var vecd2 = vectors[i].x * vectors[i].x + vectors[i].y * vectors[i].y;

        if (d === null || d * d > vecd2) {
          var vecd = Math.sqrt(
            vectors[i].x * vectors[i].x + vectors[i].y * vectors[i].y
          );
          d = vecd;
        }

        if (d !== null && d > maxd) {
          maxd = d;
          translate = vectors[i];
        }
      }

      if (translate === null || almostEqual(maxd, 0)) {
        // didn't close the loop, something went wrong here
        NFP = null;
        break;
      }

      translate.start.marked = true;
      translate.end.marked = true;

      prevvector = translate;

      // trim
      var vlength2 = translate.x * translate.x + translate.y * translate.y;
      if (maxd * maxd < vlength2 && !almostEqual(maxd * maxd, vlength2)) {
        var scale = Math.sqrt((maxd * maxd) / vlength2);
        translate.x *= scale;
        translate.y *= scale;
      }

      reference.x += translate.x;
      reference.y += translate.y;

      if (
        almostEqual(reference.x, start.x) &&
        almostEqual(reference.y, start.y)
      ) {
        // we've made a full loop
        break;
      }

      // if A and B start on a touching horizontal line, the end point may not be the start point
      var looped = false;

      if (NFP.length > 0) {
        for (i = 0; i < NFP.length - 1; ++i) {
          if (
            almostEqual(reference.x, NFP[i].x) &&
            almostEqual(reference.y, NFP[i].y)
          ) {
            looped = true;
          }
        }
      }

      if (looped) {
        // we've made a full loop
        break;
      }

      NFP.push(reference.clone());

      offset.add(translate);
      B.offsetx = offset.x;
      B.offsety = offset.y;

      ++counter;
    }

    if (NFP && NFP.length > 0) {
      NFPlist.push(NFP);
    }

    if (!searchEdges) {
      // only get outer NFP or first inner NFP
      break;
    }

    startPoint = searchStartPoint(A, B, inside, NFPlist);
  }

  return NFPlist;
}
