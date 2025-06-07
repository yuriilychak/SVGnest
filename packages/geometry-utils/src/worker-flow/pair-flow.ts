import { 
    get_bits_u32, 
    cycle_index_wasm, 
    no_fit_polygon_rectangle_f64, 
    get_nfp_looped_f64, 
    find_translate_f64,
    search_start_point_f64,
    get_touch_f64,
    apply_vectors_f64
 } from 'wasm-nesting';
import { almostEqual } from '../helpers';
import { WorkerConfig } from './types';
import { VECTOR_MEM_OFFSET } from './ constants';
import PairContent from './pair-content';
import type { Point, PolygonNode, Polygon, PointPool, TypedArray } from '../types';

// returns an interior NFP for the special case where A is a rectangle
function noFitPolygonRectangle<T extends TypedArray>(pointPool: PointPool<T>, A: Polygon<T>, B: Polygon<T>): Float32Array[] {
    return [no_fit_polygon_rectangle_f64(A.export() as Float64Array, B.export() as Float64Array)];
}

function serializeNfp(nfp: Float32Array[]) {
    const nfpCount: number = nfp.length;
    const nfpInput = new Array<number>(nfpCount + 1);
    nfpInput[0] = nfpCount;
    const source = nfp.reduce<number[]>((result, eleme, index) => {
        result[index + 1] = eleme.length;
        
        return result.concat(Array.from(eleme));
    }, nfpInput);

    return new Float32Array(source);
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
    const wasmRes = search_start_point_f64(
        polygonA.export() as Float64Array, 
        polygonB.export() as Float64Array, 
        inside, 
        new Uint32Array(markedIndices), 
        serializeNfp(nfp)
    );

    polygonA.close();
    polygonB.close();

    for(let i = 3; i < wasmRes.length; ++i) {
        markedIndices.push(wasmRes[i]);
    }

    return wasmRes[0] ? new Float64Array([wasmRes[1], wasmRes[2]]) as T : null;
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
    return get_touch_f64(
        pointA.export() as Float64Array, 
        pointANext.export() as Float64Array,
        pointB.export() as Float64Array, 
        pointBNext.export() as Float64Array, 
        indexA, 
        indexANext, 
        indexB, 
        indexBNext
    )
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

            if (touch !== 0) {
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
    const rustResult = apply_vectors_f64(
        polygonA.export() as Float64Array,
        polygonB.export() as Float64Array,
        offset.export() as Float64Array,
        touch,
        memSeg.slice() as Float64Array,
        polygonA.isClosed,
        polygonB.isClosed
    );
    memSeg.set(rustResult)
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
    const wasmRes = find_translate_f64(polygonA.export() as Float64Array, polygonB.export() as Float64Array, offset.export() as Float64Array, memSeg.slice() as Float64Array, prevTranslate.export() as Float64Array);

    memSeg[1] = wasmRes[0];
    memSeg[2] = wasmRes[1];
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
