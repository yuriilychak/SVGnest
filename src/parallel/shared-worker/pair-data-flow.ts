//@ts-ignore
import ClipperLib from "js-clipper";

import {
  polygonArea,
  getPolygonBounds,
  pointInPolygon,
  rotatePolygon,
  toClipperCoordinates,
  toNestCoordinates
} from "../../geometry-util";
import FloatPoint from "../../float-point";
import FloatRect from "../../float-rect";
import { keyToNFPData } from "../../util";
import { ArrayPolygon, NfpPair, PairWorkerData, Point } from "../../interfaces";
import { almostEqual } from "../../util";

/*!
 * General purpose geometry functions for polygon/Bezier calculations
 * Copyright 2015 Jack Qiao
 * Licensed under the MIT license
 */

// floating point comparison tolerance
const TOL: number = Math.pow(10, -9); // Floating point error is likely to be above 1 epsilon

function checkIntersection(a: number, b: number, c: number): boolean {
  const offset: number = Math.abs(a - b);

  return offset >= Math.pow(10, -9) && Math.abs(2 * c - a - b) <= offset;
}

function isRectangle(polygon: ArrayPolygon): boolean {
  const pointCount: number = polygon.length;
  const boundRect: FloatRect = getPolygonBounds(polygon);
  const bottomLeft: FloatPoint = boundRect.bottomLeft;
  const topRight: FloatPoint = boundRect.topRight;
  let i: number = 0;
  let point: Point;

  for (i = 0; i < pointCount; ++i) {
    point = polygon.at(i);

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

// returns the intersection of AB and EF
// or null if there are no intersections or other numerical error
// if the infinite flag is set, AE and EF describe infinite lines without endpoints, they are finite line segments otherwise
function _lineIntersect(
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
    FloatPoint.almostEqual(polygon1.at(pointIndex), polygon1.at(index))
  ) {
    pointIndex = (pointIndex + indexOffset + size) % size;
  }

  point1.set(polygon1.at(pointIndex)).add(pointOffset);

  return pointInPolygon(point1, polygon2) !== pointInPolygon(point2, polygon2);
}

// todo: swap this for a more efficient sweep-line implementation
// returnEdges: if set, return all edges on A that have intersections

function intersect(polygonA: ArrayPolygon, polygonB: ArrayPolygon): boolean {
  const offsetA: FloatPoint = new FloatPoint(
    polygonA.offsetx || 0,
    polygonA.offsety || 0
  );
  const offsetB: FloatPoint = new FloatPoint(
    polygonB.offsetx || 0,
    polygonB.offsety || 0
  );
  const aSize: number = polygonA.length;
  const bSize: number = polygonA.length;
  const a1: FloatPoint = new FloatPoint();
  const a2: FloatPoint = new FloatPoint();
  const b1: FloatPoint = new FloatPoint();
  const b2: FloatPoint = new FloatPoint();
  const point: FloatPoint = new FloatPoint();
  let i: number = 0;
  let j: number = 0;

  for (i = 0; i < aSize - 1; ++i) {
    a1.set(polygonA.at(i)).add(offsetA);
    a2.set(polygonA.at(i + 1)).add(offsetA);

    for (j = 0; j < bSize - 1; ++j) {
      b1.set(polygonB.at(j)).add(offsetB);
      b2.set(polygonB.at(j + 1)).add(offsetB);

      if (b1.onSegment(a1, a2) || b1.almostEqual(a1)) {
        // if a point is on a segment, it could intersect or it could not. Check via the neighboring points
        if (checkPolygon(polygonB, polygonA, point, b2, j, -1, offsetB)) {
          return true;
        } else {
          continue;
        }
      }

      if (b2.onSegment(a1, a2) || b2.almostEqual(a2)) {
        // if a point is on a segment, it could intersect or it could not. Check via the neighboring points
        if (checkPolygon(polygonB, polygonA, point, b1, j + 1, 1, offsetB)) {
          return true;
        } else {
          continue;
        }
      }

      if (a1.onSegment(b1, b2) || a1.almostEqual(b2)) {
        // if a point is on a segment, it could intersect or it could not. Check via the neighboring points
        if (checkPolygon(polygonA, polygonB, point, a2, i, -1, offsetA)) {
          return true;
        } else {
          continue;
        }
      }

      if (a2.onSegment(b1, b2) || a2.almostEqual(b1)) {
        // if a point is on a segment, it could intersect or it could not. Check via the neighboring points
        if (checkPolygon(polygonA, polygonB, point, a1, i + 1, 1, offsetA)) {
          return true;
        } else {
          continue;
        }
      }

      if (_lineIntersect(b1, b2, a1, a2) !== null) {
        return true;
      }
    }
  }

  return false;
}

function pointDistance(
  p: Point,
  s1: Point,
  s2: Point,
  normal: Point,
  infinite: boolean = false
): number {
  const localNormal: FloatPoint = FloatPoint.normalizeVector(normal);
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

function segmentDistance(
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

function polygonSlideDistance(
  a: ArrayPolygon,
  b: ArrayPolygon,
  direction: Point,
  ignoreNegative: boolean
): number {
  const a1: FloatPoint = new FloatPoint();
  const a2: FloatPoint = new FloatPoint();
  const b1: FloatPoint = new FloatPoint();
  const b2: FloatPoint = new FloatPoint();
  const offsetA: FloatPoint = new FloatPoint(a.offsetx || 0, a.offsety || 0);
  const offsetB: FloatPoint = new FloatPoint(b.offsetx || 0, b.offsety || 0);
  const dir: FloatPoint = FloatPoint.normalizeVector(direction);
  const edgeA: ArrayPolygon = a.slice(0) as ArrayPolygon;
  const edgeB: ArrayPolygon = b.slice(0) as ArrayPolygon;
  let sizeA: number = edgeA.length;
  let sizeB: number = edgeB.length;
  let result: number | null = null;
  let distance: number | null = null;
  let i: number = 0;
  let j: number = 0;

  // close the loop for polygons
  if (edgeA.at(0) != edgeA.at(sizeA - 1)) {
    ++sizeA;
    edgeA.push(edgeA.at(0));
  }

  if (edgeB.at(0) != edgeB.at(sizeB - 1)) {
    ++sizeB;
    edgeB.push(edgeB.at(0));
  }

  for (i = 0; i < sizeB - 1; ++i) {
    b1.set(edgeB.at(i)).add(offsetB);
    b2.set(edgeB.at(i + 1)).add(offsetB);

    if (FloatPoint.almostEqual(b1, b2)) {
      continue;
    }

    for (j = 0; j < sizeA - 1; ++j) {
      a1.set(edgeA.at(j)).add(offsetA);
      a2.set(edgeA.at(j + 1)).add(offsetA);

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
function polygonProjectionDistance(
  a: ArrayPolygon,
  b: ArrayPolygon,
  direction: Point
): number | null {
  const offsetA = new FloatPoint(a.offsetx || 0, a.offsety || 0);
  const offsetB = new FloatPoint(b.offsetx || 0, b.offsety || 0);
  const edgeA: ArrayPolygon = a.slice(0) as ArrayPolygon;
  const edgeB: ArrayPolygon = b.slice(0) as ArrayPolygon;
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
  if (edgeA.at(0) != edgeA.at(sizeA - 1)) {
    ++sizeA;
    edgeA.push(edgeA.at(0));
  }

  if (edgeB.at(0) != edgeB.at(sizeB - 1)) {
    ++sizeB;
    edgeB.push(edgeB.at(0));
  }

  for (i = 0; i < sizeB; ++i) {
    // the shortest/most negative projection of B onto A
    minProjection = null;
    p.set(edgeB.at(i)).add(offsetB);

    for (j = 0; j < sizeA - 1; ++j) {
      s1.set(edgeA.at(j)).add(offsetA);
      s2.set(edgeA.at(j + 1)).add(offsetA);

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
function searchStartPoint(
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
  if (edgeA.at(0) != edgeA.at(sizeA - 1)) {
    ++sizeA;
    edgeA.push(edgeA.at(0));
  }

  if (edgeB.at(0) != edgeB.at(sizeB - 1)) {
    ++sizeB;
    edgeB.push(edgeB.at(0));
  }

  for (i = 0; i < sizeA - 1; ++i) {
    if (!edgeA.at(i).marked) {
      edgeA.at(i).marked = true;
      for (j = 0; j < sizeB; ++j) {
        offset.set(edgeA.at(i)).sub(edgeB.at(j));
        edgeB.offsetx = offset.x;
        edgeB.offsety = offset.y;

        for (k = 0; k < sizeB; ++k) {
          if (pointInPolygon(point.set(edgeB.at(k)).add(offset), edgeA)) {
            // A and B are the same
            return null;
          }
        }

        if (!inside && !intersect(edgeA, edgeB) && !inNfp(offset, NFP)) {
          return offset.clone();
        }

        // slide B along vector
        point.set(edgeA.at(i + 1)).sub(edgeA.at(i));
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
          if (pointInPolygon(point.set(edgeB.at(k)).add(offset), edgeA)) {
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
      nfpItem = nfp.at(i);
      nfpCount = nfpItem.length;

      for (j = 0; j < nfpCount; ++j) {
        if (FloatPoint.almostEqual(p, nfpItem.at(j))) {
          return true;
        }
      }
    }

    return false;
  }

  return null;
}

// given a static polygon A and a movable polygon B, compute a no fit polygon by orbiting B about A
// if the inside flag is set, B is orbited inside of A rather than outside
// if the searchEdges flag is set, all edges of A are explored for NFPs - multiple
function noFitPolygon(
  a: ArrayPolygon,
  b: ArrayPolygon,
  inside: boolean,
  searchEdges: boolean
) {
  if (a.length < 3 || b.length < 3) {
    return null;
  }

  a.offsetx = 0;
  a.offsety = 0;

  const sizeA: number = a.length;
  const sizeB: number = b.length;
  let i: number = 0;
  let j: number = 0;
  let minA: number = a.at(0).y;
  let minAIndex: number = 0;
  let maxB: number = b.at(0).y;
  let maxBIndex: number = 0;

  for (i = 1; i < sizeA; ++i) {
    a.at(i).marked = false;

    if (a.at(i).y < minA) {
      minA = a.at(i).y;
      minAIndex = i;
    }
  }

  for (i = 1; i < sizeB; ++i) {
    b.at(i).marked = false;

    if (b.at(i).y > maxB) {
      maxB = b.at(i).y;
      maxBIndex = i;
    }
  }

  let startPoint: FloatPoint | null = !inside
    ? // shift B such that the bottom-most point of B is at the top-most point of A. This guarantees an initial placement with no intersections
      FloatPoint.sub(b.at(maxBIndex), a.at(minAIndex))
    : // no reliable heuristic for inside
      searchStartPoint(a, b, true);
  let reference: FloatPoint = new FloatPoint();
  let start: FloatPoint = new FloatPoint();
  let offset: FloatPoint = new FloatPoint();
  const point1: FloatPoint = new FloatPoint();
  const point2: FloatPoint = new FloatPoint();
  const point3: FloatPoint = new FloatPoint();
  const prevUnit: FloatPoint = new FloatPoint();
  const unitV: FloatPoint = new FloatPoint();
  const nfpList: Array<ArrayPolygon> = [];
  const sumSize: number = sizeA + sizeB;
  let counter: number = 0;
  // maintain a list of touching points/edges
  let touching: Array<{ A: number; B: number; type: number }>;
  let vectors: Array<Point>;
  let vectorA1: Point;
  let vectorA2: Point;
  let vectorB1: Point;
  let vectorB2: Point;
  let looped: boolean = false;
  let prevVector: Point | null = null;
  let nfp: ArrayPolygon = null;
  let vLength2: number = 0;
  let prevAIndex: number = 0;
  let nextAIndex: number = 0;
  let prevBIndex: number = 0;
  let nextBIndex: number = 0;
  let distance: number = 0;
  let maxDistance: number = 0;
  let translate: Point | null;
  let prevA: Point;
  let nextA: Point;
  let prevB: Point;
  let nextB: Point;
  let vertexA: Point;
  let vertexB: Point;
  let touchingItem: { A: number; B: number; type: number };

  while (startPoint !== null) {
    offset.set(startPoint);
    b.offsetx = offset.x;
    b.offsety = offset.y;

    prevVector = null; // keep track of previous vector
    nfp = new Array<Point>() as ArrayPolygon;
    nfp.push(FloatPoint.add(b.at(0), startPoint));

    reference.set(b.at(0)).add(startPoint);
    start.set(reference);
    counter = 0;

    while (counter < 10 * sumSize) {
      // sanity check, prevent infinite loop
      touching = [];
      // find touching vertices/edges
      for (i = 0; i < sizeA; ++i) {
        for (j = 0; j < sizeB; ++j) {
          point1.set(b.at(j)).add(offset);
          point2.set(b.at((j + 1) % sizeB)).add(offset);
          point3.set(a.at(i));

          if (FloatPoint.almostEqual(a.at(i), point1)) {
            touching.push({ type: 0, A: i, B: j });
          } else if (point1.onSegment(a.at(i), a.at((i + 1) % sizeA))) {
            touching.push({ type: 1, A: (i + 1) % sizeA, B: j });
          } else if (point3.onSegment(point1, point2)) {
            touching.push({ type: 2, A: i, B: (j + 1) % sizeB });
          }
        }
      }

      // generate translation vectors from touching vertices/edges
      vectors = [];

      for (i = 0; i < touching.length; ++i) {
        touchingItem = touching.at(i);
        vertexA = a.at(touchingItem.A);
        vertexA.marked = true;

        // adjacent A vertices
        prevAIndex = (touchingItem.A - 1 + sizeA) % sizeA; // loop
        nextAIndex = (touchingItem.A + 1) % sizeA; // loop

        prevA = a.at(prevAIndex);
        nextA = a.at(nextAIndex);

        // adjacent B vertices
        vertexB = b.at(touchingItem.B);
        prevBIndex = (touchingItem.B - 1 + sizeB) % sizeB;
        nextBIndex = (touchingItem.B + 1) % sizeB;

        prevB = b.at(prevBIndex);
        nextB = b.at(nextBIndex);

        if (touchingItem.type == 0) {
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
        } else if (touchingItem.type == 1) {
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
        } else if (touchingItem.type == 2) {
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

      translate = null;
      maxDistance = 0;

      for (i = 0; i < vectors.length; ++i) {
        if (vectors.at(i).x === 0 && vectors.at(i).y === 0) {
          continue;
        }

        // if this vector points us back to where we came from, ignore it.
        // ie cross product = 0, dot product < 0
        point1.set(vectors.at(i));

        if (prevVector && point1.dot(prevVector) < 0) {
          point2.set(prevVector);
          // compare magnitude with unit vectors
          unitV.set(point1).scale(1 / point1.length);
          prevUnit.set(prevVector).scale(1 / point2.length);

          // we need to scale down to unit vectors to normalize vector length. Could also just do a tan here
          if (Math.abs(unitV.cross(prevUnit, -1)) < 0.0001) {
            continue;
          }
        }

        distance = polygonSlideDistance(a, b, point1, true);

        if (distance === null || distance * distance > point1.squareLength) {
          distance = point1.length;
        }

        if (distance !== null && distance > maxDistance) {
          maxDistance = distance;
          translate = vectors.at(i);
        }
      }

      if (translate === null || almostEqual(maxDistance, 0)) {
        // didn't close the loop, something went wrong here
        nfp = null;
        break;
      }

      translate.start.marked = true;
      translate.end.marked = true;

      prevVector = translate;

      // trim
      vLength2 = translate.x * translate.x + translate.y * translate.y;

      if (
        maxDistance * maxDistance < vLength2 &&
        !almostEqual(maxDistance * maxDistance, vLength2)
      ) {
        var scale = Math.sqrt((maxDistance * maxDistance) / vLength2);
        translate.x *= scale;
        translate.y *= scale;
      }

      reference.add(translate);

      if (reference.almostEqual(start)) {
        // we've made a full loop
        break;
      }

      // if A and B start on a touching horizontal line, the end point may not be the start point
      looped = false;

      if (nfp.length > 0) {
        for (i = 0; i < nfp.length - 1; ++i) {
          if (reference.almostEqual(nfp.at(i))) {
            looped = true;
            break;
          }
        }
      }

      if (looped) {
        // we've made a full loop
        break;
      }

      nfp.push(reference.clone());

      offset.add(translate);
      b.offsetx = offset.x;
      b.offsety = offset.y;

      ++counter;
    }

    if (nfp && nfp.length > 0) {
      nfpList.push(nfp);
    }

    if (!searchEdges) {
      // only get outer NFP or first inner NFP
      break;
    }

    startPoint = searchStartPoint(a, b, inside, nfpList);
  }

  return nfpList;
}

// returns an interior NFP for the special case where A is a rectangle
function noFitPolygonRectangle(
  a: ArrayPolygon,
  b: ArrayPolygon
): Array<ArrayPolygon> | null {
  const firstA: Point = a.at(0);
  const firstB: Point = b.at(0);
  const minA: FloatPoint = FloatPoint.from(firstA);
  const maxA: FloatPoint = FloatPoint.from(firstA);
  const minB: FloatPoint = FloatPoint.from(firstB);
  const maxB: FloatPoint = FloatPoint.from(firstB);
  let i: number = 0;
  let point: Point;

  for (i = 1; i < a.length; ++i) {
    point = a.at(i);
    minA.min(point);
    maxA.max(point);
  }

  for (i = 1; i < b.length; ++i) {
    point = b.at(i);
    minB.min(point);
    maxB.max(point);
  }

  const offsetA: FloatPoint = FloatPoint.sub(minA, maxA);
  const offsetB: FloatPoint = FloatPoint.sub(minB, maxB);

  if (offsetB.x > offsetA.x || offsetB.y > offsetA.y) {
    return null;
  }

  const minABSum: FloatPoint = FloatPoint.add(minA, firstB);
  const maxABSum: FloatPoint = FloatPoint.add(maxA, firstB);

  //TODO: refactor when clipper logic will be removed
  return [
    [
      { x: minABSum.x - minB.x, y: minABSum.y - minB.y },
      { x: maxABSum.x - maxB.x, y: minABSum.y - minB.y },
      { x: maxABSum.x - maxB.x, y: maxABSum.y - maxB.y },
      { x: minABSum.x - minB.x, y: maxABSum.y - maxB.y }
    ] as ArrayPolygon
  ];
}

// clipperjs uses alerts for warnings
function alert(message: string) {
  console.log("alert: ", message);
}

function minkowskiDifference(
  A: ArrayPolygon,
  B: ArrayPolygon
): Array<ArrayPolygon> {
  let i: number = 0;
  let clipperNfp;
  let largestArea: number | null = null;
  let n: ArrayPolygon;
  let sArea: number;
  const clippedA = toClipperCoordinates(A);
  const clippedB = toClipperCoordinates(B);

  ClipperLib.JS.ScaleUpPath(clippedA, 10000000);
  ClipperLib.JS.ScaleUpPath(clippedB, 10000000);

  for (i = 0; i < clippedB.length; ++i) {
    clippedB.at(i).X *= -1;
    clippedB.at(i).Y *= -1;
  }

  const solutions = ClipperLib.Clipper.MinkowskiSum(clippedA, clippedB, true);
  const solutionCount: number = solutions.length;

  for (i = 0; i < solutionCount; ++i) {
    n = toNestCoordinates(solutions.at(i), 10000000);
    sArea = polygonArea(n);

    if (largestArea === null || largestArea > sArea) {
      clipperNfp = n;
      largestArea = sArea;
    }
  }

  for (i = 0; i < clipperNfp.length; ++i) {
    clipperNfp.at(i).x += B.at(0).x;
    clipperNfp.at(i).y += B.at(0).y;
  }

  return [clipperNfp];
}

export default function pairData(
  pair: NfpPair,
  env: PairWorkerData
): { value: Array<ArrayPolygon>; numKey: number } {
  if (!pair) {
    return null;
  }

  const searchEdges = env.searchEdges;
  const useHoles = env.useHoles;

  const nfpData = keyToNFPData(pair.numKey, env.rotations);

  let A = rotatePolygon(pair.A, nfpData.at(2));
  let B = rotatePolygon(pair.B, nfpData.at(3));
  let nfp: Array<ArrayPolygon>;
  let i = 0;

  if (nfpData.at(4) === 1) {
    if (isRectangle(A)) {
      nfp = noFitPolygonRectangle(A, B);
    } else {
      nfp = noFitPolygon(A, B, true, searchEdges);
    }

    // ensure all interior NFPs have the same winding direction
    if (nfp && nfp.length > 0) {
      for (i = 0; i < nfp.length; ++i) {
        if (polygonArea(nfp.at(i)) > 0) {
          nfp.at(i).reverse();
        }
      }
    } else {
      // warning on null inner NFP
      // this is not an error, as the part may simply be larger than the bin or otherwise unplaceable due to geometry
      console.log("NFP Warning: ", nfpData);
    }
  } else {
    if (searchEdges) {
      nfp = noFitPolygon(A, B, false, searchEdges);
    } else {
      nfp = minkowskiDifference(A, B);
    }
    // sanity check
    if (!nfp || nfp.length == 0) {
      console.log("NFP Error: ", nfpData);
      console.log("A: ", JSON.stringify(A));
      console.log("B: ", JSON.stringify(B));
      return null;
    }

    for (i = 0; i < nfp.length; ++i) {
      if (!searchEdges || i == 0) {
        // if searchedges is active, only the first NFP is guaranteed to pass sanity check
        if (Math.abs(polygonArea(nfp.at(i))) < Math.abs(polygonArea(A))) {
          console.log(
            "NFP Area Error: ",
            Math.abs(polygonArea(nfp.at(i))),
            nfpData
          );
          console.log("NFP:", JSON.stringify(nfp.at(i)));
          console.log("A: ", JSON.stringify(A));
          console.log("B: ", JSON.stringify(B));
          nfp.splice(i, 1);
          return null;
        }
      }
    }

    if (nfp.length == 0) {
      return null;
    }

    // for outer NFPs, the first is guaranteed to be the largest. Any subsequent NFPs that lie inside the first are holes
    for (i = 0; i < nfp.length; ++i) {
      if (polygonArea(nfp.at(i)) > 0) {
        nfp.at(i).reverse();
      }

      if (
        i > 0 &&
        pointInPolygon(nfp.at(i).at(0), nfp.at(0)) &&
        polygonArea(nfp.at(i)) < 0
      ) {
        nfp.at(i).reverse();
      }
    }

    // generate nfps for children (holes of parts) if any exist
    if (useHoles && A.childNodes && A.childNodes.length > 0) {
      const boundsB = getPolygonBounds(B);
      let boundsA;
      let cnfp;
      let j = 0;

      for (i = 0; i < A.childNodes.length; ++i) {
        boundsA = getPolygonBounds(A.childNodes.at(i));

        // no need to find nfp if B's bounding box is too big
        if (boundsA.width > boundsB.width && boundsA.height > boundsB.height) {
          cnfp = noFitPolygon(A.childNodes.at(i), B, true, searchEdges);
          // ensure all interior NFPs have the same winding direction
          if (cnfp && cnfp.length > 0) {
            for (j = 0; j < cnfp.length; ++j) {
              if (polygonArea(cnfp.at(j)) < 0) {
                cnfp.at(j).reverse();
              }
              nfp.push(cnfp.at(j));
            }
          }
        }
      }
    }
  }

  return { value: nfp, numKey: pair.numKey };
}
