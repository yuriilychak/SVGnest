import ClipperLib from 'js-clipper';
import {
    polygonArea,
    getPolygonBounds,
    isRectangle,
    noFitPolygonRectangle,
    noFitPolygon,
    pointInPolygon
} from '../../geometry-util';

// clipperjs uses alerts for warnings
function alert(message) {
    console.log('alert: ', message);
}

// jsClipper uses X/Y instead of x/y...
function toClipperCoordinates(polygon) {
    const size = polygon.length;
    const result = [];
    let i = 0;

    for (i = 0; i < size; ++i) {
        result.push({ X: polygon[i].x, Y: polygon[i].y });
    }

    return result;
}

function toNestCoordinates(polygon, scale) {
    const clone = [];
    for (let i = 0; i < polygon.length; i++) {
        clone.push({
            x: polygon[i].X / scale,
            y: polygon[i].Y / scale
        });
    }

    return clone;
}

function rotatePolygon(polygon, degrees) {
    const rotated = [];
    const angle = (degrees * Math.PI) / 180;
    for (let i = 0; i < polygon.length; i++) {
        const x = polygon[i].x;
        const y = polygon[i].y;
        const x1 = x * Math.cos(angle) - y * Math.sin(angle);
        const y1 = x * Math.sin(angle) + y * Math.cos(angle);

        rotated.push({ x: x1, y: y1 });
    }

    if (polygon.children && polygon.children.length > 0) {
        rotated.children = [];
        for (let j = 0; j < polygon.children.length; j++) {
            rotated.children.push(rotatePolygon(polygon.children[j], degrees));
        }
    }

    return rotated;
}

export function pairData(pair, env) {
    function minkowskiDifference(A, B) {
        let i = 0;
        let clipperNfp;
        let largestArea = null;
        let n;
        let sarea;
        const Ac = toClipperCoordinates(A);
        const Bc = toClipperCoordinates(B);

        ClipperLib.JS.ScaleUpPath(Ac, 10000000);
        ClipperLib.JS.ScaleUpPath(Bc, 10000000);

        for (i = 0; i < Bc.length; ++i) {
            Bc[i].X *= -1;
            Bc[i].Y *= -1;
        }

        const solutions = ClipperLib.Clipper.MinkowskiSum(Ac, Bc, true);
        const solutionCount = solutions.length;

        for (i = 0; i < solutionCount; ++i) {
            n = toNestCoordinates(solutions[i], 10000000);
            sarea = polygonArea(n);

            if (largestArea === null || largestArea > sarea) {
                clipperNfp = n;
                largestArea = sarea;
            }
        }

        for (i = 0; i < clipperNfp.length; ++i) {
            clipperNfp[i].x += B[0].x;
            clipperNfp[i].y += B[0].y;
        }

        return [clipperNfp];
    }

    if (!pair || pair.length == 0) {
        return null;
    }
    const searchEdges = env.searchEdges;
    const useHoles = env.useHoles;

    const A = rotatePolygon(pair.A, pair.key.Arotation);
    const B = rotatePolygon(pair.B, pair.key.Brotation);

    let nfp;

    if (pair.key.inside) {
        if (isRectangle(A, 0.001)) {
            nfp = noFitPolygonRectangle(A, B);
        } else {
            nfp = noFitPolygon(A, B, true, searchEdges);
        }

        // ensure all interior NFPs have the same winding direction
        if (nfp && nfp.length > 0) {
            for (var i = 0; i < nfp.length; i++) {
                if (polygonArea(nfp[i]) > 0) {
                    nfp[i].reverse();
                }
            }
        } else {
            // warning on null inner NFP
            // this is not an error, as the part may simply be larger than the bin or otherwise unplaceable due to geometry
            log('NFP Warning: ', pair.key);
        }
    } else {
        if (searchEdges) {
            nfp = noFitPolygon(A, B, false, searchEdges);
        } else {
            nfp = minkowskiDifference(A, B);
        }
        // sanity check
        if (!nfp || nfp.length == 0) {
            log('NFP Error: ', pair.key);
            log('A: ', JSON.stringify(A));
            log('B: ', JSON.stringify(B));

            return null;
        }

        for (var i = 0; i < nfp.length; i++) {
            if (!searchEdges || i == 0) {
                // if searchedges is active, only the first NFP is guaranteed to pass sanity check
                if (Math.abs(polygonArea(nfp[i])) < Math.abs(polygonArea(A))) {
                    log('NFP Area Error: ', Math.abs(polygonArea(nfp[i])), pair.key);
                    log('NFP:', JSON.stringify(nfp[i]));
                    log('A: ', JSON.stringify(A));
                    log('B: ', JSON.stringify(B));
                    nfp.splice(i, 1);

                    return null;
                }
            }
        }

        if (nfp.length == 0) {
            return null;
        }

        // for outer NFPs, the first is guaranteed to be the largest. Any subsequent NFPs that lie inside the first are holes
        for (var i = 0; i < nfp.length; i++) {
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
        if (useHoles && A.childNodes && A.childNodes.length > 0) {
            const Bbounds = getPolygonBounds(B);

            for (var i = 0; i < A.childNodes.length; i++) {
                const Abounds = getPolygonBounds(A.childNodes[i]);

                // no need to find nfp if B's bounding box is too big
                if (Abounds.width > Bbounds.width && Abounds.height > Bbounds.height) {
                    const cnfp = noFitPolygon(A.childNodes[i], B, true, searchEdges);
                    // ensure all interior NFPs have the same winding direction
                    if (cnfp && cnfp.length > 0) {
                        for (let j = 0; j < cnfp.length; j++) {
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

    function log() {
        console.log.apply(console, arguments);
    }

    return { key: pair.key, value: nfp };
}
