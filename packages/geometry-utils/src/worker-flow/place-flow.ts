import { get_result_wasm, calculate_bounds_f32, abs_polygon_area } from 'wasm-nesting';
import type { Point, Polygon, PolygonNode } from '../types';
import ClipperWrapper from '../clipper-wrapper';
import { almostEqual } from '../helpers';
import PlaceContent from './place-content';
import NFPWrapper from './nfp-wrapper';
import { PointPoolF32, PolygonF32, PointF32 } from '../geometry';

function toMemSeg(polygon: Point<Int32Array>[]): Float32Array {
    const pointCount: number = polygon.length;
    const result: Float32Array = new Float32Array(pointCount << 1);
    const tempPoint: Point<Float32Array> = PointF32.create();

    for (let i = 0; i < pointCount; ++i) {
        tempPoint.update(polygon[i]).scaleDown(ClipperWrapper.CLIPPER_SCALE);
        tempPoint.fill(result, i);
    }

    return result;
}

function fillPointMemSeg(
    node: PolygonNode,
    offset: Point<Float32Array>,
): number[] {
    const result = [];
    const pointCount = node.memSeg.length >> 1;

    for (let i = 0; i < pointCount; ++i) {
        result.push(node.memSeg[i << 1] + offset.x);
        result.push(node.memSeg[(i << 1) + 1] + offset.y);
    }

    return result;
}

function getPlacementData(
    finalNfp: Point<Int32Array>[][],
    placed: PolygonNode[],
    node: PolygonNode,
    placement: number[],
    firstPoint: Point<Float32Array>,
    inputY: number
): Float32Array {
    let positionX = NaN;
    let positionY = inputY;
    let minWidth = 0;
    let minArea = NaN;
    let minX = NaN;
    let curArea = 0;
    let nfpSize = 0;
    const tmpPoint = PointF32.create();

    for (let j = 0; j < finalNfp.length; ++j) {
        nfpSize = finalNfp[j].length;
        const memSeg1 = toMemSeg(finalNfp[j]);

        if (abs_polygon_area(memSeg1) < 2) {
            continue;
        }

        for (let k = 0; k < nfpSize; ++k) {
            let buffer: number[] = [];

            for (let m = 0; m < placed.length; ++m) {
                tmpPoint.fromMemSeg(placement, m);
                buffer = buffer.concat(fillPointMemSeg(placed[m], tmpPoint));
            }

            tmpPoint.fromMemSeg(memSeg1, k).sub(firstPoint);

            buffer = buffer.concat(fillPointMemSeg(node, tmpPoint));

            const memSeg2 = new Float32Array(buffer);

            const bounds = calculate_bounds_f32(memSeg2, 0, memSeg2.length >> 1);
            // weigh width more, to help compress in direction of gravity
            curArea = bounds[2] * 2 + bounds[3];

            if (
                Number.isNaN(minArea) ||
                curArea < minArea ||
                (almostEqual(minArea, curArea) && (Number.isNaN(minX) || tmpPoint.x < minX))
            ) {
                minArea = curArea;
                minWidth = bounds[2];
                positionX = tmpPoint.x;
                positionY = tmpPoint.y;
                minX = tmpPoint.x;
            }
        }
    }

    return new Float32Array(!Number.isNaN(positionX) ? [minWidth, positionY, positionX] : [minWidth, positionY]);
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

export function placePaths(buffer: ArrayBuffer): ArrayBuffer {
    const placeContent: PlaceContent = new PlaceContent().init(buffer);
    const pointPool = new PointPoolF32();
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
    let minWidth: number = 0;
    let placed: PolygonNode[] = [];
    let binNfp: NFPWrapper = new NFPWrapper();
    let finalNfp: Point<Int32Array>[][] = null;
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
                const polygon1: Polygon<Float32Array> = new PolygonF32();
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

            const placementData = getPlacementData(finalNfp, placed, node, placement, firstPoint, positionY);

            minWidth = placementData[0];
            positionY = placementData[1];


            if (placementData.length === 3) {
                placed.push(node);
                pathItem.push(pathKey);
                placement.push(placementData[2]);
                placement.push(placementData[1]);
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
