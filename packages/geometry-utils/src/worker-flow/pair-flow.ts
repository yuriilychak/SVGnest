import { almostEqual, cycleIndex, midValue, setBits, getBits, getUint16, joinUint16 } from '../helpers';
import { PolygonNode } from '../types';
import Point from '../point';
import Polygon from '../polygon';
import { NFP_INFO_START_INDEX, TOL } from '../constants';
import PointPool from '../point-pool';
import { WorkerConfig, SegmentCheck } from './types';
import { VECTOR_MEM_OFFSET } from './ constants';
import PairContent from './pair-content';

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
): SegmentCheck {
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
}: SegmentCheck): boolean {
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
    const segmentChecks: SegmentCheck[] = [
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
    direction: Point,
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
): Float64Array {
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
    let result: Float64Array = null;

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

function applyVector(
    memSeg: Float64Array,
    point: Point,
    start: number,
    end: number,
    baseValue: Point,
    subValue: Point,
    offset: Point = null
): void {
    point.update(baseValue).sub(subValue);

    if (offset !== null) {
        point.sub(offset);
    }

    if (!point.isEmpty) {
        const index: number = memSeg[0] << 1;

        point.fill(memSeg, index, VECTOR_MEM_OFFSET);
        point.set(start, end);
        point.fill(memSeg, index + 1, VECTOR_MEM_OFFSET);
        memSeg[0] += 1;
    }
}

function serializeTouch(type: number, firstIndex: number, secondIndex: number): number {
    let result: number = setBits(0, type, 0, 2);

    result = setBits(result, firstIndex, 2, 15);

    return setBits(result, secondIndex, 17, 15);
}

function getTouch(
    pointA: Point,
    pointANext: Point,
    pointB: Point,
    pointBNext: Point,
    indexA: number,
    indexANext: number,
    indexB: number,
    indexBNext: number
): number {
    switch (true) {
        case pointB.almostEqual(pointA):
            return serializeTouch(0, indexA, indexB);
        case pointB.onSegment(pointA, pointANext):
            return serializeTouch(1, indexANext, indexB);
        case pointA.onSegment(pointB, pointBNext):
            return serializeTouch(2, indexA, indexBNext);
        default:
            return -1;
    }
}

function fillVectors(
    polygonA: Polygon,
    polygonB: Polygon,
    pointPool: PointPool,
    offset: Point,
    memSeg: Float64Array,
    markedIndices: number[]
): void {
    // sanity check, prevent infinite loop
    const pointIndices = pointPool.alloc(4);
    const pointA: Point = pointPool.get(pointIndices, 0);
    const pointANext: Point = pointPool.get(pointIndices, 1);
    const pointB: Point = pointPool.get(pointIndices, 2);
    const pointBNext: Point = pointPool.get(pointIndices, 3);
    const sizeA: number = polygonA.length;
    const sizeB: number = polygonB.length;
    let i: number = 0;
    let j: number = 0;
    let iNext: number = 0;
    let jNext: number = 0;
    let touch: number = 0;

    memSeg[0] = 0;
    // find touching vertices/edges
    for (i = 0; i < sizeA; ++i) {
        iNext = cycleIndex(i, sizeA, 1);
        pointA.update(polygonA.at(i));
        pointANext.update(polygonA.at(iNext));

        for (j = 0; j < sizeB; ++j) {
            jNext = cycleIndex(j, sizeB, 1);
            pointB.update(polygonB.at(j)).add(offset);
            pointBNext.update(polygonB.at(jNext)).add(offset);
            touch = getTouch(pointA, pointANext, pointB, pointBNext, i, iNext, j, jNext);

            if (touch !== -1) {
                markedIndices.push(getBits(touch, 2, 15));
                applyVectors(polygonA, polygonB, pointPool, offset, touch, memSeg);
            }
        }
    }

    pointPool.malloc(pointIndices);
}

function applyVectors(
    polygonA: Polygon,
    polygonB: Polygon,
    pointPool: PointPool,
    offset: Point,
    touch: number,
    memSeg: Float64Array
): void {
    const type: number = getBits(touch, 0, 2);
    const currIndexA: number = getBits(touch, 2, 15);
    const currIndexB: number = getBits(touch, 17, 15);
    const sizeA: number = polygonA.length;
    const sizeB: number = polygonB.length;
    const prevIndexA = cycleIndex(currIndexA, sizeA, -1); // loop
    const nextIndexA = cycleIndex(currIndexA, sizeA, 1); // loop
    const prevIndexB = cycleIndex(currIndexB, sizeB, -1); // loop
    const nextIndexB = cycleIndex(currIndexB, sizeB, 1); // loop
    const pointIndices = pointPool.alloc(7);
    const prevA: Point = pointPool.get(pointIndices, 0);
    const currA: Point = pointPool.get(pointIndices, 1);
    const nextA: Point = pointPool.get(pointIndices, 2);
    const prevB: Point = pointPool.get(pointIndices, 3);
    const currB: Point = pointPool.get(pointIndices, 4);
    const nextB: Point = pointPool.get(pointIndices, 5);
    const point: Point = pointPool.get(pointIndices, 6);

    prevA.update(polygonA.at(prevIndexA));
    currA.update(polygonA.at(currIndexA));
    nextA.update(polygonA.at(nextIndexA));
    prevB.update(polygonB.at(prevIndexB));
    currB.update(polygonB.at(currIndexB));
    nextB.update(polygonB.at(nextIndexB));

    switch (type) {
        case 0: {
            applyVector(memSeg, point, currIndexA, prevIndexA, prevA, currA);
            applyVector(memSeg, point, currIndexA, nextIndexA, nextA, currA);
            // B vectors need to be inverted
            applyVector(memSeg, point, -1, -1, currB, prevB);
            applyVector(memSeg, point, -1, -1, currB, nextB);
            break;
        }
        case 1: {
            applyVector(memSeg, point, prevIndexA, currIndexA, currA, currB, offset);
            applyVector(memSeg, point, currIndexA, prevIndexA, prevA, currB, offset);
            break;
        }
        default: {
            applyVector(memSeg, point, -1, -1, currA, currB, offset);
            applyVector(memSeg, point, -1, -1, currA, prevB, offset);
        }
    }

    pointPool.malloc(pointIndices);
}

// if A and B start on a touching horizontal line, the end point may not be the start point
function getNfpLooped(nfp: number[], reference: Point, pointPool: PointPool): boolean {
    const pointCount: number = nfp.length >> 1;

    if (pointCount === 0) {
        return false;
    }

    const pointIndices: number = pointPool.alloc(1);
    const point: Point = pointPool.get(pointIndices, 0);
    let i: number = 0;

    for (i = 0; i < pointCount - 1; ++i) {
        point.fromMemSeg(nfp, i);

        if (point.almostEqual(reference)) {
            pointPool.malloc(pointIndices);
            return true;
        }
    }

    pointPool.malloc(pointIndices);

    return false;
}

function findTranslate(
    polygonA: Polygon,
    polygonB: Polygon,
    pointPool: PointPool,
    offset: Point,
    memSeg: Float64Array,
    prevTranslate: Point
): void {
    // old-todo: there should be a faster way to reject vectors
    // that will cause immediate intersection. For now just check them all
    const vectorCount: number = memSeg[0];
    const pointIndices = pointPool.alloc(3);
    const currUnitV: Point = pointPool.get(pointIndices, 0);
    const prevUnitV: Point = pointPool.get(pointIndices, 1);
    const currVector: Point = pointPool.get(pointIndices, 2);
    let translate: number = -1;
    let maxDistance: number = 0;
    let distance: number = 0;
    let vecDistance: number = 0;
    let i: number = 0;

    for (i = 0; i < vectorCount; ++i) {
        currVector.fromMemSeg(memSeg, i << 1, VECTOR_MEM_OFFSET);

        // if this vector points us back to where we came from, ignore it.
        // ie cross product = 0, dot product < 0
        if (!prevTranslate.isEmpty && currVector.dot(prevTranslate) < 0) {
            // compare magnitude with unit vectors
            currUnitV.update(currVector).normalize();
            prevUnitV.update(prevTranslate).normalize();

            // we need to scale down to unit vectors to normalize vector length. Could also just do a tan here
            if (Math.abs(currUnitV.cross(prevUnitV)) < 0.0001) {
                continue;
            }
        }

        distance = polygonSlideDistance(pointPool, polygonA, polygonB, currVector, offset);
        vecDistance = currVector.length;

        if (Number.isNaN(distance) || Math.abs(distance) > vecDistance) {
            distance = vecDistance;
        }

        if (!Number.isNaN(distance) && distance > maxDistance) {
            maxDistance = distance;
            translate = i << 1;
        }
    }

    memSeg[1] = translate;
    memSeg[2] = maxDistance;

    pointPool.malloc(pointIndices);
}

// given a static polygon A and a movable polygon B, compute a no fit polygon by orbiting B about A
// if the inside flag is set, B is orbited inside of A rather than outside
// if the searchEdges flag is set, all edges of A are explored for NFPs - multiple
function noFitPolygon(
    pointPool: PointPool,
    polygon: Polygon,
    polygonA: Polygon,
    polygonB: Polygon,
    memSeg: Float64Array,
    inside: boolean
): Float64Array[] {
    if (polygonA.isBroken || polygonB.isBroken) {
        return [];
    }

    const markedIndices: number[] = [];
    let i: number = 0;
    let minA = polygonA.first.y;
    let minIndexA = 0;
    let maxB = polygonB.first.y;
    let maxIndexB = 0;

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

    const pointIndices = pointPool.alloc(7);
    const reference: Point = pointPool.get(pointIndices, 0);
    const start: Point = pointPool.get(pointIndices, 1);
    const offset: Point = pointPool.get(pointIndices, 2);
    const startPoint: Point = pointPool.get(pointIndices, 3).update(polygonA.at(minIndexA)).sub(polygonB.at(maxIndexB));
    const prevTranslate: Point = pointPool.get(pointIndices, 4);
    const translate: Point = pointPool.get(pointIndices, 5);
    const indices: Point = pointPool.get(pointIndices, 6);
    const result: Float64Array[] = [];
    const sizeA: number = polygonA.length;
    const sizeB: number = polygonB.length;
    const condition: number = 10 * (sizeA + sizeB);
    let counter: number = 0;
    let nfp: number[] = null;
    let startPointRaw: Float64Array = null;
    let maxDistance: number = 0;
    let vLength: number = 0;
    let translateIndex: number = 0;

    // shift B such that the bottom-most point of B is at the top-most
    // point of A. This guarantees an initial placement with no intersections
    // no reliable heuristic for inside
    if (inside) {
        startPointRaw = searchStartPoint(pointPool, polygon, polygonA, polygonB, true, markedIndices);

        if (startPointRaw === null) {
            pointPool.malloc(pointIndices);

            return result;
        }

        startPoint.fromMemSeg(startPointRaw);
    }

    while (true) {
        offset.update(startPoint);
        prevTranslate.set(0, 0); // keep track of previous vector
        reference.update(polygonB.first).add(startPoint);
        start.update(reference);
        nfp = [reference.x, reference.y];
        counter = 0;

        while (counter < condition) {
            // sanity check, prevent infinite loop
            // generate translation vectors from touching vertices/edges
            fillVectors(polygonA, polygonB, pointPool, offset, memSeg, markedIndices);
            // that will cause immediate intersection. For now just check them all
            findTranslate(polygonA, polygonB, pointPool, offset, memSeg, prevTranslate);

            translateIndex = memSeg[1];
            maxDistance = memSeg[2];

            if (translateIndex === -1 || almostEqual(maxDistance)) {
                // didn't close the loop, something went wrong here
                nfp = null;
                break;
            }

            translate.fromMemSeg(memSeg, translateIndex, VECTOR_MEM_OFFSET);
            indices.fromMemSeg(memSeg, translateIndex + 1, VECTOR_MEM_OFFSET);
            prevTranslate.update(translate);
            maxDistance = Math.abs(maxDistance);
            // trim
            vLength = translate.length;

            if (indices.x !== -1) {
                markedIndices.push(indices.x);
            }

            if (indices.y !== -1) {
                markedIndices.push(indices.y);
            }

            if (maxDistance < vLength && !almostEqual(maxDistance, vLength)) {
                translate.scaleUp(maxDistance / vLength);
            }

            reference.add(translate);

            if (reference.almostEqual(start) || getNfpLooped(nfp, reference, pointPool)) {
                // we've made a full loop
                break;
            }

            nfp.push(reference.x);
            nfp.push(reference.y);

            offset.add(translate);

            ++counter;
        }

        if (nfp && nfp.length > 0) {
            result.push(new Float64Array(nfp));
        }

        startPointRaw = searchStartPoint(pointPool, polygon, polygonA, polygonB, inside, markedIndices, result);

        if (startPointRaw === null) {
            break;
        }

        startPoint.fromMemSeg(startPointRaw);
    }

    pointPool.malloc(pointIndices);

    return result;
}

export function pairData(buffer: ArrayBuffer, config: WorkerConfig): Float64Array {
    const pairContent: PairContent = config.pairContent.init(buffer);

    if (pairContent.isBroken) {
        return new Float64Array(0);
    }

    const { pointPool, polygons, memSeg } = config;
    const polygonA: Polygon = polygons[0];
    const polygonB: Polygon = polygons[1];

    polygonA.bind(pairContent.firstNode.memSeg);
    polygonB.bind(pairContent.secondNode.memSeg);
    const tmpPolygon: Polygon = polygons[2];
    let nfp: Float64Array[] = null;
    let nfpSize: number = 0;
    let i: number = 0;

    if (pairContent.isInside) {
        nfp = polygonA.isRectangle
            ? noFitPolygonRectangle(pointPool, polygonA, polygonB)
            : noFitPolygon(pointPool, tmpPolygon, polygonA, polygonB, memSeg, true);

        // ensure all interior NFPs have the same winding direction
        nfpSize = nfp.length;

        if (nfpSize !== 0) {
            for (i = 0; i < nfpSize; ++i) {
                tmpPolygon.bind(nfp[i]);

                if (tmpPolygon.area > 0) {
                    tmpPolygon.reverse();
                }
            }
        } else {
            // warning on null inner NFP
            // this is not an error, as the part may simply be larger than the bin or otherwise unplaceable due to geometry
            pairContent.logError('NFP Warning');
        }

        return pairContent.getResult(nfp);
    }

    nfp = noFitPolygon(pointPool, tmpPolygon, polygonA, polygonB, memSeg, false);
    // sanity check
    if (nfp.length === 0) {
        pairContent.logError('NFP Error');

        return new Float64Array(0);
    }

    tmpPolygon.bind(nfp[0]);
    // if searchedges is active, only the first NFP is guaranteed to pass sanity check
    if (tmpPolygon.absArea < polygonA.absArea) {
        pairContent.logError('NFP Area Error');
        console.log('Area: ', tmpPolygon.absArea);
        nfp.splice(i, 1);

        return new Float64Array(0);
    }

    const firstNfp: Polygon = polygons[3];

    firstNfp.bind(nfp[0]);

    nfpSize = nfp.length;

    // for outer NFPs, the first is guaranteed to be the largest. Any subsequent NFPs that lie inside the first are holes
    for (i = 0; i < nfpSize; ++i) {
        tmpPolygon.bind(nfp[i]);

        if (tmpPolygon.area > 0) {
            tmpPolygon.reverse();
        }

        if (i > 0 && firstNfp.pointIn(tmpPolygon.first) && tmpPolygon.area < 0) {
            tmpPolygon.reverse();
        }
    }

    // generate nfps for children (holes of parts) if any exist
    if (pairContent.isUseHoles) {
        const childCount: number = pairContent.firstNode.children.length;
        let node: PolygonNode = null;
        const child: Polygon = polygons[4];

        for (i = 0; i < childCount; ++i) {
            node = pairContent.firstNode.children[i];
            child.bind(node.memSeg);

            // no need to find nfp if B's bounding box is too big
            if (child.size.x > polygonB.size.x && child.size.y > polygonB.size.y) {
                const noFitPolygons: Float64Array[] = noFitPolygon(pointPool, tmpPolygon, child, polygonB, memSeg, true);
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

    return pairContent.getResult(nfp);
}
