import ClipperLib from 'js-clipper';
import { isRectangle, noFitPolygonRectangle, noFitPolygon, pointInPolygon } from '../../../geometry-util';
import { keyToNFPData, rotatePolygon, getPolygonBounds, polygonArea } from '../../../helpers';
import ClipperWrapper from '../../../clipper-wrapper';
import { BoundRect, IPoint, IPolygon, NestConfig, NFPContent, NFPPair, PairWorkerResult } from '../../../types';

// clipperjs uses alerts for warnings
// eslint-disable-next-line
function alert(message: string) {
    console.log('alert: ', message);
}

function minkowskiDifference(polygonA: IPolygon, polygonB: IPolygon, clipperScale: number): IPoint[][] {
    const clipperA: ClipperLib.IntPoint[] = ClipperWrapper.toClipper(polygonA, clipperScale);
    const clipperB: ClipperLib.IntPoint[] = ClipperWrapper.toClipper(polygonB, -clipperScale);
    const solutions: ClipperLib.IntPoint[][] = ClipperLib.Clipper.MinkowskiSum(clipperA, clipperB, true);
    const solutionCount: number = solutions.length;
    const firstPoint: IPoint = polygonB[0];
    let i: number = 0;
    let clipperNfp: IPoint[] = null;
    let largestArea: number = null;
    let n = null;
    let area: number = 0;

    for (i = 0; i < solutionCount; ++i) {
        n = ClipperWrapper.toNest(solutions[i], clipperScale);
        area = polygonArea(n);

        if (largestArea === null || largestArea > area) {
            clipperNfp = n;
            largestArea = area;
        }
    }

    for (i = 0; i < clipperNfp.length; ++i) {
        clipperNfp[i].x = clipperNfp[i].x + firstPoint.x;
        clipperNfp[i].y = clipperNfp[i].y + firstPoint.y;
    }

    return [clipperNfp];
}

export function pairData(pair: NFPPair, configuration: NestConfig): PairWorkerResult | null {
    const { clipperScale, exploreConcave, useHoles, rotations } = configuration;

    if (!pair || pair.length === 0) {
        return null;
    }

    const nfpContent: NFPContent = keyToNFPData(pair.key, rotations);
    const polygonA: IPolygon = rotatePolygon(pair.A, nfpContent.Arotation);
    const polygonB: IPolygon = rotatePolygon(pair.B, nfpContent.Brotation);
    let nfp: IPoint[][] = null;
    let i: number = 0;

    if (nfpContent.inside) {
        nfp = isRectangle(polygonA, 0.001)
            ? noFitPolygonRectangle(polygonA, polygonB)
            : noFitPolygon(polygonA, polygonB, true, exploreConcave);

        // ensure all interior NFPs have the same winding direction
        if (nfp && nfp.length > 0) {
            for (i = 0; i < nfp.length; ++i) {
                if (polygonArea(nfp[i]) > 0) {
                    nfp[i].reverse();
                }
            }
        } else {
            // warning on null inner NFP
            // this is not an error, as the part may simply be larger than the bin or otherwise unplaceable due to geometry
            console.log('NFP Warning: ', pair.key);
        }
    } else {
        nfp = exploreConcave
            ? noFitPolygon(polygonA, polygonB, false, exploreConcave)
            : minkowskiDifference(polygonA, polygonB, clipperScale);
        // sanity check
        if (!nfp || nfp.length === 0) {
            console.log('NFP Error: ', pair.key);
            console.log('A: ', JSON.stringify(polygonA));
            console.log('B: ', JSON.stringify(polygonB));

            return null;
        }

        for (i = 0; i < nfp.length; ++i) {
            if (!exploreConcave || i === 0) {
                // if searchedges is active, only the first NFP is guaranteed to pass sanity check
                if (Math.abs(polygonArea(nfp[i])) < Math.abs(polygonArea(polygonA))) {
                    console.log('NFP Area Error: ', Math.abs(polygonArea(nfp[i])), pair.key);
                    console.log('NFP:', JSON.stringify(nfp[i]));
                    console.log('A: ', JSON.stringify(polygonA));
                    console.log('B: ', JSON.stringify(polygonB));
                    nfp.splice(i, 1);

                    return null;
                }
            }
        }

        if (nfp.length === 0) {
            return null;
        }

        // for outer NFPs, the first is guaranteed to be the largest. Any subsequent NFPs that lie inside the first are holes
        for (i = 0; i < nfp.length; ++i) {
            if (polygonArea(nfp[i]) > 0) {
                nfp[i].reverse();
            }

            if (i > 0) {
                if (pointInPolygon(nfp[i][0], nfp[0])) {
                    if (polygonArea(nfp[i]) < 0) {
                        nfp[i].reverse();
                    }
                }
            }
        }

        const childCount: number = polygonA.children ? polygonA.children.length : 0;

        // generate nfps for children (holes of parts) if any exist
        if (useHoles && childCount !== 0) {
            const boundsB: BoundRect = getPolygonBounds(polygonB);

            for (i = 0; i < childCount; ++i) {
                const boundsA = getPolygonBounds(polygonA.children[i]);

                // no need to find nfp if B's bounding box is too big
                if (boundsA.width > boundsB.width && boundsA.height > boundsB.height) {
                    const noFitPolygons: IPoint[][] = noFitPolygon(polygonA.children[i], polygonB, true, exploreConcave);
                    const noFitCount: number = noFitPolygons ? noFitPolygons.length : 0;
                    // ensure all interior NFPs have the same winding direction
                    if (noFitCount !== 0) {
                        let j: number = 0;

                        for (j = 0; j < noFitCount; ++j) {
                            if (polygonArea(noFitPolygons[j]) < 0) {
                                noFitPolygons[j].reverse();
                            }

                            nfp.push(noFitPolygons[j]);
                        }
                    }
                }
            }
        }
    }

    return { key: pair.key, value: nfp };
}
