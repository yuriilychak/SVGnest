import { get_result_wasm } from 'wasm-nesting';
import type { Point, PointPool, Polygon, PolygonNode, TypedArray } from '../types';
import ClipperWrapper from '../clipper-wrapper';
import { almostEqual } from '../helpers';
import { WorkerConfig } from './types';
import PlaceContent from './place-content';
import NFPWrapper from './nfp-wrapper';

function fillPointMemSeg<T extends TypedArray = Float32Array>(
    pointPool: PointPool<T>,
    memSeg: T,
    node: PolygonNode,
    offset: Point<T>,
    prevValue: number,
    memOffset: number
): number {
    const pointIndices: number = pointPool.alloc(1);
    const tmpPoint: Point<T> = pointPool.get(pointIndices, 0);
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

/**
 * Serialize number[][] to Float32Array with format: [count, size1, ...data1..., size2, ...data2..., ...]
 */
function serializePlacementsToFloat32Array(placements: number[][]): Float32Array {
    const count = placements.length;
    let totalLength = 1; // For count
    for (const placement of placements) {
        totalLength += 1 + placement.length; // size + data
    }

    const buffer = new Float32Array(totalLength);
    buffer[0] = count;
    let offset = 1;

    for (const placement of placements) {
        buffer[offset++] = placement.length;
        for (const value of placement) {
            buffer[offset++] = value;
        }
    }

    return buffer;
}

/**
 * Serialize number[][] to Uint32Array with format: [count, size1, ...data1..., size2, ...data2..., ...]
 */
function serializePathItemsToUint32Array(pathItems: number[][]): Uint32Array {
    const count = pathItems.length;
    let totalLength = 1; // For count
    for (const pathItem of pathItems) {
        totalLength += 1 + pathItem.length; // size + data
    }

    const buffer = new Uint32Array(totalLength);
    buffer[0] = count;
    let offset = 1;

    for (const pathItem of pathItems) {
        buffer[offset++] = pathItem.length;
        for (const value of pathItem) {
            buffer[offset++] = value;
        }
    }

    return buffer;
}

function getResult(placements: number[][], pathItems: number[][], fitness: number): ArrayBuffer {
    const placementsBuffer = serializePlacementsToFloat32Array(placements);
    const pathItemsBuffer = serializePathItemsToUint32Array(pathItems);
    const result = get_result_wasm(placementsBuffer, pathItemsBuffer, fitness);

    return result.buffer as ArrayBuffer;
}

export function placePaths(buffer: ArrayBuffer, config: WorkerConfig): ArrayBuffer {
    const { pointPool, polygons, memSeg } = config.f32;
    const placeContent: PlaceContent = config.placeContent.init(buffer);
    const polygon1: Polygon<Float32Array> = polygons[0];
    const polygon2: Polygon<Float32Array> = polygons[1];
    const pointIndices: number = pointPool.alloc(2);
    const tmpPoint: Point<Float32Array> = pointPool.get(pointIndices, 0);
    const firstPoint: Point<Float32Array> = pointPool.get(pointIndices, 1);
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
    let binNfp: NFPWrapper = new NFPWrapper();
    let finalNfp: Point<Int32Array>[][] = null;
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
            binNfp.buffer = placeContent.getBinNfp(i);

            // part unplaceable, skip             part unplaceable, skip
            if (binNfp.isBroken || placeContent.getNfpError(placed, node)) {
                continue;
            }

            positionX = NaN;

            binNfpCount = binNfp.count;

            if (placed.length === 0) {
                // first placement, put it on the left
                for (j = 0; j < binNfpCount; ++j) {
                    polygon1.bind(binNfp.getNFPMemSeg(j));

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

            finalNfp = ClipperWrapper.getFinalNfps(placeContent, placed, node, binNfp, placement);

            if (finalNfp.length === 0) {
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
                ClipperWrapper.toMemSeg(finalNfp[j], memSeg);
                polygon1.bind(memSeg, 0, nfpSize);
                nfpOffset = nfpSize << 1;

                if (polygon1.absArea < 2) {
                    continue;
                }

                for (k = 0; k < nfpSize; ++k) {
                    pointCount = 0;

                    for (m = 0; m < placed.length; ++m) {
                        tmpPoint.fromMemSeg(placement, m);
                        pointCount = fillPointMemSeg(pointPool, memSeg, placed[m], tmpPoint, pointCount, nfpOffset);
                    }

                    tmpPoint.update(polygon1.at(k)).sub(firstPoint);

                    pointCount = fillPointMemSeg(pointPool, memSeg, node, tmpPoint, pointCount, nfpOffset);

                    polygon2.bind(memSeg, nfpOffset, pointCount);
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

    pointPool.malloc(pointIndices);

    return getResult(placements, pathItems, fitness);
}
