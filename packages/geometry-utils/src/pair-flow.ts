import ClipperLib from 'js-clipper';
import { keyToNFPData, rotatePolygon, getPolygonBounds, polygonArea, almostEqual, TOL } from './helpers';
import ClipperWrapper from './clipper-wrapper';
import { BoundRect, IPoint, IPolygon, NestConfig, NFPContent, NFPPair, PairWorkerResult } from './types';

// clipperjs uses alerts for warnings
// eslint-disable-next-line
function alert(message: string) {
    console.log('alert: ', message);
}

function normalizeVector(v: IPoint): IPoint {
    if (almostEqual(v.x * v.x + v.y * v.y, 1)) {
        return v; // given vector was already a unit vector
    }
    const len: number = Math.sqrt(v.x * v.x + v.y * v.y);

    return {
        x: v.x / len,
        y: v.y / len
    };
}

// returns true if p lies on the line segment defined by AB, but not at any endpoints
// may need work!
function onSegment(A: IPoint, B: IPoint, p: IPoint): boolean {
    // vertical line
    if (almostEqual(A.x, B.x) && almostEqual(p.x, A.x)) {
        if (!almostEqual(p.y, B.y) && !almostEqual(p.y, A.y) && p.y < Math.max(B.y, A.y) && p.y > Math.min(B.y, A.y)) {
            return true;
        }

        return false;
    }

    // horizontal line
    if (almostEqual(A.y, B.y) && almostEqual(p.y, A.y)) {
        if (!almostEqual(p.x, B.x) && !almostEqual(p.x, A.x) && p.x < Math.max(B.x, A.x) && p.x > Math.min(B.x, A.x)) {
            return true;
        }

        return false;
    }

    // range check
    if ((p.x < A.x && p.x < B.x) || (p.x > A.x && p.x > B.x) || (p.y < A.y && p.y < B.y) || (p.y > A.y && p.y > B.y)) {
        return false;
    }

    // exclude end points
    if ((almostEqual(p.x, A.x) && almostEqual(p.y, A.y)) || (almostEqual(p.x, B.x) && almostEqual(p.y, B.y))) {
        return false;
    }

    const cross = (p.y - A.y) * (B.x - A.x) - (p.x - A.x) * (B.y - A.y);

    if (Math.abs(cross) > TOL) {
        return false;
    }

    const dot = (p.x - A.x) * (B.x - A.x) + (p.y - A.y) * (B.y - A.y);

    if (dot < 0 || almostEqual(dot, 0)) {
        return false;
    }

    const len2 = (B.x - A.x) * (B.x - A.x) + (B.y - A.y) * (B.y - A.y);

    if (dot > len2 || almostEqual(dot, len2)) {
        return false;
    }

    return true;
}

// returns the intersection of AB and EF
// or null if there are no intersections or other numerical error
// if the infinite flag is set, AE and EF describe infinite lines without endpoints, they are finite line segments otherwise
function lineIntersect(A: IPoint, B: IPoint, E: IPoint, F: IPoint, infinite: boolean = false): IPoint {
    let a1: number = 0;
    let a2: number = 0;
    let b1: number = 0;
    let b2: number = 0;
    let c1: number = 0;
    let c2: number = 0;
    let x: number = 0;
    let y: number = 0;

    a1 = B.y - A.y;
    b1 = A.x - B.x;
    c1 = B.x * A.y - A.x * B.y;
    a2 = F.y - E.y;
    b2 = E.x - F.x;
    c2 = F.x * E.y - E.x * F.y;

    const denom = a1 * b2 - a2 * b1;

    x = (b1 * c2 - b2 * c1) / denom;
    y = (a2 * c1 - a1 * c2) / denom;

    if (!isFinite(x) || !isFinite(y)) {
        return null;
    }

    // lines are colinear
    /* var crossABE = (E.y - A.y) * (B.x - A.x) - (E.x - A.x) * (B.y - A.y);
		var crossABF = (F.y - A.y) * (B.x - A.x) - (F.x - A.x) * (B.y - A.y);
		if(_almostEqual(crossABE,0) && _almostEqual(crossABF,0)){
			return null;
		}*/

    if (!infinite) {
        // coincident points do not count as intersecting
        if (Math.abs(A.x - B.x) > TOL && (A.x < B.x ? x < A.x || x > B.x : x > A.x || x < B.x)) {
            return null;
        }
        if (Math.abs(A.y - B.y) > TOL && (A.y < B.y ? y < A.y || y > B.y : y > A.y || y < B.y)) {
            return null;
        }

        if (Math.abs(E.x - F.x) > TOL && (E.x < F.x ? x < E.x || x > F.x : x > E.x || x < F.x)) {
            return null;
        }
        if (Math.abs(E.y - F.y) > TOL && (E.y < F.y ? y < E.y || y > F.y : y > E.y || y < F.y)) {
            return null;
        }
    }

    return { x, y };
}

function isRectangle(poly: IPoint[]): boolean {
    const bb: BoundRect = getPolygonBounds(poly);
    const pointCount: number = poly.length;
    let i: number = 0;

    for (i = 0; i < pointCount; ++i) {
        if (!almostEqual(poly[i].x, bb.x) && !almostEqual(poly[i].x, bb.x + bb.width)) {
            return false;
        }
        if (!almostEqual(poly[i].y, bb.y) && !almostEqual(poly[i].y, bb.y + bb.height)) {
            return false;
        }
    }

    return true;
}

// return true if point is in the polygon, false if outside, and null if exactly on a point or edge
function pointInPolygon(point: IPoint, polygon: IPolygon): boolean {
    if (!polygon || polygon.length < 3) {
        return null;
    }

    let inside: boolean = false;
    const offsetx: number = polygon.offsetx || 0;
    const offsety: number = polygon.offsety || 0;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi: number = polygon[i].x + offsetx;
        const yi: number = polygon[i].y + offsety;
        const xj: number = polygon[j].x + offsetx;
        const yj: number = polygon[j].y + offsety;

        if (almostEqual(xi, point.x) && almostEqual(yi, point.y)) {
            return null; // no result
        }

        if (onSegment({ x: xi, y: yi }, { x: xj, y: yj }, point)) {
            return null; // exactly on the segment
        }

        if (almostEqual(xi, xj) && almostEqual(yi, yj)) {
            // ignore very small lines
            continue;
        }

        if (yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }

    return inside;
}

// old-todo: swap this for a more efficient sweep-line implementation
// returnEdges: if set, return all edges on A that have intersections

function intersect(initialA: IPolygon, initialB: IPolygon): boolean {
    const Aoffsetx = initialA.offsetx || 0;
    const Aoffsety = initialA.offsety || 0;

    const Boffsetx = initialB.offsetx || 0;
    const Boffsety = initialB.offsety || 0;

    const A = initialA.slice(0) as IPolygon;
    const B = initialB.slice(0) as IPolygon;

    for (let i = 0; i < A.length - 1; i++) {
        for (let j = 0; j < B.length - 1; j++) {
            const a1 = { x: A[i].x + Aoffsetx, y: A[i].y + Aoffsety };
            const a2 = { x: A[i + 1].x + Aoffsetx, y: A[i + 1].y + Aoffsety };
            const b1 = { x: B[j].x + Boffsetx, y: B[j].y + Boffsety };
            const b2 = { x: B[j + 1].x + Boffsetx, y: B[j + 1].y + Boffsety };

            let prevbindex = j === 0 ? B.length - 1 : j - 1;
            let prevaindex = i === 0 ? A.length - 1 : i - 1;
            let nextbindex = j + 1 === B.length - 1 ? 0 : j + 2;
            let nextaindex = i + 1 === A.length - 1 ? 0 : i + 2;

            // go even further back if we happen to hit on a loop end point
            if (B[prevbindex] === B[j] || (almostEqual(B[prevbindex].x, B[j].x) && almostEqual(B[prevbindex].y, B[j].y))) {
                prevbindex = prevbindex === 0 ? B.length - 1 : prevbindex - 1;
            }

            if (A[prevaindex] === A[i] || (almostEqual(A[prevaindex].x, A[i].x) && almostEqual(A[prevaindex].y, A[i].y))) {
                prevaindex = prevaindex === 0 ? A.length - 1 : prevaindex - 1;
            }

            // go even further forward if we happen to hit on a loop end point
            if (
                B[nextbindex] === B[j + 1] ||
                (almostEqual(B[nextbindex].x, B[j + 1].x) && almostEqual(B[nextbindex].y, B[j + 1].y))
            ) {
                nextbindex = nextbindex === B.length - 1 ? 0 : nextbindex + 1;
            }

            if (
                A[nextaindex] === A[i + 1] ||
                (almostEqual(A[nextaindex].x, A[i + 1].x) && almostEqual(A[nextaindex].y, A[i + 1].y))
            ) {
                nextaindex = nextaindex === A.length - 1 ? 0 : nextaindex + 1;
            }

            const a0 = {
                x: A[prevaindex].x + Aoffsetx,
                y: A[prevaindex].y + Aoffsety
            };
            const b0 = {
                x: B[prevbindex].x + Boffsetx,
                y: B[prevbindex].y + Boffsety
            };

            const a3 = {
                x: A[nextaindex].x + Aoffsetx,
                y: A[nextaindex].y + Aoffsety
            };
            const b3 = {
                x: B[nextbindex].x + Boffsetx,
                y: B[nextbindex].y + Boffsety
            };

            if (onSegment(a1, a2, b1) || (almostEqual(a1.x, b1.x) && almostEqual(a1.y, b1.y))) {
                // if a point is on a segment, it could intersect or it could not. Check via the neighboring points
                const b0in = pointInPolygon(b0, A);
                const b2in = pointInPolygon(b2, A);
                if ((b0in === true && b2in === false) || (b0in === false && b2in === true)) {
                    return true;
                }
                continue;
            }

            if (onSegment(a1, a2, b2) || (almostEqual(a2.x, b2.x) && almostEqual(a2.y, b2.y))) {
                // if a point is on a segment, it could intersect or it could not. Check via the neighboring points
                const b1in = pointInPolygon(b1, A);
                const b3in = pointInPolygon(b3, A);

                if ((b1in === true && b3in === false) || (b1in === false && b3in === true)) {
                    return true;
                }
                continue;
            }

            if (onSegment(b1, b2, a1) || (almostEqual(a1.x, b2.x) && almostEqual(a1.y, b2.y))) {
                // if a point is on a segment, it could intersect or it could not. Check via the neighboring points
                const a0in = pointInPolygon(a0, B);
                const a2in = pointInPolygon(a2, B);

                if ((a0in === true && a2in === false) || (a0in === false && a2in === true)) {
                    return true;
                }
                continue;
            }

            if (onSegment(b1, b2, a2) || (almostEqual(a2.x, b1.x) && almostEqual(a2.y, b1.y))) {
                // if a point is on a segment, it could intersect or it could not. Check via the neighboring points
                const a1in = pointInPolygon(a1, B);
                const a3in = pointInPolygon(a3, B);

                if ((a1in === true && a3in === false) || (a1in === false && a3in === true)) {
                    return true;
                }
                continue;
            }

            const p = lineIntersect(b1, b2, a1, a2);

            if (p !== null) {
                return true;
            }
        }
    }

    return false;
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

function pointDistance(p: IPoint, s1: IPoint, s2: IPoint, inputNormal: IPoint, infinite: boolean = false): number {
    const normal = normalizeVector(inputNormal);

    const dir = {
        x: normal.y,
        y: -normal.x
    };

    const pdot = p.x * dir.x + p.y * dir.y;
    const s1dot = s1.x * dir.x + s1.y * dir.y;
    const s2dot = s2.x * dir.x + s2.y * dir.y;

    const pdotnorm = p.x * normal.x + p.y * normal.y;
    const s1dotnorm = s1.x * normal.x + s1.y * normal.y;
    const s2dotnorm = s2.x * normal.x + s2.y * normal.y;

    if (!infinite) {
        if (
            ((pdot < s1dot || almostEqual(pdot, s1dot)) && (pdot < s2dot || almostEqual(pdot, s2dot))) ||
            ((pdot > s1dot || almostEqual(pdot, s1dot)) && (pdot > s2dot || almostEqual(pdot, s2dot)))
        ) {
            return null; // dot doesn't collide with segment, or lies directly on the vertex
        }
        if (almostEqual(pdot, s1dot) && almostEqual(pdot, s2dot) && pdotnorm > s1dotnorm && pdotnorm > s2dotnorm) {
            return Math.min(pdotnorm - s1dotnorm, pdotnorm - s2dotnorm);
        }
        if (almostEqual(pdot, s1dot) && almostEqual(pdot, s2dot) && pdotnorm < s1dotnorm && pdotnorm < s2dotnorm) {
            return -Math.min(s1dotnorm - pdotnorm, s2dotnorm - pdotnorm);
        }
    }

    return -(pdotnorm - s1dotnorm + ((s1dotnorm - s2dotnorm) * (s1dot - pdot)) / (s1dot - s2dot));
}

function segmentDistance(A: IPoint, B: IPoint, E: IPoint, F: IPoint, direction: IPoint): number {
    const normal = {
        x: direction.y,
        y: -direction.x
    };

    const reverse = {
        x: -direction.x,
        y: -direction.y
    };

    const dotA = A.x * normal.x + A.y * normal.y;
    const dotB = B.x * normal.x + B.y * normal.y;
    const dotE = E.x * normal.x + E.y * normal.y;
    const dotF = F.x * normal.x + F.y * normal.y;

    const crossA = A.x * direction.x + A.y * direction.y;
    const crossB = B.x * direction.x + B.y * direction.y;
    const crossE = E.x * direction.x + E.y * direction.y;
    const crossF = F.x * direction.x + F.y * direction.y;

    const ABmin = Math.min(dotA, dotB);
    const ABmax = Math.max(dotA, dotB);

    const EFmax = Math.max(dotE, dotF);
    const EFmin = Math.min(dotE, dotF);

    // segments that will merely touch at one point
    if (almostEqual(ABmax, EFmin) || almostEqual(ABmin, EFmax)) {
        return null;
    }
    // segments miss eachother completely
    if (ABmax < EFmin || ABmin > EFmax) {
        return null;
    }

    let overlap: number = 0;

    if ((ABmax > EFmax && ABmin < EFmin) || (EFmax > ABmax && EFmin < ABmin)) {
        overlap = 1;
    } else {
        const minMax = Math.min(ABmax, EFmax);
        const maxMin = Math.max(ABmin, EFmin);

        const maxMax = Math.max(ABmax, EFmax);
        const minMin = Math.min(ABmin, EFmin);

        overlap = (minMax - maxMin) / (maxMax - minMin);
    }

    const crossABE = (E.y - A.y) * (B.x - A.x) - (E.x - A.x) * (B.y - A.y);
    const crossABF = (F.y - A.y) * (B.x - A.x) - (F.x - A.x) * (B.y - A.y);

    // lines are colinear
    if (almostEqual(crossABE, 0) && almostEqual(crossABF, 0)) {
        const ABnorm = { x: B.y - A.y, y: A.x - B.x };
        const EFnorm = { x: F.y - E.y, y: E.x - F.x };

        const ABnormlength = Math.sqrt(ABnorm.x * ABnorm.x + ABnorm.y * ABnorm.y);
        ABnorm.x = ABnorm.x / ABnormlength;
        ABnorm.y = ABnorm.y / ABnormlength;

        const EFnormlength = Math.sqrt(EFnorm.x * EFnorm.x + EFnorm.y * EFnorm.y);
        EFnorm.x = EFnorm.x / EFnormlength;
        EFnorm.y = EFnorm.y / EFnormlength;

        // segment normals must point in opposite directions
        if (Math.abs(ABnorm.y * EFnorm.x - ABnorm.x * EFnorm.y) < TOL && ABnorm.y * EFnorm.y + ABnorm.x * EFnorm.x < 0) {
            // normal of AB segment must point in same direction as given direction vector
            const normdot = ABnorm.y * direction.y + ABnorm.x * direction.x;
            // the segments merely slide along eachother
            if (almostEqual(normdot, 0)) {
                return null;
            }
            if (normdot < 0) {
                return 0;
            }
        }

        return null;
    }

    const distances = [];

    // coincident points
    if (almostEqual(dotA, dotE)) {
        distances.push(crossA - crossE);
    } else if (almostEqual(dotA, dotF)) {
        distances.push(crossA - crossF);
    } else if (dotA > EFmin && dotA < EFmax) {
        let d: number = pointDistance(A, E, F, reverse);
        if (d !== null && almostEqual(d, 0)) {
            //  A currently touches EF, but AB is moving away from EF
            const dB = pointDistance(B, E, F, reverse, true);
            if (dB < 0 || almostEqual(dB * overlap, 0)) {
                d = null;
            }
        }
        if (d !== null) {
            distances.push(d);
        }
    }

    if (almostEqual(dotB, dotE)) {
        distances.push(crossB - crossE);
    } else if (almostEqual(dotB, dotF)) {
        distances.push(crossB - crossF);
    } else if (dotB > EFmin && dotB < EFmax) {
        let d: number = pointDistance(B, E, F, reverse);

        if (d !== null && almostEqual(d, 0)) {
            // crossA>crossB A currently touches EF, but AB is moving away from EF
            const dA = pointDistance(A, E, F, reverse, true);
            if (dA < 0 || almostEqual(dA * overlap, 0)) {
                d = null;
            }
        }
        if (d !== null) {
            distances.push(d);
        }
    }

    if (dotE > ABmin && dotE < ABmax) {
        let d: number = pointDistance(E, A, B, direction);
        if (d !== null && almostEqual(d, 0)) {
            // crossF<crossE A currently touches EF, but AB is moving away from EF
            const dF = pointDistance(F, A, B, direction, true);
            if (dF < 0 || almostEqual(dF * overlap, 0)) {
                d = null;
            }
        }
        if (d !== null) {
            distances.push(d);
        }
    }

    if (dotF > ABmin && dotF < ABmax) {
        let d: number = pointDistance(F, A, B, direction);
        if (d !== null && almostEqual(d, 0)) {
            // && crossE<crossF A currently touches EF, but AB is moving away from EF
            const dE = pointDistance(E, A, B, direction, true);
            if (dE < 0 || almostEqual(dE * overlap, 0)) {
                d = null;
            }
        }
        if (d !== null) {
            distances.push(d);
        }
    }

    if (distances.length === 0) {
        return null;
    }

    return Math.min(...distances);
}

function polygonSlideDistance(inputA: IPolygon, inputB: IPolygon, direction: IPoint, ignoreNegative: boolean): number {
    let A1: IPoint = null;
    let A2: IPoint = null;
    let B1: IPoint = null;
    let B2: IPoint = null;
    let Aoffsetx: number = 0;
    let Aoffsety: number = 0;
    let Boffsetx: number = 0;
    let Boffsety: number = 0;

    Aoffsetx = inputA.offsetx || 0;
    Aoffsety = inputA.offsety || 0;

    Boffsetx = inputB.offsetx || 0;
    Boffsety = inputB.offsety || 0;

    const A = inputA.slice(0);
    const B = inputB.slice(0);

    // close the loop for polygons
    if (A[0] !== A[A.length - 1]) {
        A.push(A[0]);
    }

    if (B[0] !== B[B.length - 1]) {
        B.push(B[0]);
    }

    const edgeA = A;
    const edgeB = B;

    let distance = null;
    let d: number = 0;

    const dir = normalizeVector(direction);

    for (let i = 0; i < edgeB.length - 1; i++) {
        for (let j = 0; j < edgeA.length - 1; j++) {
            A1 = { x: edgeA[j].x + Aoffsetx, y: edgeA[j].y + Aoffsety };
            A2 = { x: edgeA[j + 1].x + Aoffsetx, y: edgeA[j + 1].y + Aoffsety };
            B1 = { x: edgeB[i].x + Boffsetx, y: edgeB[i].y + Boffsety };
            B2 = { x: edgeB[i + 1].x + Boffsetx, y: edgeB[i + 1].y + Boffsety };

            if ((almostEqual(A1.x, A2.x) && almostEqual(A1.y, A2.y)) || (almostEqual(B1.x, B2.x) && almostEqual(B1.y, B2.y))) {
                continue; // ignore extremely small lines
            }

            d = segmentDistance(A1, A2, B1, B2, dir);

            if (d !== null && (distance === null || d < distance)) {
                if (!ignoreNegative || d > 0 || almostEqual(d, 0)) {
                    distance = d;
                }
            }
        }
    }

    return distance;
}

// project each point of B onto A in the given direction, and return the
function polygonProjectionDistance(inputA: IPolygon, inputB: IPolygon, direction: IPoint): number {
    const Boffsetx = inputB.offsetx || 0;
    const Boffsety = inputB.offsety || 0;

    const Aoffsetx = inputA.offsetx || 0;
    const Aoffsety = inputA.offsety || 0;

    const A = inputA.slice(0) as IPolygon;
    const B = inputB.slice(0) as IPolygon;

    // close the loop for polygons
    if (A[0] !== A[A.length - 1]) {
        A.push(A[0]);
    }

    if (B[0] !== B[B.length - 1]) {
        B.push(B[0]);
    }

    const edgeA = A;
    const edgeB = B;

    let distance = null;
    let p: IPoint = null;
    let d: number = 0;
    let s1: IPoint = null;
    let s2: IPoint = null;

    for (let i = 0; i < edgeB.length; i++) {
        // the shortest/most negative projection of B onto A
        let minprojection = null;
        for (let j = 0; j < edgeA.length - 1; j++) {
            p = { x: edgeB[i].x + Boffsetx, y: edgeB[i].y + Boffsety };
            s1 = { x: edgeA[j].x + Aoffsetx, y: edgeA[j].y + Aoffsety };
            s2 = { x: edgeA[j + 1].x + Aoffsetx, y: edgeA[j + 1].y + Aoffsety };

            if (Math.abs((s2.y - s1.y) * direction.x - (s2.x - s1.x) * direction.y) < TOL) {
                continue;
            }

            // project point, ignore edge boundaries
            d = pointDistance(p, s1, s2, direction);

            if (d !== null && (minprojection === null || d < minprojection)) {
                minprojection = d;
            }
        }
        if (minprojection !== null && (distance === null || minprojection > distance)) {
            distance = minprojection;
        }
    }

    return distance;
}

// returns an interior NFP for the special case where A is a rectangle
function noFitPolygonRectangle(A: IPolygon, B: IPolygon): IPoint[][] {
    let minAx = A[0].x;
    let minAy = A[0].y;
    let maxAx = A[0].x;
    let maxAy = A[0].y;
    let i: number = 0;

    for (i = 1; i < A.length; i++) {
        if (A[i].x < minAx) {
            minAx = A[i].x;
        }
        if (A[i].y < minAy) {
            minAy = A[i].y;
        }
        if (A[i].x > maxAx) {
            maxAx = A[i].x;
        }
        if (A[i].y > maxAy) {
            maxAy = A[i].y;
        }
    }

    let minBx = B[0].x;
    let minBy = B[0].y;
    let maxBx = B[0].x;
    let maxBy = B[0].y;
    for (i = 1; i < B.length; i++) {
        if (B[i].x < minBx) {
            minBx = B[i].x;
        }
        if (B[i].y < minBy) {
            minBy = B[i].y;
        }
        if (B[i].x > maxBx) {
            maxBx = B[i].x;
        }
        if (B[i].y > maxBy) {
            maxBy = B[i].y;
        }
    }

    if (maxBx - minBx > maxAx - minAx) {
        return null;
    }
    if (maxBy - minBy > maxAy - minAy) {
        return null;
    }

    return [
        [
            { x: minAx - minBx + B[0].x, y: minAy - minBy + B[0].y },
            { x: maxAx - maxBx + B[0].x, y: minAy - minBy + B[0].y },
            { x: maxAx - maxBx + B[0].x, y: maxAy - maxBy + B[0].y },
            { x: minAx - minBx + B[0].x, y: maxAy - maxBy + B[0].y }
        ]
    ];
}

// returns true if point already exists in the given nfp
function inNfp(p: IPoint, nfp: IPoint[][]): boolean {
    if (!nfp || nfp.length === 0) {
        return false;
    }

    for (let i = 0; i < nfp.length; i++) {
        for (let j = 0; j < nfp[i].length; j++) {
            if (almostEqual(p.x, nfp[i][j].x) && almostEqual(p.y, nfp[i][j].y)) {
                return true;
            }
        }
    }

    return false;
}

// searches for an arrangement of A and B such that they do not overlap
// if an NFP is given, only search for startpoints that have not already been traversed in the given NFP
function searchStartPoint(inputA: IPolygon, inputB: IPolygon, inside: boolean, NFP: IPoint[][] = []): IPoint {
    // clone arrays
    const A = inputA.slice(0) as IPolygon;
    const B = inputB.slice(0) as IPolygon;

    // close the loop for polygons
    if (A[0] !== A[A.length - 1]) {
        A.push(A[0]);
    }

    if (B[0] !== B[B.length - 1]) {
        B.push(B[0]);
    }

    let i: number = 0;
    let j: number = 0;
    let k: number = 0;
    let vx = 0;
    let vy = 0;
    let inpoly: boolean = false;
    let startPoint: IPoint = null;
    let d: number = null;
    let Binside: boolean = null;

    for (i = 0; i < A.length - 1; i++) {
        if (!A[i].marked) {
            A[i].marked = true;
            for (j = 0; j < B.length; j++) {
                B.offsetx = A[i].x - B[j].x;
                B.offsety = A[i].y - B[j].y;

                Binside = null;
                for (k = 0; k < B.length; k++) {
                    inpoly = pointInPolygon({ x: B[k].x + B.offsetx, y: B[k].y + B.offsety }, A);
                    if (inpoly !== null) {
                        Binside = inpoly;
                        break;
                    }
                }

                if (Binside === null) {
                    // A and B are the same
                    return null;
                }

                startPoint = { x: B.offsetx, y: B.offsety };
                if (((Binside && inside) || (!Binside && !inside)) && !intersect(A, B) && !inNfp(startPoint, NFP)) {
                    return startPoint;
                }

                // slide B along vector
                vx = A[i + 1].x - A[i].x;
                vy = A[i + 1].y - A[i].y;

                const d1 = polygonProjectionDistance(A, B, { x: vx, y: vy });
                const d2 = polygonProjectionDistance(B, A, { x: -vx, y: -vy });

                d = null;

                // old-todo: clean this up
                if (d1 === null && d2 === null) {
                    // nothin
                } else if (d1 === null) {
                    d = d2;
                } else if (d2 === null) {
                    d = d1;
                } else {
                    d = Math.min(d1, d2);
                }

                // only slide until no longer negative
                // old-todo: clean this up
                if (!(d !== null && !almostEqual(d, 0) && d > 0)) {
                    continue;
                }

                const vd2 = vx * vx + vy * vy;

                if (d * d < vd2 && !almostEqual(d * d, vd2)) {
                    const vd = Math.sqrt(vx * vx + vy * vy);
                    vx = vx * (d / vd);
                    vy = vy * (d / vd);
                }

                B.offsetx = B.offsetx + vx;
                B.offsety = B.offsety + vy;

                for (k = 0; k < B.length; ++k) {
                    inpoly = pointInPolygon({ x: B[k].x + B.offsetx, y: B[k].y + B.offsety }, A);
                    if (inpoly !== null) {
                        Binside = inpoly;
                        break;
                    }
                }
                startPoint = { x: B.offsetx, y: B.offsety };
                if (((Binside && inside) || (!Binside && !inside)) && !intersect(A, B) && !inNfp(startPoint, NFP)) {
                    return startPoint;
                }
            }
        }
    }

    return null;
}

// given a static polygon A and a movable polygon B, compute a no fit polygon by orbiting B about A
// if the inside flag is set, B is orbited inside of A rather than outside
// if the searchEdges flag is set, all edges of A are explored for NFPs - multiple
function noFitPolygon(A: IPolygon, B: IPolygon, inside: boolean, searchEdges: boolean) {
    if (!A || A.length < 3 || !B || B.length < 3) {
        return null;
    }

    A.offsetx = 0;
    A.offsety = 0;

    let i: number = 0;
    let j: number = 0;

    let minA = A[0].y;
    let minAindex = 0;

    let maxB = B[0].y;
    let maxBindex = 0;

    for (i = 1; i < A.length; i++) {
        A[i].marked = false;
        if (A[i].y < minA) {
            minA = A[i].y;
            minAindex = i;
        }
    }

    for (i = 1; i < B.length; i++) {
        B[i].marked = false;
        if (B[i].y > maxB) {
            maxB = B[i].y;
            maxBindex = i;
        }
    }

    let startpoint: IPoint = null;

    if (!inside) {
        // shift B such that the bottom-most point of B is at the top-most
        // point of A. This guarantees an initial placement with no intersections
        startpoint = {
            x: A[minAindex].x - B[maxBindex].x,
            y: A[minAindex].y - B[maxBindex].y
        };
    } else {
        // no reliable heuristic for inside
        startpoint = searchStartPoint(A, B, true);
    }

    const NFPlist = [];

    while (startpoint !== null) {
        B.offsetx = startpoint.x;
        B.offsety = startpoint.y;

        // maintain a list of touching points/edges
        let touching: { type: number; A: number; B: number }[] = [];

        let prevvector = null; // keep track of previous vector
        let NFP = [
            {
                x: B[0].x + B.offsetx,
                y: B[0].y + B.offsety
            }
        ];

        let referencex = B[0].x + B.offsetx;
        let referencey = B[0].y + B.offsety;
        const startx = referencex;
        const starty = referencey;
        let counter = 0;

        while (counter < 10 * (A.length + B.length)) {
            // sanity check, prevent infinite loop
            touching = [];
            // find touching vertices/edges
            for (i = 0; i < A.length; i++) {
                const nexti = i === A.length - 1 ? 0 : i + 1;
                for (j = 0; j < B.length; j++) {
                    const nextj = j === B.length - 1 ? 0 : j + 1;
                    if (almostEqual(A[i].x, B[j].x + B.offsetx) && almostEqual(A[i].y, B[j].y + B.offsety)) {
                        touching.push({ type: 0, A: i, B: j });
                    } else if (
                        onSegment(A[i], A[nexti], {
                            x: B[j].x + B.offsetx,
                            y: B[j].y + B.offsety
                        })
                    ) {
                        touching.push({ type: 1, A: nexti, B: j });
                    } else if (
                        onSegment(
                            { x: B[j].x + B.offsetx, y: B[j].y + B.offsety },
                            { x: B[nextj].x + B.offsetx, y: B[nextj].y + B.offsety },
                            A[i]
                        )
                    ) {
                        touching.push({ type: 2, A: i, B: nextj });
                    }
                }
            }

            // generate translation vectors from touching vertices/edges
            const vectors = [];
            for (i = 0; i < touching.length; i++) {
                const vertexA = A[touching[i].A];
                vertexA.marked = true;

                // adjacent A vertices
                let prevAindex = touching[i].A - 1;
                let nextAindex = touching[i].A + 1;

                prevAindex = prevAindex < 0 ? A.length - 1 : prevAindex; // loop
                nextAindex = nextAindex >= A.length ? 0 : nextAindex; // loop

                const prevA = A[prevAindex];
                const nextA = A[nextAindex];

                // adjacent B vertices
                const vertexB = B[touching[i].B];

                let prevBindex = touching[i].B - 1;
                let nextBindex = touching[i].B + 1;

                prevBindex = prevBindex < 0 ? B.length - 1 : prevBindex; // loop
                nextBindex = nextBindex >= B.length ? 0 : nextBindex; // loop

                const prevB = B[prevBindex];
                const nextB = B[nextBindex];

                if (touching[i].type === 0) {
                    const vA1 = {
                        x: prevA.x - vertexA.x,
                        y: prevA.y - vertexA.y,
                        start: vertexA,
                        end: prevA
                    };

                    const vA2 = {
                        x: nextA.x - vertexA.x,
                        y: nextA.y - vertexA.y,
                        start: vertexA,
                        end: nextA
                    };

                    // B vectors need to be inverted
                    const vB1 = {
                        x: vertexB.x - prevB.x,
                        y: vertexB.y - prevB.y,
                        start: prevB,
                        end: vertexB
                    };

                    const vB2 = {
                        x: vertexB.x - nextB.x,
                        y: vertexB.y - nextB.y,
                        start: nextB,
                        end: vertexB
                    };

                    vectors.push(vA1);
                    vectors.push(vA2);
                    vectors.push(vB1);
                    vectors.push(vB2);
                } else if (touching[i].type === 1) {
                    vectors.push({
                        x: vertexA.x - (vertexB.x + B.offsetx),
                        y: vertexA.y - (vertexB.y + B.offsety),
                        start: prevA,
                        end: vertexA
                    });

                    vectors.push({
                        x: prevA.x - (vertexB.x + B.offsetx),
                        y: prevA.y - (vertexB.y + B.offsety),
                        start: vertexA,
                        end: prevA
                    });
                } else if (touching[i].type === 2) {
                    vectors.push({
                        x: vertexA.x - (vertexB.x + B.offsetx),
                        y: vertexA.y - (vertexB.y + B.offsety),
                        start: prevB,
                        end: vertexB
                    });

                    vectors.push({
                        x: vertexA.x - (prevB.x + B.offsetx),
                        y: vertexA.y - (prevB.y + B.offsety),
                        start: vertexB,
                        end: prevB
                    });
                }
            }

            // old-todo: there should be a faster way to reject vectors
            // that will cause immediate intersection. For now just check them all

            let translate = null;
            let maxd = 0;

            for (i = 0; i < vectors.length; i++) {
                if (vectors[i].x === 0 && vectors[i].y === 0) {
                    continue;
                }

                // if this vector points us back to where we came from, ignore it.
                // ie cross product = 0, dot product < 0
                if (prevvector && vectors[i].y * prevvector.y + vectors[i].x * prevvector.x < 0) {
                    // compare magnitude with unit vectors
                    const vectorlength = Math.sqrt(vectors[i].x * vectors[i].x + vectors[i].y * vectors[i].y);
                    const unitv = {
                        x: vectors[i].x / vectorlength,
                        y: vectors[i].y / vectorlength
                    };

                    const prevlength = Math.sqrt(prevvector.x * prevvector.x + prevvector.y * prevvector.y);
                    const prevunit = {
                        x: prevvector.x / prevlength,
                        y: prevvector.y / prevlength
                    };

                    // we need to scale down to unit vectors to normalize vector length. Could also just do a tan here
                    if (Math.abs(unitv.y * prevunit.x - unitv.x * prevunit.y) < 0.0001) {
                        continue;
                    }
                }

                let d = polygonSlideDistance(A, B, vectors[i], true);
                const vecd2 = vectors[i].x * vectors[i].x + vectors[i].y * vectors[i].y;

                if (d === null || d * d > vecd2) {
                    const vecd = Math.sqrt(vectors[i].x * vectors[i].x + vectors[i].y * vectors[i].y);
                    d = vecd;
                }

                if (d !== null && d > maxd) {
                    maxd = d;
                    translate = vectors[i];
                }
            }

            if (translate === null || almostEqual(maxd, 0)) {
                // didn't close the loop, something went wrong here
                NFP = null;
                break;
            }

            translate.start.marked = true;
            translate.end.marked = true;

            prevvector = translate;

            // trim
            const vlength2 = translate.x * translate.x + translate.y * translate.y;
            if (maxd * maxd < vlength2 && !almostEqual(maxd * maxd, vlength2)) {
                const scale = Math.sqrt((maxd * maxd) / vlength2);
                translate.x = translate.x * scale;
                translate.y = translate.y * scale;
            }

            referencex = referencex + translate.x;
            referencey = referencey + translate.y;

            if (almostEqual(referencex, startx) && almostEqual(referencey, starty)) {
                // we've made a full loop
                break;
            }

            // if A and B start on a touching horizontal line, the end point may not be the start point
            let looped = false;
            if (NFP.length > 0) {
                for (i = 0; i < NFP.length - 1; i++) {
                    if (almostEqual(referencex, NFP[i].x) && almostEqual(referencey, NFP[i].y)) {
                        looped = true;
                    }
                }
            }

            if (looped) {
                // we've made a full loop
                break;
            }

            NFP.push({
                x: referencex,
                y: referencey
            });

            B.offsetx = B.offsetx + translate.x;
            B.offsety = B.offsety + translate.y;

            counter++;
        }

        if (NFP && NFP.length > 0) {
            NFPlist.push(NFP);
        }

        if (!searchEdges) {
            // only get outer NFP or first inner NFP
            break;
        }

        startpoint = searchStartPoint(A, B, inside, NFPlist);
    }

    return NFPlist;
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
        nfp = isRectangle(polygonA)
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
                if (pointInPolygon(nfp[i][0], nfp[0] as IPolygon)) {
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
