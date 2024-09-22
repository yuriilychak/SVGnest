import ClipperLib from 'js-clipper';
import { IPoint, IPolygon, PlacementWorkerData } from './types';
import { polygonArea, rotatePolygon } from './helpers';
import ClipperWrapper from './clipper-wrapper';
import { almostEqual, generateNFPCacheKey, toRotationIndex } from './shared-helpers';
import Point from './point';
import Polygon from './polygon';
import PointPool from './point-pool';
import { NFP_INFO_START_INDEX, NFP_SHIFT_AMOUNT } from './constants';

function fillPointMemSeg(
    pointPool: PointPool,
    memSeg: Float64Array,
    points: IPoint[],
    offset: IPoint,
    prevValue: number
): number {
    const pointIndices: number = pointPool.alloc(1);
    const tmpPoint: Point = pointPool.get(pointIndices, 0);
    const pointCount = points.length;
    let i: number = 0;

    for (i = 0; i < pointCount; ++i) {
        tmpPoint
            .update(points[i])
            .add(offset)
            .fill(memSeg, prevValue + i);
    }

    pointPool.malloc(pointIndices);

    return prevValue + pointCount;
}

function bindNFP(polygon: Polygon, memSeg: Float64Array, index: number): void {
    const compressedInfo: number = memSeg[NFP_INFO_START_INDEX + index];
    const offset: number = compressedInfo >>> NFP_SHIFT_AMOUNT;
    const size: number = (compressedInfo & ((1 << NFP_SHIFT_AMOUNT) - 1)) >>> 1;

    polygon.bind(memSeg, offset, size);
}

function applyNfps(polygon: Polygon, clipper: ClipperLib.Clipper, nfpBuffer: ArrayBuffer, offset: IPoint): void {
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
function getNfpError(placementData: PlacementWorkerData, placed: IPolygon[], path: IPolygon): boolean {
    let i: number = 0;
    let key: number = 0;

    for (i = 0; i < placed.length; ++i) {
        key = generateNFPCacheKey(placementData.angleSplit, false, placed[i], path);

        if (!placementData.nfpCache.has(key)) {
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
    placementData: PlacementWorkerData,
    placed: IPolygon[],
    path: IPolygon,
    binNfp: Float64Array,
    placement: number[]
) {
    const pointIndices: number = pointPool.alloc(1);
    const tmpPoint: Point = pointPool.get(pointIndices, 0);
    let clipper = new ClipperLib.Clipper();
    let i: number = 0;
    let key: number = 0;

    for (i = 0; i < placed.length; ++i) {
        key = generateNFPCacheKey(placementData.angleSplit, false, placed[i], path);

        if (!placementData.nfpCache.has(key)) {
            continue;
        }

        tmpPoint.fromMemSeg(placement, i);

        applyNfps(polygon, clipper, placementData.nfpCache.get(key), tmpPoint);
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

function getPathKey(id: number, rotation: number, placementData: PlacementWorkerData): number {
    return (id << 16) | toRotationIndex(rotation, placementData.angleSplit);
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
        info[i] = size | (totalSize << NFP_SHIFT_AMOUNT);
        totalSize += size * 3;
    }

    const result = new Float64Array(totalSize);

    result[0] = fitness;
    result[1] = placementCount;

    result.set(info, NFP_INFO_START_INDEX);

    for (i = 0; i < placementCount; ++i) {
        offset = info[i] >>> NFP_SHIFT_AMOUNT;
        size = info[i] & ((1 << NFP_SHIFT_AMOUNT) - 1);
        result.set(pathItems[i], offset);
        result.set(placements[i], offset + size);
    }

    return result;
}

export function placePaths(inputPaths: IPolygon[], placementData: PlacementWorkerData, pointPool: PointPool): Float64Array {
    if (!placementData.binPolygon) {
        return new Float64Array(0);
    }

    // rotate paths by given rotation
    const paths: IPolygon[] = [];
    const emptyPath: IPolygon = [] as IPolygon;
    const pointIndices: number = pointPool.alloc(1);
    const tmpPoint: Point = pointPool.get(pointIndices, 0);
    let i: number = 0;
    let j: number = 0;
    let k: number = 0;
    let m: number = 0;
    let path: IPolygon = null;
    let rotatedPath: IPolygon = null;

    emptyPath.id = -1;
    emptyPath.rotation = 0;

    for (i = 0; i < inputPaths.length; ++i) {
        path = inputPaths[i];
        rotatedPath = rotatePolygon(path, path.rotation);
        rotatedPath.rotation = path.rotation;
        rotatedPath.source = path.source;
        rotatedPath.id = path.id;
        paths.push(rotatedPath);
    }

    const polygon: Polygon = Polygon.create();
    const placements: number[][] = [];
    let placement: number[] = [];
    const pathItems: number[][] = [];
    let pathItem: number[] = [];
    const area = Math.abs(polygonArea(placementData.binPolygon));
    const pntMemSeg: Float64Array = new Float64Array(8192);
    const nfpMemSeg: Float64Array = new Float64Array(2048);
    let positionX: number = 0;
    let positionY: number = 0;
    let fitness: number = 0;
    let pointCount: number = 0;
    let key: number = 0;
    let minWidth: number = 0;
    let curArea: number = 0;
    let placed: IPolygon[] = [];
    let binNfp: Float64Array = null;
    let finalNfp: ClipperLib.Paths = null;
    let minArea: number = 0;
    let minX: number = 0;
    let nfpSize: number = 0;
    let binNfpCount: number = 0;
    let pathKey: number = 0;

    while (paths.length > 0) {
        placed = [];
        placement = [];
        pathItem = [];
        ++fitness; // add 1 for each new bin opened (lower fitness is better)

        for (i = 0; i < paths.length; ++i) {
            path = paths[i];
            pathKey = getPathKey(path.id, path.rotation, placementData);

            // inner NFP
            key = generateNFPCacheKey(placementData.angleSplit, true, emptyPath, path);
            binNfp = placementData.nfpCache.has(key) ? new Float64Array(placementData.nfpCache.get(key)) : null;

            // part unplaceable, skip             part unplaceable, skip
            if (!binNfp || binNfp.length < 3 || getNfpError(placementData, placed, path)) {
                continue;
            }

            positionX = NaN;

            binNfpCount = binNfp[1];

            if (placed.length === 0) {
                // first placement, put it on the left
                for (j = 0; j < binNfpCount; ++j) {
                    bindNFP(polygon, binNfp, j);

                    for (k = 0; k < polygon.length; ++k) {
                        tmpPoint.update(polygon.at(k)).sub(path[0]);

                        if (Number.isNaN(positionX) || tmpPoint.x < positionX) {
                            positionX = tmpPoint.x;
                            positionY = tmpPoint.y;
                        }
                    }
                }

                pathItem.push(pathKey);
                placement.push(positionX);
                placement.push(positionY);
                placed.push(path);

                continue;
            }

            finalNfp = getFinalNfps(polygon, pointPool, placementData, placed, path, binNfp, placement);

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
                ClipperWrapper.toMemSeg(finalNfp[j], nfpMemSeg);
                polygon.bind(nfpMemSeg, 0, nfpSize);

                if (Math.abs(polygon.area) < 2) {
                    continue;
                }

                for (k = 0; k < nfpSize; ++k) {
                    pointCount = 0;

                    for (m = 0; m < placed.length; ++m) {
                        tmpPoint.fromMemSeg(placement, m);
                        pointCount = fillPointMemSeg(pointPool, pntMemSeg, placed[m], tmpPoint, pointCount);
                    }

                    polygon.bind(nfpMemSeg, 0, nfpSize);

                    tmpPoint.update(polygon.at(k)).sub(path[0]);

                    pointCount = fillPointMemSeg(pointPool, pntMemSeg, path, tmpPoint, pointCount);

                    polygon.bind(pntMemSeg, 0, pointCount);
                    // weigh width more, to help compress in direction of gravity
                    curArea = polygon.size.x * 2 + polygon.size.y;

                    if (
                        Number.isNaN(minArea) ||
                        curArea < minArea ||
                        (almostEqual(minArea, curArea) && (Number.isNaN(minX) || tmpPoint.x < minX))
                    ) {
                        minArea = curArea;
                        minWidth = polygon.size.x;
                        positionX = tmpPoint.x;
                        positionY = tmpPoint.y;
                        minX = tmpPoint.x;
                    }
                }
            }

            if (!Number.isNaN(positionX)) {
                placed.push(path);
                pathItem.push(pathKey);
                placement.push(positionX);
                placement.push(positionY);
            }
        }

        if (minWidth) {
            fitness += minWidth / area;
        }

        for (i = 0; i < placed.length; ++i) {
            const index = paths.indexOf(placed[i]);
            if (index !== -1) {
                paths.splice(index, 1);
            }
        }

        if (placement.length === 0) {
            break; // something went wrong
        }

        placements.push(placement);
        pathItems.push(pathItem);
    }

    // there were parts that couldn't be placed
    fitness += paths.length << 1;

    pointPool.malloc(pointIndices);

    return getResult(placements, pathItems, fitness);
}
