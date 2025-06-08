import { 
    no_fit_polygon_rectangle_f64, 
    no_fit_polygon_f64
 } from 'wasm-nesting';
import { WorkerConfig } from './types';
import PairContent from './pair-content';
import type { PolygonNode, Polygon, PointPool, TypedArray } from '../types';

// returns an interior NFP for the special case where A is a rectangle
function noFitPolygonRectangle<T extends TypedArray>(pointPool: PointPool<T>, A: Polygon<T>, B: Polygon<T>): Float32Array[] {
    return [no_fit_polygon_rectangle_f64(A.export() as Float64Array, B.export() as Float64Array)];
}

export function deserializeNfp(flat: Float32Array): Float32Array[] {
    const count = flat[0] >>> 0;
    const result: Float32Array[] = [];
    let coordIdx = 1 + count; // початок координат після блоків довжин
  
    for (let i = 0; i < count; i++) {
      const len = flat[i + 1] >>> 0;
      result.push(flat.slice(coordIdx, coordIdx + len));
      coordIdx += len;
    }
  
    return result;
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
    const rawRustResult = no_fit_polygon_f64(polygonA.export() as Float64Array, polygonB.export() as Float64Array, inside);

    return deserializeNfp(rawRustResult);
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