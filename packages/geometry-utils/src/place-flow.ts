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

export function placePaths(
    inputPaths: IPolygon[],
    placementData: PlacementWorkerData,
    pointPool: PointPool
): PlacementWorkerResult | null {
    if (!placementData.binPolygon) {
        return null;
    }

    let i: number = 0;
    let j: number = 0;
    let k: number = 0;
    let m: number = 0;
    let n: number = 0;
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

    const polygon: Polygon = Polygon.fromLegacy([]);
    const allplacements = [];
    let fitness = 0;
    const binarea = Math.abs(polygonArea(placementData.binPolygon));
    let key: number = 0;
    let nfp: IPoint[][] = null;
    let minWidth: number = 0;
    let area: number = 0;
    let pointIndices: number = 0;

    while (paths.length > 0) {
        const placed = [];
        const placements = [];
        fitness = fitness + 1; // add 1 for each new bin opened (lower fitness is better)

        for (i = 0; i < paths.length; ++i) {
            path = paths[i];

            // inner NFP
            key = generateNFPCacheKey(placementData.angleSplit, true, emptyPath, path);
            const binNfp = placementData.nfpCache.get(key);

            // part unplaceable, skip
            if (!binNfp || binNfp.length === 0) {
                continue;
            }

            // ensure all necessary NFPs exist
            let isError: boolean = false;
            for (j = 0; j < placed.length; ++j) {
                key = generateNFPCacheKey(placementData.angleSplit, false, placed[j], path);
                nfp = placementData.nfpCache.get(key);

                if (!nfp) {
                    isError = true;
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
                        if (position === null || binNfp[j][k].x - path[0].x < position.x) {
                            position = {
                                x: binNfp[j][k].x - path[0].x,
                                y: binNfp[j][k].y - path[0].y,
                                id: path.id,
                                rotation: path.rotation
                            };
                        }
                    }
                }

                placements.push(position);
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

                nfp = placementData.nfpCache.get(key);

                if (!nfp) {
                    continue;
                }

                let clone: ClipperLib.IntPoint[] = null;

                for (k = 0; k < nfp.length; ++k) {
                    clone = ClipperWrapper.toClipper(nfp[k], placementData.config.clipperScale, placements[j]);
                    clone = ClipperLib.Clipper.CleanPolygon(clone, 0.0001 * placementData.config.clipperScale);
                    area = Math.abs(ClipperLib.Clipper.Area(clone));

                    if (
                        clone.length > 2 &&
                        area > 0.1 * placementData.config.clipperScale * placementData.config.clipperScale
                    ) {
                        clipper.AddPath(clone, ClipperLib.PolyType.ptSubject, true);
                    }
                }
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
            let finalNfp = new ClipperLib.Paths();
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

            finalNfp = ClipperLib.Clipper.CleanPolygons(finalNfp, 0.0001 * placementData.config.clipperScale);

            for (j = 0; j < finalNfp.length; ++j) {
                area = Math.abs(ClipperLib.Clipper.Area(finalNfp[j]));
                if (
                    finalNfp[j].length < 3 ||
                    area < 0.1 * placementData.config.clipperScale * placementData.config.clipperScale
                ) {
                    finalNfp.splice(j, 1);
                    --j;
                }
            }

            if (!finalNfp || finalNfp.length === 0) {
                continue;
            }

            const f: IPoint[][] = [];
            for (j = 0; j < finalNfp.length; ++j) {
                // back to normal scale
                f.push(ClipperWrapper.toNest(finalNfp[j], placementData.config.clipperScale));
            }

            // choose placement that results in the smallest bounding box
            // could use convex hull instead, but it can create oddly shaped nests (triangles or long slivers)
            // which are not optimal for real-world use
            // OLD-TODO generalize gravity direction
            minWidth = 0;
            let minArea: number = NaN;
            let minX: number = NaN;
            area = 0;
            let nf: IPoint[] = null;
            let shiftVector: ShiftVector = null;

            for (j = 0; j < f.length; ++j) {
                nf = f[j];
                if (Math.abs(polygonArea(nf)) < 2) {
                    continue;
                }

                for (k = 0; k < nf.length; ++k) {
                    const allPoints: Point[] = [];
                    for (m = 0; m < placed.length; ++m) {
                        for (n = 0; n < placed[m].length; ++n) {
                            allPoints.push(Point.from(placed[m][n]).add(placements[m]));
                        }
                    }

                    shiftVector = {
                        x: nf[k].x - path[0].x,
                        y: nf[k].y - path[0].y,
                        id: path.id,
                        rotation: path.rotation,
                        nfp: combinedNfp
                    };

                    for (m = 0; m < path.length; ++m) {
                        allPoints.push(Point.from(path[m]).add(shiftVector));
                    }

                    polygon.reset(allPoints);
                    // weigh width more, to help compress in direction of gravity
                    area = polygon.width * 2 + polygon.height;

                    if (
                        Number.isNaN(minArea) ||
                        area < minArea ||
                        (almostEqual(minArea, area) && (Number.isNaN(minX) || shiftVector.x < minX))
                    ) {
                        minArea = area;
                        minWidth = polygon.width;
                        position = shiftVector;
                        minX = shiftVector.x;
                    }
                }
            }
            if (position) {
                placed.push(path);
                placements.push(position);
            }
        }

        if (minWidth) {
            fitness = fitness + minWidth / binarea;
        }

        for (i = 0; i < placed.length; ++i) {
            const index = paths.indexOf(placed[i]);
            if (index >= 0) {
                paths.splice(index, 1);
            }
        }

        if (placements && placements.length > 0) {
            allplacements.push(placements);
        } else {
            break; // something went wrong
        }
    }

    // there were parts that couldn't be placed
    fitness = fitness + 2 * paths.length;

    return {
        placements: allplacements,
        fitness,
        paths,
        area: binarea
    };
}
