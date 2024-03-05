/*!
 * General purpose geometry functions for polygon/Bezier calculations
 * Copyright 2015 Jack Qiao
 * Licensed under the MIT license
 */

import Point from "../../point";
import { IPolygon, IPoint } from "../../interfaces";
import Vector from "../../vector";

// private shared variables/methods

// floating point comparison tolerance
const TOLERANCE: number = Math.pow(10, -9); // Floating point error is likely to be above 1 epsilon

enum TripleStatus {
  True = 1,
  False = 0,
  Error = -1
}

function almostEqual(
  a: number,
  b: number = 0,
  tolerance: number = TOLERANCE
): boolean {
  return Math.abs(a - b) < tolerance;
}

// returns the intersection of AB and EF
// or null if there are no intersections or other numerical error
// if the infinite flag is set, AE and EF describe infinite lines without endpoints, they are finite line segments otherwise
function lineIntersect(a: Point, b: Point, e: Point, f: Point): boolean {
  const diffAB: Point = Point.sub(a, b);
  const diffEF: Point = Point.sub(e, f);
  const denom: number = diffEF.cross(diffAB);

  const crossAB: number = a.cross(b);
  const crossEF: number = e.cross(f);

  diffAB.scale(crossEF);
  diffEF.scale(crossAB);

  const point: Point = Point.from(diffEF)
    .sub(diffAB)
    .scale(1 / denom);

  return point.checkIntersect(a, b) && point.checkIntersect(e, f);
}

// return true if point is in the polygon, false if outside, and null if exactly on a point or edge
export function pointInPolygon(point: Point, polygon: IPolygon): TripleStatus {
  if (!polygon || polygon.length < 3) {
    return TripleStatus.Error;
  }

  if (!polygon.offset) {
    polygon.offset = Point.empty();
  }

  const currentPoint: Point = Point.empty();
  const prevPoint: Point = Point.empty();
  const neighboarDiff: Point = Point.empty();
  const pointDiff: Point = Point.empty();
  const pointCount: number = polygon.length;
  let inside: boolean = false;
  let i: number = 0;

  for (i = 0; i < pointCount; ++i) {
    currentPoint.set(polygon[i]).add(polygon.offset);
    prevPoint
      .set(polygon[(i + pointCount - 1) % pointCount])
      .add(polygon.offset);

    if (
      // no result
      point.almostEqual(currentPoint) ||
      // exactly on the segment
      point.onSegment(currentPoint, prevPoint)
    ) {
      return TripleStatus.Error; // no result
    }

    if (currentPoint.almostEqual(prevPoint)) {
      // ignore very small lines
      continue;
    }

    neighboarDiff.set(prevPoint).sub(currentPoint);
    pointDiff.set(point).sub(currentPoint);

    if (
      0 > pointDiff.y != prevPoint.y > point.y &&
      neighboarDiff.cross(pointDiff) / neighboarDiff.y < 0
    ) {
      inside = !inside;
    }
  }

  return inside ? TripleStatus.True : TripleStatus.False;
}

function updateIntersectPoints(
  polygon: IPolygon,
  offset: Point,
  points: Point[],
  index: number
): void {
  const pointCount: number = polygon.length;
  const currentPoint: IPoint = polygon.at(index);
  const nextPoint: IPoint = polygon.at(index + 1);

  // go even further back if we happen to hit on a loop end point
  const prevOffset: number = Point.almostEqual(
    polygon.at((index + pointCount - 1) % pointCount),
    currentPoint
  )
    ? 2
    : 1;

  // go even further forward if we happen to hit on a loop end point
  const nextOffset: number = Point.almostEqual(
    polygon.at((index + 2) % pointCount),
    nextPoint
  )
    ? 3
    : 2;

  points[0]
    .set(polygon.at((index + pointCount - prevOffset) % pointCount))
    .add(offset);
  points[1].set(currentPoint).add(offset);
  points[2].set(nextPoint).add(offset);
  points[3].set(polygon.at((index + nextOffset) % pointCount)).add(offset);
}

function checkIntersect(
  a: IPolygon,
  b: IPolygon,
  pointsA: Point[],
  pointsB: Point[],
  indexData: number
): TripleStatus {
  const inputIndex: number = indexData >> 1;
  const outputIndex: number = indexData - (inputIndex << 1);
  const isReversed: boolean = inputIndex !== outputIndex;
  const inputPoints: Point[] = isReversed ? pointsA : pointsB;
  const outputPoints: Point[] = isReversed ? pointsB : pointsA;
  const polygon: IPolygon = isReversed ? b : a;
  const checkPoint: Point = inputPoints.at(inputIndex + 1);

  if (
    checkPoint.onSegment(outputPoints.at(1), outputPoints.at(2)) ||
    checkPoint.almostEqual(outputPoints.at(outputIndex + 1))
  ) {
    // if a point is on a segment, it could intersect or it could not. Check via the neighboring points
    const point1In: TripleStatus = pointInPolygon(
      inputPoints.at(inputIndex),
      polygon
    );
    const point2In: TripleStatus = pointInPolygon(
      inputPoints.at(2 + inputIndex),
      polygon
    );
    const condition: boolean =
      (point1In === TripleStatus.True && point2In === TripleStatus.False) ||
      (point1In === TripleStatus.False && point2In === TripleStatus.True);

    return condition ? TripleStatus.True : TripleStatus.False;
  }

  return TripleStatus.Error;
}

// todo: swap this for a more efficient sweep-line implementation
// returnEdges: if set, return all edges on A that have intersections
function intersect(a: IPolygon, b: IPolygon): boolean {
  const pointsA: Point[] = [
    Point.empty(),
    Point.empty(),
    Point.empty(),
    Point.empty()
  ];
  const pointsB: Point[] = [
    Point.empty(),
    Point.empty(),
    Point.empty(),
    Point.empty()
  ];
  const sizeA: number = a.length;
  const sizeB: number = b.length;
  let i: number = 0;
  let j: number = 0;
  let k: number = 0;
  let condition: number = 0;

  for (i = 0; i < sizeA - 1; ++i) {
    updateIntersectPoints(a, Point.from(a.offset), pointsA, i);

    for (j = 0; j < sizeB - 1; ++j) {
      updateIntersectPoints(b, Point.from(b.offset), pointsB, j);

      for (k = 0; k < 4; ++k) {
        condition = checkIntersect(a, b, pointsA, pointsB, k);

        if (condition === 1) {
          return true;
        } else if (condition === 0) {
          break;
        }
      }

      if (condition === 0) {
        continue;
      }

      if (
        lineIntersect(
          pointsB.at(1),
          pointsB.at(2),
          pointsA.at(1),
          pointsA.at(2)
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function pointDistance(
  point: Point,
  segment1: Point,
  segment2: Point,
  normal: Point,
  infinite: boolean
): number {
  const innerNormal: Point = Point.normalize(normal);
  const dir: Point = Point.normal(innerNormal);
  const pointDot: number = point.dot(dir);
  const pointDotNorm: number = point.dot(innerNormal);
  const segment1Diff: number = pointDot - segment1.dot(dir);
  const segment2Diff: number = pointDot - segment2.dot(dir);
  const segment1DotDiff: number = pointDotNorm - segment1.dot(innerNormal);
  const segment2DotDiff: number = pointDotNorm - segment2.dot(innerNormal);

  if (!infinite) {
    if (
      !(
        Math.max(segment1Diff, segment2Diff) >= TOLERANCE &&
        Math.min(segment1Diff, segment2Diff) <= -TOLERANCE
      )
    ) {
      return Number.NaN; // dot doesn't collide with segment, or lies directly on the vertex
    }

    if (almostEqual(segment1Diff) && almostEqual(segment2Diff)) {
      let result: number = Math.min(segment1DotDiff, segment2DotDiff);

      if (result > 0) {
        return result;
      }

      result = Math.max(segment1DotDiff, segment2DotDiff);
      if (result < 0) {
        return result;
      }
    }
  }

  return (
    (segment2DotDiff * segment1Diff - segment1DotDiff * segment2Diff) /
    (segment2Diff - segment1Diff)
  );
}

function getPointDistance(
  point1: Point,
  point2: Point,
  point3: Point,
  point4: Point,
  direction: Point,
  overlap: number
): number {
  let result: number = pointDistance(point1, point3, point4, direction, false);

  if (!Number.isNaN(result) && almostEqual(result, 0)) {
    //  A currently touches EF, but AB is moving away from EF
    const distance: number = pointDistance(
      point2,
      point3,
      point4,
      direction,
      true
    );

    if (distance < 0 || almostEqual(distance * overlap)) {
      return Number.NaN;
    }
  }

  return result;
}

function segmentDistance(
  a: Point,
  b: Point,
  e: Point,
  f: Point,
  direction: Point
): number {
  const normal: Point = Point.normal(direction);
  const reverse: Point = Point.reverse(direction);

  const dotA: number = a.dot(normal);
  const dotB: number = b.dot(normal);
  const dotE: number = e.dot(normal);
  const dotF: number = f.dot(normal);

  const crossA: number = a.dot(direction);
  const crossB: number = b.dot(direction);
  const crossE: number = e.dot(direction);
  const crossF: number = f.dot(direction);

  const minAB: number = Math.min(dotA, dotB);
  const maxAB: number = Math.max(dotA, dotB);
  const minEF: number = Math.min(dotE, dotF);
  const maxEF: number = Math.max(dotE, dotF);

  if (
    // segments that will merely touch at one point
    almostEqual(maxAB, minEF) ||
    almostEqual(minAB, maxEF) ||
    // segments miss eachother completely
    maxAB < minEF ||
    minAB > maxEF
  ) {
    return Number.NaN;
  }

  const overlap: number =
    (maxAB > maxEF && minAB < minEF) || (maxEF > maxAB && minEF < minAB)
      ? 1
      : (Math.min(maxAB, maxEF) - Math.max(minAB, minEF)) /
        (Math.max(maxAB, maxEF) - Math.min(minAB, minEF));

  const diffAB: Point = Point.sub(a, b);
  const diffEF: Point = Point.sub(e, f);
  const diffAE: Point = Point.sub(a, e);
  const diffAF: Point = Point.sub(a, f);
  const crossABE: number = diffAE.cross(diffAB);
  const crossABF: number = diffAF.cross(diffAB);

  // lines are colinear
  if (almostEqual(crossABE) && almostEqual(crossABF)) {
    const normAB: Point = Point.normal(diffAB).normalize();
    const normEF: Point = Point.normal(diffEF).normalize();

    // segment normals must point in opposite directions
    if (almostEqual(normAB.cross(normEF)) && normAB.dot(normEF) < 0) {
      // normal of AB segment must point in same direction as given direction vector
      const normDot: number = normAB.dot(direction);
      // the segments merely slide along eachother
      if (almostEqual(normDot)) {
        return Number.NaN;
      }

      if (normDot < 0) {
        return 0;
      }
    }
    return Number.NaN;
  }

  const distances: number[] = [];
  let distance: number;

  // coincident points
  if (almostEqual(dotA, dotE)) {
    distances.push(crossA - crossE);
  } else if (almostEqual(dotA, dotF)) {
    distances.push(crossA - crossF);
  } else if (dotA > minEF && dotA < maxEF) {
    distance = getPointDistance(a, b, e, f, reverse, overlap);

    if (!Number.isNaN(distance)) {
      distances.push(distance);
    }
  }

  if (almostEqual(dotB, dotE)) {
    distances.push(crossB - crossE);
  } else if (almostEqual(dotB, dotF)) {
    distances.push(crossB - crossF);
  } else if (dotB > minEF && dotB < maxEF) {
    distance = getPointDistance(b, a, e, f, reverse, overlap);

    if (!Number.isNaN(distance)) {
      distances.push(distance);
    }
  }

  if (dotE > minAB && dotE < maxAB) {
    distance = getPointDistance(e, f, a, b, direction, overlap);

    if (!Number.isNaN(distance)) {
      distances.push(distance);
    }
  }

  if (dotF > minAB && dotF < maxAB) {
    distance = getPointDistance(f, e, a, b, direction, overlap);

    if (!Number.isNaN(distance)) {
      distances.push(distance);
    }
  }

  if (distances.length == 0) {
    return Number.NaN;
  }

  let i: number = 0;
  const distanceCount: number = distances.length;
  let result: number = distances[0];

  for (i = 1; i < distanceCount; ++i) {
    result = Math.min(result, distances.at(i));
  }

  return result;
}

function polygonSlideDistance(
  a: IPolygon,
  b: IPolygon,
  direction: Point
): number {
  const sizeA: number = a.length;
  const sizeB: number = b.length;
  const lastAIndex: number = a.at(0) !== a.at(sizeA - 1) ? sizeA : sizeA - 1;
  const lastBIndex: number = b.at(0) !== b.at(sizeB - 1) ? sizeB : sizeB - 1;
  const a1: Point = Point.empty();
  const a2: Point = Point.empty();
  const b1: Point = Point.empty();
  const b2: Point = Point.empty();
  const dir: Point = Point.normalize(direction);
  let i: number = 0;
  let j: number = 0;
  let result: number = Number.NaN;
  let distance: number = 0;

  for (i = 0; i < lastBIndex; ++i) {
    b1.set(b.at(i)).add(b.offset);
    b2.set(b.at((i + 1) % sizeB)).add(b.offset);

    if (b1.almostEqual(b2)) {
      continue; // ignore extremely small lines
    }

    for (j = 0; j < lastAIndex; ++j) {
      a1.set(a.at(j)).add(a.offset);
      a2.set(a.at((j + 1) % sizeA)).add(a.offset);

      if (a1.almostEqual(a2)) {
        continue; // ignore extremely small lines
      }

      distance = segmentDistance(a1, a2, b1, b2, dir);

      if (
        !Number.isNaN(distance) &&
        (Number.isNaN(result) || distance < result)
      ) {
        if (distance > 0 || almostEqual(distance, 0)) {
          result = distance;
        }
      }
    }
  }
  return result;
}

// project each point of B onto A in the given direction, and return the
function polygonProjectionDistance(
  a: IPolygon,
  b: IPolygon,
  direction: IPoint
): number {
  const sizeA: number = a.length;
  const sizeB: number = b.length;
  const lastAIndex: number = a.at(0) !== a.at(sizeA - 1) ? sizeA : sizeA - 1;
  const segmentDiff: Point = Point.empty();
  const point: Point = Point.empty();
  const s1: Point = Point.empty();
  const s2: Point = Point.empty();
  let i: number = 0;
  let j: number = 0;
  let minProjection: number = Number.NaN;
  let result: number = Number.NaN;
  let distance: number;

  for (i = 0; i < sizeB; ++i) {
    // the shortest/most negative projection of B onto A
    minProjection = Number.NaN;
    point.set(b.at(i)).add(b.offset);

    for (j = 0; j < lastAIndex; ++j) {
      s1.set(a.at(j)).add(a.offset);
      s2.set(a.at((j + 1) % sizeA)).add(a.offset);

      segmentDiff.set(s2).sub(s1);

      if (almostEqual(segmentDiff.cross(direction))) {
        continue;
      }

      // project point, ignore edge boundaries
      distance = pointDistance(point, s1, s2, Point.from(direction), false);

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

// returns true if point already exists in the given nfp
function inNfp(p: IPoint, nfp: IPolygon[]) {
  if (nfp.length == 0) {
    return false;
  }

  let i: number = 0;
  let j: number = 0;
  let polygon: IPolygon;

  for (i = 0; i < nfp.length; ++i) {
    polygon = nfp.at(i);
    for (j = 0; j < nfp[i].length; ++j) {
      if (Point.almostEqual(p, polygon.at(j))) {
        return true;
      }
    }
  }

  return false;
}
// searches for an arrangement of A and B such that they do not overlap
// if an NFP is given, only search for startpoints that have not already been traversed in the given NFP
function searchStartPoint(
  a: IPolygon,
  b: IPolygon,
  inside: boolean,
  nfp: IPolygon[] = []
): Point | null {
  const sizeA: number = a.length;
  const iterationCountA: number =
    a.at(0) !== a.at(sizeA - 1) ? sizeA : sizeA - 1;
  // clone arrays
  a = a.slice(0) as IPolygon;
  b = b.slice(0) as IPolygon;

  // close the loop for polygons
  if (a[0] != a[a.length - 1]) {
    a.push(a[0]);
  }

  if (b[0] != b[b.length - 1]) {
    b.push(b[0]);
  }

  a.offset = Point.empty();
  b.offset = Point.empty();

  const vector: Point = Point.empty();
  const vectorReversed: Point = Point.empty();
  const startPoint: Point = Point.empty();
  const tmpPoint: Point = Point.empty();
  let i: number = 0;
  let j: number = 0;
  let k: number = 0;
  let distance1: number = 0;
  let distance2: number = 0;
  let distance: number = 0;
  let vectorSquareLength: number = 0;
  let insideB: TripleStatus = TripleStatus.Error;
  let inPoly: TripleStatus = TripleStatus.Error;
  let currentA: IPoint;

  for (i = 0; i < iterationCountA; ++i) {
    currentA = a.at(i);

    if (currentA.marked) {
      continue;
    }

    vector.set(a.at((i + 1) % sizeA)).sub(currentA);
    vectorReversed.set(vector).reverse();
    currentA.marked = true;

    for (j = 0; j < b.length; ++j) {
      (b.offset as Point).set(currentA).sub(b.at(j));

      insideB = TripleStatus.Error;

      for (k = 0; k < b.length; ++k) {
        tmpPoint.set(b.at(k)).add(b.offset);
        inPoly = pointInPolygon(tmpPoint, a);

        if (inPoly !== TripleStatus.Error) {
          insideB = inPoly;
          break;
        }
      }

      if (insideB === TripleStatus.Error) {
        // A and B are the same
        return null;
      }

      startPoint.set(b.offset);

      if (
        ((insideB && inside) || (!insideB && !inside)) &&
        !intersect(a, b) &&
        !inNfp(startPoint, nfp)
      ) {
        return startPoint;
      }

      // slide B along vector
      distance1 = polygonProjectionDistance(a, b, vector);
      distance2 = polygonProjectionDistance(b, a, vectorReversed);

      // todo: clean this up
      if (Number.isNaN(distance1) && Number.isNaN(distance2)) {
        // nothin
        distance = Number.NaN;
      } else if (Number.isNaN(distance1)) {
        distance = distance2;
      } else if (Number.isNaN(distance2)) {
        distance = distance1;
      } else {
        distance = Math.min(distance1, distance2);
      }

      // only slide until no longer negative
      // todo: clean this up
      if (Number.isNaN(distance) || almostEqual(distance) || distance <= 0) {
        continue;
      }

      vectorSquareLength = vector.squareLength;

      if (
        distance * distance < vectorSquareLength &&
        !almostEqual(distance * distance, vectorSquareLength)
      ) {
        vector.normalize(distance);
      }

      (b.offset as Point).add(vector);

      for (k = 0; k < b.length; ++k) {
        tmpPoint.set(b.at(k)).add(b.offset);
        inPoly = pointInPolygon(tmpPoint, a);

        if (inPoly !== TripleStatus.Error) {
          insideB = inPoly;
          break;
        }
      }

      startPoint.set(b.offset);

      if (
        ((insideB && inside) || (!insideB && !inside)) &&
        !intersect(a, b) &&
        !inNfp(startPoint, nfp)
      ) {
        return startPoint;
      }
    }
  }

  return null;
}

function getTouch(type: number, a: number, b: number): Int16Array {
  const result = new Int16Array(3);
  result[0] = type;
  result[1] = a;
  result[2] = b;

  return result;
}
// given a static polygon A and a movable polygon B, compute a no fit polygon by orbiting B about A
// if the inside flag is set, B is orbited inside of A rather than outside
// if the searchEdges flag is set, all edges of A are explored for NFPs - multiple
export function noFitPolygon(
  a: IPolygon,
  b: IPolygon,
  inside: boolean,
  searchEdges: boolean
): IPolygon[] {
  const sizeA: number = a.length;
  const sizeB: number = b.length;

  if (sizeA < 3 || sizeB < 3) {
    return [];
  }

  a.offset = Point.empty();
  b.offset = Point.empty();

  let i: number = 0;
  let j: number = 0;

  let minA: number = a.at(0).y;
  let minIndexA = 0;

  let maxB: number = b.at(0).y;
  let maxIndexB: number = 0;

  for (i = 1; i < sizeA; ++i) {
    a.at(i).marked = false;
    if (a.at(i).y < minA) {
      minA = a.at(i).y;
      minIndexA = i;
    }
  }

  for (i = 1; i < sizeB; ++i) {
    b.at(i).marked = false;
    if (b.at(i).y > maxB) {
      maxB = b.at(i).y;
      maxIndexB = i;
    }
  }

  const result: IPolygon[] = [];
  const vectorNormal: Point = Point.empty();
  const prevVectorNormal: Point = Point.empty();
  const reference: Point = Point.empty();
  const start: Point = Point.empty();
  const localA: Point = Point.empty();
  const localPrimaryB: Point = Point.empty();
  const localSecondaryB: Point = Point.empty();
  const counterCondition: number = 10 * (sizeA + sizeB);
  let vectors: Vector[];
  let vector: Vector;
  let translate: Vector | null = null;
  let nfp: IPoint[] = [];
  let prevVector: Vector | null = null;
  let vectorLength: number = 0;
  let looped: boolean = false;
  let distance: number = Number.NaN;
  let maxDistance: number = 0;
  let counter: number = 0;
  let currentA: IPoint;
  let currentB: IPoint;
  let nextA: IPoint;
  let prevA: IPoint;
  let nextB: IPoint;
  let prevB: IPoint;
  let touches: Int16Array[];
  let touch: Int16Array;
  let indexA: number = 0;
  let indexB: number = 0;
  let vectorCount: number = 0;
  let nfpPointCount: number = 0;
  let startPoint: IPoint | null = !inside
    ? // shift B such that the bottom-most point of B is at the top-most point of A. This guarantees an initial placement with no intersections
      Point.sub(b.at(maxIndexB), a.at(minIndexA))
    : // no reliable heuristic for inside
      searchStartPoint(a, b, true);

  while (startPoint !== null) {
    (b.offset as Point).set(startPoint);

    // maintain a list of touching points/edges

    localPrimaryB.set(b.at(0)).add(startPoint);
    prevVector = null; // keep track of previous vector
    nfp = [{ x: localPrimaryB.x, y: localPrimaryB.y }];

    reference.set(b.at(0)).add(startPoint);
    start.set(reference);
    counter = 0;

    while (counter < counterCondition) {
      // sanity check, prevent infinite loop
      touches = [];
      // find touching vertices/edges
      for (i = 0; i < sizeA; ++i) {
        currentA = a.at(i);
        nextA = a.at((i + 1) % sizeA);
        localA.set(currentA);

        for (j = 0; j < sizeB; ++j) {
          localPrimaryB.set(b.at(j)).add(b.offset);
          localSecondaryB.set(b.at((j + 1) % sizeB)).add(b.offset);

          if (localPrimaryB.almostEqual(currentA)) {
            touches.push(getTouch(0, i, j));
          } else if (localPrimaryB.onSegment(currentA, nextA)) {
            touches.push(getTouch(1, (i + 1) % sizeA, j));
          } else if (localA.onSegment(localPrimaryB, localSecondaryB)) {
            touches.push(getTouch(2, i, (j + 1) % sizeB));
          }
        }
      }

      // generate translation vectors from touching vertices/edges
      vectors = [];

      for (i = 0; i < touches.length; ++i) {
        touch = touches.at(i);
        indexA = touch.at(1);
        indexB = touch.at(2);

        currentA = a.at(indexA);
        prevA = a.at((indexA + sizeA - 1) % sizeA);
        nextA = a.at((indexA + 1) % sizeA);

        // adjacent B vertices
        currentB = b.at(indexB);
        prevB = b.at((indexB + sizeB - 1) % sizeB);
        nextB = b.at((indexB + 1) % sizeB);

        localPrimaryB.set(currentB).add(b.offset);
        localSecondaryB.set(prevB).add(b.offset);

        currentA.marked = true;

        switch (touch[0]) {
          case 0:
            vectors.push(
              new Vector(Point.sub(currentA, prevA), currentA, prevA)
            );
            vectors.push(
              new Vector(Point.sub(currentA, nextA), currentA, nextA)
            );
            // B vectors need to be inverted
            vectors.push(
              new Vector(Point.sub(prevB, currentB), prevB, currentB)
            );
            vectors.push(
              new Vector(Point.sub(nextB, currentB), nextB, currentB)
            );
            break;
          case 1:
            vectors.push(
              new Vector(Point.sub(localPrimaryB, currentA), prevA, currentA)
            );

            vectors.push(
              new Vector(Point.sub(localPrimaryB, prevA), currentA, prevA)
            );
            break;
          case 2:
            vectors.push(
              new Vector(Point.sub(localPrimaryB, currentA), prevB, currentB)
            );

            vectors.push(
              new Vector(Point.sub(localSecondaryB, currentA), currentB, prevB)
            );
            break;
        }
      }

      // todo: there should be a faster way to reject vectors that will cause immediate intersection. For now just check them all

      translate = null;
      maxDistance = 0;
      vectorCount = vectors.length;

      for (i = 0; i < vectorCount; ++i) {
        vector = vectors.at(i);

        if (vector.x == 0 && vector.y == 0) {
          continue;
        }

        // if this vector points us back to where we came from, ignore it.
        // ie cross product = 0, dot product < 0
        if (prevVector !== null && vector.dot(prevVector) < 0) {
          // compare magnitude with unit vectors
          vectorNormal.set(vector).normalize();

          prevVectorNormal.set(prevVector).normalize();

          // we need to scale down to unit vectors to normalize vector length. Could also just do a tan here
          if (Math.abs(vectorNormal.cross(prevVectorNormal)) < 0.0001) {
            continue;
          }
        }

        distance = polygonSlideDistance(a, b, vector);
        vectorLength = vector.length;

        if (Number.isNaN(distance) || Math.abs(distance) > vectorLength) {
          distance = vectorLength;
        }

        if (!Number.isNaN(distance) && distance > maxDistance) {
          maxDistance = distance;
          translate = vector;
        }
      }

      if (translate === null || almostEqual(maxDistance)) {
        // didn't close the loop, something went wrong here
        nfp = [];
        break;
      }

      translate.start.marked = true;
      translate.end.marked = true;

      prevVector = translate;

      // trim
      vectorLength = translate.length;

      if (
        Math.abs(maxDistance) < vectorLength &&
        !almostEqual(maxDistance, vectorLength)
      ) {
        translate.normalize(Math.abs(maxDistance));
      }

      reference.add(translate);

      if (Point.almostEqual(reference, start)) {
        // we've made a full loop
        break;
      }

      // if A and B start on a touching horizontal line, the end point may not be the start point
      looped = false;
      nfpPointCount = nfp.length;

      if (nfpPointCount !== 0) {
        for (i = 0; i < nfpPointCount - 1; ++i) {
          if (reference.almostEqual(nfp.at(i))) {
            looped = true;
          }
        }
      }

      if (looped) {
        // we've made a full loop
        break;
      }

      nfp.push({ x: reference.x, y: reference.y });

      (b.offset as Point).add(translate);

      ++counter;
    }

    if (nfp.length !== 0) {
      result.push(nfp as IPolygon);
    }

    if (!searchEdges) {
      // only get outer NFP or first inner NFP
      break;
    }

    startPoint = searchStartPoint(a, b, inside, result as IPolygon[]);
  }

  return result;
}

export function importPolygon(
  polygonData: Float64Array,
  offset: number = 0
): IPolygon {
  const innerOffset: number = 14 + offset;
  const size: number = polygonData[offset];
  const pointCount: number = polygonData[11 + offset];
  const result: IPolygon = new Array<IPoint>(pointCount) as IPolygon;
  const hasParent: boolean = polygonData[offset + 12] === 1;
  let i: number = 0;

  result.id = polygonData[offset + 1];
  result.source = polygonData[offset + 2];
  result.hole = polygonData[offset + 3] === 1;
  result.rotation = polygonData[offset + 4];
  result.x = polygonData[offset + 5];
  result.y = polygonData[offset + 6];
  result.width = polygonData[offset + 7];
  result.height = polygonData[offset + 8];
  result.offset = Point.fromCords(
    polygonData[offset + 9],
    polygonData[offset + 10]
  );

  for (i = 0; i < pointCount; ++i) {
    result[i] = {
      x: polygonData[innerOffset + (i << 1)],
      y: polygonData[innerOffset + (i << 1) + 1]
    };
  }

  if (hasParent) {
    result.parent = importPolygon(polygonData, size);
  }

  return result;
}

export function importPolygons(data: Float64Array): IPolygon[] {
  if (data.length === 0) {
    return [];
  }

  const polygonCount: number = data[0];
  const result: IPolygon[] = [];
  let offset = polygonCount + 1;
  let i: number = 0;

  for (i = 0; i < polygonCount; ++i) {
    result.push(importPolygon(data, offset));
    offset += data[i + 1];
  }

  return result;
}
