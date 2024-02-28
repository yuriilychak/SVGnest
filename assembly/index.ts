// The entry file of your WebAssembly module.

import Point from "./point";
import Polygon from "./polygon";
import { almostEqual, TOLEARANCE } from "./util";
import Vector from "./vector";

function checkIntersection(a: f32, b: f32, c: f32): boolean {
  const offset: f32 = f32(Math.abs(a - b));

  return offset >= TOLEARANCE && Math.abs(2 * c - a - b) <= offset;
}

// returns the intersection of AB and EF
// or null if there are no intersections or other numerical error
// if the infinite flag is set, AE and EF describe infinite lines without endpoints, they are finite line segments otherwise
function lineIntersect(
  a: Point,
  b: Point,
  e: Point,
  f: Point,
  infinite: boolean = false
): boolean {
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

function segmentDistance(
  a: Point,
  b: Point,
  e: Point,
  f: Point,
  direction: Point
): f64 {
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

function polygonSlideDistance(
  a: Polygon,
  b: Polygon,
  direction: Point,
  ignoreNegative: boolean
): f64 {
  const a1: Point = new Point();
  const a2: Point = new Point();
  const b1: Point = new Point();
  const b2: Point = new Point();
  const dir: Point = Point.normalizeVector(direction);
  const edgeA: Polygon = new Polygon(a.export());
  const edgeB: Polygon = new Polygon(b.export());

  if (!edgeA.isValid || !edgeB.isValid) {
    return Number.NaN;
  }

  edgeA.close();
  edgeB.close();

  const sizeA: u16 = edgeA.length;
  const sizeB: u16 = edgeB.length;
  let result: f64 = Number.NaN;
  let distance: f64 = Number.NaN;
  let i: u16 = 0;
  let j: u16 = 0;

  for (i = 0; i < sizeB - 1; ++i) {
    b1.set(edgeB.at(i) as Point).add(edgeB.offset);
    b2.set(edgeB.at(i + 1) as Point).add(edgeB.offset);

    if (Point.almostEqual(b1, b2)) {
      continue;
    }

    for (j = 0; j < sizeA - 1; ++j) {
      a1.set(edgeA.at(j) as Point).add(edgeA.offset);
      a2.set(edgeA.at(j + 1) as Point).add(edgeA.offset);

      if (Point.almostEqual(a1, a2)) {
        continue; // ignore extremely small lines
      }

      distance = segmentDistance(a1, a2, b1, b2, dir);

      if (
        !Number.isNaN(distance) &&
        (Number.isNaN(result) || distance < result) &&
        (!ignoreNegative || distance > 0 || almostEqual(f32(distance), 0))
      ) {
        result = distance;
      }
    }
  }

  return result;
}

// project each point of B onto A in the given direction, and return the
function polygonProjectionDistance(
  a: Polygon,
  b: Polygon,
  direction: Point
): f64 {
  const edgeA: Polygon = a.clone();
  const edgeB: Polygon = b.clone();
  const p: Point = new Point();
  const s1: Point = new Point();
  const s2: Point = new Point();
  let result: f64 = Number.NaN;
  let distance: f64 = Number.NaN;
  let minProjection: f64 = Number.NaN;
  // close the loop for polygons
  edgeA.close();
  edgeB.close();

  let sizeA: u16 = edgeA.length;
  let sizeB: u16 = edgeB.length;
  let i: u16 = 0;
  let j: u16 = 0;

  for (i = 0; i < sizeB; ++i) {
    // the shortest/most negative projection of B onto A
    minProjection = Number.NaN;
    p.set(edgeB.at(i) as Point).add(edgeB.offset);

    for (j = 0; j < sizeA - 1; ++j) {
      s1.set(edgeA.at(j) as Point).add(edgeA.offset);
      s2.set(edgeA.at(j + 1) as Point).add(edgeA.offset);

      if (
        almostEqual((s2.y - s1.y) * direction.x, (s2.x - s1.x) * direction.y)
      ) {
        continue;
      }

      // project point, ignore edge boundaries
      distance = pointDistance(p, s1, s2, direction);

      if (
        !Number.isNaN(distance) &&
        (Number.isNaN(minProjection) || distance < minProjection)
      ) {
        minProjection = distance;
      }
    }

    if (
      !Number.isNaN(minProjection) &&
      (Number.isNaN(result) || minProjection > result)
    ) {
      result = minProjection;
    }
  }

  return result;
}

// returns an interior NFP for the special case where A is a rectangle
function noFitPolygonRectangle(a: Polygon, b: Polygon): Polygon[] {
  const firstB: Point = b.firstPoint as Point;
  const minA: Point = a.min;
  const maxA: Point = a.max;
  const minB: Point = b.min;
  const maxB: Point = b.max;
  const offsetA: Point = Point.sub(minA, maxA);
  const offsetB: Point = Point.sub(minB, maxB);

  if (offsetB.x > offsetA.x || offsetB.y > offsetA.y) {
    return [];
  }

  const minOffsetAB: Point = Point.from(minA).add(firstB).sub(minB);
  const maxOffsetAB: Point = Point.from(maxA).add(firstB).sub(maxB);
  const polygon = Polygon.fromPoints([
    new Point(minOffsetAB.x, minOffsetAB.y),
    new Point(maxOffsetAB.x, minOffsetAB.y),
    new Point(maxOffsetAB.x, maxOffsetAB.y),
    new Point(minOffsetAB.x, maxOffsetAB.y)
  ]);

  return [polygon];
}

// returns true if point already exists in the given nfp
function inNfp(point: Point, nfp: Polygon[] = []): boolean {
  const rootSize: u16 = u16(nfp.length);

  if (rootSize === 0) {
    return false;
  }

  let nfpCount: u16 = 0;
  let i: u16 = 0;
  let j: u16 = 0;
  let nfpItem: Polygon;

  for (i = 0; i < rootSize; ++i) {
    nfpItem = nfp.at(i);
    nfpCount = nfpItem.length;

    for (j = 0; j < nfpCount; ++j) {
      if (Point.almostEqual(point, nfpItem.at(j) as Point)) {
        return true;
      }
    }
  }

  return false;
}

function checkPolygon(
  polygon1: Polygon,
  polygon2: Polygon,
  point1: Point,
  point2: Point,
  index: u16,
  indexOffset: i16,
  pointOffset: Point
): boolean {
  const size: u16 = polygon1.length;
  let pointIndex: u16 = (index + size + indexOffset) % size;

  if (
    pointIndex === index ||
    Point.almostEqual(
      polygon1.at(pointIndex) as Point,
      polygon1.at(index) as Point
    )
  ) {
    pointIndex = (pointIndex + size + indexOffset) % size;
  }

  point1.set(polygon1.at(pointIndex) as Point).add(pointOffset);

  return polygon2.pointIn(point1) !== polygon2.pointIn(point2);
}

// todo: swap this for a more efficient sweep-line implementation
// returnEdges: if set, return all edges on A that have intersections

function intersect(a: Polygon, b: Polygon): boolean {
  const aSize: u16 = a.length;
  const bSize: u16 = a.length;
  const a1: Point = new Point();
  const a2: Point = new Point();
  const b1: Point = new Point();
  const b2: Point = new Point();
  const point: Point = new Point();
  let i: u16 = 0;
  let j: u16 = 0;

  for (i = 0; i < aSize - 1; ++i) {
    a1.set(a.at(i) as Point).add(a.offset);
    a2.set(a.at(i + 1) as Point).add(a.offset);

    for (j = 0; j < bSize - 1; ++j) {
      b1.set(b.at(j) as Point).add(b.offset);
      b2.set(b.at(j + 1) as Point).add(b.offset);

      if (b1.onSegment(a1, a2) || b1.almostEqual(a1)) {
        // if a point is on a segment, it could intersect or it could not. Check via the neighboring points
        if (checkPolygon(b, a, point, b2, j, -1, b.offset)) {
          return true;
        } else {
          continue;
        }
      }

      if (b2.onSegment(a1, a2) || b2.almostEqual(a2)) {
        // if a point is on a segment, it could intersect or it could not. Check via the neighboring points
        if (checkPolygon(b, a, point, b1, j + 1, 1, b.offset)) {
          return true;
        } else {
          continue;
        }
      }

      if (a1.onSegment(b1, b2) || a1.almostEqual(b2)) {
        // if a point is on a segment, it could intersect or it could not. Check via the neighboring points
        if (checkPolygon(a, b, point, a2, i, -1, a.offset)) {
          return true;
        } else {
          continue;
        }
      }

      if (a2.onSegment(b1, b2) || a2.almostEqual(b1)) {
        // if a point is on a segment, it could intersect or it could not. Check via the neighboring points
        if (checkPolygon(a, b, point, a1, i + 1, 1, a.offset)) {
          return true;
        } else {
          continue;
        }
      }

      if (lineIntersect(b1, b2, a1, a2)) {
        return true;
      }
    }
  }

  return false;
}

// searches for an arrangement of A and B such that they do not overlap
// if an NFP is given, only search for startpoints that have not already been traversed in the given NFP
function searchStartPoint(
  a: Polygon,
  b: Polygon,
  inside: boolean,
  nfp: Polygon[] = []
): Point | null {
  // clone arrays
  const edgeA: Polygon = a.clone();
  const edgeB: Polygon = b.clone();
  const offset: Point = new Point();
  const point: Point = new Point();
  let projectionDistance1: f64 = 0;
  let projectionDistance2: f64 = 0;
  let vectorDistance: f64 = 0;
  let distance: f64 = 0;

  // close the loop for polygons
  edgeA.close();
  edgeB.close();

  const sizeA: u16 = edgeA.length;
  const sizeB: u16 = edgeB.length;
  let i: u16 = 0;
  let j: u16 = 0;
  let k: u16 = 0;
  let pointA1: Point;
  let pointA2: Point;
  let pointB1: Point;
  let pointB2: Point;

  for (i = 0; i < sizeA - 1; ++i) {
    pointA1 = edgeA.at(i) as Point;
    pointA2 = edgeA.at(i + 1) as Point;
    if (!pointA1.marked) {
      pointA1.marked = true;
      for (j = 0; j < sizeB; ++j) {
        pointB1 = edgeB.at(j) as Point;
        offset.set(pointA1).sub(pointB1);
        edgeB.offset.x = offset.x;
        edgeB.offset.y = offset.y;

        for (k = 0; k < sizeB; ++k) {
          pointB2 = edgeB.at(k) as Point;
          if (edgeA.pointIn(point.set(pointB2).add(offset))) {
            // A and B are the same
            return null;
          }
        }

        if (!inside && !intersect(edgeA, edgeB) && !inNfp(offset, nfp)) {
          return offset.clone();
        }
        // slide B along vector
        point.set(pointA2).sub(pointA1);
        projectionDistance1 = polygonProjectionDistance(edgeA, edgeB, point);
        projectionDistance2 = polygonProjectionDistance(
          edgeB,
          edgeA,
          Point.reverse(point)
        );

        // todo: clean this up
        if (
          Number.isNaN(projectionDistance1) &&
          Number.isNaN(projectionDistance2)
        ) {
          continue;
        }

        projectionDistance1 = Number.isNaN(projectionDistance1)
          ? projectionDistance2
          : projectionDistance1;

        projectionDistance2 = Number.isNaN(projectionDistance2)
          ? projectionDistance1
          : projectionDistance2;

        distance = Math.min(projectionDistance1, projectionDistance2);

        // only slide until no longer negative
        // todo: clean this up
        if (Math.abs(distance) < TOLEARANCE || distance <= 0) {
          continue;
        }

        vectorDistance = point.length;

        if (distance - vectorDistance < -TOLEARANCE) {
          point.scale(f32(distance / vectorDistance));
        }

        offset.add(point);
        edgeB.offset.x = offset.x;
        edgeB.offset.y = offset.y;

        for (k = 0; k < sizeB; ++k) {
          pointB2 = edgeB.at(k) as Point;
          if (edgeA.pointIn(point.set(pointB2).add(offset))) {
            break;
          }

          if (!inside && !intersect(edgeA, edgeB) && !inNfp(offset, nfp)) {
            return offset.clone();
          }
        }
      }
    }

    return null;
  }

  return null;
}

// given a static polygon A and a movable polygon B, compute a no fit polygon by orbiting B about A
// if the inside flag is set, B is orbited inside of A rather than outside
// if the searchEdges flag is set, all edges of A are explored for NFPs - multiple
function noFitPolygonsInner(
  a: Polygon,
  b: Polygon,
  inside: boolean,
  searchEdges: boolean
): Polygon[] {
  if (!a.isValid || !b.isValid) {
    return [];
  }

  a.offset.x = 0;
  a.offset.y = 0;

  const sizeA: u16 = a.length;
  const sizeB: u16 = b.length;
  let i: u16 = 0;
  let j: u16 = 0;
  let minA: f32 = (a.firstPoint as Point).y;
  let minAIndex: u16 = 0;
  let maxB: f32 = (b.firstPoint as Point).y;
  let maxBIndex: u16 = 0;
  let point: Point;

  for (i = 1; i < sizeA; ++i) {
    point = a.at(i) as Point;
    point.marked = false;

    if (point.y < minA) {
      minA = point.y;
      minAIndex = i;
    }
  }

  for (i = 1; i < sizeB; ++i) {
    point = b.at(i) as Point;
    point.marked = false;

    if (point.y > maxB) {
      maxB = point.y;
      maxBIndex = i;
    }
  }

  let startPoint: Point | null = !inside
    ? // shift B such that the bottom-most point of B is at the top-most point of A. This guarantees an initial placement with no intersections
      Point.sub(b.at(maxBIndex) as Point, a.at(minAIndex) as Point)
    : // no reliable heuristic for inside
      searchStartPoint(a, b, true);
  let reference: Point = new Point();
  let start: Point = new Point();
  let offset: Point = new Point();
  const point1: Point = new Point();
  const point2: Point = new Point();
  const point3: Point = new Point();
  const prevUnit: Point = new Point();
  const unitV: Point = new Point();
  const nfpList: Array<Polygon> = [];
  const sumSize: u16 = sizeA + sizeB;
  let counter: u16 = 0;
  // maintain a list of touching points/edges
  let touching: Uint16Array[];
  let vectors: Vector[];
  let looped: boolean = false;
  let prevVector: Vector | null = null;
  let nfp: Point[] | null = null;
  let nfpSize: u16 = 0;
  let vLength2: f32 = 0;
  let prevAIndex: u16 = 0;
  let nextAIndex: u16 = 0;
  let prevBIndex: u16 = 0;
  let nextBIndex: u16 = 0;
  let distance: f64 = 0;
  let maxDistance: f32 = 0;
  let translate: Vector | null = null;
  let prevA: Point;
  let nextA: Point;
  let prevB: Point;
  let nextB: Point;
  let vertexA: Point;
  let vertexB: Point;
  let touchingItem: Uint16Array;
  let touchingSize: u16;
  let vectorCount: u16;

  while (startPoint !== null) {
    offset.set(startPoint);
    b.offset.x = offset.x;
    b.offset.y = offset.y;

    prevVector = null; // keep track of previous vector
    nfp = [];
    nfp.push(Point.add(b.firstPoint as Point, startPoint));

    reference.set(b.firstPoint as Point).add(startPoint);
    start.set(reference);
    counter = 0;

    while (counter < 10 * sumSize) {
      // sanity check, prevent infinite loop
      touching = [];
      // find touching vertices/edges
      for (i = 0; i < sizeA; ++i) {
        for (j = 0; j < sizeB; ++j) {
          point1.set(b.at(j) as Point).add(offset);
          point2.set(b.at((j + 1) % sizeB) as Point).add(offset);
          point3.set(a.at(i) as Point);

          if (Point.almostEqual(a.at(i) as Point, point1)) {
            touchingItem = new Uint16Array(3);
            touchingItem[0] = 0; // type
            touchingItem[1] = i; // A
            touchingItem[2] = j; // B
            touching.push(touchingItem);
          } else if (
            point1.onSegment(a.at(i) as Point, a.at((i + 1) % sizeA) as Point)
          ) {
            touchingItem = new Uint16Array(3);
            touchingItem[0] = 1; // type
            touchingItem[1] = (i + 1) % sizeA; // A
            touchingItem[2] = j; // B
            touching.push(touchingItem);
          } else if (point3.onSegment(point1, point2)) {
            touchingItem = new Uint16Array(3);
            touchingItem[0] = 2; // type
            touchingItem[1] = i; // A
            touchingItem[2] = (j + 1) % sizeB; // B
            touching.push(touchingItem);
          }
        }
      }

      // generate translation vectors from touching vertices/edges
      vectors = [];
      touchingSize = u16(touching.length);

      for (i = 0; i < touchingSize; ++i) {
        touchingItem = touching.at(i);
        vertexA = a.at(touchingItem[1]) as Point;
        vertexA.marked = true;

        // adjacent A vertices
        prevAIndex = (touchingItem[1] + sizeA - 1) % sizeA; // loop
        nextAIndex = (touchingItem[1] + 1) % sizeA; // loop

        prevA = a.at(prevAIndex) as Point;
        nextA = a.at(nextAIndex) as Point;

        // adjacent B vertices
        vertexB = b.at(touchingItem[2]) as Point;
        prevBIndex = (touchingItem[2] + sizeB - 1) % sizeB;
        nextBIndex = (touchingItem[2] + 1) % sizeB;

        prevB = b.at(prevBIndex) as Point;
        nextB = b.at(nextBIndex) as Point;

        if (touchingItem[0] == 0) {
          // B vectors need to be inverted
          vectors.push(new Vector(Point.sub(vertexA, prevA), vertexA, prevA));
          vectors.push(new Vector(Point.sub(vertexA, nextA), vertexA, nextA));
          vectors.push(new Vector(Point.sub(prevB, vertexB), prevB, vertexB));
          vectors.push(new Vector(Point.sub(nextB, vertexB), nextB, vertexB));
        } else if (touchingItem[0] == 1) {
          vectors.push(
            new Vector(Point.sub(vertexB, vertexA).sub(offset), prevA, vertexA)
          );
          vectors.push(
            new Vector(Point.sub(vertexB, prevA).sub(offset), vertexA, prevA)
          );
        } else if (touchingItem[0] == 2) {
          vectors.push(
            new Vector(Point.sub(vertexB, vertexA).sub(offset), prevB, vertexB)
          );
          vectors.push(
            new Vector(Point.sub(prevB, vertexA).sub(offset), vertexB, prevB)
          );
        }
      }

      // todo: there should be a faster way to reject vectors that will cause immediate intersection. For now just check them all

      translate = null;
      maxDistance = 0;
      vectorCount = u16(vectors.length);

      for (i = 0; i < vectorCount; ++i) {
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

        if (
          Number.isNaN(distance) ||
          distance * distance > point1.squareLength
        ) {
          distance = point1.length;
        }

        if (!Number.isNaN(distance) && distance > maxDistance) {
          maxDistance = f32(distance);
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
      vLength2 = translate.squareLength;

      if (
        maxDistance * maxDistance < vLength2 &&
        !almostEqual(maxDistance * maxDistance, vLength2)
      ) {
        translate.scale(f32(Math.sqrt((maxDistance * maxDistance) / vLength2)));
      }

      reference.add(translate);

      if (reference.almostEqual(start)) {
        // we've made a full loop
        break;
      }

      // if A and B start on a touching horizontal line, the end point may not be the start point
      looped = false;

      nfpSize = u16(nfp.length);

      if (nfpSize > 0) {
        for (i = 0; i < nfpSize - 1; ++i) {
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
      b.offset.x = offset.x;
      b.offset.y = offset.y;

      ++counter;
    }

    if (nfpSize > 0) {
      nfpList.push(Polygon.fromPoints(nfp as Point[]));
    }

    if (!searchEdges) {
      // only get outer NFP or first inner NFP
      break;
    }

    startPoint = searchStartPoint(a, b, inside, nfpList);
  }

  return nfpList;
}

export function getNfp(
  dataA: Float32Array,
  dataB: Float32Array,
  searchEdges: boolean
): Float32Array {
  const a: Polygon = new Polygon(dataA);
  const b: Polygon = new Polygon(dataB);
  const result: Polygon[] = a.isRectangle
    ? noFitPolygonRectangle(a, b)
    : noFitPolygonsInner(a, b, true, searchEdges);
  const nfpCount: u16 = u16(result.length);
  let i: u16 = 0;

  for (i = 0; i < nfpCount; ++i) {
    if (result.at(i).area > 0) {
      result.at(i).reverse();
    }
  }

  return Polygon.exportPolygons(result);
}

// given a static polygon A and a movable polygon B, compute a no fit polygon by orbiting B about A
// if the inside flag is set, B is orbited inside of A rather than outside
// if the searchEdges flag is set, all edges of A are explored for NFPs - multiple
export function noFitPolygon(
  a: Float32Array,
  b: Float32Array,
  inside: boolean,
  searchEdges: boolean
): Float32Array {
  return Polygon.exportPolygons(
    noFitPolygonsInner(new Polygon(a), new Polygon(b), inside, searchEdges)
  );
}
