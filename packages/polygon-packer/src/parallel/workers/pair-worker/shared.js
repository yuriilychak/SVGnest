import ClipperLib from 'js-clipper';
import { isRectangle, noFitPolygonRectangle, noFitPolygon, pointInPolygon } from '../../../geometry-util';
import { keyToNFPData, rotatePolygon, getPolygonBounds, polygonArea } from '../../../helpers';
import ClipperWrapper from '../../../clipper-wrapper';

// clipperjs uses alerts for warnings
function alert(message) {
    console.log('alert: ', message);
}

function minkowskiDifference(polygonA, polygonB, clipperScale) {
    const clipperA = ClipperWrapper.toClipper(polygonA, clipperScale);
    const clipperB = ClipperWrapper.toClipper(polygonB, -clipperScale);
    const solutions = ClipperLib.Clipper.MinkowskiSum(clipperA, clipperB, true);
    const solutionCount = solutions.length;
    let i = 0;
    let clipperNfp = null;
    let largestArea = null;
    let n = null;
    let area = 0;

    for (i = 0; i < solutionCount; ++i) {
        n = ClipperWrapper.toNest(solutions[i], clipperScale);
        area = polygonArea(n);

        if (largestArea === null || largestArea > area) {
            clipperNfp = n;
            largestArea = area;
        }
    }

    for (i = 0; i < clipperNfp.length; ++i) {
        clipperNfp[i].x += polygonB[0].x;
        clipperNfp[i].y += polygonB[0].y;
    }

    return [clipperNfp];
}

export function pairData(pair, env) {
    const { clipperScale, searchEdges, useHoles, rotations } = env.configuration;

    if (!pair || pair.length === 0) {
        return null;
    }

    const nfpData = keyToNFPData(pair.key, rotations);
    const polygonA = rotatePolygon(pair.A, nfpData.Arotation);
    const polygonB = rotatePolygon(pair.B, nfpData.Brotation);
    let nfp = null;
    let i = 0;

    if (nfpData.inside) {
        nfp = isRectangle(polygonA, 0.001)
            ? noFitPolygonRectangle(polygonA, polygonB)
            : noFitPolygon(polygonA, polygonB, true, searchEdges);

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
        nfp = searchEdges
            ? noFitPolygon(polygonA, polygonB, false, searchEdges)
            : minkowskiDifference(polygonA, polygonB, clipperScale);
        // sanity check
        if (!nfp || nfp.length === 0) {
            console.log('NFP Error: ', pair.key);
            console.log('A: ', JSON.stringify(polygonA));
            console.log('B: ', JSON.stringify(polygonB));

            return null;
        }

        for (i = 0; i < nfp.length; ++i) {
            if (!searchEdges || i === 0) {
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

        // generate nfps for children (holes of parts) if any exist
        if (useHoles && polygonA.children && polygonA.children.length > 0) {
            const boundsB = getPolygonBounds(polygonB);

            for (i = 0; i < polygonA.children.length; ++i) {
                const boundsA = getPolygonBounds(polygonA.children[i]);

                // no need to find nfp if B's bounding box is too big
                if (boundsA.width > boundsB.width && boundsA.height > boundsB.height) {
                    const cnfp = noFitPolygon(polygonA.children[i], polygonB, true, searchEdges);
                    // ensure all interior NFPs have the same winding direction
                    if (cnfp && cnfp.length > 0) {
                        for (let j = 0; j < cnfp.length; ++j) {
                            if (polygonArea(cnfp[j]) < 0) {
                                cnfp[j].reverse();
                            }

                            nfp.push(cnfp[j]);
                        }
                    }
                }
            }
        }
    }

    return { key: pair.key, value: nfp };
}
