import { 
    set_bits_u32, 
    get_bits_u32, 
    cycle_index_wasm, 
    polygon_projection_distance_f64, 
    polygon_slide_distance_f64, 
    no_fit_polygon_rectangle_f64, 
    intersect_f64,
    get_nfp_looped_f64
 } from 'wasm-nesting';
import { almostEqual } from '../helpers';
import { TOL_F64 } from '../constants';
import { WorkerConfig } from './types';
import { VECTOR_MEM_OFFSET } from './ constants';
import PairContent from './pair-content';
import type { Point, PolygonNode, Polygon, PointPool, TypedArray } from '../types';

function intersect<T extends TypedArray>(
    pointPool: PointPool<T>, 
    polygonA: Polygon<T>, 
    polygonB: Polygon<T>, 
    offset: Point<T>
): boolean {
    return intersect_f64(polygonA.export() as Float64Array, polygonB.export() as Float64Array, offset.export() as Float64Array);
}

function polygonSlideDistance<T extends TypedArray>(
    pointPool: PointPool<T>,
    polygonA: Polygon<T>,
    polygonB: Polygon<T>,
    direction: Point<T>,
    offset: Point<T>
): number {
    return polygon_slide_distance_f64(polygonA.export() as Float64Array, polygonB.export() as Float64Array, direction.export() as Float64Array, offset.export() as Float64Array, polygonA.isClosed, polygonB.isClosed);
}

// project each point of B onto A in the given direction, and return the
function polygonProjectionDistance<T extends TypedArray>(
    pointPool: PointPool<T>,
    polygonA: Polygon<T>,
    polygonB: Polygon<T>,
    direction: Point<T>,
    offset: Point<T>
): number {
    return polygon_projection_distance_f64(polygonA.export() as Float64Array, polygonB.export() as Float64Array, direction.export() as Float64Array, offset.export() as Float64Array, polygonA.isClosed, polygonB.isClosed);
}

// returns an interior NFP for the special case where A is a rectangle
function noFitPolygonRectangle<T extends TypedArray>(pointPool: PointPool<T>, A: Polygon<T>, B: Polygon<T>): Float32Array[] {
    return [no_fit_polygon_rectangle_f64(A.export() as Float64Array, B.export() as Float64Array)];
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
                startPoint.update(polygonA.at(i)).sub(polygonB.at(cycle_index_wasm(j, sizeB, 0)));

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
                v.update(polygonA.at(cycle_index_wasm(i, sizeA, 1))).sub(polygonA.at(i));
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
        iNext = cycle_index_wasm(i, sizeA, 1);
        pointA.update(polygonA.at(i));
        pointANext.update(polygonA.at(iNext));

        for (j = 0; j < sizeB; ++j) {
            jNext = cycle_index_wasm(j, sizeB, 1);
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
    const prevIndexA = cycle_index_wasm(currIndexA, sizeA, -1); // loop
    const nextIndexA = cycle_index_wasm(currIndexA, sizeA, 1); // loop
    const prevIndexB = cycle_index_wasm(currIndexB, sizeB, -1); // loop
    const nextIndexB = cycle_index_wasm(currIndexB, sizeB, 1); // loop
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
    return get_nfp_looped_f64(new Float64Array(nfp), reference.export() as Float64Array) 
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
