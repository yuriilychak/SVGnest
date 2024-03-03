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

export function almostEqual(
  a: number,
  b: number = 0,
  tolerance: number = TOLERANCE
): boolean {
  return Math.abs(a - b) < tolerance;
}

// returns true if p lies on the line segment defined by AB, but not at any endpoints
// may need work!
function onSegment(a: IPoint, b: IPoint, p: IPoint): boolean {
  const diffAB: Point = Point.sub(a, b);
  const diffAP: Point = Point.sub(a, p);
  const diffBP: Point = Point.sub(b, p);
  const minDiff: Point = Point.min(diffAP, diffBP);
  const maxDiff: Point = Point.max(diffAP, diffBP);
  // vertical line
  if (almostEqual(diffAB.x) && almostEqual(diffAP.x)) {
    return (
      !almostEqual(diffBP.y) &&
      !almostEqual(diffAP.y) &&
      minDiff.y < 0 &&
      maxDiff.y > 0
    );
  }

  // horizontal line
  if (almostEqual(diffAB.y) && almostEqual(diffAP.y)) {
    return (
      !almostEqual(diffBP.x) &&
      !almostEqual(diffAP.x) &&
      minDiff.x < 0 &&
      maxDiff.x > 0
    );
  }

  return (
    //range check
    maxDiff.x >= 0 &&
    minDiff.x <= 0 &&
    maxDiff.y >= 0 &&
    minDiff.y <= 0 &&
    // exclude end points
    !Point.almostEqual(p, a) &&
    !Point.almostEqual(p, b) &&
    almostEqual(diffAP.cross(diffAB)) &&
    !almostEqual(diffAP.dot(diffAB) - diffAB.squareLength)
  );
}

// returns the intersection of AB and EF
// or null if there are no intersections or other numerical error
// if the infinite flag is set, AE and EF describe infinite lines without endpoints, they are finite line segments otherwise
export function lineIntersect(a: Point, b: Point, e: Point, f: Point): boolean {
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
export function pointInPolygon(point: IPoint, polygon: IPolygon): number {
  if (!polygon || polygon.length < 3) {
    return -1;
  }

  const offset: Point = new Point(polygon.offsetx || 0, polygon.offsety || 0);
  const currentPoint: Point = new Point();
  const prevPoint: Point = new Point();
  const neighboarDiff: Point = new Point();
  const pointDiff: Point = new Point();
  const pointCount: number = polygon.length;
  let inside: boolean = false;
  let i: number = 0;

  for (i = 0; i < pointCount; ++i) {
    currentPoint.set(polygon[i]).add(offset);
    prevPoint.set(polygon[(i + pointCount - 1) % pointCount]).add(offset);

    if (
      // no result
      Point.almostEqual(currentPoint, point) ||
      // exactly on the segment
      onSegment(currentPoint, prevPoint, point)
    ) {
      return -1; // no result
    }

    if (Point.almostEqual(currentPoint, prevPoint)) {
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

  return inside ? 1 : 0;
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
  polygon: IPolygon,
  points: Point[],
  index1: number,
  index2: number
): boolean {
  const point1In: number = pointInPolygon(points[index1], polygon);
  const point2In: number = pointInPolygon(points[index2], polygon);

  return (
    (point1In === 1 && point2In === 0) || (point1In === 0 && point2In === 1)
  );
}

function checkIntersectCondition(
  points1: Point[],
  points2: Point[],
  index0: number,
  index3: number
): boolean {
  return (
    points1[index0].onSegment(points2[1], points2[2]) ||
    points1[index0].almostEqual(points2[index3])
  );
}

// todo: swap this for a more efficient sweep-line implementation
// returnEdges: if set, return all edges on A that have intersections
export function intersect(a: IPolygon, b: IPolygon): boolean {
  const offsetA: Point = new Point(a.offsetx || 0, a.offsety || 0);
  const offsetB: Point = new Point(b.offsetx || 0, b.offsety || 0);
  const pointsA: Point[] = [new Point(), new Point(), new Point(), new Point()];
  const pointsB: Point[] = [new Point(), new Point(), new Point(), new Point()];
  const sizeA: number = a.length;
  const sizeB: number = b.length;
  let i: number = 0;
  let j: number = 0;

  for (i = 0; i < sizeA - 1; ++i) {
    updateIntersectPoints(a, offsetA, pointsA, i);

    for (j = 0; j < sizeB - 1; ++j) {
      updateIntersectPoints(b, offsetB, pointsB, j);

      if (checkIntersectCondition(pointsB, pointsA, 1, 1)) {
        // if a point is on a segment, it could intersect or it could not. Check via the neighboring points
        if (checkIntersect(a, pointsB, 0, 2)) {
          return true;
        } else {
          continue;
        }
      }

      if (checkIntersectCondition(pointsB, pointsA, 2, 2)) {
        // if a point is on a segment, it could intersect or it could not. Check via the neighboring points
        if (checkIntersect(a, pointsB, 1, 3)) {
          return true;
        } else {
          continue;
        }
      }

      if (checkIntersectCondition(pointsA, pointsB, 1, 2)) {
        // if a point is on a segment, it could intersect or it could not. Check via the neighboring points
        if (checkIntersect(b, pointsA, 0, 2)) {
          return true;
        } else {
          continue;
        }
      }

      if (checkIntersectCondition(pointsA, pointsB, 2, 1)) {
        // if a point is on a segment, it could intersect or it could not. Check via the neighboring points
        if (checkIntersect(b, pointsA, 1, 3)) {
          return true;
        } else {
          continue;
        }
      }

      if (lineIntersect(pointsB[1], pointsB[2], pointsA[1], pointsA[2])) {
        return true;
      }
    }
  }

  return false;
}

export function pointDistance(
  p: IPoint,
  s1: IPoint,
  s2: IPoint,
  normal: IPoint,
  infinite: boolean = false
): number {
  normal = Point.normalize(normal);

  var dir = {
    x: normal.y,
    y: -normal.x
  };

  var pdot = p.x * dir.x + p.y * dir.y;
  var s1dot = s1.x * dir.x + s1.y * dir.y;
  var s2dot = s2.x * dir.x + s2.y * dir.y;

  var pdotnorm = p.x * normal.x + p.y * normal.y;
  var s1dotnorm = s1.x * normal.x + s1.y * normal.y;
  var s2dotnorm = s2.x * normal.x + s2.y * normal.y;

  if (!infinite) {
    if (
      ((pdot < s1dot || almostEqual(pdot, s1dot)) &&
        (pdot < s2dot || almostEqual(pdot, s2dot))) ||
      ((pdot > s1dot || almostEqual(pdot, s1dot)) &&
        (pdot > s2dot || almostEqual(pdot, s2dot)))
    ) {
      return null; // dot doesn't collide with segment, or lies directly on the vertex
    }
    if (
      almostEqual(pdot, s1dot) &&
      almostEqual(pdot, s2dot) &&
      pdotnorm > s1dotnorm &&
      pdotnorm > s2dotnorm
    ) {
      return Math.min(pdotnorm - s1dotnorm, pdotnorm - s2dotnorm);
    }
    if (
      almostEqual(pdot, s1dot) &&
      almostEqual(pdot, s2dot) &&
      pdotnorm < s1dotnorm &&
      pdotnorm < s2dotnorm
    ) {
      return -Math.min(s1dotnorm - pdotnorm, s2dotnorm - pdotnorm);
    }
  }

  return -(
    pdotnorm -
    s1dotnorm +
    ((s1dotnorm - s2dotnorm) * (s1dot - pdot)) / (s1dot - s2dot)
  );
}

export function segmentDistance(
  A: IPoint,
  B: IPoint,
  E: IPoint,
  F: IPoint,
  direction: IPoint
): number {
  var normal = {
    x: direction.y,
    y: -direction.x
  };

  var reverse = {
    x: -direction.x,
    y: -direction.y
  };

  var dotA = A.x * normal.x + A.y * normal.y;
  var dotB = B.x * normal.x + B.y * normal.y;
  var dotE = E.x * normal.x + E.y * normal.y;
  var dotF = F.x * normal.x + F.y * normal.y;

  var crossA = A.x * direction.x + A.y * direction.y;
  var crossB = B.x * direction.x + B.y * direction.y;
  var crossE = E.x * direction.x + E.y * direction.y;
  var crossF = F.x * direction.x + F.y * direction.y;

  var ABmin = Math.min(dotA, dotB);
  var ABmax = Math.max(dotA, dotB);

  var EFmax = Math.max(dotE, dotF);
  var EFmin = Math.min(dotE, dotF);

  // segments that will merely touch at one point
  if (
    almostEqual(ABmax, EFmin, TOLERANCE) ||
    almostEqual(ABmin, EFmax, TOLERANCE)
  ) {
    return null;
  }
  // segments miss eachother completely
  if (ABmax < EFmin || ABmin > EFmax) {
    return null;
  }

  var overlap;

  if ((ABmax > EFmax && ABmin < EFmin) || (EFmax > ABmax && EFmin < ABmin)) {
    overlap = 1;
  } else {
    var minMax = Math.min(ABmax, EFmax);
    var maxMin = Math.max(ABmin, EFmin);

    var maxMax = Math.max(ABmax, EFmax);
    var minMin = Math.min(ABmin, EFmin);

    overlap = (minMax - maxMin) / (maxMax - minMin);
  }

  var crossABE = (E.y - A.y) * (B.x - A.x) - (E.x - A.x) * (B.y - A.y);
  var crossABF = (F.y - A.y) * (B.x - A.x) - (F.x - A.x) * (B.y - A.y);

  // lines are colinear
  if (almostEqual(crossABE, 0) && almostEqual(crossABF, 0)) {
    var ABnorm = { x: B.y - A.y, y: A.x - B.x };
    var EFnorm = { x: F.y - E.y, y: E.x - F.x };

    var ABnormlength = Math.sqrt(ABnorm.x * ABnorm.x + ABnorm.y * ABnorm.y);
    ABnorm.x /= ABnormlength;
    ABnorm.y /= ABnormlength;

    var EFnormlength = Math.sqrt(EFnorm.x * EFnorm.x + EFnorm.y * EFnorm.y);
    EFnorm.x /= EFnormlength;
    EFnorm.y /= EFnormlength;

    // segment normals must point in opposite directions
    if (
      Math.abs(ABnorm.y * EFnorm.x - ABnorm.x * EFnorm.y) < TOLERANCE &&
      ABnorm.y * EFnorm.y + ABnorm.x * EFnorm.x < 0
    ) {
      // normal of AB segment must point in same direction as given direction vector
      var normdot = ABnorm.y * direction.y + ABnorm.x * direction.x;
      // the segments merely slide along eachother
      if (almostEqual(normdot, 0)) {
        return null;
      }
      if (normdot < 0) {
        return 0;
      }
    }
    return null;
  }

  var distances = [];

  // coincident points
  if (almostEqual(dotA, dotE)) {
    distances.push(crossA - crossE);
  } else if (almostEqual(dotA, dotF)) {
    distances.push(crossA - crossF);
  } else if (dotA > EFmin && dotA < EFmax) {
    var d = pointDistance(A, E, F, reverse);
    if (d !== null && almostEqual(d, 0)) {
      //  A currently touches EF, but AB is moving away from EF
      var dB = pointDistance(B, E, F, reverse, true);
      if (dB < 0 || almostEqual(dB * overlap, 0)) {
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
  } else if (dotB > EFmin && dotB < EFmax) {
    var d = pointDistance(B, E, F, reverse);

    if (d !== null && almostEqual(d, 0)) {
      // crossA>crossB A currently touches EF, but AB is moving away from EF
      var dA = pointDistance(A, E, F, reverse, true);
      if (dA < 0 || almostEqual(dA * overlap, 0)) {
        d = null;
      }
    }
    if (d !== null) {
      distances.push(d);
    }
  }

  if (dotE > ABmin && dotE < ABmax) {
    var d = pointDistance(E, A, B, direction);
    if (d !== null && almostEqual(d, 0)) {
      // crossF<crossE A currently touches EF, but AB is moving away from EF
      var dF = pointDistance(F, A, B, direction, true);
      if (dF < 0 || almostEqual(dF * overlap, 0)) {
        d = null;
      }
    }
    if (d !== null) {
      distances.push(d);
    }
  }

  if (dotF > ABmin && dotF < ABmax) {
    var d = pointDistance(F, A, B, direction);
    if (d !== null && almostEqual(d, 0)) {
      // && crossE<crossF A currently touches EF, but AB is moving away from EF
      var dE = pointDistance(E, A, B, direction, true);
      if (dE < 0 || almostEqual(dE * overlap, 0)) {
        d = null;
      }
    }
    if (d !== null) {
      distances.push(d);
    }
  }

  if (distances.length == 0) {
    return null;
  }

  return Math.min.apply(Math, distances);
}

export function polygonSlideDistance(
  A: IPolygon,
  B: IPolygon,
  direction: IPoint,
  ignoreNegative: boolean
): number {
  var A1, A2, B1, B2, Aoffsetx, Aoffsety, Boffsetx, Boffsety;

  Aoffsetx = A.offsetx || 0;
  Aoffsety = A.offsety || 0;

  Boffsetx = B.offsetx || 0;
  Boffsety = B.offsety || 0;

  A = A.slice(0) as IPolygon;
  B = B.slice(0) as IPolygon;

  // close the loop for polygons
  if (A[0] != A[A.length - 1]) {
    A.push(A[0]);
  }

  if (B[0] != B[B.length - 1]) {
    B.push(B[0]);
  }

  var edgeA = A;
  var edgeB = B;

  var distance = null;
  var d;

  var dir = Point.normalize(direction);

  for (var i = 0; i < edgeB.length - 1; i++) {
    for (var j = 0; j < edgeA.length - 1; j++) {
      A1 = { x: edgeA[j].x + Aoffsetx, y: edgeA[j].y + Aoffsety };
      A2 = { x: edgeA[j + 1].x + Aoffsetx, y: edgeA[j + 1].y + Aoffsety };
      B1 = { x: edgeB[i].x + Boffsetx, y: edgeB[i].y + Boffsety };
      B2 = { x: edgeB[i + 1].x + Boffsetx, y: edgeB[i + 1].y + Boffsety };

      if (
        (almostEqual(A1.x, A2.x) && almostEqual(A1.y, A2.y)) ||
        (almostEqual(B1.x, B2.x) && almostEqual(B1.y, B2.y))
      ) {
        continue; // ignore extremely small lines
      }

      d = segmentDistance(A1, A2, B1, B2, dir);

      if (d !== null && (distance === null || d < distance)) {
        if (!ignoreNegative || d > 0 || almostEqual(d, 0)) {
          distance = d;
        }
      }
    }
  }
  return distance;
}

// project each point of B onto A in the given direction, and return the
export function polygonProjectionDistance(
  A: IPolygon,
  B: IPolygon,
  direction: IPoint
): number {
  var Boffsetx = B.offsetx || 0;
  var Boffsety = B.offsety || 0;

  var Aoffsetx = A.offsetx || 0;
  var Aoffsety = A.offsety || 0;

  A = A.slice(0) as IPolygon;
  B = B.slice(0) as IPolygon;

  // close the loop for polygons
  if (A[0] != A[A.length - 1]) {
    A.push(A[0]);
  }

  if (B[0] != B[B.length - 1]) {
    B.push(B[0]);
  }

  var edgeA = A;
  var edgeB = B;

  var distance = null;
  var p, d, s1, s2;

  for (var i = 0; i < edgeB.length; i++) {
    // the shortest/most negative projection of B onto A
    var minprojection = null;
    for (var j = 0; j < edgeA.length - 1; j++) {
      p = { x: edgeB[i].x + Boffsetx, y: edgeB[i].y + Boffsety };
      s1 = { x: edgeA[j].x + Aoffsetx, y: edgeA[j].y + Aoffsety };
      s2 = { x: edgeA[j + 1].x + Aoffsetx, y: edgeA[j + 1].y + Aoffsety };

      if (
        Math.abs((s2.y - s1.y) * direction.x - (s2.x - s1.x) * direction.y) <
        TOLERANCE
      ) {
        continue;
      }

      // project point, ignore edge boundaries
      d = pointDistance(p, s1, s2, direction);

      if (d !== null && (minprojection === null || d < minprojection)) {
        minprojection = d;
      }
    }
    if (
      minprojection !== null &&
      (distance === null || minprojection > distance)
    ) {
      distance = minprojection;
    }
  }

  return distance;
}

// searches for an arrangement of A and B such that they do not overlap
// if an NFP is given, only search for startpoints that have not already been traversed in the given NFP
export function searchStartPoint(
  A: IPolygon,
  B: IPolygon,
  inside: boolean,
  NFP: IPolygon[] = []
): IPoint | null {
  // clone arrays
  A = A.slice(0) as IPolygon;
  B = B.slice(0) as IPolygon;

  // close the loop for polygons
  if (A[0] != A[A.length - 1]) {
    A.push(A[0]);
  }

  if (B[0] != B[B.length - 1]) {
    B.push(B[0]);
  }

  for (var i = 0; i < A.length - 1; i++) {
    if (!A[i].marked) {
      A[i].marked = true;
      for (var j = 0; j < B.length; j++) {
        B.offsetx = A[i].x - B[j].x;
        B.offsety = A[i].y - B[j].y;

        var Binside = null;
        for (var k = 0; k < B.length; k++) {
          var inpoly = pointInPolygon(
            { x: B[k].x + B.offsetx, y: B[k].y + B.offsety },
            A
          );
          if (inpoly !== -1) {
            Binside = inpoly === 1;
            break;
          }
        }

        if (Binside === null) {
          // A and B are the same
          return null;
        }

        var startPoint = { x: B.offsetx, y: B.offsety };
        if (
          ((Binside && inside) || (!Binside && !inside)) &&
          !intersect(A, B) &&
          !inNfp(startPoint, NFP)
        ) {
          return startPoint;
        }

        // slide B along vector
        var vx = A[i + 1].x - A[i].x;
        var vy = A[i + 1].y - A[i].y;

        var d1 = polygonProjectionDistance(A, B, { x: vx, y: vy });
        var d2 = polygonProjectionDistance(B, A, { x: -vx, y: -vy });

        var d = null;

        // todo: clean this up
        if (d1 === null && d2 === null) {
          // nothin
        } else if (d1 === null) {
          d = d2;
        } else if (d2 === null) {
          d = d1;
        } else {
          d = Math.min(d1, d2);
        }

        // only slide until no longer negative
        // todo: clean this up
        if (d !== null && !almostEqual(d, 0) && d > 0) {
        } else {
          continue;
        }

        var vd2 = vx * vx + vy * vy;

        if (d * d < vd2 && !almostEqual(d * d, vd2)) {
          var vd = Math.sqrt(vx * vx + vy * vy);
          vx *= d / vd;
          vy *= d / vd;
        }

        B.offsetx += vx;
        B.offsety += vy;

        for (k = 0; k < B.length; k++) {
          var inpoly = pointInPolygon(
            { x: B[k].x + B.offsetx, y: B[k].y + B.offsety },
            A
          );
          if (inpoly !== -1) {
            Binside = inpoly === 1;
            break;
          }
        }
        startPoint = { x: B.offsetx, y: B.offsety };
        if (
          ((Binside && inside) || (!Binside && !inside)) &&
          !intersect(A, B) &&
          !inNfp(startPoint, NFP)
        ) {
          return startPoint;
        }
      }
    }
  }

  // returns true if point already exists in the given nfp
  function inNfp(p: IPoint, nfp: IPolygon[]) {
    if (nfp.length == 0) {
      return false;
    }

    for (var i = 0; i < nfp.length; i++) {
      for (var j = 0; j < nfp[i].length; j++) {
        if (almostEqual(p.x, nfp[i][j].x) && almostEqual(p.y, nfp[i][j].y)) {
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
export function noFitPolygon(
  A: IPolygon,
  B: IPolygon,
  inside: boolean,
  searchEdges: boolean
): IPolygon[] {
  if (!A || A.length < 3 || !B || B.length < 3) {
    return null;
  }

  A.offsetx = 0;
  A.offsety = 0;

  var i, j;

  var minA = A[0].y;
  var minAindex = 0;

  var maxB = B[0].y;
  var maxBindex = 0;

  for (i = 1; i < A.length; ++i) {
    A[i].marked = false;
    if (A[i].y < minA) {
      minA = A[i].y;
      minAindex = i;
    }
  }

  for (i = 1; i < B.length; ++i) {
    B[i].marked = false;
    if (B[i].y > maxB) {
      maxB = B[i].y;
      maxBindex = i;
    }
  }

  let startPoint: IPoint | null = !inside
    ? // shift B such that the bottom-most point of B is at the top-most point of A. This guarantees an initial placement with no intersections
      Point.sub(B[maxBindex], A[minAindex])
    : // no reliable heuristic for inside
      searchStartPoint(A, B, true);

  const result: IPolygon[] = [];
  const vectorNormal: Point = new Point();
  const prevVectorNormal: Point = new Point();
  const reference: Point = new Point();
  const start: Point = new Point();
  let vectors: Vector[];
  let vector: Vector;
  let translate: Vector | null = null;

  while (startPoint !== null) {
    B.offsetx = startPoint.x;
    B.offsety = startPoint.y;

    // maintain a list of touching points/edges
    var touching;

    var prevVector: Vector | null = null; // keep track of previous vector
    var nfp: IPoint[] = [
      {
        x: B[0].x + B.offsetx,
        y: B[0].y + B.offsety
      }
    ];

    reference.x = B[0].x + B.offsetx;
    reference.y = B[0].y + B.offsety;
    start.set(reference);
    var counter = 0;

    while (counter < 10 * (A.length + B.length)) {
      // sanity check, prevent infinite loop
      touching = [];
      // find touching vertices/edges
      for (i = 0; i < A.length; i++) {
        var nexti = i == A.length - 1 ? 0 : i + 1;
        for (j = 0; j < B.length; j++) {
          var nextj = j == B.length - 1 ? 0 : j + 1;
          if (
            almostEqual(A[i].x, B[j].x + B.offsetx) &&
            almostEqual(A[i].y, B[j].y + B.offsety)
          ) {
            touching.push({ type: 0, A: i, B: j });
          } else if (
            onSegment(A[i], A[nexti], {
              x: B[j].x + B.offsetx,
              y: B[j].y + B.offsety
            })
          ) {
            touching.push({ type: 1, A: nexti, B: j });
          } else if (
            onSegment(
              { x: B[j].x + B.offsetx, y: B[j].y + B.offsety },
              { x: B[nextj].x + B.offsetx, y: B[nextj].y + B.offsety },
              A[i]
            )
          ) {
            touching.push({ type: 2, A: i, B: nextj });
          }
        }
      }

      // generate translation vectors from touching vertices/edges
      vectors = [];

      for (i = 0; i < touching.length; i++) {
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
          vectors.push(
            new Vector(Point.from(prevA).sub(vertexA), vertexA, prevA)
          );
          vectors.push(
            new Vector(Point.from(nextA).sub(vertexA), vertexA, nextA)
          );
          // B vectors need to be inverted
          vectors.push(
            new Vector(Point.from(vertexB).sub(prevB), prevB, vertexB)
          );
          vectors.push(
            new Vector(Point.from(vertexB).sub(nextB), nextB, vertexB)
          );
        } else if (touching[i].type == 1) {
          vectors.push(
            new Vector(
              new Point(
                vertexA.x - (vertexB.x + B.offsetx),
                vertexA.y - (vertexB.y + B.offsety)
              ),
              prevA,
              vertexA
            )
          );

          vectors.push(
            new Vector(
              new Point(
                prevA.x - (vertexB.x + B.offsetx),
                prevA.y - (vertexB.y + B.offsety)
              ),
              vertexA,
              prevA
            )
          );
        } else if (touching[i].type == 2) {
          vectors.push(
            new Vector(
              new Point(
                vertexA.x - (vertexB.x + B.offsetx),
                vertexA.y - (vertexB.y + B.offsety)
              ),
              prevB,
              vertexB
            )
          );

          vectors.push(
            new Vector(
              new Point(
                vertexA.x - (prevB.x + B.offsetx),
                vertexA.y - (prevB.y + B.offsety)
              ),
              vertexB,
              prevB
            )
          );
        }
      }

      // todo: there should be a faster way to reject vectors that will cause immediate intersection. For now just check them all

      translate = null;
      var maxd = 0;

      for (i = 0; i < vectors.length; ++i) {
        vector = vectors[i];
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

        var d = polygonSlideDistance(A, B, vector, true);
        var vecd2 = vector.squareLength;

        if (d === null || d * d > vecd2) {
          d = vector.length;
        }

        if (d !== null && d > maxd) {
          maxd = d;
          translate = vector;
        }
      }

      if (translate === null || almostEqual(maxd, 0)) {
        // didn't close the loop, something went wrong here
        nfp = null;
        break;
      }

      translate.start.marked = true;
      translate.end.marked = true;

      prevVector = translate;

      // trim
      const vlength2 = translate.squareLength;

      if (maxd * maxd < vlength2 && !almostEqual(maxd * maxd, vlength2)) {
        translate.normalize(Math.abs(maxd));
      }

      reference.add(translate);

      if (Point.almostEqual(reference, start)) {
        // we've made a full loop
        break;
      }

      // if A and B start on a touching horizontal line, the end point may not be the start point
      var looped = false;
      if (nfp.length > 0) {
        for (i = 0; i < nfp.length - 1; i++) {
          if (Point.almostEqual(reference, nfp[i])) {
            looped = true;
          }
        }
      }

      if (looped) {
        // we've made a full loop
        break;
      }

      nfp.push({
        x: reference.x,
        y: reference.y
      });

      B.offsetx += translate.x;
      B.offsety += translate.y;

      counter++;
    }

    if (nfp && nfp.length > 0) {
      result.push(nfp as IPolygon);
    }

    if (!searchEdges) {
      // only get outer NFP or first inner NFP
      break;
    }

    startPoint = searchStartPoint(A, B, inside, result as IPolygon[]);
  }

  return result;
}
