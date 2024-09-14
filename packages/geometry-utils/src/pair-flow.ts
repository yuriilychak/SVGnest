import ClipperLib from 'js-clipper';
import { almostEqual, cycleIndex, midValue, keyToNFPData } from './shared-helpers';
import ClipperWrapper from './clipper-wrapper';
import { IPoint, NestConfig, NFPContent, NFPPair, PairWorkerResult } from './types';
import Point from './point';
import Polygon from './polygon';
import { NFP_INFO_START_INDEX, NFP_SHIFT_AMOUNT, TOL } from './constants';
import PointPool from './point-pool';

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

function getSegmentStats({
    point,
    segmentStart,
    segmentEnd,
    target,
    polygon,
    checkStart,
    checkEnd,
    offset
}: ISegmentCheck): boolean {
    if (point.onSegment(segmentStart, segmentEnd) || point.almostEqual(target)) {
        // if a point is on a segment, it could intersect or it could not. Check via the neighboring points
        const pointIn1 = polygon.pointIn(checkStart, offset);
        const pointIn2 = polygon.pointIn(checkEnd, offset);

        return pointIn1 !== null && pointIn2 !== null && pointIn1 !== pointIn2;
    }

    return null;
}

function intersect(pointPool: PointPool, polygonA: Polygon, polygonB: Polygon, offset: Point): boolean {
    const pointIndices: number = pointPool.alloc(9);
    const a0: Point = pointPool.get(pointIndices, 0);
    const a1: Point = pointPool.get(pointIndices, 1);
    const a2: Point = pointPool.get(pointIndices, 2);
    const a3: Point = pointPool.get(pointIndices, 3);
    const b0: Point = pointPool.get(pointIndices, 4);
    const b1: Point = pointPool.get(pointIndices, 5);
    const b2: Point = pointPool.get(pointIndices, 6);
    const b3: Point = pointPool.get(pointIndices, 7);
    const offsetA: Point = pointPool.get(pointIndices, 8).set(0, 0);
    const pointCountA: number = polygonA.length;
    const pointCountB: number = polygonB.length;
    const segmentChecks: ISegmentCheck[] = [
        getSegmentCheck(b1, polygonA, a1, a2, b0, b2, a1, offset),
        getSegmentCheck(b2, polygonA, a1, a2, b1, b3, a2, offset),
        getSegmentCheck(a1, polygonB, b1, b2, a0, a2, b2, offsetA),
        getSegmentCheck(a2, polygonB, b1, b2, a1, a3, a1, offsetA)
    ];
    const segmentCheckCount = segmentChecks.length;
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
                segmentStats = getSegmentStats(segmentChecks[k]);

                if (segmentStats !== null) {
                    break;
                }
            }

            if (segmentStats || (segmentStats === null && lineIntersect(b1, b2, a1, a2))) {
                pointPool.malloc(pointIndices);

                return true;
            } else if (segmentStats === false) {
                continue;
            }
        }
    }

    pointPool.malloc(pointIndices);

    return false;
}

function minkowskiDifference(polygon: Polygon, polygonA: Polygon, polygonB: Polygon): Float64Array[] {
    const clipperA: ClipperLib.IntPoint[] = ClipperWrapper.toClipper(polygonA);
    const clipperB: ClipperLib.IntPoint[] = ClipperWrapper.toClipper(polygonB, -1);
    const solutions: ClipperLib.IntPoint[][] = ClipperLib.Clipper.MinkowskiSum(clipperA, clipperB, true);
    const solutionCount: number = solutions.length;
    const firstPoint: IPoint = polygonB.first;
    const memSeg: Float64Array = new Float64Array(1024);
    let resuly: Float64Array = null;
    let largestArea: number = null;
    let area: number = 0;
    let i: number = 0;

    for (i = 0; i < solutionCount; ++i) {
        ClipperWrapper.toMemSeg(solutions[i], memSeg, firstPoint);
        polygon.bind(memSeg, 0, solutions[i].length);
        area = polygon.area;

        if (largestArea === null || largestArea > area) {
            resuly = memSeg.slice(0, solutions[i].length << 1);
            largestArea = area;
        }
    }

    return [resuly];
}

function pointDistance(
    pointPool: PointPool,
    p: Point,
    s1: Point,
    s2: Point,
    inputNormal: Point,
    infinite: boolean = false
): number {
    const pointIndices: number = pointPool.alloc(2);
    const normal = pointPool.get(pointIndices, 0).update(inputNormal).normalize();
    const dir = pointPool.get(pointIndices, 1).update(normal).normal();
    const pdot = dir.dot(p);
    const s1dot = dir.dot(s1);
    const s2dot = dir.dot(s2);
    const pdotnorm = normal.dot(p);
    const s1dotnorm = normal.dot(s1);
    const s2dotnorm = normal.dot(s2);

    if (!infinite) {
        if (midValue(pdot, s1dot, s2dot) > TOL) {
            pointPool.malloc(pointIndices);

            return NaN; // dot doesn't collide with segment, or lies directly on the vertex
        }

        if (almostEqual(pdot, s1dot) && almostEqual(pdot, s2dot) && midValue(pdotnorm, s1dotnorm, s2dotnorm) > 0) {
            pointPool.malloc(pointIndices);

            return pdotnorm - Math.max(s1dotnorm, s2dotnorm);
        }
    }

    pointPool.malloc(pointIndices);

    return s1dotnorm - pdotnorm - ((s1dotnorm - s2dotnorm) * (s1dot - pdot)) / (s1dot - s2dot);
}

function coincedentDistance(
    pointPool: PointPool,
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

    const result: number = pointDistance(pointPool, point1, point3, point4, direction);

    if (Number.isNaN(result)) {
        return defaultValue;
    }

    if (almostEqual(result)) {
        //  A currently touches EF, but AB is moving away from EF
        const distance = pointDistance(pointPool, point2, point3, point4, direction, true);
        if (distance < 0 || almostEqual(distance * overlap)) {
            return defaultValue;
        }
    }

    return Number.isNaN(defaultValue) ? result : Math.min(result, defaultValue);
}

function segmentDistance(pointPool: PointPool, A: Point, B: Point, E: Point, F: Point, direction: Point): number {
    let sharedPointIndices: number = pointPool.alloc(3);
    const normal = pointPool.get(sharedPointIndices, 0).update(direction).normal();
    const reverse = pointPool.get(sharedPointIndices, 1).update(direction).reverse();
    const dir = pointPool.get(sharedPointIndices, 2).update(direction);
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
        pointPool.malloc(sharedPointIndices);

        return NaN;
    }
    // segments miss eachother completely
    const overlap: number =
        (maxAB > maxEF && minAB < minEF) || (maxEF > maxAB && minEF < minAB)
            ? 1
            : (Math.min(maxAB, maxEF) - Math.max(minAB, minEF)) / (Math.max(maxAB, maxEF) - Math.min(minAB, minEF));
    const pointIndices2: number = pointPool.alloc(3);
    const diffAB: Point = pointPool.get(pointIndices2, 0).update(B).sub(A);
    const diffAE: Point = pointPool.get(pointIndices2, 1).update(E).sub(A);
    const diffAF: Point = pointPool.get(pointIndices2, 2).update(F).sub(A);
    const crossABE = diffAE.cross(diffAB);
    const crossABF = diffAF.cross(diffAB);

    sharedPointIndices |= pointIndices2;

    // lines are colinear
    if (almostEqual(crossABE) && almostEqual(crossABF)) {
        const pointIndices3: number = pointPool.alloc(2);
        const normAB = pointPool.get(pointIndices3, 0).update(B).sub(A).normal().normalize();
        const normEF = pointPool.get(pointIndices3, 1).update(F).sub(E).normal().normalize();

        sharedPointIndices |= pointIndices3;

        // segment normals must point in opposite directions
        if (almostEqual(normAB.cross(normEF)) && normAB.dot(normEF) < 0) {
            // normal of AB segment must point in same direction as given direction vector
            const normdot = normAB.dot(direction);
            // the segments merely slide along eachother
            if (almostEqual(normdot)) {
                pointPool.malloc(sharedPointIndices);

                return NaN;
            }

            if (normdot < 0) {
                pointPool.malloc(sharedPointIndices);

                return 0;
            }
        }

        pointPool.malloc(sharedPointIndices);

        return NaN;
    }

    let result: number = NaN;

    // coincident points
    if (almostEqual(dotA, dotE)) {
        result = crossA - crossE;
    } else if (almostEqual(dotA, dotF)) {
        result = crossA - crossF;
    } else {
        result = coincedentDistance(pointPool, A, B, E, F, reverse, normal, overlap, result);
    }

    if (almostEqual(dotB, dotE)) {
        result = Number.isNaN(result) ? crossB - crossE : Math.min(crossB - crossE, result);
    } else if (almostEqual(dotB, dotF)) {
        result = Number.isNaN(result) ? crossB - crossF : Math.min(crossB - crossF, result);
    } else {
        result = coincedentDistance(pointPool, B, A, E, F, reverse, normal, overlap, result);
    }

    result = coincedentDistance(pointPool, E, F, A, B, direction, normal, overlap, result);
    result = coincedentDistance(pointPool, F, E, A, B, direction, normal, overlap, result);

    pointPool.malloc(sharedPointIndices);

    return result;
}

function polygonSlideDistance(
    pointPool: PointPool,
    polygonA: Polygon,
    polygonB: Polygon,
    direction: IPoint,
    offset: Point
): number {
    const pointIndices: number = pointPool.alloc(5);
    const a1: Point = pointPool.get(pointIndices, 0);
    const a2: Point = pointPool.get(pointIndices, 1);
    const b1: Point = pointPool.get(pointIndices, 2);
    const b2: Point = pointPool.get(pointIndices, 3);
    const dir = pointPool.get(pointIndices, 4).update(direction).normalize();
    const sizeA: number = polygonA.length;
    const sizeB: number = polygonB.length;
    let distance = NaN;
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

            d = segmentDistance(pointPool, a1, a2, b1, b2, dir);

            if (!Number.isNaN(d) && (Number.isNaN(distance) || d < distance)) {
                if (d > 0 || almostEqual(d)) {
                    distance = d;
                }
            }
        }
    }

    pointPool.malloc(pointIndices);

    return distance;
}

// project each point of B onto A in the given direction, and return the
function polygonProjectionDistance(
    pointPool: PointPool,
    polygonA: Polygon,
    polygonB: Polygon,
    direction: Point,
    offset: Point
): number {
    const sizeA: number = polygonA.length;
    const sizeB: number = polygonB.length;
    const pointIndices: number = pointPool.alloc(4);
    const p: Point = pointPool.get(pointIndices, 0);
    const s1: Point = pointPool.get(pointIndices, 1);
    const s2: Point = pointPool.get(pointIndices, 2);
    const sOffset: Point = pointPool.get(pointIndices, 3);
    let result: number = NaN;
    let d: number = 0;
    let i: number = 0;
    let j: number = 0;
    let minProjection: number = 0;

    for (i = 0; i < sizeB; ++i) {
        // the shortest/most negative projection of B onto A
        minProjection = NaN;
        p.update(polygonB.at(i)).add(offset);

        for (j = 0; j < sizeA - 1; ++j) {
            s1.update(polygonA.at(j));
            s2.update(polygonA.at(cycleIndex(j, sizeA, 1)));
            sOffset.update(s2).sub(s1);

            if (almostEqual(sOffset.cross(direction))) {
                continue;
            }

            // project point, ignore edge boundaries
            d = pointDistance(pointPool, p, s1, s2, direction);

            if (!Number.isNaN(d) && (Number.isNaN(minProjection) || d < minProjection)) {
                minProjection = d;
            }
        }

        if (!Number.isNaN(minProjection) && (Number.isNaN(result) || minProjection > result)) {
            result = minProjection;
        }
    }

    pointPool.malloc(pointIndices);

    return result;
}

// returns an interior NFP for the special case where A is a rectangle
function noFitPolygonRectangle(pointPool: PointPool, A: Polygon, B: Polygon): Float64Array[] {
    const pointIndices = pointPool.alloc(2);
    const minDiff = pointPool.get(pointIndices, 0).update(A.position).sub(B.position);
    const maxDiff = pointPool.get(pointIndices, 1).update(A.size).sub(B.size);

    if (maxDiff.x <= 0 || maxDiff.y <= 0) {
        return [];
    }

    minDiff.add(B.first);
    maxDiff.add(minDiff);

    const result = [new Float64Array([minDiff.x, minDiff.y, maxDiff.x, minDiff.y, maxDiff.x, maxDiff.y, minDiff.x, maxDiff.y])];

    pointPool.malloc(pointIndices);

    return result;
}

// returns true if point already exists in the given nfp
function inNfp(polygon: Polygon, point: Point, nfp: Float64Array[]): boolean {
    if (nfp.length === 0) {
        return false;
    }

    const nfpCount: number = nfp.length;
    let pointCount: number = 0;
    let i: number = 0;
    let j: number = 0;

    for (i = 0; i < nfpCount; ++i) {
        polygon.bind(nfp[i]);
        pointCount = polygon.length;

        for (j = 0; j < pointCount; ++j) {
            if (point.almostEqual(polygon.at(j))) {
                return true;
            }
        }
    }

    return false;
}

function getInside(
    pointPool: PointPool,
    polygonA: Polygon,
    polygonB: Polygon,
    offset: Point,
    defaultValue: boolean | null
): boolean | null {
    const pointIndices: number = pointPool.alloc(1);
    const point: Point = pointPool.get(pointIndices, 0);
    const sizeB: number = polygonB.length;
    let i: number = 0;
    let inPoly: boolean = false;

    for (i = 0; i < sizeB; ++i) {
        point.update(polygonB.at(i)).add(offset);
        inPoly = polygonA.pointIn(point);

        if (inPoly !== null) {
            pointPool.malloc(pointIndices);

            return inPoly;
        }
    }

    pointPool.malloc(pointIndices);

    return defaultValue;
}

// searches for an arrangement of A and B such that they do not overlap
// if an NFP is given, only search for startpoints that have not already been traversed in the given NFP
function searchStartPoint(
    pointPool: PointPool,
    polygon: Polygon,
    polygonA: Polygon,
    polygonB: Polygon,
    inside: boolean,
    markedIndices: number[],
    nfp: Float64Array[] = []
): IPoint {
    polygonA.close();
    polygonB.close();
    const sizeA: number = polygonA.length;
    const sizeB: number = polygonB.length;
    const pointIndices = pointPool.alloc(3);
    const startPoint: Point = pointPool.get(pointIndices, 0);
    const v: Point = pointPool.get(pointIndices, 1);
    const vNeg: Point = pointPool.get(pointIndices, 2);
    let i: number = 0;
    let j: number = 0;
    let d: number = 0;
    let isInside: boolean = false;
    let result: IPoint = null;

    for (i = 0; i < sizeA - 1; ++i) {
        if (markedIndices.indexOf(i) === -1) {
            markedIndices.push(i);

            for (j = 0; j < sizeB; ++j) {
                startPoint.update(polygonA.at(i)).sub(polygonB.at(cycleIndex(j, sizeB, 0)));

                isInside = getInside(pointPool, polygonA, polygonB, startPoint, null);

                if (isInside === null) {
                    pointPool.malloc(pointIndices);
                    // A and B are the same
                    return null;
                }

                if (
                    isInside === inside &&
                    !intersect(pointPool, polygonA, polygonB, startPoint) &&
                    !inNfp(polygon, startPoint, nfp)
                ) {
                    result = startPoint.export();
                    pointPool.malloc(pointIndices);

                    return result;
                }

                // slide B along vector
                v.update(polygonA.at(cycleIndex(i, sizeA, 1))).sub(polygonA.at(i));
                vNeg.update(v).reverse();

                const d1 = polygonProjectionDistance(pointPool, polygonA, polygonB, v, startPoint);
                const d2 = polygonProjectionDistance(pointPool, polygonB, polygonA, vNeg, startPoint);

                d = -1;

                if (!Number.isNaN(d1) && !Number.isNaN(d2)) {
                    d = Math.min(d1, d2);
                } else if (!Number.isNaN(d2)) {
                    d = d2;
                } else if (!Number.isNaN(d1)) {
                    d = d1;
                }

                // only slide until no longer negative
                // old-todo: clean this up
                if (d < TOL) {
                    continue;
                }

                const vd = v.length;

                if (vd - d >= TOL) {
                    v.scaleUp(d / vd);
                }

                startPoint.add(v);

                isInside = getInside(pointPool, polygonA, polygonB, startPoint, isInside);

                if (
                    isInside === inside &&
                    !intersect(pointPool, polygonA, polygonB, startPoint) &&
                    !inNfp(polygon, startPoint, nfp)
                ) {
                    result = startPoint.export();
                    pointPool.malloc(pointIndices);

                    return result;
                }
            }
        }
    }

    pointPool.malloc(pointIndices);

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
function noFitPolygon(
    pointPool: PointPool,
    polygon: Polygon,
    polygonA: Polygon,
    polygonB: Polygon,
    inside: boolean,
    searchEdges: boolean
): Float64Array[] {
    if (polygonA.isBroken || polygonB.isBroken) {
        return [];
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

    const pointIndices = pointPool.alloc(16);
    const reference: Point = pointPool.get(pointIndices, 0);
    const start: Point = pointPool.get(pointIndices, 1);
    const pointA: Point = pointPool.get(pointIndices, 2);
    const pointANext: Point = pointPool.get(pointIndices, 3);
    const pointB: Point = pointPool.get(pointIndices, 4);
    const pointBNext: Point = pointPool.get(pointIndices, 5);
    const currUnitV: Point = pointPool.get(pointIndices, 6);
    const prevUnitV: Point = pointPool.get(pointIndices, 7);
    const offset: Point = pointPool.get(pointIndices, 8);
    const startPoint: Point = pointPool.get(pointIndices, 9).update(polygonA.at(minIndexA)).sub(polygonB.at(maxIndexB));
    const prevA: Point = pointPool.get(pointIndices, 10);
    const currA: Point = pointPool.get(pointIndices, 11);
    const nextA: Point = pointPool.get(pointIndices, 12);
    const prevB: Point = pointPool.get(pointIndices, 13);
    const currB: Point = pointPool.get(pointIndices, 14);
    const nextB: Point = pointPool.get(pointIndices, 15);
    const result: Float64Array[] = [];
    const sizeA: number = polygonA.length;
    const sizeB: number = polygonB.length;
    const condition: number = 10 * (sizeA + sizeB);
    let counter: number = 0;
    let nfp: number[] = null;
    let startPointRaw: IPoint = null;
    let currVector: IVector = null;
    let prevVector: IVector = null;
    // maintain a list of touching points/edges
    let touchings: number[][] = null;
    let touching: number[] = null;
    let iNext: number = 0;
    let jNext: number = 0;
    let isLooped: boolean = false;
    let currIndexA: number = 0;
    let prevIndexA: number = 0;
    let nextIndexA: number = 0;
    let currIndexB: number = 0;
    let prevIndexB: number = 0;
    let nextIndexB: number = 0;
    let vectors: IVector[] = null;
    let translate: IVector = null;
    let maxDistance: number = 0;
    let distance: number = 0;
    let vecDistance: number = 0;
    let nfpSize: number = 0;
    let vLength: number = 0;

    // shift B such that the bottom-most point of B is at the top-most
    // point of A. This guarantees an initial placement with no intersections
    // no reliable heuristic for inside
    if (inside) {
        startPointRaw = searchStartPoint(pointPool, polygon, polygonA, polygonB, true, markedIndices);

        if (startPointRaw === null) {
            pointPool.malloc(pointIndices);

            return result;
        }

        startPoint.update(startPointRaw);
    }

    while (true) {
        offset.update(startPoint);

        touchings = [];
        prevVector = null; // keep track of previous vector
        reference.update(polygonB.first).add(startPoint);
        start.update(reference);
        nfp = [reference.x, reference.y];
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
                currIndexA = touching[1];
                currIndexB = touching[2];
                prevIndexA = cycleIndex(currIndexA, sizeA, -1); // loop
                nextIndexA = cycleIndex(currIndexA, sizeA, 1); // loop
                prevIndexB = cycleIndex(currIndexB, sizeB, -1); // loop
                nextIndexB = cycleIndex(currIndexB, sizeB, 1); // loop

                markedIndices.push(currIndexA);

                prevA.update(polygonA.at(prevIndexA));
                currA.update(polygonA.at(currIndexA));
                nextA.update(polygonA.at(nextIndexA));
                prevB.update(polygonB.at(prevIndexB));
                currB.update(polygonB.at(currIndexB));
                nextB.update(polygonB.at(nextIndexB));

                switch (touching[0]) {
                    case 0: {
                        vectors.push(getVector(currIndexA, prevIndexA, prevA, currA));
                        vectors.push(getVector(currIndexA, nextIndexA, nextA, currA));
                        // B vectors need to be inverted
                        vectors.push(getVector(-1, -1, currB, prevB));
                        vectors.push(getVector(-1, -1, currB, nextB));
                        break;
                    }
                    case 1: {
                        vectors.push(getVector(prevIndexA, currIndexA, currA, currB, offset));
                        vectors.push(getVector(currIndexA, prevIndexA, prevA, currB, offset));
                        break;
                    }
                    default: {
                        vectors.push(getVector(-1, -1, currA, currB, offset));
                        vectors.push(getVector(-1, -1, currA, prevB, offset));
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

                distance = polygonSlideDistance(pointPool, polygonA, polygonB, currVector.value, offset);
                vecDistance = currVector.value.length;

                if (Number.isNaN(distance) || Math.abs(distance) > vecDistance) {
                    distance = vecDistance;
                }

                if (!Number.isNaN(distance) && distance > maxDistance) {
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
                translate.value.scaleUp(maxDistance / vLength);
            }

            reference.add(translate.value);

            if (reference.almostEqual(start)) {
                // we've made a full loop
                break;
            }

            // if A and B start on a touching horizontal line, the end point may not be the start point
            isLooped = false;
            nfpSize = nfp.length >> 1;

            if (nfpSize > 0) {
                for (i = 0; i < nfpSize - 1; ++i) {
                    if (almostEqual(nfp[i << 1], reference.x) && almostEqual(nfp[(i << 1) + 1], reference.y)) {
                        isLooped = true;
                        break;
                    }
                }
            }

            if (isLooped) {
                // we've made a full loop
                break;
            }

            nfp.push(reference.x);
            nfp.push(reference.y);

            offset.add(translate.value);

            ++counter;
        }

        if (nfp && nfp.length > 0) {
            result.push(new Float64Array(nfp));
        }

        if (!searchEdges) {
            // only get outer NFP or first inner NFP
            break;
        }

        startPointRaw = searchStartPoint(pointPool, polygon, polygonA, polygonB, inside, markedIndices, result);

        if (startPointRaw === null) {
            break;
        }

        startPoint.update(startPointRaw);
    }

    pointPool.malloc(pointIndices);

    return result;
}

function getResult(key: number, nfpArrays: Float64Array[]): Float64Array {
    const nfpCount: number = nfpArrays.length;
    const info = new Float64Array(nfpCount);
    let totalSize: number = NFP_INFO_START_INDEX + nfpCount;
    let offset: number = 0;
    let size: number = 0;
    let i: number = 0;

    for (i = 0; i < nfpCount; ++i) {
        size = nfpArrays[i].length;
        offset = totalSize;
        info[i] = size | (offset << NFP_SHIFT_AMOUNT);
        totalSize += size;
    }

    const result = new Float64Array(totalSize);

    result[0] = key;
    result[1] = nfpCount;

    result.set(info, NFP_INFO_START_INDEX);

    for (i = 0; i < nfpCount; ++i) {
        offset = info[i] >>> NFP_SHIFT_AMOUNT; 
        result.set(nfpArrays[i], offset);
    }

    return result;
}

export function pairData(pair: NFPPair, configuration: NestConfig, pointPool: PointPool): Float64Array {
    const { exploreConcave, useHoles, rotations } = configuration;

    if (!pair || pair.length === 0) {
        return new Float64Array(0);
    }

    const nfpContent: NFPContent = keyToNFPData(pair.key, rotations);
    const polygonA: Polygon = Polygon.fromLegacy(pair.A);
    const polygonB: Polygon = Polygon.fromLegacy(pair.B);
    const tmpPolygon: Polygon = Polygon.create();
    let nfp: Float64Array[] = null;
    let i: number = 0;

    polygonA.rotate(nfpContent.Arotation);
    polygonB.rotate(nfpContent.Brotation);

    if (nfpContent.inside) {
        nfp = polygonA.isRectangle
            ? noFitPolygonRectangle(pointPool, polygonA, polygonB)
            : noFitPolygon(pointPool, tmpPolygon, polygonA, polygonB, true, exploreConcave);

        // ensure all interior NFPs have the same winding direction
        if (nfp.length > 0) {
            for (i = 0; i < nfp.length; ++i) {
                tmpPolygon.bind(nfp[i]);

                if (tmpPolygon.area > 0) {
                    tmpPolygon.reverse();
                }
            }
        } else {
            // warning on null inner NFP
            // this is not an error, as the part may simply be larger than the bin or otherwise unplaceable due to geometry
            console.log('NFP Warning: ', pair.key);
        }
    } else {
        nfp = exploreConcave
            ? noFitPolygon(pointPool, tmpPolygon, polygonA, polygonB, false, exploreConcave)
            : minkowskiDifference(tmpPolygon, polygonA, polygonB);
        // sanity check
        if (nfp.length === 0) {
            console.log('NFP Error: ', pair.key);
            console.log('A: ', JSON.stringify(polygonA));
            console.log('B: ', JSON.stringify(polygonB));

            return new Float64Array(0);
        }

        for (i = 0; i < nfp.length; ++i) {
            if (!exploreConcave || i === 0) {
                tmpPolygon.bind(nfp[i]);
                // if searchedges is active, only the first NFP is guaranteed to pass sanity check
                if (Math.abs(tmpPolygon.area) < Math.abs(polygonA.area)) {
                    console.log('NFP Area Error: ', Math.abs(tmpPolygon.area), pair.key);
                    console.log('NFP:', JSON.stringify(tmpPolygon));
                    console.log('A: ', JSON.stringify(polygonA));
                    console.log('B: ', JSON.stringify(polygonB));
                    nfp.splice(i, 1);

                    return new Float64Array(0);
                }
            }
        }

        if (nfp.length === 0) {
            return new Float64Array(0);
        }

        const firstNfp: Polygon = Polygon.create();

        firstNfp.bind(nfp[0]);

        // for outer NFPs, the first is guaranteed to be the largest. Any subsequent NFPs that lie inside the first are holes
        for (i = 0; i < nfp.length; ++i) {
            tmpPolygon.bind(nfp[i]);

            if (tmpPolygon.area > 0) {
                tmpPolygon.reverse();
            }

            if (i > 0 && firstNfp.pointIn(tmpPolygon.first) && tmpPolygon.area < 0) {
                tmpPolygon.reverse();
            }
        }

        // generate nfps for children (holes of parts) if any exist
        if (useHoles && polygonA.hasChildren) {
            const childCount: number = polygonA.childrCount;
            let child: Polygon = null;

            for (i = 0; i < childCount; ++i) {
                child = polygonA.children[i];

                // no need to find nfp if B's bounding box is too big
                if (child.size.x > polygonB.size.x && child.size.y > polygonB.size.y) {
                    const noFitPolygons: Float64Array[] = noFitPolygon(
                        pointPool,
                        tmpPolygon,
                        child,
                        polygonB,
                        true,
                        exploreConcave
                    );
                    const noFitCount: number = noFitPolygons ? noFitPolygons.length : 0;
                    // ensure all interior NFPs have the same winding direction
                    if (noFitCount !== 0) {
                        let j: number = 0;

                        for (j = 0; j < noFitCount; ++j) {
                            tmpPolygon.bind(noFitPolygons[j]);
                            if (tmpPolygon.area < 0) {
                                tmpPolygon.reverse();
                            }

                            nfp.push(noFitPolygons[j]);
                        }
                    }
                }
            }
        }
    }

    return getResult(pair.key, nfp);
}
