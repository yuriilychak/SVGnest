import { 
    pair_inside_f64,
    pair_outside_f64,
    pair_child_f64
 } from 'wasm-nesting';
import { WorkerConfig } from './types';
import PairContent from './pair-content';
import type { PolygonNode, Polygon, PointPool, TypedArray } from '../types';

export function deserializeNfp(flat: Float32Array): Float32Array[] {
    const count = flat[0] >>> 0;
    const result: Float32Array[] = [];
    let coordIdx = 1 + count;
  
    for (let i = 0; i < count; i++) {
      const len = flat[i + 1] >>> 0;
      result.push(flat.slice(coordIdx, coordIdx + len));
      coordIdx += len;
    }
  
    return result;
}

function pairInside<T extends TypedArray>(
    pointPool: PointPool<T>,
    polygon: Polygon<Float32Array>,
    polygonA: Polygon<T>,
    polygonB: Polygon<T>,
    memSeg: T,
): Float32Array[] {
    const result =  pair_inside_f64(polygonA.export() as Float64Array, polygonB.export() as Float64Array);

    return deserializeNfp(result);
}

function pairOutside<T extends TypedArray>(
    pointPool: PointPool<T>,
    polygon: Polygon<Float32Array>,
    polygonA: Polygon<T>,
    polygonB: Polygon<T>,
    memSeg: T,
): Float32Array[] {
    const result =  pair_outside_f64(polygonA.export() as Float64Array, polygonB.export() as Float64Array);

    return deserializeNfp(result);
}

function pairChild<T extends TypedArray>(
    pointPool: PointPool<T>,
    polygon: Polygon<Float32Array>,
    polygonA: Polygon<T>,
    polygonB: Polygon<T>,
    memSeg: T,
): Float32Array[] {
    const result = pair_child_f64(polygonA.export() as Float64Array, polygonB.export() as Float64Array);

    return deserializeNfp(result);
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

    if (pairContent.isInside) {
        nfp = pairInside(pointPool, tmpPolygon, polygonA, polygonB, memSeg);

        if (nfp.length === 0) {
            // warning on null inner NFP
            // this is not an error, as the part may simply be larger than the bin or otherwise unplaceable due to geometry
            pairContent.logError('NFP Warning');
        }

        return pairContent.getResult(nfp);
    }

    nfp = pairOutside(pointPool, tmpPolygon, polygonA, polygonB, memSeg);

    
    // sanity check
    if (nfp.length === 0) {
        pairContent.logError('NFP Error');

        return new ArrayBuffer(0);
    }

    // generate nfps for children (holes of parts) if any exist
    if (pairContent.isUseHoles) {
        const childCount: number = pairContent.firstNode.children.length;
        let node: PolygonNode = null;
        const child: Polygon<Float64Array> = polygons[4];

        for (let i = 0; i < childCount; ++i) {
            node = pairContent.firstNode.children[i];
            child.bind(Float64Array.from(node.memSeg));

            // no need to find nfp if B's bounding box is too big
            if (child.size.x > polygonB.size.x && child.size.y > polygonB.size.y) {
                const noFitPolygons: Float32Array[] = pairChild(pointPool, tmpPolygon, child, polygonB, memSeg);

                nfp = nfp.concat(noFitPolygons);
            }
        }
    }

    return pairContent.getResult(nfp);
}