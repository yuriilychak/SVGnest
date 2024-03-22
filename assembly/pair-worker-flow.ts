import { ClipType, Clipper, PolyFillType, PolyType } from "./clipper";
import { TripleStatus } from "./enums";
import { Polygon, Point, Vector } from "./geom";
import { TOLERANCE, almostEqual } from "./util";

// returns an interior NFP for the special case where A is a rectangle
export function noFitPolygonRectangle(a: Polygon, b: Polygon): Polygon[] {
  const firstB: Point = b.firstPoint;
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
    Point.fromCords(minOffsetAB.x, minOffsetAB.y),
    Point.fromCords(maxOffsetAB.x, minOffsetAB.y),
    Point.fromCords(maxOffsetAB.x, maxOffsetAB.y),
    Point.fromCords(minOffsetAB.x, maxOffsetAB.y)
  ]);

  return [polygon];
}

function pointDistance(
  point: Point,
  segment1: Point,
  segment2: Point,
  normal: Point,
  infinite: boolean
): f64 {
  const innerNormal: Point = Point.normalize(normal);
  const dir: Point = Point.normal(innerNormal);
  const pointDot: f64 = point.dot(dir);
  const pointDotNorm: f64 = point.dot(innerNormal);
  const segment1Diff: f64 = pointDot - segment1.dot(dir);
  const segment2Diff: f64 = pointDot - segment2.dot(dir);
  const segment1DotDiff: f64 = pointDotNorm - segment1.dot(innerNormal);
  const segment2DotDiff: f64 = pointDotNorm - segment2.dot(innerNormal);

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
      let result: f64 = Math.min(segment1DotDiff, segment2DotDiff);

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
  overlap: f64
): f64 {
  let result: f64 = pointDistance(point1, point3, point4, direction, false);

  if (!Number.isNaN(result) && almostEqual(result, 0)) {
    //  A currently touches EF, but AB is moving away from EF
    const distance: f64 = pointDistance(
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
): f64 {
  const normal: Point = Point.normal(direction);
  const reverse: Point = Point.reverse(direction);

  const dotA: f64 = a.dot(normal);
  const dotB: f64 = b.dot(normal);
  const dotE: f64 = e.dot(normal);
  const dotF: f64 = f.dot(normal);

  const crossA: f64 = a.dot(direction);
  const crossB: f64 = b.dot(direction);
  const crossE: f64 = e.dot(direction);
  const crossF: f64 = f.dot(direction);

  const minAB: f64 = Math.min(dotA, dotB);
  const maxAB: f64 = Math.max(dotA, dotB);
  const minEF: f64 = Math.min(dotE, dotF);
  const maxEF: f64 = Math.max(dotE, dotF);

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

  const overlap: f64 =
    (maxAB > maxEF && minAB < minEF) || (maxEF > maxAB && minEF < minAB)
      ? 1
      : (Math.min(maxAB, maxEF) - Math.max(minAB, minEF)) /
        (Math.max(maxAB, maxEF) - Math.min(minAB, minEF));

  const diffAB: Point = Point.sub(a, b);
  const diffEF: Point = Point.sub(e, f);
  const diffAE: Point = Point.sub(a, e);
  const diffAF: Point = Point.sub(a, f);
  const crossABE: f64 = diffAE.cross(diffAB);
  const crossABF: f64 = diffAF.cross(diffAB);

  // lines are colinear
  if (almostEqual(crossABE) && almostEqual(crossABF)) {
    const normAB: Point = Point.normal(diffAB).normalize();
    const normEF: Point = Point.normal(diffEF).normalize();

    // segment normals must point in opposite directions
    if (almostEqual(normAB.cross(normEF)) && normAB.dot(normEF) < 0) {
      // normal of AB segment must point in same direction as given direction vector
      const normDot: f64 = normAB.dot(direction);
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

  const distances: f64[] = [];
  let distance: f64;

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

  let i: u16 = 0;
  const distanceCount: u16 = u16(distances.length);
  let result: f64 = distances[0];

  for (i = 1; i < distanceCount; ++i) {
    result = Math.min(result, distances.at(i));
  }

  return result;
}

function polygonSlideDistance(a: Polygon, b: Polygon, direction: Point): f64 {
  const sizeA: u16 = a.length;
  const sizeB: u16 = b.length;
  const lastAIndex: u16 = a.at(0) !== a.at(sizeA - 1) ? sizeA : sizeA - 1;
  const lastBIndex: u16 = b.at(0) !== b.at(sizeB - 1) ? sizeB : sizeB - 1;
  const a1: Point = Point.empty();
  const a2: Point = Point.empty();
  const b1: Point = Point.empty();
  const b2: Point = Point.empty();
  const dir: Point = Point.normalize(direction);
  let i: u16 = 0;
  let j: u16 = 0;
  let result: f64 = Number.NaN;
  let distance: f64 = 0;

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
  a: Polygon,
  b: Polygon,
  direction: Point
): f64 {
  const sizeA: u16 = a.length;
  const sizeB: u16 = b.length;
  const lastAIndex: u16 = a.at(0) !== a.at(sizeA - 1) ? sizeA : sizeA - 1;
  const segmentDiff: Point = Point.empty();
  const point: Point = Point.empty();
  const s1: Point = Point.empty();
  const s2: Point = Point.empty();
  let i: u16 = 0;
  let j: u16 = 0;
  let minProjection: f64 = Number.NaN;
  let result: f64 = Number.NaN;
  let distance: f64;

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
function inNfp(p: Point, nfp: Polygon[]): boolean {
  const nfpCount: u16 = u16(nfp.length);
  if (nfpCount == 0) {
    return false;
  }

  let i: u16 = 0;
  let j: u16 = 0;
  let polygon: Polygon;

  for (i = 0; i < nfpCount; ++i) {
    polygon = nfp.at(i);
    for (j = 0; j < nfp[i].length; ++j) {
      if (Point.almostEqual(p, polygon.at(j))) {
        return true;
      }
    }
  }

  return false;
}

function getInsideB(
  a: Polygon,
  b: Polygon,
  initialStatus: TripleStatus
): TripleStatus {
  let i: u16 = 0;
  const sizeB: u16 = b.length;
  const point: Point = Point.empty();
  let inPoly: TripleStatus;

  for (i = 0; i < sizeB; ++i) {
    point.set(b.at(i)).add(b.offset);
    inPoly = a.pointIn(point);

    if (inPoly === TripleStatus.Error) {
      continue;
    }

    return inPoly;
  }

  return initialStatus;
}

function checkStartPoint(
  a: Polygon,
  b: Polygon,
  nfp: Polygon[],
  inside: boolean,
  insideB: TripleStatus
): TripleStatus {
  if (insideB === TripleStatus.Error) {
    // A and B are the same
    return TripleStatus.Error;
  }

  if (!!insideB === inside && !a.intersect(b) && !inNfp(b.offset, nfp)) {
    return TripleStatus.True;
  }

  return TripleStatus.False;
}

function getProjectionDistance(
  a: Polygon,
  b: Polygon,
  vector: Point,
  vectorReversed: Point
): f64 {
  const distance1: f64 = polygonProjectionDistance(a, b, vector);
  const distance2: f64 = polygonProjectionDistance(b, a, vectorReversed);

  if (Number.isNaN(distance1)) {
    return Number.isNaN(distance2) ? Number.NaN : distance2;
  }

  return Number.isNaN(distance2) ? distance1 : Math.min(distance1, distance2);
}
// searches for an arrangement of A and B such that they do not overlap
// if an NFP is given, only search for startpoints that have not already been traversed in the given NFP
function searchStartPoint(
  a: Polygon,
  b: Polygon,
  inside: boolean,
  marked: boolean[],
  nfp: Polygon[] = []
): Point | null {
  const sizeA: u16 = a.length;
  const sizeB: u16 = b.length;
  const iterationCountA: u16 = a.at(0) !== a.at(sizeA - 1) ? sizeA : sizeA - 1;
  const iterationCountB: u16 = b.at(0) !== b.at(sizeB - 1) ? sizeB + 1 : sizeB;
  // clone arrays
  const edgeA: Polygon = a.clone();
  const edgeB: Polygon = b.clone();

  edgeA.close();
  edgeB.close();

  edgeA.offset.update(0, 0);
  edgeB.offset.update(0, 0);

  const vector: Point = Point.empty();
  const vectorReversed: Point = Point.empty();
  let i: u16 = 0;
  let j: u16 = 0;
  let distance: f64 = 0;
  let vectorLength: f64 = 0;
  let insideB: TripleStatus = TripleStatus.Error;
  let currentA: Point;

  for (i = 0; i < iterationCountA; ++i) {
    currentA = edgeA.at(i);

    if (marked[i]) {
      continue;
    }

    vector.set(edgeA.at((i + 1) % sizeA)).sub(currentA);
    vectorReversed.set(vector).reverse();
    marked[i] = true;

    for (j = 0; j < iterationCountB; ++j) {
      (edgeB.offset as Point).set(currentA).sub(edgeB.at(j));

      insideB = getInsideB(edgeA, edgeB, TripleStatus.Error);

      switch (checkStartPoint(edgeA, edgeB, nfp, inside, insideB)) {
        case TripleStatus.Error:
          return null;
        case TripleStatus.True:
          return Point.from(edgeB.offset);
      }

      // slide B along vector
      distance = getProjectionDistance(edgeA, edgeB, vector, vectorReversed);

      // only slide until no longer negative
      // todo: clean this up
      if (Number.isNaN(distance) || almostEqual(distance) || distance <= 0) {
        continue;
      }

      vectorLength = vector.length;

      if (
        Math.abs(distance) < vectorLength &&
        !almostEqual(Math.abs(distance), vectorLength)
      ) {
        vector.normalize(distance);
      }

      (edgeB.offset as Point).add(vector);

      insideB = getInsideB(edgeA, edgeB, insideB);

      switch (checkStartPoint(edgeA, edgeB, nfp, inside, insideB)) {
        case TripleStatus.Error:
          return null;
        case TripleStatus.True:
          return Point.from(edgeB.offset);
      }
    }
  }

  return null;
}

function getTouch(type: i16, a: i16, b: i16): Int16Array {
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
  a: Polygon,
  b: Polygon,
  inside: boolean,
  searchEdges: boolean
): Polygon[] {
  const sizeA: u16 = a.length;
  const sizeB: u16 = b.length;

  if (sizeA < 3 || sizeB < 3) {
    return [];
  }

  a.offset.update(0, 0);
  b.offset.update(0, 0);

  let i: u16 = 0;
  let j: u16 = 0;

  let minA: f64 = a.at(0).y;
  let minIndexA: u16 = 0;

  let maxB: f64 = b.at(0).y;
  let maxIndexB: u16 = 0;

  const marked: boolean[] = new Array<boolean>(sizeA);

  marked.fill(false);

  for (i = 1; i < sizeA; ++i) {
    if (a.at(i).y < minA) {
      minA = a.at(i).y;
      minIndexA = i;
    }
  }

  for (i = 1; i < sizeB; ++i) {
    if (b.at(i).y > maxB) {
      maxB = b.at(i).y;
      maxIndexB = i;
    }
  }

  const result: Polygon[] = [];
  const vectorNormal: Point = Point.empty();
  const prevVectorNormal: Point = Point.empty();
  const reference: Point = Point.empty();
  const start: Point = Point.empty();
  const localA: Point = Point.empty();
  const primaryB: Point = Point.empty();
  const secondaryB: Point = Point.empty();
  const counterCondition: u32 = 10 * (sizeA + sizeB);
  let vectors: Vector[];
  let vector: Vector;
  let translate: Vector | null = null;
  let nfp: Point[] = [];
  let prevVector: Vector | null = null;
  let vectorLength: f64 = 0;
  let looped: boolean = false;
  let distance: f64 = Number.NaN;
  let maxDistance: f64 = 0;
  let counter: u32 = 0;
  let currentA: Point;
  let currentB: Point;
  let nextA: Point;
  let prevA: Point;
  let nextB: Point;
  let prevB: Point;
  let touches: Int16Array[];
  let touch: Int16Array;
  let prevIndexA: u16 = 0;
  let currentIndexA: u16 = 0;
  let nextIndexA: u16 = 0;
  let prevIndexB: u16 = 0;
  let currentIndexB: u16 = 0;
  let nextIndexB: u16 = 0;
  let vectorCount: u16 = 0;
  let nfpPointCount: u16 = 0;
  let touchCount: u16 = 0;
  let startPoint: Point | null = !inside
    ? // shift B such that the bottom-most point of B is at the top-most point of A. This guarantees an initial placement with no intersections
      Point.sub(b.at(maxIndexB), a.at(minIndexA))
    : // no reliable heuristic for inside
      searchStartPoint(a, b, true, marked);

  while (startPoint !== null) {
    (b.offset as Point).set(startPoint);

    // maintain a list of touching points/edges

    primaryB.set(b.at(0)).add(startPoint);
    prevVector = null; // keep track of previous vector
    nfp = [primaryB.clone()];

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
          primaryB.set(b.at(j)).add(b.offset);
          secondaryB.set(b.at((j + 1) % sizeB)).add(b.offset);

          if (primaryB.almostEqual(currentA)) {
            touches.push(getTouch(0, i, j));
          } else if (primaryB.onSegment(currentA, nextA)) {
            touches.push(getTouch(1, (i + 1) % sizeA, j));
          } else if (localA.onSegment(primaryB, secondaryB)) {
            touches.push(getTouch(2, i, (j + 1) % sizeB));
          }
        }
      }

      // generate translation vectors from touching vertices/edges
      vectors = [];
      touchCount = u16(touches.length);

      for (i = 0; i < touchCount; ++i) {
        touch = touches.at(i);
        currentIndexA = touch.at(1);
        prevIndexA = (currentIndexA + sizeA - 1) % sizeA;
        nextIndexA = (currentIndexA + 1) % sizeA;

        currentIndexB = touch.at(2);
        prevIndexB = (currentIndexB + sizeB - 1) % sizeB;
        nextIndexB = (currentIndexB + 1) % sizeB;

        currentA = a.at(currentIndexA);
        prevA = a.at(prevIndexA);
        nextA = a.at(nextIndexA);

        // adjacent B vertices
        currentB = b.at(currentIndexB);
        prevB = b.at(prevIndexB);
        nextB = b.at(nextIndexB);

        primaryB.set(currentB).add(b.offset);
        secondaryB.set(prevB).add(b.offset);

        marked[currentIndexA] = true;

        switch (touch[0]) {
          case 0:
            vectors.push(
              new Vector(currentA, prevA, a, currentIndexA, prevIndexA, true)
            );
            vectors.push(
              new Vector(currentA, nextA, a, currentIndexA, nextIndexA, true)
            );
            // B vectors need to be inverted
            vectors.push(
              new Vector(prevB, currentB, b, prevIndexB, currentIndexB, false)
            );
            vectors.push(
              new Vector(nextB, currentB, b, nextIndexB, currentIndexB, false)
            );
            break;
          case 1:
            vectors.push(
              new Vector(
                primaryB,
                currentA,
                a,
                prevIndexA,
                currentIndexA,
                false
              )
            );

            vectors.push(
              new Vector(primaryB, prevA, a, currentIndexA, prevIndexA, true)
            );
            break;
          case 2:
            vectors.push(
              new Vector(
                primaryB,
                currentA,
                b,
                prevIndexB,
                currentIndexB,
                false
              )
            );

            vectors.push(
              new Vector(
                secondaryB,
                currentA,
                b,
                currentIndexB,
                prevIndexB,
                false
              )
            );
            break;
        }
      }

      // todo: there should be a faster way to reject vectors that will cause immediate intersection. For now just check them all

      translate = null;
      maxDistance = 0;
      vectorCount = u16(vectors.length);

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

      if (translate.isMain) {
        marked[translate.startIndex] = true;
        marked[translate.endIndex] = true;
      }

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
      nfpPointCount = u16(nfp.length);

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

      nfp.push(reference.clone());

      (b.offset as Point).add(translate);

      ++counter;
    }

    if (nfp.length !== 0) {
      result.push(Polygon.fromPoints(nfp));
    }

    if (!searchEdges) {
      // only get outer NFP or first inner NFP
      break;
    }

    startPoint = searchStartPoint(a, b, inside, marked, result);
  }

  return result;
}

function orientation(poly: Point[]): boolean {
  const pointCount: u16 = u16(poly.length);
  let result: f64 = 0;
  let i: u16 = 0;
  let prevPoint: Point;
  let currentPoint: Point;

  for (i = 0; i < pointCount; ++i) {
    currentPoint = poly.at(i);
    prevPoint = poly.at((i + pointCount - 1) % pointCount);
    result += (prevPoint.x + currentPoint.x) * (prevPoint.y - currentPoint.y);
  }

  return result >= 0;
}

export function minkowskiDifference(a: Polygon, b: Polygon): Polygon[] {
  const scale: f64 = 10000000;
  const sizeA: u16 = u16(a.length);
  const sizeB: u16 = u16(b.length);
  const solutions: Point[][] = [];
  const quads: Point[][] = [];
  let pointB: Point;
  let pointA: Point;
  let currentPath: Point[];
  let nextPath: Point[];
  let quad: Point[];
  let i: u16 = 0;
  let j: u16 = 0;
  let sArea: f64;

  for (i = 0; i < sizeB; ++i) {
    pointB = b.at(i);
    currentPath = new Array(sizeA);

    for (j = 0; j < sizeA; ++j) {
      pointA = a.at(j);
      currentPath[j] = Point.from(pointA).sub(pointB).scale(scale);
    }

    solutions.push(currentPath);
  }

  for (i = 0; i < sizeB; ++i) {
    currentPath = solutions[i];
    nextPath = solutions[(i + 1) % sizeB];

    for (j = 0; j < sizeA; ++j) {
      quad = [
        currentPath[j],
        nextPath[j],
        nextPath[(j + 1) % sizeA],
        currentPath[(j + 1) % sizeA]
      ];

      if (orientation(quad)) {
        quad.reverse();
      }
      quads.push(quad);
    }
  }
  const clipper: Clipper = new Clipper();

  clipper.addPaths(quads, PolyType.Subject, true);
  clipper.execute(
    ClipType.Union,
    solutions,
    PolyFillType.NonZero,
    PolyFillType.NonZero
  );

  const solutionCount: number = solutions.length;
  let clipperNfp: Polygon = Polygon.fromPoints(solutions.at(0), 1 / scale);
  let n: Polygon;
  let largestArea: number = clipperNfp.area;

  for (i = 1; i < solutionCount; ++i) {
    n = Polygon.fromPoints(solutions.at(i), 1 / scale);
    sArea = n.area;

    if (largestArea > sArea) {
      clipperNfp = n;
      largestArea = sArea;
    }
  }

  clipperNfp.offsetPoints(b.at(0));

  return [clipperNfp];
}
