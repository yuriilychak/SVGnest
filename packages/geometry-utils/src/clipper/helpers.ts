import OutPt from './out-pt';
import Point from '../point';
import { cycleIndex } from '../helpers';

export function getArea(poly: Point[]): number {
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

export function absArea(poly: Point[]): number {
    return Math.abs(getArea(poly));
}

export function distanceFromLineSqrd(point: Point, line1: Point, line2: Point): number {
    const equation: number[] = Point.lineEquation(line2, line1);
    const c: number = equation[0] * point.x + equation[1] * point.y - equation[2];

    return (c * c) / (equation[0] * equation[0] + equation[1] * equation[1]);
}

export function slopesNearCollinear(pt1: Point, pt2: Point, pt3: Point, distSqrd: number) {
    return distanceFromLineSqrd(pt2, pt1, pt3) < distSqrd;
}

export function cleanPolygon(path: Point[], distance: number): Point[] {
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
        outPts[i].Next = outPts[cycleIndex(i, pointCount, 1)];
        outPts[i].Next.Prev = outPts[i];
    }

    const distSqrd = distance * distance;
    let op: OutPt = outPts[0];

    while (op.Idx === 0 && op.Next != op.Prev) {
        if (Point.pointsAreClose(op.Pt, op.Prev.Pt, distSqrd)) {
            op = op.exclude();
            --pointCount;
        } else if (Point.pointsAreClose(op.Prev.Pt, op.Next.Pt, distSqrd)) {
            op.Next.exclude();
            op = op.exclude();
            pointCount -= 2;
        } else if (slopesNearCollinear(op.Prev.Pt, op.Pt, op.Next.Pt, distSqrd)) {
            op = op.exclude();
            --pointCount;
        } else {
            op.Idx = 1;
            op = op.Next;
        }
    }

    if (pointCount < 3) {
        return [];
    }

    const result = new Array(pointCount);

    for (i = 0; i < pointCount; ++i) {
        result[i] = Point.from(op.Pt);
        op = op.Next;
    }

    return result;
}

export function cleanPolygons(polys: Point[][], distance: number): Point[][] {
    const polygonCount: number = polys.length;
    const result: Point[][] = new Array(polygonCount);
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
