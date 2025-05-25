import { set_bits_u32, get_bits_u32 } from 'wasm-nesting';
import { almostEqual, cycleIndex, midValue } from '../helpers';
import { PointBase } from '../geometry';
import { TOL_F64 } from '../constants';
import { WorkerConfig, SegmentCheck } from './types';
import { VECTOR_MEM_OFFSET } from './ constants';
import PairContent from './pair-content';
import type { Point, PolygonNode, Polygon, PointPool, TypedArray } from '../types';

// old-todo: swap this for a more efficient sweep-line implementation
// returnEdges: if set, return all edges on A that have intersections

function updateIntersectPoint<T extends TypedArray>(point: Point<T>, polygon: Polygon<T>, index: number, offset: number): void {
    const pointCount: number = polygon.length;
    let currentIndex = cycleIndex(index, pointCount, offset);

    point.update(polygon.at(index));

    // go even further back if we happen to hit on a loop end point
    if (point.almostEqual(polygon.at(currentIndex))) {
        currentIndex = cycleIndex(currentIndex, pointCount, offset);
        point.update(polygon.at(currentIndex));
    }
}

function getSegmentCheck<T extends TypedArray>(
    point: Point<T>,
    polygon: Polygon<T>,
    segmentStart: Point<T>,
    segmentEnd: Point<T>,
    checkStart: Point<T>,
    checkEnd: Point<T>,
    target: Point<T>,
    offset: Point<T>
): SegmentCheck<T> {
    return { point, polygon, segmentStart, segmentEnd, checkStart, checkEnd, target, offset };
}

function getSegmentStats<T extends TypedArray>({
    point,
    segmentStart,
    segmentEnd,
    target,
    polygon,
    checkStart,
    checkEnd,
    offset
}: SegmentCheck<T>): boolean {
    if (point.onSegment(segmentStart, segmentEnd) || point.almostEqual(target)) {
        // if a point is on a segment, it could intersect or it could not. Check via the neighboring points
        const pointIn1 = polygon.pointIn(checkStart, offset);
        const pointIn2 = polygon.pointIn(checkEnd, offset);

        return pointIn1 !== null && pointIn2 !== null && pointIn1 !== pointIn2;
    }

    return null;
}

function intersect<T extends TypedArray>(
    pointPool: PointPool<T>, 
    polygonA: Polygon<T>, 
    polygonB: Polygon<T>, 
    offset: Point<T>
): boolean {
    const pointIndices: number = pointPool.alloc(9);
    const a0: Point<T> = pointPool.get(pointIndices, 0);
    const a1: Point<T> = pointPool.get(pointIndices, 1);
    const a2: Point<T> = pointPool.get(pointIndices, 2);
    const a3: Point<T> = pointPool.get(pointIndices, 3);
    const b0: Point<T> = pointPool.get(pointIndices, 4);
    const b1: Point<T> = pointPool.get(pointIndices, 5);
    const b2: Point<T> = pointPool.get(pointIndices, 6);
    const b3: Point<T> = pointPool.get(pointIndices, 7);
    const offsetA: Point<T> = pointPool.get(pointIndices, 8).set(0, 0);
    const pointCountA: number = polygonA.length;
    const pointCountB: number = polygonB.length;
    const segmentChecks: SegmentCheck<T>[] = [
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

            if (segmentStats || (segmentStats === null && PointBase.lineIntersect(b1, b2, a1, a2))) {
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

function pointDistance<T extends TypedArray>(
    pointPool: PointPool<T>,
    p: Point<T>,
    s1: Point<T>,
    s2: Point<T>,
    inputNormal: Point<T>,
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
        if (midValue(pdot, s1dot, s2dot) > TOL_F64) {
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

function coincedentDistance<T extends TypedArray>(
    pointPool: PointPool<T>,
    point1: Point<T>,
    point2: Point<T>,
    point3: Point<T>,
    point4: Point<T>,
    direction: Point<T>,
    normal: Point<T>,
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

function segmentDistance<T extends TypedArray>(pointPool: PointPool<T>, A: Point<T>, B: Point<T>, E: Point<T>, F: Point<T>, direction: Point<T>): number {
    let sharedPointIndices: number = pointPool.alloc(3);
    const normal: Point<T> = pointPool.get(sharedPointIndices, 0).update(direction).normal();
    const reverse: Point<T> = pointPool.get(sharedPointIndices, 1).update(direction).reverse();
    const dir: Point<T> = pointPool.get(sharedPointIndices, 2).update(direction);
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
    if (maxAB - minEF < TOL_F64 || maxEF - minAB < TOL_F64) {
        pointPool.malloc(sharedPointIndices);

        return NaN;
    }
    // segments miss eachother completely
    const overlap: number =
        (maxAB > maxEF && minAB < minEF) || (maxEF > maxAB && minEF < minAB)
            ? 1
            : (Math.min(maxAB, maxEF) - Math.max(minAB, minEF)) / (Math.max(maxAB, maxEF) - Math.min(minAB, minEF));
    const pointIndices2: number = pointPool.alloc(3);
    const diffAB: Point<T> = pointPool.get(pointIndices2, 0).update(B).sub(A);
    const diffAE: Point<T> = pointPool.get(pointIndices2, 1).update(E).sub(A);
    const diffAF: Point<T> = pointPool.get(pointIndices2, 2).update(F).sub(A);
    const crossABE: number = diffAE.cross(diffAB);
    const crossABF: number = diffAF.cross(diffAB);

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

function polygonSlideDistance<T extends TypedArray>(
    pointPool: PointPool<T>,
    polygonA: Polygon<T>,
    polygonB: Polygon<T>,
    direction: Point<T>,
    offset: Point<T>
): number {
    const pointIndices: number = pointPool.alloc(5);
    const a1: Point<T> = pointPool.get(pointIndices, 0);
    const a2: Point<T> = pointPool.get(pointIndices, 1);
    const b1: Point<T> = pointPool.get(pointIndices, 2);
    const b2: Point<T> = pointPool.get(pointIndices, 3);
    const dir = pointPool.get(pointIndices, 4).update(direction).normalize();
    const sizeA: number = polygonA.length;
    const sizeB: number = polygonB.length;
    let distance: number = NaN;
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

    return Number.isNaN(distance) ? distance : Math.max(distance, 0);
}

// project each point of B onto A in the given direction, and return the
function polygonProjectionDistance<T extends TypedArray>(
    pointPool: PointPool<T>,
    polygonA: Polygon<T>,
    polygonB: Polygon<T>,
    direction: Point<T>,
    offset: Point<T>
): number {
    const sizeA: number = polygonA.length;
    const sizeB: number = polygonB.length;
    const pointIndices: number = pointPool.alloc(4);
    const p: Point<T> = pointPool.get(pointIndices, 0);
    const s1: Point<T> = pointPool.get(pointIndices, 1);
    const s2: Point<T> = pointPool.get(pointIndices, 2);
    const sOffset: Point<T> = pointPool.get(pointIndices, 3);
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
function noFitPolygonRectangle<T extends TypedArray>(pointPool: PointPool<T>, A: Polygon<T>, B: Polygon<T>): Float32Array[] {
    const pointIndices = pointPool.alloc(2);
    const minDiff = pointPool.get(pointIndices, 0).update(A.position).sub(B.position);
    const maxDiff = pointPool.get(pointIndices, 1).update(A.size).sub(B.size);

    if (maxDiff.x <= 0 || maxDiff.y <= 0) {
        return [];
    }

    minDiff.add(B.first);
    maxDiff.add(minDiff);

    const result = [new Float32Array([minDiff.x, minDiff.y, maxDiff.x, minDiff.y, maxDiff.x, maxDiff.y, minDiff.x, maxDiff.y])];

    pointPool.malloc(pointIndices);

    return result;
}

// returns true if point already exists in the given nfp
function inNfp<T extends TypedArray>(polygon: Polygon<Float32Array>, point: Point<T>, nfp: Float32Array[]): boolean {
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

function getInside<T extends TypedArray>(
    pointPool: PointPool<T>,
    polygonA: Polygon<T>,
    polygonB: Polygon<T>,
    offset: Point<T>,
    defaultValue: boolean | null
): boolean | null {
    const pointIndices: number = pointPool.alloc(1);
    const point: Point<T> = pointPool.get(pointIndices, 0);
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
function searchStartPoint<T extends TypedArray>(
    pointPool: PointPool<T>,
    polygon: Polygon<Float32Array>,
    polygonA: Polygon<T>,
    polygonB: Polygon<T>,
    inside: boolean,
    markedIndices: number[],
    nfp: Float32Array[] = []
): T {
    polygonA.close();
    polygonB.close();
    const sizeA: number = polygonA.length;
    const sizeB: number = polygonB.length;
    const pointIndices = pointPool.alloc(3);
    const startPoint: Point<T> = pointPool.get(pointIndices, 0);
    const v: Point<T> = pointPool.get(pointIndices, 1);
    const vNeg: Point<T> = pointPool.get(pointIndices, 2);
    let i: number = 0;
    let j: number = 0;
    let d: number = 0;
    let isInside: boolean = false;
    let result: T = null;

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
                if (d < TOL_F64) {
                    continue;
                }

                const vd = v.length;

                if (vd - d >= TOL_F64) {
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

function applyVector<T extends TypedArray>(
    memSeg: T,
    point: Point<T>,
    start: number,
    end: number,
    baseValue: Point<T>,
    subValue: Point<T>,
    offset: Point<T> = null
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
    let result: number = set_bits_u32(0, type, 0, 2);

    result = set_bits_u32(result, firstIndex, 2, 15);

    return set_bits_u32(result, secondIndex, 17, 15);
}

function getTouch<T extends TypedArray>(
    pointA: Point<T>,
    pointANext: Point<T>,
    pointB: Point<T>,
    pointBNext: Point<T>,
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

function fillVectors<T extends TypedArray>(
    polygonA: Polygon<T>,
    polygonB: Polygon<T>,
    pointPool: PointPool<T>,
    offset: Point<T>,
    memSeg: T,
    markedIndices: number[]
): void {
    // sanity check, prevent infinite loop
    const pointIndices = pointPool.alloc(4);
    const pointA: Point<T> = pointPool.get(pointIndices, 0);
    const pointANext: Point<T> = pointPool.get(pointIndices, 1);
    const pointB: Point<T> = pointPool.get(pointIndices, 2);
    const pointBNext: Point<T> = pointPool.get(pointIndices, 3);
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
                markedIndices.push(get_bits_u32(touch, 2, 15));
                applyVectors(polygonA, polygonB, pointPool, offset, touch, memSeg);
            }
        }
    }

    pointPool.malloc(pointIndices);
}

function applyVectors<T extends TypedArray>(
    polygonA: Polygon<T>,
    polygonB: Polygon<T>,
    pointPool: PointPool<T>,
    offset: Point<T>,
    touch: number,
    memSeg: T
): void {
    const type: number = get_bits_u32(touch, 0, 2);
    const currIndexA: number = get_bits_u32(touch, 2, 15);
    const currIndexB: number = get_bits_u32(touch, 17, 15);
    const sizeA: number = polygonA.length;
    const sizeB: number = polygonB.length;
    const prevIndexA = cycleIndex(currIndexA, sizeA, -1); // loop
    const nextIndexA = cycleIndex(currIndexA, sizeA, 1); // loop
    const prevIndexB = cycleIndex(currIndexB, sizeB, -1); // loop
    const nextIndexB = cycleIndex(currIndexB, sizeB, 1); // loop
    const pointIndices = pointPool.alloc(7);
    const prevA: Point<T> = pointPool.get(pointIndices, 0);
    const currA: Point<T> = pointPool.get(pointIndices, 1);
    const nextA: Point<T> = pointPool.get(pointIndices, 2);
    const prevB: Point<T> = pointPool.get(pointIndices, 3);
    const currB: Point<T> = pointPool.get(pointIndices, 4);
    const nextB: Point<T> = pointPool.get(pointIndices, 5);
    const point: Point<T> = pointPool.get(pointIndices, 6);

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
function getNfpLooped<T extends TypedArray>(nfp: number[], reference: Point<T>, pointPool: PointPool<T>): boolean {
    const pointCount: number = nfp.length >> 1;

    if (pointCount === 0) {
        return false;
    }

    const pointIndices: number = pointPool.alloc(1);
    const point: Point<T> = pointPool.get(pointIndices, 0);
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

function findTranslate<T extends TypedArray>(
    polygonA: Polygon<T>,
    polygonB: Polygon<T>,
    pointPool: PointPool<T>,
    offset: Point<T>,
    memSeg: T,
    prevTranslate: Point<T>
): void {
    // old-todo: there should be a faster way to reject vectors
    // that will cause immediate intersection. For now just check them all
    const vectorCount: number = memSeg[0];
    const pointIndices = pointPool.alloc(3);
    const currUnitV: Point<T> = pointPool.get(pointIndices, 0);
    const prevUnitV: Point<T> = pointPool.get(pointIndices, 1);
    const currVector: Point<T> = pointPool.get(pointIndices, 2);
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
export function noFitPolygon<T extends TypedArray>(
    pointPool: PointPool<T>,
    polygon: Polygon<Float32Array>,
    polygonA: Polygon<T>,
    polygonB: Polygon<T>,
    memSeg: T,
    inside: boolean
): Float32Array[] {
    if (polygonA.isBroken || polygonB.isBroken) {
        return [];
    }

    const markedIndices: number[] = [];
    let i: number = 0;
    let minA: number = polygonA.first.y;
    let minIndexA: number = 0;
    let maxB: number = polygonB.first.y;
    let maxIndexB: number = 0;

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

    const pointIndices: number = pointPool.alloc(7);
    const reference: Point<T> = pointPool.get(pointIndices, 0);
    const start: Point<T> = pointPool.get(pointIndices, 1);
    const offset: Point<T> = pointPool.get(pointIndices, 2);
    const startPoint: Point<T> = pointPool.get(pointIndices, 3).update(polygonA.at(minIndexA)).sub(polygonB.at(maxIndexB));
    const prevTranslate: Point<T> = pointPool.get(pointIndices, 4);
    const translate: Point<T> = pointPool.get(pointIndices, 5);
    const indices: Point<T> = pointPool.get(pointIndices, 6);
    const result: Float32Array[] = [];
    const sizeA: number = polygonA.length;
    const sizeB: number = polygonB.length;
    const condition: number = 10 * (sizeA + sizeB);
    let counter: number = 0;
    let nfp: number[] = null;
    let startPointRaw: T = null;
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
            result.push(new Float32Array(nfp));
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

export function pairData(buffer: ArrayBuffer, config: WorkerConfig): ArrayBuffer {
    const pairContent: PairContent = config.pairContent.init(buffer);

    if (pairContent.isBroken) {
        return new ArrayBuffer(0);
    }

    const { f32, f64 } = config;
    const { memSeg, polygons, pointPool } = f64;
    const polygonA: Polygon<Float64Array> = polygons[0];
    const polygonB: Polygon<Float64Array> = polygons[1];

    polygonA.bind(Float64Array.from(pairContent.firstNode.memSeg));
    polygonB.bind(Float64Array.from(pairContent.secondNode.memSeg));
    const tmpPolygon: Polygon<Float32Array> = f32.polygons[2];
    let nfp: Float32Array[] = null;
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

        return new ArrayBuffer(0);
    }

    tmpPolygon.bind(nfp[0]);
    // if searchedges is active, only the first NFP is guaranteed to pass sanity check
    if (tmpPolygon.absArea < polygonA.absArea) {
        pairContent.logError('NFP Area Error');
        console.log('Area: ', tmpPolygon.absArea);
        nfp.splice(i, 1);

        return new ArrayBuffer(0);
    }

    const firstNfp: Polygon<Float32Array> = f32.polygons[3];

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
        const child: Polygon<Float64Array> = polygons[4];

        for (i = 0; i < childCount; ++i) {
            node = pairContent.firstNode.children[i];
            child.bind(Float64Array.from(node.memSeg));

            // no need to find nfp if B's bounding box is too big
            if (child.size.x > polygonB.size.x && child.size.y > polygonB.size.y) {
                const noFitPolygons: Float32Array[] = noFitPolygon(pointPool, tmpPolygon, child, polygonB, memSeg, true);
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
