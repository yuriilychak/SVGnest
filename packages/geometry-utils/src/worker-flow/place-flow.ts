import { get_result_wasm, get_placement_data_wasm, get_first_placement_wasm } from 'wasm-nesting';
import type { Point, PolygonNode } from '../types';
import ClipperWrapper from '../clipper-wrapper';
import { serializePolygonNodes } from '../helpers';
import PlaceContent from './place-content';
import NFPWrapper from './nfp-wrapper';
import { PointF32 } from '../geometry';

function getPlacementData(
    finalNfp: Point<Int32Array>[][],
    placed: PolygonNode[],
    node: PolygonNode,
    placement: number[],
    firstPoint: Point<Float32Array>,
    inputY: number
): Float32Array {
    // Serialize finalNfp using ClipperWrapper
    const finalNfpSerialized = ClipperWrapper.serializePolygons(finalNfp);

    // Serialize nodes (placed + current node)
    const allNodes = [...placed, node];
    const nodesBuffer = new Float32Array(serializePolygonNodes(allNodes));

    // Create placement buffer
    const placementBuffer = new Float32Array(placement);

    // Call WASM function
    return get_placement_data_wasm(
        finalNfpSerialized,
        nodesBuffer,
        placementBuffer,
        firstPoint.x,
        firstPoint.y,
        inputY
    );
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

function getFirstPlacement(binNfp: NFPWrapper, firstPoint: Point<Float32Array>): Float32Array {
    return get_first_placement_wasm(new Uint8Array(binNfp.buffer), firstPoint.x, firstPoint.y);
}

function getResult(placements: number[][], pathItems: number[][], fitness: number): ArrayBuffer {
    const placementsBuffer = serializePlacementsToFloat32Array(placements);
    const pathItemsBuffer = serializePathItemsToUint32Array(pathItems);
    const result = get_result_wasm(placementsBuffer, pathItemsBuffer, fitness);

    return result.buffer as ArrayBuffer;
}

export function placePaths(buffer: ArrayBuffer): ArrayBuffer {
    const placeContent: PlaceContent = new PlaceContent().init(buffer);
    const firstPoint: Point<Float32Array> = PointF32.create();
    const placements: number[][] = [];
    const pathItems: number[][] = [];
    let node: PolygonNode = null;
    let placement: number[] = [];
    let pathItem: number[] = [];
    let positionY: number = 0;
    let fitness: number = 0;
    let minWidth: number = 0;
    let placed: PolygonNode[] = [];
    let binNfp: NFPWrapper = new NFPWrapper();
    let finalNfp: Point<Int32Array>[][] = null;
    let pathKey: number = 0;
    let i: number = 0;

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

            if (placed.length === 0) {
                const placementData = getFirstPlacement(binNfp, firstPoint);

                positionY = placementData[1];

                pathItem.push(pathKey);
                placement.push(placementData[0]);
                placement.push(placementData[1]);
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

    return getResult(placements, pathItems, fitness);
}
