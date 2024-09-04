import ClipperLib from 'js-clipper';
import { keyToNFPData, rotatePolygon, getPolygonBounds, polygonArea, pointInPolygon } from './helpers';
import { almostEqual, cycleIndex, midValue } from './shared-helpers';
import ClipperWrapper from './clipper-wrapper';
import { BoundRect, IPoint, IPolygon, NestConfig, NFPContent, NFPPair, PairWorkerResult } from './types';
import Point from './point';
import { TOL } from './constants';

interface ISegmentCheck {
    point: Point;
    polygon: IPolygon;
    segmentStart: Point;
    segmentEnd: Point;
    checkStart: Point;
    checkEnd: Point;
    target: Point;
}

interface IVector {
    value: Point;
    start: IPoint;
    end: IPoint;
}
// returns the intersection of AB and EF
// or null if there are no intersections or other numerical error
// if the infinite flag is set, AE and EF describe infinite lines without endpoints, they are finite line segments otherwise
function lineIntersect(A: IPoint, B: IPoint, E: IPoint, F: IPoint): boolean {
    const [a1, b1, c1] = Point.lineEquation(A, B);
    const [a2, b2, c2] = Point.lineEquation(E, F);
    const denom = a1 * b2 - a2 * b1;
    const x = (b1 * c2 - b2 * c1) / denom;
    const y = (a2 * c1 - a1 * c2) / denom;

    // lines are colinear
    /* var crossABE = (E.y - A.y) * (B.x - A.x) - (E.x - A.x) * (B.y - A.y);
		var crossABF = (F.y - A.y) * (B.x - A.x) - (F.x - A.x) * (B.y - A.y);
		if(_almostEqual(crossABE,0) && _almostEqual(crossABF,0)){
			return null;
		}*/

    return !(
        !(isFinite(x) && isFinite(y)) ||
        // coincident points do not count as intersecting
        (!almostEqual(A.x, B.x) && midValue(x, A.x, B.x) > 0) ||
        (!almostEqual(A.y, B.y) && midValue(y, A.y, B.y) > 0) ||
        (!almostEqual(E.x, F.x) && midValue(x, E.x, F.x) > 0) ||
        (!almostEqual(E.y, F.y) && midValue(y, E.y, F.y) > 0)
    );
}

function isRectangle(poly: IPoint[]): boolean {
    const bounds: BoundRect = getPolygonBounds(poly);
    const pointCount: number = poly.length;
    const rightX: number = bounds.x + bounds.width;
    const bottomY: number = bounds.y + bounds.height;
    let point: IPoint = null;
    let i: number = 0;

    for (i = 0; i < pointCount; ++i) {
        point = poly[i];

        if (
            !(
                (almostEqual(point.x, bounds.x) || almostEqual(point.x, rightX)) &&
                (almostEqual(point.y, bounds.y) || almostEqual(point.y, bottomY))
            )
        ) {
            return false;
        }
    }

    return true;
}

// old-todo: swap this for a more efficient sweep-line implementation
// returnEdges: if set, return all edges on A that have intersections

function updateIntersectPoint(point: Point, polygon: IPolygon, index: number, offset: number): void {
    const pointCount: number = polygon.length;
    let currentIndex = cycleIndex(index, pointCount, offset);

    point.update(polygon[index]);

    // go even further back if we happen to hit on a loop end point
    if (point.almostEqual(polygon[index])) {
        currentIndex = cycleIndex(currentIndex, pointCount, offset);
        point.update(polygon[currentIndex]);
    }
}

function getSegmentCheck(
    point: Point,
    polygon: IPolygon,
    segmentStart: Point,
    segmentEnd: Point,
    checkStart: Point,
    checkEnd: Point,
    target: Point
): ISegmentCheck {
    return { point, polygon, segmentStart, segmentEnd, checkStart, checkEnd, target };
}

function intersect(initialA: IPolygon, initialB: IPolygon): boolean {
    const offsetA: Point = Point.create(initialA.offsetx || 0, initialA.offsety || 0);
    const offsetB: Point = Point.create(initialB.offsetx || 0, initialB.offsety || 0);
    const A = initialA.slice(0) as IPolygon;
    const B = initialB.slice(0) as IPolygon;
    const a0: Point = Point.zero();
    const a1: Point = Point.zero();
    const a2: Point = Point.zero();
    const a3: Point = Point.zero();
    const b0: Point = Point.zero();
    const b1: Point = Point.zero();
    const b2: Point = Point.zero();
    const b3: Point = Point.zero();
    const pointCountA: number = A.length;
    const pointCountB: number = B.length;
    const segmentChecks: ISegmentCheck[] = [
        getSegmentCheck(b1, A, a1, a2, b0, b2, a1),
        getSegmentCheck(b2, A, a1, a2, b1, b3, a2),
        getSegmentCheck(a1, B, b1, b2, a0, a2, b2),
        getSegmentCheck(a2, B, b1, b2, a1, a3, a1)
    ];
    const segmentCheckCount = segmentChecks.length;
    let segmentCheck: ISegmentCheck = null;
    let pointIn1: boolean = false;
    let pointIn2: boolean = false;
    let i: number = 0;
    let j: number = 0;
    let k: number = 0;
    let segmentStats: boolean = false;

    for (i = 0; i < pointCountA - 1; ++i) {
        a1.update(A[i]);
        a2.update(A[i + 1]);

        updateIntersectPoint(a0, A, i, -1);
        updateIntersectPoint(a3, A, i + 1, 1);

        a0.add(offsetA);
        a1.add(offsetA);
        a2.add(offsetA);
        a3.add(offsetA);

        for (j = 0; j < pointCountB - 1; ++j) {
            b1.update(B[j]);
            b2.update(B[j + 1]);

            updateIntersectPoint(b0, B, j, -1);
            updateIntersectPoint(b3, B, j + 1, 1);

            b0.add(offsetB);
            b1.add(offsetB);
            b3.add(offsetB);
            b2.add(offsetB);

            segmentStats = null;

            for (k = 0; k < segmentCheckCount; ++k) {
                segmentCheck = segmentChecks[k];

                if (
                    segmentCheck.point.onSegment(segmentCheck.segmentStart, segmentCheck.segmentEnd) ||
                    segmentCheck.point.almostEqual(segmentCheck.target)
                ) {
                    // if a point is on a segment, it could intersect or it could not. Check via the neighboring points
                    pointIn1 = pointInPolygon(segmentCheck.checkStart, segmentCheck.polygon);
                    pointIn2 = pointInPolygon(segmentCheck.checkEnd, segmentCheck.polygon);

                    segmentStats = pointIn1 !== null && pointIn2 !== null && pointIn1 !== pointIn2;
                    break;
                }
            }

            if (segmentStats || (segmentStats === null && lineIntersect(b1, b2, a1, a2))) {
                return true;
            } else if (segmentStats === false) {
                continue;
            }
        }
    }

    return false;
}

function minkowskiDifference(polygonA: IPolygon, polygonB: IPolygon, clipperScale: number): IPoint[][] {
    const clipperA: ClipperLib.IntPoint[] = ClipperWrapper.toClipper(polygonA, clipperScale);
    const clipperB: ClipperLib.IntPoint[] = ClipperWrapper.toClipper(polygonB, -clipperScale);
    const solutions: ClipperLib.IntPoint[][] = ClipperLib.Clipper.MinkowskiSum(clipperA, clipperB, true);
    const solutionCount: number = solutions.length;
    const firstPoint: IPoint = polygonB[0];
    let i: number = 0;
    let clipperNfp: IPoint[] = null;
    let largestArea: number = null;
    let n = null;
    let area: number = 0;

    for (i = 0; i < solutionCount; ++i) {
        n = ClipperWrapper.toNest(solutions[i], clipperScale);
        area = polygonArea(n);

        if (largestArea === null || largestArea > area) {
            clipperNfp = n;
            largestArea = area;
        }
    }

    for (i = 0; i < clipperNfp.length; ++i) {
        clipperNfp[i].x = clipperNfp[i].x + firstPoint.x;
        clipperNfp[i].y = clipperNfp[i].y + firstPoint.y;
    }

    return [clipperNfp];
}

function pointDistance(p: IPoint, s1: IPoint, s2: IPoint, inputNormal: IPoint, infinite: boolean = false): number {
    const normal = Point.from(inputNormal).normalize();
    const dir = Point.from(normal).normal();
    const pdot = dir.dot(p);
    const s1dot = dir.dot(s1);
    const s2dot = dir.dot(s2);
    const pdotnorm = normal.dot(p);
    const s1dotnorm = normal.dot(s1);
    const s2dotnorm = normal.dot(s2);

    if (!infinite) {
        if (midValue(pdot, s1dot, s2dot) > TOL) {
            return null; // dot doesn't collide with segment, or lies directly on the vertex
        }

        if (almostEqual(pdot, s1dot) && almostEqual(pdot, s2dot) && midValue(pdotnorm, s1dotnorm, s2dotnorm) > 0) {
            return pdotnorm - Math.max(s1dotnorm, s2dotnorm);
        }
    }

    return s1dotnorm - pdotnorm - ((s1dotnorm - s2dotnorm) * (s1dot - pdot)) / (s1dot - s2dot);
}

function coincedentDistance(
    point1: IPoint,
    point2: IPoint,
    point3: IPoint,
    point4: IPoint,
    direction: IPoint,
    normal: Point,
    overlap: number,
    defaultValue: number
): number {
    const dot1: number = normal.dot(point1);
    const dot3: number = normal.dot(point3);
    const dot4: number = normal.dot(point4);

    if (midValue(dot1, dot3, dot4) >= 0) {
        return defaultValue;
    }

    const result: number = pointDistance(point1, point3, point4, direction);

    if (result === null) {
        return defaultValue;
    }

    if (almostEqual(result)) {
        //  A currently touches EF, but AB is moving away from EF
        const distance = pointDistance(point2, point3, point4, direction, true);
        if (distance < 0 || almostEqual(distance * overlap)) {
            return defaultValue;
        }
    }

    return defaultValue !== null ? Math.min(result, defaultValue) : result;
}

function segmentDistance(A: IPoint, B: IPoint, E: IPoint, F: IPoint, direction: IPoint): number {
    const normal = Point.from(direction).normal();
    const reverse = Point.from(direction).reverse();
    const dir = Point.from(direction);
    const dotA: number = normal.dot(A);
    const dotB: number = normal.dot(B);
    const dotE: number = normal.dot(E);
    const dotF: number = normal.dot(F);
    const crossA: number = dir.dot(A);
    const crossB: number = dir.dot(B);
    const crossE: number = dir.dot(E);
    const crossF: number = dir.dot(F);
    const minAB: number = Math.min(dotA, dotB);
    const maxAB: number = Math.max(dotA, dotB);
    const maxEF: number = Math.max(dotE, dotF);
    const minEF: number = Math.min(dotE, dotF);

    // segments that will merely touch at one point
    if (maxAB - minEF < TOL || maxEF - minAB < TOL) {
        return null;
    }
    // segments miss eachother completely
    const overlap: number =
        (maxAB > maxEF && minAB < minEF) || (maxEF > maxAB && minEF < minAB)
            ? 1
            : (Math.min(maxAB, maxEF) - Math.max(minAB, minEF)) / (Math.max(maxAB, maxEF) - Math.min(minAB, minEF));
    const diffAB: Point = Point.from(B).sub(A);
    const diffAE: Point = Point.from(E).sub(A);
    const diffAF: Point = Point.from(F).sub(A);
    const crossABE = diffAE.cross(diffAB);
    const crossABF = diffAF.cross(diffAB);

    // lines are colinear
    if (almostEqual(crossABE) && almostEqual(crossABF)) {
        const normAB = Point.from(B).sub(A).normal().normalize();
        const normEF = Point.from(F).sub(E).normal().normalize();

        // segment normals must point in opposite directions
        if (almostEqual(normAB.cross(normEF)) && normAB.dot(normEF) < 0) {
            // normal of AB segment must point in same direction as given direction vector
            const normdot = normAB.dot(direction);
            // the segments merely slide along eachother
            if (almostEqual(normdot)) {
                return null;
            }

            if (normdot < 0) {
                return 0;
            }
        }

        return null;
    }

    let result: number = null;

    // coincident points
    if (almostEqual(dotA, dotE)) {
        result = crossA - crossE;
    } else if (almostEqual(dotA, dotF)) {
        result = crossA - crossF;
    } else {
        result = coincedentDistance(A, B, E, F, reverse, normal, overlap, result);
    }

    if (almostEqual(dotB, dotE)) {
        result = result !== null ? Math.min(crossB - crossE, result) : crossB - crossE;
    } else if (almostEqual(dotB, dotF)) {
        result = result !== null ? Math.min(crossB - crossF, result) : crossB - crossF;
    } else {
        result = coincedentDistance(B, A, E, F, reverse, normal, overlap, result);
    }

    result = coincedentDistance(E, F, A, B, direction, normal, overlap, result);
    result = coincedentDistance(F, E, A, B, direction, normal, overlap, result);

    return result;
}

function polygonSlideDistance(inputA: IPolygon, inputB: IPolygon, direction: IPoint): number {
    const a1: Point = Point.zero();
    const a2: Point = Point.zero();
    const b1: Point = Point.zero();
    const b2: Point = Point.zero();
    const offsetA: Point = Point.create(inputA.offsetx || 0, inputA.offsety || 0);
    const offsetB: Point = Point.create(inputB.offsetx || 0, inputB.offsety || 0);
    const A = inputA.slice(0);
    const B = inputB.slice(0);

    // close the loop for polygons
    if (A[0] !== A[A.length - 1]) {
        A.push(A[0]);
    }

    if (B[0] !== B[B.length - 1]) {
        B.push(B[0]);
    }

    const edgeA = A;
    const edgeB = B;
    const sizeA: number = edgeA.length;
    const sizeB: number = edgeB.length;
    const dir = Point.from(direction).normalize();
    let distance = null;
    let d: number = 0;
    let i: number = 0;
    let j: number = 0;

    for (i = 0; i < sizeB - 1; ++i) {
        b1.update(edgeB[i]).add(offsetB);
        b2.update(edgeB[i + 1]).add(offsetB);

        for (j = 0; j < sizeA - 1; ++j) {
            a1.update(edgeA[j]).add(offsetA);
            a2.update(edgeA[j + 1]).add(offsetA);

            if (a1.almostEqual(a2) || b1.almostEqual(b2)) {
                continue; // ignore extremely small lines
            }

            d = segmentDistance(a1, a2, b1, b2, dir);

            if (d !== null && (distance === null || d < distance)) {
                if (d > 0 || almostEqual(d)) {
                    distance = d;
                }
            }
        }
    }

    return distance;
}

// project each point of B onto A in the given direction, and return the
function polygonProjectionDistance(inputA: IPolygon, inputB: IPolygon, direction: IPoint): number {
    const offsetA: Point = Point.create(inputA.offsetx || 0, inputA.offsety || 0);
    const offsetB: Point = Point.create(inputB.offsetx || 0, inputB.offsety || 0);
    const A = inputA.slice(0) as IPolygon;
    const B = inputB.slice(0) as IPolygon;

    // close the loop for polygons
    if (A[0] !== A[A.length - 1]) {
        A.push(A[0]);
    }

    if (B[0] !== B[B.length - 1]) {
        B.push(B[0]);
    }

    const sizeA: number = A.length;
    const sizeB: number = B.length;
    let distance = null;
    let p: Point = Point.zero();
    let d: number = 0;
    let s1: Point = Point.zero();
    let s2: Point = Point.zero();
    let sOffset: Point = Point.zero();
    let i: number = 0;
    let j: number = 0;
    let minProjection: number = null;

    for (i = 0; i < sizeB; ++i) {
        // the shortest/most negative projection of B onto A
        minProjection = null;
        p.update(B[i]).add(offsetB);

        for (j = 0; j < sizeA - 1; ++j) {
            s1.update(A[j]).add(offsetA);
            s2.update(A[j + 1]).add(offsetA);
            sOffset.update(s2).sub(s1);

            if (almostEqual(sOffset.cross(direction))) {
                continue;
            }

            // project point, ignore edge boundaries
            d = pointDistance(p, s1, s2, direction);

            if (d !== null && (minProjection === null || d < minProjection)) {
                minProjection = d;
            }
        }

        if (minProjection !== null && (distance === null || minProjection > distance)) {
            distance = minProjection;
        }
    }

    return distance;
}

// returns an interior NFP for the special case where A is a rectangle
function noFitPolygonRectangle(A: IPolygon, B: IPolygon): IPoint[][] {
    const minA: Point = Point.from(A[0]);
    const maxA: Point = Point.from(A[0]);
    const minB: Point = Point.from(B[0]);
    const maxB: Point = Point.from(B[0]);
    let i: number = 0;

    for (i = 1; i < A.length; ++i) {
        minA.min(A[i]);
        maxA.max(A[i]);
    }

    for (i = 1; i < B.length; ++i) {
        minB.min(B[i]);
        maxB.max(B[i]);
    }

    const minDiff = Point.from(minA).sub(minB);
    const maxDiff = Point.from(maxA).sub(maxB);

    if (maxDiff.x <= minDiff.x || maxDiff.y <= minDiff.y) {
        return null;
    }

    minDiff.add(B[0]);
    maxDiff.add(B[0]);

    return [
        [
            { x: minDiff.x, y: minDiff.y },
            { x: maxDiff.x, y: minDiff.y },
            { x: maxDiff.x, y: maxDiff.y },
            { x: minDiff.x, y: maxDiff.y }
        ]
    ];
}

// returns true if point already exists in the given nfp
function inNfp(p: Point, nfp: IPoint[][]): boolean {
    if (!nfp || nfp.length === 0) {
        return false;
    }

    const nfpCount: number = nfp.length;
    let currentNfp: IPoint[] = null;
    let pointCount: number = 0;
    let i: number = 0;
    let j: number = 0;

    for (i = 0; i < nfpCount; ++i) {
        currentNfp = nfp[i];
        pointCount = currentNfp.length;

        for (j = 0; j < pointCount; ++j) {
            if (p.almostEqual(currentNfp[j])) {
                return true;
            }
        }
    }

    return false;
}

function getInside(A: IPolygon, B: IPolygon, startPoint: Point, defaultValue: boolean | null): boolean | null {
    B.offsetx = startPoint.x;
    B.offsety = startPoint.y;

    const point: Point = Point.zero();
    let i: number = 0;
    let inPoly: boolean = false;

    for (i = 0; i < B.length; ++i) {
        point.update(B[i]).add(startPoint);
        inPoly = pointInPolygon(point, A);

        if (inPoly !== null) {
            return inPoly;
        }
    }

    return defaultValue;
}

// searches for an arrangement of A and B such that they do not overlap
// if an NFP is given, only search for startpoints that have not already been traversed in the given NFP
function searchStartPoint(inputA: IPolygon, inputB: IPolygon, inside: boolean, NFP: IPoint[][] = []): Point {
    // clone arrays
    const A = inputA.slice(0) as IPolygon;
    const B = inputB.slice(0) as IPolygon;

    // close the loop for polygons
    if (A[0] !== A[A.length - 1]) {
        A.push(A[0]);
    }

    if (B[0] !== B[B.length - 1]) {
        B.push(B[0]);
    }

    const startPoint: Point = Point.zero();
    const v: Point = Point.zero();
    const vNeg: Point = Point.zero();
    let i: number = 0;
    let j: number = 0;
    let d: number = null;
    let isInside: boolean = null;

    for (i = 0; i < A.length - 1; ++i) {
        if (!A[i].marked) {
            A[i].marked = true;
            for (j = 0; j < B.length; ++j) {
                startPoint.update(A[i]).sub(B[j]);

                isInside = getInside(A, B, startPoint, null);

                if (isInside === null) {
                    // A and B are the same
                    return null;
                }

                if (isInside === inside && !intersect(A, B) && !inNfp(startPoint, NFP)) {
                    return startPoint;
                }

                // slide B along vector
                v.update(A[i + 1]).sub(A[i]);
                vNeg.update(v).reverse();

                const d1 = polygonProjectionDistance(A, B, v);
                const d2 = polygonProjectionDistance(B, A, vNeg);

                d = -1;

                // old-todo: clean this up
                if (d1 !== null && d2 !== null) {
                    d = Math.min(d1, d2);
                } else if (d2 !== null) {
                    d = d2;
                } else if (d1 !== null) {
                    d = d1;
                }

                // only slide until no longer negative
                // old-todo: clean this up
                if (d < TOL) {
                    continue;
                }

                const vd = v.length;

                if (vd - d >= TOL) {
                    v.scale(d / vd);
                }

                startPoint.add(v);

                isInside = getInside(A, B, startPoint, isInside);

                if (isInside === inside && !intersect(A, B) && !inNfp(startPoint, NFP)) {
                    return startPoint;
                }
            }
        }
    }

    return null;
}

function getVector(
    polygon: IPolygon,
    startIndex: number,
    endIndex: number,
    baseValue: IPoint = polygon[endIndex],
    subValue: IPoint = polygon[startIndex],
    offset: Point = null
): IVector {
    const value = Point.from(baseValue).sub(subValue);

    if (offset !== null) {
        value.sub(offset);
    }

    return { value, start: polygon[startIndex], end: polygon[endIndex] };
}

// given a static polygon A and a movable polygon B, compute a no fit polygon by orbiting B about A
// if the inside flag is set, B is orbited inside of A rather than outside
// if the searchEdges flag is set, all edges of A are explored for NFPs - multiple
function noFitPolygon(A: IPolygon, B: IPolygon, inside: boolean, searchEdges: boolean) {
    if (!A || A.length < 3 || !B || B.length < 3) {
        return null;
    }

    A.offsetx = 0;
    A.offsety = 0;

    let i: number = 0;
    let j: number = 0;

    let minA = A[0].y;
    let minIndexA = 0;

    let maxB = B[0].y;
    let maxIndexB = 0;

    for (i = 1; i < A.length; ++i) {
        A[i].marked = false;
        if (A[i].y < minA) {
            minA = A[i].y;
            minIndexA = i;
        }
    }

    for (i = 1; i < B.length; ++i) {
        B[i].marked = false;
        if (B[i].y > maxB) {
            maxB = B[i].y;
            maxIndexB = i;
        }
    }

    // shift B such that the bottom-most point of B is at the top-most
    // point of A. This guarantees an initial placement with no intersections
    // no reliable heuristic for inside
    let startPoint: Point = inside ? searchStartPoint(A, B, true) : Point.from(A[minIndexA]).sub(B[maxIndexB]);

    const nfpList = [];
    const reference: Point = Point.zero();
    const start: Point = Point.zero();
    const offsetB: Point = Point.zero();
    const sizeA: number = A.length;
    const sizeB: number = B.length;
    const condition: number = 10 * (sizeA + sizeB);
    const pointA: Point = Point.zero();
    const pointANext: Point = Point.zero();
    const pointB: Point = Point.zero();
    const pointBNext: Point = Point.zero();
    const currUnitV: Point = Point.zero();
    const prevUnitV: Point = Point.zero();
    let counter: number = 0;
    let nfp: IPoint[] = null;
    let currVector: IVector = null;
    let prevVector: IVector = null;
    // maintain a list of touching points/edges
    let touchings: number[][] = null;
    let touching: number[] = null;
    let iNext: number = 0;
    let jNext: number = 0;
    let looped: boolean = false;
    let currA: number = 0;
    let prevA: number = 0;
    let nextA: number = 0;
    let currB: number = 0;
    let prevB: number = 0;
    let nextB: number = 0;
    let vectors: IVector[] = null;
    let translate: IVector = null;
    let maxDistance: number = 0;
    let distance: number = 0;
    let vecDistance: number = 0;
    let nfpSize: number = 0;
    let vLength: number = 0;

    while (startPoint !== null) {
        offsetB.update(startPoint);
        B.offsetx = offsetB.x;
        B.offsety = offsetB.y;

        touchings = [];
        prevVector = null; // keep track of previous vector
        reference.update(B[0]).add(startPoint);
        start.update(reference);
        nfp = [reference.export()];
        counter = 0;

        while (counter < condition) {
            // sanity check, prevent infinite loop
            touchings = [];
            // find touching vertices/edges
            for (i = 0; i < sizeA; ++i) {
                iNext = cycleIndex(i, sizeA, 1);
                pointA.update(A[i]);
                pointANext.update(A[iNext]);
                for (j = 0; j < sizeB; ++j) {
                    jNext = cycleIndex(j, sizeB, 1);
                    pointB.update(B[j]).add(offsetB);
                    pointBNext.update(B[jNext]).add(offsetB);

                    if (pointB.almostEqual(A[i])) {
                        touchings.push([0, i, j]);
                    } else if (pointB.onSegment(pointA, pointANext)) {
                        touchings.push([1, iNext, j]);
                    } else if (pointA.onSegment(pointB, pointBNext)) {
                        touchings.push([2, i, jNext]);
                    }
                }
            }

            // generate translation vectors from touching vertices/edges
            vectors = [];

            for (i = 0; i < touchings.length; ++i) {
                touching = touchings[i];
                // adjacent A vertices
                currA = touching[1];
                currB = touching[2];
                prevA = cycleIndex(currA, sizeA, -1); // loop
                nextA = cycleIndex(currA, sizeA, 1); // loop
                prevB = cycleIndex(currB, sizeB, -1); // loop
                nextB = cycleIndex(currB, sizeB, 1); // loop

                A[currA].marked = true;

                switch (touching[0]) {
                    case 0: {
                        vectors.push(getVector(A, currA, prevA));
                        vectors.push(getVector(A, currA, nextA));
                        // B vectors need to be inverted
                        vectors.push(getVector(B, prevB, currB));
                        vectors.push(getVector(B, nextB, currB));
                        break;
                    }
                    case 1: {
                        vectors.push(getVector(A, prevA, currA, A[currA], B[currB], offsetB));
                        vectors.push(getVector(A, currA, prevA, A[prevA], B[currB], offsetB));
                        break;
                    }
                    default: {
                        vectors.push(getVector(B, prevB, currB, A[currA], B[currB], offsetB));
                        vectors.push(getVector(B, currB, prevB, A[currA], B[prevB], offsetB));
                    }
                }
            }

            // old-todo: there should be a faster way to reject vectors
            // that will cause immediate intersection. For now just check them all
            translate = null;
            maxDistance = 0;

            for (i = 0; i < vectors.length; ++i) {
                currVector = vectors[i];

                if (currVector.value.isEmpty) {
                    continue;
                }

                // if this vector points us back to where we came from, ignore it.
                // ie cross product = 0, dot product < 0
                if (prevVector && currVector.value.dot(prevVector.value) < 0) {
                    // compare magnitude with unit vectors
                    currUnitV.update(currVector.value).normalize();
                    prevUnitV.update(prevVector.value).normalize();

                    // we need to scale down to unit vectors to normalize vector length. Could also just do a tan here
                    if (Math.abs(currUnitV.cross(prevUnitV)) < 0.0001) {
                        continue;
                    }
                }

                distance = polygonSlideDistance(A, B, currVector.value);
                vecDistance = currVector.value.length;

                if (distance === null || Math.abs(distance) > vecDistance) {
                    distance = vecDistance;
                }

                if (distance !== null && distance > maxDistance) {
                    maxDistance = distance;
                    translate = vectors[i];
                }
            }

            if (translate === null || almostEqual(maxDistance)) {
                // didn't close the loop, something went wrong here
                nfp = null;
                break;
            }

            translate.start.marked = true;
            translate.end.marked = true;

            prevVector = translate;
            maxDistance = Math.abs(maxDistance);

            // trim
            vLength = translate.value.length;

            if (maxDistance < vLength && !almostEqual(maxDistance, vLength)) {
                translate.value.scale(maxDistance / vLength);
            }

            reference.add(translate.value);

            if (reference.almostEqual(start)) {
                // we've made a full loop
                break;
            }

            // if A and B start on a touching horizontal line, the end point may not be the start point
            looped = false;
            nfpSize = nfp.length;

            if (nfpSize > 0) {
                for (i = 0; i < nfpSize - 1; ++i) {
                    if (reference.almostEqual(nfp[i])) {
                        looped = true;
                        break;
                    }
                }
            }

            if (looped) {
                // we've made a full loop
                break;
            }

            nfp.push(reference.export());

            offsetB.add(translate.value);
            B.offsetx = offsetB.x;
            B.offsety = offsetB.y;

            ++counter;
        }

        if (nfp && nfp.length > 0) {
            nfpList.push(nfp);
        }

        if (!searchEdges) {
            // only get outer NFP or first inner NFP
            break;
        }

        startPoint = searchStartPoint(A, B, inside, nfpList);
    }

    return nfpList;
}

export function pairData(pair: NFPPair, configuration: NestConfig): PairWorkerResult | null {
    const { clipperScale, exploreConcave, useHoles, rotations } = configuration;

    if (!pair || pair.length === 0) {
        return null;
    }

    const nfpContent: NFPContent = keyToNFPData(pair.key, rotations);
    const polygonA: IPolygon = rotatePolygon(pair.A, nfpContent.Arotation);
    const polygonB: IPolygon = rotatePolygon(pair.B, nfpContent.Brotation);
    let nfp: IPoint[][] = null;
    let i: number = 0;

    if (nfpContent.inside) {
        nfp = isRectangle(polygonA)
            ? noFitPolygonRectangle(polygonA, polygonB)
            : noFitPolygon(polygonA, polygonB, true, exploreConcave);

        // ensure all interior NFPs have the same winding direction
        if (nfp && nfp.length > 0) {
            for (i = 0; i < nfp.length; ++i) {
                if (polygonArea(nfp[i]) > 0) {
                    nfp[i].reverse();
                }
            }
        } else {
            // warning on null inner NFP
            // this is not an error, as the part may simply be larger than the bin or otherwise unplaceable due to geometry
            console.log('NFP Warning: ', pair.key);
        }
    } else {
        nfp = exploreConcave
            ? noFitPolygon(polygonA, polygonB, false, exploreConcave)
            : minkowskiDifference(polygonA, polygonB, clipperScale);
        // sanity check
        if (!nfp || nfp.length === 0) {
            console.log('NFP Error: ', pair.key);
            console.log('A: ', JSON.stringify(polygonA));
            console.log('B: ', JSON.stringify(polygonB));

            return null;
        }

        for (i = 0; i < nfp.length; ++i) {
            if (!exploreConcave || i === 0) {
                // if searchedges is active, only the first NFP is guaranteed to pass sanity check
                if (Math.abs(polygonArea(nfp[i])) < Math.abs(polygonArea(polygonA))) {
                    console.log('NFP Area Error: ', Math.abs(polygonArea(nfp[i])), pair.key);
                    console.log('NFP:', JSON.stringify(nfp[i]));
                    console.log('A: ', JSON.stringify(polygonA));
                    console.log('B: ', JSON.stringify(polygonB));
                    nfp.splice(i, 1);

                    return null;
                }
            }
        }

        if (nfp.length === 0) {
            return null;
        }

        // for outer NFPs, the first is guaranteed to be the largest. Any subsequent NFPs that lie inside the first are holes
        for (i = 0; i < nfp.length; ++i) {
            if (polygonArea(nfp[i]) > 0) {
                nfp[i].reverse();
            }

            if (i > 0) {
                if (pointInPolygon(nfp[i][0], nfp[0] as IPolygon)) {
                    if (polygonArea(nfp[i]) < 0) {
                        nfp[i].reverse();
                    }
                }
            }
        }

        const childCount: number = polygonA.children ? polygonA.children.length : 0;

        // generate nfps for children (holes of parts) if any exist
        if (useHoles && childCount !== 0) {
            const boundsB: BoundRect = getPolygonBounds(polygonB);

            for (i = 0; i < childCount; ++i) {
                const boundsA = getPolygonBounds(polygonA.children[i]);

                // no need to find nfp if B's bounding box is too big
                if (boundsA.width > boundsB.width && boundsA.height > boundsB.height) {
                    const noFitPolygons: IPoint[][] = noFitPolygon(polygonA.children[i], polygonB, true, exploreConcave);
                    const noFitCount: number = noFitPolygons ? noFitPolygons.length : 0;
                    // ensure all interior NFPs have the same winding direction
                    if (noFitCount !== 0) {
                        let j: number = 0;

                        for (j = 0; j < noFitCount; ++j) {
                            if (polygonArea(noFitPolygons[j]) < 0) {
                                noFitPolygons[j].reverse();
                            }

                            nfp.push(noFitPolygons[j]);
                        }
                    }
                }
            }
        }
    }

    return { key: pair.key, value: nfp };
}
