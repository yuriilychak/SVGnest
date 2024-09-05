import ClipperLib from 'js-clipper';
import { keyToNFPData, polygonArea, pointInPolygon } from './helpers';
import { almostEqual, cycleIndex, midValue } from './shared-helpers';
import ClipperWrapper from './clipper-wrapper';
import { IPoint, IPolygon, NestConfig, NFPContent, NFPPair, PairWorkerResult } from './types';
import Point from './point';
import Polygon from './polygon';
import { TOL } from './constants';

interface ISegmentCheck {
    point: Point;
    polygon: Polygon;
    segmentStart: Point;
    segmentEnd: Point;
    checkStart: Point;
    checkEnd: Point;
    target: Point;
    offset: Point;
}

interface IVector {
    value: Point;
    start: number;
    end: number;
}
// returns the intersection of AB and EF
// or null if there are no intersections or other numerical error
// if the infinite flag is set, AE and EF describe infinite lines without endpoints, they are finite line segments otherwise
function lineIntersect(A: Point, B: Point, E: Point, F: Point): boolean {
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

// old-todo: swap this for a more efficient sweep-line implementation
// returnEdges: if set, return all edges on A that have intersections

function updateIntersectPoint(point: Point, polygon: Polygon, index: number, offset: number): void {
    const pointCount: number = polygon.length;
    let currentIndex = cycleIndex(index, pointCount, offset);

    point.update(polygon.at(index));

    // go even further back if we happen to hit on a loop end point
    if (point.almostEqual(polygon.at(currentIndex))) {
        currentIndex = cycleIndex(currentIndex, pointCount, offset);
        point.update(polygon.at(currentIndex));
    }
}

function getSegmentCheck(
    point: Point,
    polygon: Polygon,
    segmentStart: Point,
    segmentEnd: Point,
    checkStart: Point,
    checkEnd: Point,
    target: Point,
    offset: Point
): ISegmentCheck {
    return { point, polygon, segmentStart, segmentEnd, checkStart, checkEnd, target, offset };
}

function intersect(polygonA: Polygon, polygonB: Polygon, offset: Point): boolean {
    const a0: Point = Point.zero();
    const a1: Point = Point.zero();
    const a2: Point = Point.zero();
    const a3: Point = Point.zero();
    const b0: Point = Point.zero();
    const b1: Point = Point.zero();
    const b2: Point = Point.zero();
    const b3: Point = Point.zero();
    const offsetA: Point = Point.zero();
    const pointCountA: number = polygonA.length;
    const pointCountB: number = polygonB.length;
    const segmentChecks: ISegmentCheck[] = [
        getSegmentCheck(b1, polygonA, a1, a2, b0, b2, a1, offset),
        getSegmentCheck(b2, polygonA, a1, a2, b1, b3, a2, offset),
        getSegmentCheck(a1, polygonB, b1, b2, a0, a2, b2, offsetA),
        getSegmentCheck(a2, polygonB, b1, b2, a1, a3, a1, offsetA)
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
        a1.update(polygonA.at(i));
        a2.update(polygonA.at(i + 1));

        updateIntersectPoint(a0, polygonA, i, -1);
        updateIntersectPoint(a3, polygonA, i + 1, 1);

        for (j = 0; j < pointCountB - 1; ++j) {
            b1.update(polygonB.at(j));
            b2.update(polygonB.at(j + 1));

            updateIntersectPoint(b0, polygonB, j, -1);
            updateIntersectPoint(b3, polygonB, j + 1, 1);

            b0.add(offset);
            b1.add(offset);
            b3.add(offset);
            b2.add(offset);

            segmentStats = null;

            for (k = 0; k < segmentCheckCount; ++k) {
                segmentCheck = segmentChecks[k];

                if (
                    segmentCheck.point.onSegment(segmentCheck.segmentStart, segmentCheck.segmentEnd) ||
                    segmentCheck.point.almostEqual(segmentCheck.target)
                ) {
                    // if a point is on a segment, it could intersect or it could not. Check via the neighboring points
                    pointIn1 = segmentCheck.polygon.pointIn(segmentCheck.checkStart, segmentCheck.offset);
                    pointIn2 = segmentCheck.polygon.pointIn(segmentCheck.checkEnd, segmentCheck.offset);

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

function minkowskiDifference(polygonA: Polygon, polygonB: Polygon, clipperScale: number): IPoint[][] {
    const clipperA: ClipperLib.IntPoint[] = ClipperWrapper.toClipper(polygonA, clipperScale);
    const clipperB: ClipperLib.IntPoint[] = ClipperWrapper.toClipper(polygonB, -clipperScale);
    const solutions: ClipperLib.IntPoint[][] = ClipperLib.Clipper.MinkowskiSum(clipperA, clipperB, true);
    const solutionCount: number = solutions.length;
    const firstPoint: IPoint = polygonB.first;
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

function pointDistance(p: Point, s1: Point, s2: Point, inputNormal: Point, infinite: boolean = false): number {
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
    point1: Point,
    point2: Point,
    point3: Point,
    point4: Point,
    direction: Point,
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

function segmentDistance(A: Point, B: Point, E: Point, F: Point, direction: Point): number {
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

function polygonSlideDistance(polygonA: Polygon, polygonB: Polygon, direction: IPoint, offset: Point): number {
    const a1: Point = Point.zero();
    const a2: Point = Point.zero();
    const b1: Point = Point.zero();
    const b2: Point = Point.zero();
    const sizeA: number = polygonA.length;
    const sizeB: number = polygonB.length;
    const dir = Point.from(direction).normalize();
    let distance = null;
    let d: number = 0;
    let i: number = 0;
    let j: number = 0;

    for (i = 0; i < sizeB; ++i) {
        b1.update(polygonB.at(i)).add(offset);
        b2.update(polygonB.at(cycleIndex(i, sizeB, 1))).add(offset);

        for (j = 0; j < sizeA; ++j) {
            a1.update(polygonA.at(j));
            a2.update(polygonA.at(cycleIndex(j, sizeA, 1)));

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
function polygonProjectionDistance(polygonA: Polygon, polygonB: Polygon, direction: Point, offset: Point): number {
    const sizeA: number = polygonA.length;
    const sizeB: number = polygonB.length;
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
        p.update(polygonB.at(i)).add(offset);

        for (j = 0; j < sizeA; ++j) {
            s1.update(polygonA.at(j));
            s2.update(polygonA.at(cycleIndex(j, sizeA, 1)));
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
function noFitPolygonRectangle(A: Polygon, B: Polygon): IPoint[][] {
    const minA: Point = Point.from(A.first);
    const maxA: Point = Point.from(A.first);
    const minB: Point = Point.from(B.first);
    const maxB: Point = Point.from(B.first);
    let i: number = 0;

    for (i = 1; i < A.length; ++i) {
        minA.min(A.at(i));
        maxA.max(A.at(i));
    }

    for (i = 1; i < B.length; ++i) {
        minB.min(B.at(i));
        maxB.max(B.at(i));
    }

    const minDiff = Point.from(minA).sub(minB);
    const maxDiff = Point.from(maxA).sub(maxB);

    if (maxDiff.x <= minDiff.x || maxDiff.y <= minDiff.y) {
        return null;
    }

    minDiff.add(B.first);
    maxDiff.add(B.first);

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

function getInside(polygonA: Polygon, polygonB: Polygon, startPoint: Point, defaultValue: boolean | null): boolean | null {
    const point: Point = Point.zero();
    const sizeB: number = polygonB.length;
    let i: number = 0;
    let inPoly: boolean = false;

    for (i = 0; i < sizeB; ++i) {
        point.update(polygonB.at(i)).add(startPoint);
        inPoly = polygonA.pointIn(point);

        if (inPoly !== null) {
            return inPoly;
        }
    }

    return defaultValue;
}

// searches for an arrangement of A and B such that they do not overlap
// if an NFP is given, only search for startpoints that have not already been traversed in the given NFP
function searchStartPoint(
    polygonA: Polygon,
    polygonB: Polygon,
    inside: boolean,
    markedIndices: number[],
    NFP: IPoint[][] = []
): Point {
    const sizeA: number = polygonA.length;
    const sizeB: number = polygonB.length;
    const startPoint: Point = Point.zero();
    const v: Point = Point.zero();
    const vNeg: Point = Point.zero();
    let i: number = 0;
    let j: number = 0;
    let d: number = null;
    let isInside: boolean = null;

    for (i = 0; i < sizeA; ++i) {
        if (markedIndices.indexOf(i) === -1) {
            markedIndices.push(i);

            for (j = 0; j < sizeB; ++j) {
                startPoint.update(polygonA.at(i)).sub(polygonB.at(j));

                isInside = getInside(polygonA, polygonB, startPoint, null);

                if (isInside === null) {
                    // A and B are the same
                    return null;
                }

                if (isInside === inside && !intersect(polygonA, polygonB, startPoint) && !inNfp(startPoint, NFP)) {
                    return startPoint;
                }

                // slide B along vector
                v.update(polygonA.at(cycleIndex(i, sizeA, 1))).sub(polygonA.at(i));
                vNeg.update(v).reverse();

                const d1 = polygonProjectionDistance(polygonA, polygonB, v, startPoint);
                const d2 = polygonProjectionDistance(polygonB, polygonA, vNeg, startPoint);

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

                isInside = getInside(polygonA, polygonB, startPoint, isInside);

                if (isInside === inside && !intersect(polygonA, polygonB, startPoint) && !inNfp(startPoint, NFP)) {
                    return startPoint;
                }
            }
        }
    }

    return null;
}

function getVector(start: number, end: number, baseValue: Point, subValue: Point, offset: Point = null): IVector {
    const value = Point.from(baseValue).sub(subValue);

    if (offset !== null) {
        value.sub(offset);
    }

    return { value, start, end };
}

// given a static polygon A and a movable polygon B, compute a no fit polygon by orbiting B about A
// if the inside flag is set, B is orbited inside of A rather than outside
// if the searchEdges flag is set, all edges of A are explored for NFPs - multiple
function noFitPolygon(polygonA: Polygon, polygonB: Polygon, inside: boolean, searchEdges: boolean) {
    if (polygonA.isBroken || polygonB.isBroken) {
        return null;
    }

    let i: number = 0;
    let j: number = 0;

    let minA = polygonA.first.y;
    let minIndexA = 0;

    let maxB = polygonB.first.y;
    let maxIndexB = 0;
    const markedIndices: number[] = [];

    for (i = 1; i < polygonA.length; ++i) {
        if (polygonA.at(i).y < minA) {
            minA = polygonA.at(i).y;
            minIndexA = i;
        }
    }

    for (i = 1; i < polygonB.length; ++i) {
        if (polygonB.at(i).y > maxB) {
            maxB = polygonB.at(i).y;
            maxIndexB = i;
        }
    }

    // shift B such that the bottom-most point of B is at the top-most
    // point of A. This guarantees an initial placement with no intersections
    // no reliable heuristic for inside
    let startPoint: Point = inside
        ? searchStartPoint(polygonA, polygonB, true, markedIndices)
        : Point.from(polygonA.at(minIndexA)).sub(polygonB.at(maxIndexB));
    const nfpList = [];
    const reference: Point = Point.zero();
    const start: Point = Point.zero();
    const sizeA: number = polygonA.length;
    const sizeB: number = polygonB.length;
    const condition: number = 10 * (sizeA + sizeB);
    const pointA: Point = Point.zero();
    const pointANext: Point = Point.zero();
    const pointB: Point = Point.zero();
    const pointBNext: Point = Point.zero();
    const currUnitV: Point = Point.zero();
    const prevUnitV: Point = Point.zero();
    const offset: Point = Point.zero();
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
        offset.update(startPoint);

        touchings = [];
        prevVector = null; // keep track of previous vector
        reference.update(polygonB.first).add(startPoint);
        start.update(reference);
        nfp = [reference.export()];
        counter = 0;

        while (counter < condition) {
            // sanity check, prevent infinite loop
            touchings = [];
            // find touching vertices/edges
            for (i = 0; i < sizeA; ++i) {
                iNext = cycleIndex(i, sizeA, 1);
                pointA.update(polygonA.at(i));
                pointANext.update(polygonA.at(iNext));
                for (j = 0; j < sizeB; ++j) {
                    jNext = cycleIndex(j, sizeB, 1);
                    pointB.update(polygonB.at(j)).add(offset);
                    pointBNext.update(polygonB.at(jNext)).add(offset);

                    if (pointB.almostEqual(polygonA.at(i))) {
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

                markedIndices.push(currA);

                switch (touching[0]) {
                    case 0: {
                        vectors.push(getVector(currA, prevA, polygonA.at(prevA), polygonA.at(currA)));
                        vectors.push(getVector(currA, nextA, polygonA.at(nextA), polygonA.at(currA)));
                        // B vectors need to be inverted
                        vectors.push(getVector(-1, -1, polygonB.at(currB), polygonB.at(prevB)));
                        vectors.push(getVector(-1, -1, polygonB.at(currB), polygonB.at(nextB)));
                        break;
                    }
                    case 1: {
                        vectors.push(getVector(prevA, currA, polygonA.at(currA), polygonB.at(currB), offset));
                        vectors.push(getVector(currA, prevA, polygonA.at(prevA), polygonB.at(currB), offset));
                        break;
                    }
                    default: {
                        vectors.push(getVector(-1, -1, polygonA.at(currA), polygonB.at(currB), offset));
                        vectors.push(getVector(-1, -1, polygonA.at(currA), polygonB.at(prevB), offset));
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

                distance = polygonSlideDistance(polygonA, polygonB, currVector.value, offset);
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

            if (translate.start !== -1) {
                markedIndices.push(translate.start);
            }

            if (translate.end !== -1) {
                markedIndices.push(translate.end);
            }

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

            offset.add(translate.value);

            ++counter;
        }

        if (nfp && nfp.length > 0) {
            nfpList.push(nfp);
        }

        if (!searchEdges) {
            // only get outer NFP or first inner NFP
            break;
        }

        startPoint = searchStartPoint(polygonA, polygonB, inside, markedIndices, nfpList);
    }

    return nfpList;
}

export function pairData(pair: NFPPair, configuration: NestConfig): PairWorkerResult | null {
    const { clipperScale, exploreConcave, useHoles, rotations } = configuration;

    if (!pair || pair.length === 0) {
        return null;
    }

    const nfpContent: NFPContent = keyToNFPData(pair.key, rotations);
    const polygonA: Polygon = Polygon.fromLegacy(pair.A);
    const polygonB: Polygon = Polygon.fromLegacy(pair.B);
    let nfp: IPoint[][] = null;
    let i: number = 0;

    polygonA.rotate(nfpContent.Arotation);
    polygonB.rotate(nfpContent.Brotation);

    if (nfpContent.inside) {
        nfp = polygonA.isRectangle
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
                if (Math.abs(polygonArea(nfp[i])) < Math.abs(polygonA.area)) {
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

        // generate nfps for children (holes of parts) if any exist
        if (useHoles && polygonA.hasChildren) {
            const childCount: number = polygonA.childrCount;
            let child: Polygon = null;

            for (i = 0; i < childCount; ++i) {
                child = polygonA.children[i];

                // no need to find nfp if B's bounding box is too big
                if (child.width > polygonB.width && child.height > polygonB.height) {
                    const noFitPolygons: IPoint[][] = noFitPolygon(child, polygonB, true, exploreConcave);
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
