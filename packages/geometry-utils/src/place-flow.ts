import ClipperLib from 'js-clipper';
import { IPoint, IPolygon, PlacementWorkerData, PlacementWorkerResult } from './types';
import { polygonArea, rotatePolygon } from './helpers';
import ClipperWrapper from './clipper-wrapper';
import { almostEqual, generateNFPCacheKey } from './shared-helpers';
import Point from './point';
import Polygon from './polygon';
import PointPool from './point-pool';

interface ShiftVector extends IPoint {
    nfp: ClipperLib.Paths;
}

function fillPointStack(
    pointPool: PointPool,
    pointStack: Float64Array,
    points: IPoint[],
    offset: IPoint,
    prevValue: number
): number {
    const pointIndices: number = pointPool.alloc(1);
    const tmpPoint: Point = pointPool.get(pointIndices, 0);
    const pointCount = points.length;
    let i: number = 0;
    let index: number = 0;

    for (i = 0; i < pointCount; ++i) {
        tmpPoint.update(points[i]).add(offset);
        index = (prevValue + i) << 1;
        pointStack[index] = tmpPoint.x;
        pointStack[index + 1] = tmpPoint.y;
    }

    pointPool.malloc(pointIndices);

    return prevValue + pointCount;
}

function applyNfps(
    clipper: ClipperLib.Clipper,
    nfps: IPoint[][],
    scale: number,
    offset: IPoint,
    areaTrashold: number,
    cleanTrashold: number
): void {
    const nfpCount: number = nfps.length;
    let clone: ClipperLib.IntPoint[] = null;
    let i: number = 0;

    for (i = 0; i < nfpCount; ++i) {
        clone = ClipperWrapper.toClipper(nfps[i], scale, offset, false, cleanTrashold);

        if (clone.length > 2 && Math.abs(ClipperLib.Clipper.Area(clone)) > areaTrashold) {
            clipper.AddPath(clone, ClipperLib.PolyType.ptSubject, true);
        }
    }
}

export function placePaths(
    inputPaths: IPolygon[],
    placementData: PlacementWorkerData,
    pointPool: PointPool
): PlacementWorkerResult | null {
    if (!placementData.binPolygon) {
        return null;
    }

    const pointIndices: number = pointPool.alloc(1);
    const tmpPoint: Point = pointPool.get(pointIndices, 0);
    let i: number = 0;
    let j: number = 0;
    let k: number = 0;
    let m: number = 0;
    let path: IPolygon = null;
    let rotatedPath: IPolygon = null;
    // rotate paths by given rotation
    const paths: IPolygon[] = [];
    const emptyPath: IPolygon = [] as IPolygon;

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
    const placements = [];
    const areaTrashold: number = 0.1 * placementData.config.clipperScale * placementData.config.clipperScale;
    const cleanTrashold: number = 0.0001 * placementData.config.clipperScale;
    const area = Math.abs(polygonArea(placementData.binPolygon));
    const pointStack: Float64Array = new Float64Array(2048);
    const nfpMemSeg: Float64Array = new Float64Array(512);
    let shiftVector: ShiftVector = null;
    let fitness: number = 0;
    let pointCount: number = 0;
    let key: number = 0;
    let nfps: IPoint[][] = null;
    let minWidth: number = 0;
    let curArea: number = 0;
    let placed: IPolygon[] = [];
    let currPlacements: IPoint[] = [];
    let binNfp: IPoint[][] = null;
    let finalNfp: ClipperLib.Paths = null;
    let isError: boolean = false;
    let minArea: number = 0;
    let minX: number = 0;
    let nfpSize: number = 0;

    while (paths.length > 0) {
        placed = [];
        currPlacements = [];
        ++fitness; // add 1 for each new bin opened (lower fitness is better)

        for (i = 0; i < paths.length; ++i) {
            path = paths[i];

            // inner NFP
            key = generateNFPCacheKey(placementData.angleSplit, true, emptyPath, path);
            binNfp = placementData.nfpCache.get(key);

            // part unplaceable, skip
            if (!binNfp || binNfp.length === 0) {
                continue;
            }

            // ensure all necessary NFPs exist
            isError = false;

            for (j = 0; j < placed.length; ++j) {
                key = generateNFPCacheKey(placementData.angleSplit, false, placed[j], path);
                isError = !placementData.nfpCache.has(key);

                if (isError) {
                    break;
                }
            }

            // part unplaceable, skip
            if (isError) {
                continue;
            }

            let position: IPoint = null;

            if (placed.length === 0) {
                // first placement, put it on the left
                for (j = 0; j < binNfp.length; ++j) {
                    for (k = 0; k < binNfp[j].length; ++k) {
                        tmpPoint.update(binNfp[j][k]).sub(path[0]);
                        if (position === null || tmpPoint.x < position.x) {
                            position = { x: tmpPoint.x, y: tmpPoint.y, id: path.id, rotation: path.rotation };
                        }
                    }
                }

                currPlacements.push(position);
                placed.push(path);

                continue;
            }

            const clipperBinNfp = [];
            for (j = 0; j < binNfp.length; ++j) {
                clipperBinNfp.push(
                    ClipperWrapper.toClipper(binNfp[j], placementData.config.clipperScale, { x: 0, y: 0 }, true)
                );
            }

            let clipper = new ClipperLib.Clipper();
            const combinedNfp = new ClipperLib.Paths();

            for (j = 0; j < placed.length; ++j) {
                key = generateNFPCacheKey(placementData.angleSplit, false, placed[j], path);

                if (!placementData.nfpCache.has(key)) {
                    continue;
                }

                nfps = placementData.nfpCache.get(key);

                applyNfps(clipper, nfps, placementData.config.clipperScale, currPlacements[j], areaTrashold, cleanTrashold);
            }

            if (
                !clipper.Execute(
                    ClipperLib.ClipType.ctUnion,
                    combinedNfp,
                    ClipperLib.PolyFillType.pftNonZero,
                    ClipperLib.PolyFillType.pftNonZero
                )
            ) {
                continue;
            }

            // difference with bin polygon
            finalNfp = new ClipperLib.Paths();
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
                continue;
            }

            finalNfp = ClipperLib.Clipper.CleanPolygons(finalNfp, cleanTrashold);

            for (j = 0; j < finalNfp.length; ++j) {
                curArea = Math.abs(ClipperLib.Clipper.Area(finalNfp[j]));
                if (finalNfp[j].length < 3 || curArea < areaTrashold) {
                    finalNfp.splice(j, 1);
                    --j;
                }
            }

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
            shiftVector = null;

            for (j = 0; j < finalNfp.length; ++j) {
                nfpSize = finalNfp[j].length;
                ClipperWrapper.toMemSeg(finalNfp[j], placementData.config.clipperScale, nfpMemSeg);
                polygon.bind(nfpMemSeg, 0, nfpSize);

                if (Math.abs(polygon.area) < 2) {
                    continue;
                }

                for (k = 0; k < nfpSize; ++k) {
                    pointCount = 0;

                    for (m = 0; m < placed.length; ++m) {
                        pointCount = fillPointStack(pointPool, pointStack, placed[m], currPlacements[m], pointCount);
                    }

                    polygon.bind(nfpMemSeg, 0, nfpSize);

                    tmpPoint.update(polygon.at(k)).sub(path[0]);

                    shiftVector = { x: tmpPoint.x, y: tmpPoint.y, id: path.id, rotation: path.rotation, nfp: combinedNfp };

                    pointCount = fillPointStack(pointPool, pointStack, path, shiftVector, pointCount);

                    polygon.bind(pointStack, 0, pointCount);
                    // weigh width more, to help compress in direction of gravity
                    curArea = polygon.size.x * 2 + polygon.size.y;

                    if (
                        Number.isNaN(minArea) ||
                        curArea < minArea ||
                        (almostEqual(minArea, curArea) && (Number.isNaN(minX) || shiftVector.x < minX))
                    ) {
                        minArea = curArea;
                        minWidth = polygon.size.x;
                        position = shiftVector;
                        minX = shiftVector.x;
                    }
                }
            }

            if (position) {
                placed.push(path);
                currPlacements.push(position);
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

        if (currPlacements.length === 0) {
            break; // something went wrong
        }

        placements.push(currPlacements);
    }

    // there were parts that couldn't be placed
    fitness += paths.length << 1;

    pointPool.malloc(pointIndices);

    return { placements, fitness, paths, area };
}
