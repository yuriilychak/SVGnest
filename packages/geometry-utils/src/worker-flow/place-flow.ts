import ClipperLib from 'js-clipper';

import { NFPCache, PolygonNode } from '../types';
import ClipperWrapper from '../clipper-wrapper';
import {
    almostEqual,
    deserializeBufferToMap,
    deserializeConfig,
    deserializePolygonNodes,
    generateNFPCacheKey,
    getPolygonNode,
    getUint16,
    joinUint16,
    toRotationIndex
} from '../helpers';
import Point from '../point';
import Polygon from '../polygon';
import PointPool from '../point-pool';
import { NFP_INFO_START_INDEX } from '../constants';
import { WorkerConfig } from './types';

function fillPointMemSeg(
    pointPool: PointPool,
    memSeg: Float64Array,
    node: PolygonNode,
    offset: Point,
    prevValue: number,
    memOffset: number
): number {
    const pointIndices: number = pointPool.alloc(1);
    const tmpPoint: Point = pointPool.get(pointIndices, 0);
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

function bindNFP(polygon: Polygon, memSeg: Float64Array, index: number): void {
    const compressedInfo: number = memSeg[NFP_INFO_START_INDEX + index];
    const offset: number = getUint16(compressedInfo, 1);
    const size: number = getUint16(compressedInfo, 0) >>> 1;

    polygon.bind(memSeg, offset, size);
}

function applyNfps(polygon: Polygon, clipper: ClipperLib.Clipper, nfpBuffer: ArrayBuffer, offset: Point): void {
    const nfpMemSeg: Float64Array = new Float64Array(nfpBuffer);
    const nfpCount: number = nfpMemSeg[1];
    let clone: ClipperLib.IntPoint[] = null;
    let i: number = 0;

    for (i = 0; i < nfpCount; ++i) {
        bindNFP(polygon, nfpMemSeg, i);
        clone = ClipperWrapper.toClipper(polygon, 1, offset, false, ClipperWrapper.CLEAN_TRASHOLD);

        if (clone.length > 2 && Math.abs(ClipperLib.Clipper.Area(clone)) > ClipperWrapper.AREA_TRASHOLD) {
            clipper.AddPath(clone, ClipperLib.PolyType.ptSubject, true);
        }
    }
}

// ensure all necessary NFPs exist
function getNfpError(nfpCache: NFPCache, rotations: number, placed: PolygonNode[], path: PolygonNode): boolean {
    let i: number = 0;
    let key: number = 0;

    for (i = 0; i < placed.length; ++i) {
        key = generateNFPCacheKey(rotations, false, placed[i], path);

        if (!nfpCache.has(key)) {
            return true;
        }
    }

    return false;
}

function nfpToClipper(polygon: Polygon, pointPool: PointPool, nfpMmSeg: Float64Array): ClipperLib.IntPoint[][] {
    const pointIndices = pointPool.alloc(1);
    const offset: Point = pointPool.get(pointIndices, 0).set(0, 0);
    const nfpCount: number = nfpMmSeg[1];
    let i: number = 0;
    const result = [];

    for (i = 0; i < nfpCount; ++i) {
        bindNFP(polygon, nfpMmSeg, i);
        result.push(ClipperWrapper.toClipper(polygon, 1, offset, true));
    }

    pointPool.malloc(pointIndices);

    return result;
}

function getFinalNfps(
    polygon: Polygon,
    pointPool: PointPool,
    nfpCache: NFPCache,
    rotations: number,
    placed: PolygonNode[],
    path: PolygonNode,
    binNfp: Float64Array,
    placement: number[]
) {
    const pointIndices: number = pointPool.alloc(1);
    const tmpPoint: Point = pointPool.get(pointIndices, 0);
    let clipper = new ClipperLib.Clipper();
    let i: number = 0;
    let key: number = 0;

    for (i = 0; i < placed.length; ++i) {
        key = generateNFPCacheKey(rotations, false, placed[i], path);

        if (!nfpCache.has(key)) {
            continue;
        }

        tmpPoint.fromMemSeg(placement, i);

        applyNfps(polygon, clipper, nfpCache.get(key), tmpPoint);
    }

    pointPool.malloc(pointIndices);

    const combinedNfp = new ClipperLib.Paths();

    if (
        !clipper.Execute(
            ClipperLib.ClipType.ctUnion,
            combinedNfp,
            ClipperLib.PolyFillType.pftNonZero,
            ClipperLib.PolyFillType.pftNonZero
        )
    ) {
        return null;
    }

    // difference with bin polygon
    let finalNfp: ClipperLib.Paths = new ClipperLib.Paths();
    const clipperBinNfp: ClipperLib.IntPoint[][] = nfpToClipper(polygon, pointPool, binNfp);

    clipper = new ClipperLib.Clipper();
    clipper.AddPaths(combinedNfp, ClipperLib.PolyType.ptClip, true);
    clipper.AddPaths(clipperBinNfp, ClipperLib.PolyType.ptSubject, true);

    if (
        !clipper.Execute(
            ClipperLib.ClipType.ctDifference,
            finalNfp,
            ClipperLib.PolyFillType.pftNonZero,
            ClipperLib.PolyFillType.pftNonZero
        )
    ) {
        return null;
    }

    finalNfp = ClipperLib.Clipper.CleanPolygons(finalNfp, ClipperWrapper.CLEAN_TRASHOLD);

    for (i = 0; i < finalNfp.length; ++i) {
        if (finalNfp[i].length < 3 || Math.abs(ClipperLib.Clipper.Area(finalNfp[i])) < ClipperWrapper.AREA_TRASHOLD) {
            finalNfp.splice(i, 1);
            --i;
        }
    }

    return finalNfp.length === 0 ? null : finalNfp;
}

function getPathKey(id: number, rotation: number, rotations: number): number {
    return joinUint16(toRotationIndex(rotation, rotations), id);
}

function getResult(placements: number[][], pathItems: number[][], fitness: number): Float64Array {
    const placementCount: number = pathItems.length;
    const info = new Float64Array(placementCount);
    let totalSize: number = NFP_INFO_START_INDEX + placementCount;
    let offset: number = 0;
    let size: number = 0;
    let i: number = 0;

    for (i = 0; i < placementCount; ++i) {
        size = pathItems[i].length;
        info[i] = joinUint16(size, totalSize);
        totalSize += size * 3;
    }

    const result = new Float64Array(totalSize);

    result[0] = fitness;
    result[1] = placementCount;

    result.set(info, NFP_INFO_START_INDEX);

    for (i = 0; i < placementCount; ++i) {
        offset = getUint16(info[i], 1);
        size = getUint16(info[i], 0);
        result.set(pathItems[i], offset);
        result.set(placements[i], offset + size);
    }

    return result;
}

function deserializeBuffer(buffer: ArrayBuffer): { rotations: number; area: number; nfpCache: NFPCache; nodes: PolygonNode[] } {
    const view: DataView = new DataView(buffer);
    const { rotations } = deserializeConfig(view.getFloat64(Float64Array.BYTES_PER_ELEMENT));
    const area = view.getFloat64(Float64Array.BYTES_PER_ELEMENT * 2);
    const mapBufferSize: number = view.getFloat64(Float64Array.BYTES_PER_ELEMENT * 3);
    const nfpCache: NFPCache = deserializeBufferToMap(buffer, Float64Array.BYTES_PER_ELEMENT * 4, mapBufferSize);
    const nodes: PolygonNode[] = deserializePolygonNodes(buffer, Float64Array.BYTES_PER_ELEMENT * 4 + mapBufferSize);

    return { rotations, area, nfpCache, nodes };
}

export function placePaths(buffer: ArrayBuffer, config: WorkerConfig): Float64Array {
    const { pointPool, polygons, memSeg } = config;
    const { rotations, area, nodes, nfpCache } = deserializeBuffer(buffer);
    const polygon1: Polygon = polygons[0];
    const polygon2: Polygon = polygons[1];
    const emptyPath: PolygonNode = getPolygonNode(-1, new Float64Array(0));
    const pointIndices: number = pointPool.alloc(2);
    const tmpPoint: Point = pointPool.get(pointIndices, 0);
    const firstPoint: Point = pointPool.get(pointIndices, 1);
    const placements: number[][] = [];
    const pathItems: number[][] = [];
    let node: PolygonNode = null;
    let placement: number[] = [];
    let pathItem: number[] = [];
    let positionX: number = 0;
    let positionY: number = 0;
    let fitness: number = 0;
    let pointCount: number = 0;
    let key: number = 0;
    let minWidth: number = 0;
    let curArea: number = 0;
    let nfpOffset: number = 0;
    let placed: PolygonNode[] = [];
    let binNfp: Float64Array = null;
    let finalNfp: ClipperLib.Paths = null;
    let minArea: number = 0;
    let minX: number = 0;
    let nfpSize: number = 0;
    let binNfpCount: number = 0;
    let pathKey: number = 0;
    let i: number = 0;
    let j: number = 0;
    let k: number = 0;
    let m: number = 0;

    while (nodes.length > 0) {
        placed = [];
        placement = [];
        pathItem = [];
        ++fitness; // add 1 for each new bin opened (lower fitness is better)

        for (i = 0; i < nodes.length; ++i) {
            node = nodes[i];
            firstPoint.fromMemSeg(node.memSeg);
            pathKey = getPathKey(node.source, node.rotation, rotations);

            // inner NFP
            key = generateNFPCacheKey(rotations, true, emptyPath, node);
            binNfp = nfpCache.has(key) ? new Float64Array(nfpCache.get(key)) : null;

            // part unplaceable, skip             part unplaceable, skip
            if (!binNfp || binNfp.length < 3 || getNfpError(nfpCache, rotations, placed, node)) {
                continue;
            }

            positionX = NaN;

            binNfpCount = binNfp[1];

            if (placed.length === 0) {
                // first placement, put it on the left
                for (j = 0; j < binNfpCount; ++j) {
                    bindNFP(polygon1, binNfp, j);

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

            finalNfp = getFinalNfps(polygon1, pointPool, nfpCache, rotations, placed, node, binNfp, placement);

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
            fitness += minWidth / area;
        }

        for (i = 0; i < placed.length; ++i) {
            const index = nodes.indexOf(placed[i]);
            if (index !== -1) {
                nodes.splice(index, 1);
            }
        }

        if (placement.length === 0) {
            break; // something went wrong
        }

        placements.push(placement);
        pathItems.push(pathItem);
    }

    // there were parts that couldn't be placed
    fitness += nodes.length << 1;

    pointPool.malloc(pointIndices);

    return getResult(placements, pathItems, fitness);
}
