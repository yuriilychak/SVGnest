import OutPt from './out-pt';
import { PointF64 } from '../point';
import { cycleIndex } from '../helpers';

export function getArea(poly: PointF64[]): number {
    const pointCount: number = poly.length;

    if (pointCount < 3) {
        return 0;
    }

    let result: number = 0;
    let i: number = 0;
    let j: number = 0;

    for (i = 0, j = pointCount - 1; i < pointCount; ++i) {
        result += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
        j = i;
    }

    return -result * 0.5;
}

export function absArea(poly: PointF64[]): number {
    return Math.abs(getArea(poly));
}

export function distanceFromLineSqrd(point: PointF64, line1: PointF64, line2: PointF64): number {
    const equation: number[] = PointF64.lineEquation(line2, line1);
    const c: number = equation[0] * point.x + equation[1] * point.y - equation[2];

    return (c * c) / (equation[0] * equation[0] + equation[1] * equation[1]);
}

export function slopesNearCollinear(pt1: PointF64, pt2: PointF64, pt3: PointF64, distSqrd: number) {
    return distanceFromLineSqrd(pt2, pt1, pt3) < distSqrd;
}

export function cleanPolygon(path: PointF64[], distance: number): PointF64[] {
    //distance = proximity in units/pixels below which vertices will be stripped.
    //Default ~= sqrt(2) so when adjacent vertices or semi-adjacent vertices have
    //both x & y coords within 1 unit, then the second vertex will be stripped.
    let pointCount: number = path.length;
    const outPts: OutPt[] = new Array<OutPt>(pointCount);
    let i: number = 0;

    for (i = 0; i < pointCount; ++i) {
        outPts[i] = new OutPt(0, path[i]);
    }

    for (i = 0; i < pointCount; ++i) {
        outPts[i].next = outPts[cycleIndex(i, pointCount, 1)];
        outPts[i].next.prev = outPts[i];
    }

    const distSqrd = distance * distance;
    let op: OutPt = outPts[0];

    while (op.index === 0 && op.next != op.prev) {
        if (op.point.closeTo(op.prev.point, distSqrd)) {
            op = op.exclude();
            --pointCount;
        } else if (op.prev.point.closeTo(op.next.point, distSqrd)) {
            op.next.exclude();
            op = op.exclude();
            pointCount -= 2;
        } else if (slopesNearCollinear(op.prev.point, op.point, op.next.point, distSqrd)) {
            op = op.exclude();
            --pointCount;
        } else {
            op.index = 1;
            op = op.next;
        }
    }

    if (pointCount < 3) {
        return [];
    }

    const result = new Array(pointCount);

    for (i = 0; i < pointCount; ++i) {
        result[i] = PointF64.from(op.point);
        op = op.next;
    }

    return result;
}

export function cleanPolygons(polys: PointF64[][], distance: number): PointF64[][] {
    const polygonCount: number = polys.length;
    const result: PointF64[][] = new Array(polygonCount);
    let i: number = 0;

    for (i = 0; i < polygonCount; ++i) {
        result[i] = cleanPolygon(polys[i], distance);
    }

    return result;
}

export function showError(message: string): void {
    try {
        throw new Error(message);
    } catch (err) {
        console.warn(err.message);
    }
}
