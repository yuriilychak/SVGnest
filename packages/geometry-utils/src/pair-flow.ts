import ClipperLib from 'js-clipper';
import {
    keyToNFPData,
    rotatePolygon,
    getPolygonBounds,
    polygonArea,
    almostEqual,
    TOL,
    onSegment,
    pointInPolygon,
    cycleIndex
} from './helpers';
import ClipperWrapper from './clipper-wrapper';
import { BoundRect, IPoint, IPolygon, NestConfig, NFPContent, NFPPair, PairWorkerResult } from './types';
import Point from './point';

interface ISegmentCheck {
    point: Point;
    polygon: IPolygon;
    segmentStart: Point;
    segmentEnd: Point;
    checkStart: Point;
    checkEnd: Point;
    target: Point;
}
// returns the intersection of AB and EF
// or null if there are no intersections or other numerical error
// if the infinite flag is set, AE and EF describe infinite lines without endpoints, they are finite line segments otherwise
function lineIntersect(A: IPoint, B: IPoint, E: IPoint, F: IPoint): boolean {
    const offsetAB = Point.from(A).sub(B);
    const offsetEF = Point.from(E).sub(F);
    const a1 = -offsetAB.y;
    const b1 = offsetAB.x;
    const c1 = B.x * A.y - A.x * B.y;
    const a2 = -offsetEF.y;
    const b2 = offsetEF.x;
    const c2 = F.x * E.y - E.x * F.y;
    const denom = offsetEF.y * offsetAB.x - offsetAB.y * offsetEF.x;
    const x = (b1 * c2 - b2 * c1) / denom;
    const y = (a2 * c1 - a1 * c2) / denom;

    // lines are colinear
    /* var crossABE = (E.y - A.y) * (B.x - A.x) - (E.x - A.x) * (B.y - A.y);
		var crossABF = (F.y - A.y) * (B.x - A.x) - (F.x - A.x) * (B.y - A.y);
		if(_almostEqual(crossABE,0) && _almostEqual(crossABF,0)){
			return null;
		}*/

    return !(
        !(isFinite(x) && isFinite(y)) ||
        // coincident points do not count as intersecting
        (Math.abs(offsetAB.x) > TOL && Math.abs(2 * x - A.x - B.x) > Math.abs(offsetAB.x)) ||
        (Math.abs(offsetAB.y) > TOL && Math.abs(2 * y - A.y - B.y) > Math.abs(offsetAB.y)) ||
        (Math.abs(offsetEF.x) > TOL && Math.abs(2 * x - E.x - F.x) > Math.abs(offsetEF.x)) ||
        (Math.abs(offsetEF.y) > TOL && Math.abs(2 * y - E.y - F.y) > Math.abs(offsetEF.y))
    );
}

function isRectangle(poly: IPoint[]): boolean {
    const bounds: BoundRect = getPolygonBounds(poly);
    const pointCount: number = poly.length;
    const rightX: number = bounds.x + bounds.width;
    const bottomY: number = bounds.y + bounds.height;
    let point: IPoint = null;
    let i: number = 0;

    for (i = 0; i < pointCount; ++i) {
        point = poly[i];

        if (
            !(
                (almostEqual(point.x, bounds.x) || almostEqual(point.x, rightX)) &&
                (almostEqual(point.y, bounds.y) || almostEqual(point.y, bottomY))
            )
        ) {
            return false;
        }
    }

    return true;
}

// old-todo: swap this for a more efficient sweep-line implementation
// returnEdges: if set, return all edges on A that have intersections

function updateIntersectPoint(point: Point, polygon: IPolygon, index: number, offset: number): void {
    const pointCount: number = polygon.length;
    let currentIndex = cycleIndex(index, pointCount, offset);

    point.update(polygon[index]);

    // go even further back if we happen to hit on a loop end point
    if (point.almostEqual(polygon[index])) {
        currentIndex = cycleIndex(currentIndex, pointCount, offset);
        point.update(polygon[currentIndex]);
    }
}

function getSegmentCheck(
    point: Point,
    polygon: IPolygon,
    segmentStart: Point,
    segmentEnd: Point,
    checkStart: Point,
    checkEnd: Point,
    target: Point
): ISegmentCheck {
    return { point, polygon, segmentStart, segmentEnd, checkStart, checkEnd, target };
}

function intersect(initialA: IPolygon, initialB: IPolygon): boolean {
    const offsetA: Point = Point.create(initialA.offsetx || 0, initialA.offsety || 0);
    const offsetB: Point = Point.create(initialB.offsetx || 0, initialB.offsety || 0);
    const A = initialA.slice(0) as IPolygon;
    const B = initialB.slice(0) as IPolygon;
    const a0: Point = Point.zero();
    const a1: Point = Point.zero();
    const a2: Point = Point.zero();
    const a3: Point = Point.zero();
    const b0: Point = Point.zero();
    const b1: Point = Point.zero();
    const b2: Point = Point.zero();
    const b3: Point = Point.zero();
    const pointCountA: number = A.length;
    const pointCountB: number = B.length;
    const segmentChecks: ISegmentCheck[] = [
        getSegmentCheck(b1, A, a1, a2, b0, b2, a1),
        getSegmentCheck(b2, A, a1, a2, b1, b3, a2),
        getSegmentCheck(a1, B, b1, b2, a0, a2, b2),
        getSegmentCheck(a2, B, b1, b2, a1, a3, a1)
    ];
    const segmentCheckCount = segmentChecks.length;
    let segmentCheck: ISegmentCheck = null;
    let pointIn1: boolean = false;
    let pointIn2: boolean = false;
    let i: number = 0;
    let j: number = 0;
    let k: number = 0;
    let segmentStats: boolean = false;

    for (i = 0; i < pointCountA - 1; ++i) {
        a1.update(A[i]);
        a2.update(A[i + 1]);

        updateIntersectPoint(a0, A, i, -1);
        updateIntersectPoint(a3, A, i + 1, 1);

        a0.add(offsetA);
        a1.add(offsetA);
        a2.add(offsetA);
        a3.add(offsetA);

        for (j = 0; j < pointCountB - 1; ++j) {
            b1.update(B[j]);
            b2.update(B[j + 1]);

            updateIntersectPoint(b0, B, j, -1);
            updateIntersectPoint(b3, B, j + 1, 1);

            b0.add(offsetB);
            b1.add(offsetB);
            b3.add(offsetB);
            b2.add(offsetB);

            segmentStats = null;

            for (k = 0; k < segmentCheckCount; ++k) {
                segmentCheck = segmentChecks[k];

                if (
                    segmentCheck.point.onSegment(segmentCheck.segmentStart, segmentCheck.segmentEnd) ||
                    segmentCheck.point.almostEqual(segmentCheck.target)
                ) {
                    // if a point is on a segment, it could intersect or it could not. Check via the neighboring points
                    pointIn1 = pointInPolygon(segmentCheck.checkStart, segmentCheck.polygon);
                    pointIn2 = pointInPolygon(segmentCheck.checkEnd, segmentCheck.polygon);

                    segmentStats = pointIn1 !== null && pointIn2 !== null && pointIn1 !== pointIn2;
                    break;
                }
            }

            if (segmentStats || (segmentStats === null && lineIntersect(b1, b2, a1, a2))) {
                return true;
            } else if (segmentStats === false) {
                continue;
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
    const normal = Point.from(inputNormal).normalize();

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

function polygonSlideDistance(inputA: IPolygon, inputB: IPolygon, direction: IPoint): number {
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

    const dir = Point.from(direction).normalize();

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
                if (d > 0 || almostEqual(d, 0)) {
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

                let d = polygonSlideDistance(A, B, vectors[i]);
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
