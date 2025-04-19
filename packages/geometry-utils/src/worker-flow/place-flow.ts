import { PolygonNode } from '../types';
import ClipperWrapper from '../clipper-wrapper';
import { almostEqual, getUint16, joinUint16, writeUint32ToF32 } from '../helpers';
import { PointF32, PointF64 } from '../point';
import { NFP_INFO_START_INDEX } from '../constants';
import { WorkerConfig } from './types';
import PlaceContent from './place-content';
import PolygonF32 from '../polygon-f32';
import PointPoolF32 from '../point-pool-f32';

function fillPointMemSeg(
    pointPool: PointPoolF32,
    memSeg: Float32Array,
    node: PolygonNode,
    offset: PointF32,
    prevValue: number,
    memOffset: number
): number {
    const pointIndices: number = pointPool.alloc(1);
    const tmpPoint: PointF32 = pointPool.get(pointIndices, 0);
    const pointCount = node.memSeg.length >> 1;
    let i: number = 0;

    for (i = 0; i < pointCount; ++i) {
        tmpPoint
            .fromMemSeg(node.memSeg, i)
            .add(offset)
            .fill(memSeg, prevValue + i, memOffset);
    }

    pointPool.malloc(pointIndices);

    return prevValue + pointCount;
}

function getResult(placements: number[][], pathItems: number[][], fitness: number): Float32Array {
    const placementCount: number = pathItems.length;
    const info: Uint32Array = new Uint32Array(placementCount);
    let totalSize: number = NFP_INFO_START_INDEX + placementCount;
    let mergedSize: number = 0;
    let offset: number = 0;
    let size: number = 0;
    let i: number = 0;
    let j: number = 0;

    for (i = 0; i < placementCount; ++i) {
        size = pathItems[i].length;
        mergedSize = joinUint16(size, totalSize)
        info[i] = mergedSize;
        totalSize += size * 3;
    }

    const result = new Float32Array(totalSize);

    result[0] = fitness;
    result[1] = placementCount;

    for (i = 0; i < placementCount; ++i) {
        mergedSize = info[i];
        offset = getUint16(mergedSize, 1);
        size = getUint16(mergedSize, 0);
        writeUint32ToF32(result, NFP_INFO_START_INDEX + i, mergedSize);

        for (j = 0; j < size; ++j) {
            writeUint32ToF32(result, offset + j, pathItems[i][j]);
        }

        result.set(placements[i], offset + size);
    }

    return result;
}

export function placePaths(buffer: ArrayBuffer, config: WorkerConfig): Float32Array {
    const { pointPoolF32, polygonsF32, memSegF32 } = config;
    const placeContent: PlaceContent = config.placeContent.init(buffer);
    const polygon1: PolygonF32 = polygonsF32[0];
    const polygon2: PolygonF32 = polygonsF32[1];
    const pointIndices: number = pointPoolF32.alloc(2);
    const tmpPoint: PointF32 = pointPoolF32.get(pointIndices, 0);
    const firstPoint: PointF32 = pointPoolF32.get(pointIndices, 1);
    const placements: number[][] = [];
    const pathItems: number[][] = [];
    let node: PolygonNode = null;
    let placement: number[] = [];
    let pathItem: number[] = [];
    let positionX: number = 0;
    let positionY: number = 0;
    let fitness: number = 0;
    let pointCount: number = 0;
    let minWidth: number = 0;
    let curArea: number = 0;
    let nfpOffset: number = 0;
    let placed: PolygonNode[] = [];
    let binNfp: Float64Array = null;
    let finalNfp: PointF64[][] = null;
    let minArea: number = 0;
    let minX: number = 0;
    let nfpSize: number = 0;
    let binNfpCount: number = 0;
    let pathKey: number = 0;
    let i: number = 0;
    let j: number = 0;
    let k: number = 0;
    let m: number = 0;

    while (placeContent.nodeCount > 0) {
        placed = [];
        placement = [];
        pathItem = [];
        ++fitness; // add 1 for each new bin opened (lower fitness is better)

        for (i = 0; i < placeContent.nodeCount; ++i) {
            node = placeContent.nodeAt(i);
            firstPoint.fromMemSeg(node.memSeg);
            pathKey = placeContent.getPathKey(i);

            // inner NFP
            binNfp = placeContent.getBinNfp(i);

            // part unplaceable, skip             part unplaceable, skip
            if (!binNfp || binNfp.length < 3 || placeContent.getNfpError(placed, node)) {
                continue;
            }

            positionX = NaN;

            binNfpCount = binNfp[1];

            if (placed.length === 0) {
                // first placement, put it on the left
                for (j = 0; j < binNfpCount; ++j) {
                    polygon1.bindNFP(binNfp, j);

                    for (k = 0; k < polygon1.length; ++k) {
                        tmpPoint.update(polygon1.at(k)).sub(firstPoint);

                        if (Number.isNaN(positionX) || tmpPoint.x < positionX) {
                            positionX = tmpPoint.x;
                            positionY = tmpPoint.y;
                        }
                    }
                }

                pathItem.push(pathKey);
                placement.push(positionX);
                placement.push(positionY);
                placed.push(node);

                continue;
            }

            finalNfp = ClipperWrapper.getFinalNfps(pointPoolF32, placeContent, placed, node, binNfp, placement);

            if (finalNfp === null) {
                continue;
            }

            // choose placement that results in the smallest bounding box
            // could use convex hull instead, but it can create oddly shaped nests (triangles or long slivers)
            // which are not optimal for real-world use
            // OLD-TODO generalize gravity direction
            minWidth = 0;
            minArea = NaN;
            minX = NaN;
            curArea = 0;

            for (j = 0; j < finalNfp.length; ++j) {
                nfpSize = finalNfp[j].length;
                ClipperWrapper.toMemSegF32(finalNfp[j], memSegF32);
                polygon1.bind(memSegF32, 0, nfpSize);
                nfpOffset = nfpSize << 1;

                if (polygon1.absArea < 2) {
                    continue;
                }

                for (k = 0; k < nfpSize; ++k) {
                    pointCount = 0;

                    for (m = 0; m < placed.length; ++m) {
                        tmpPoint.fromMemSeg(placement, m);
                        pointCount = fillPointMemSeg(pointPoolF32, memSegF32, placed[m], tmpPoint, pointCount, nfpOffset);
                    }

                    tmpPoint.update(polygon1.at(k)).sub(firstPoint);

                    pointCount = fillPointMemSeg(pointPoolF32, memSegF32, node, tmpPoint, pointCount, nfpOffset);

                    polygon2.bind(memSegF32, nfpOffset, pointCount);
                    // weigh width more, to help compress in direction of gravity
                    curArea = polygon2.size.x * 2 + polygon2.size.y;

                    if (
                        Number.isNaN(minArea) ||
                        curArea < minArea ||
                        (almostEqual(minArea, curArea) && (Number.isNaN(minX) || tmpPoint.x < minX))
                    ) {
                        minArea = curArea;
                        minWidth = polygon2.size.x;
                        positionX = tmpPoint.x;
                        positionY = tmpPoint.y;
                        minX = tmpPoint.x;
                    }
                }
            }

            if (!Number.isNaN(positionX)) {
                placed.push(node);
                pathItem.push(pathKey);
                placement.push(positionX);
                placement.push(positionY);
            }
        }

        if (minWidth) {
            fitness += minWidth / placeContent.area;
        }

        for (i = 0; i < placed.length; ++i) {
            placeContent.removeNode(placed[i]);
        }

        if (placement.length === 0) {
            break; // something went wrong
        }

        placements.push(placement);
        pathItems.push(pathItem);
    }

    // there were parts that couldn't be placed
    fitness += placeContent.nodeCount << 1;

    pointPoolF32.malloc(pointIndices);

    return getResult(placements, pathItems, fitness);
}
