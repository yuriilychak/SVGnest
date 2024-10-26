import { IntPoint } from './types';
import OutPt from './out-pt';

export function getArea(poly: IntPoint[]): number {
    const pointCount: number = poly.length;

    if (pointCount < 3) {
        return 0;
    }

    let result: number = 0;
    let i: number = 0;
    let j: number = 0;

    for (i = 0, j = pointCount - 1; i < pointCount; ++i) {
        result += (poly[j].X + poly[i].X) * (poly[j].Y - poly[i].Y);
        j = i;
    }

    return -result * 0.5;
}

export function absArea(poly: IntPoint[]): number {
    return Math.abs(getArea(poly));
}

export function pointsAreClose(pt1: IntPoint, pt2: IntPoint, distSqrd: number) {
    const dx = pt1.X - pt2.X;
    const dy = pt1.Y - pt2.Y;

    return dx * dx + dy * dy <= distSqrd;
}

export function distanceFromLineSqrd(pt: IntPoint, ln1: IntPoint, ln2: IntPoint): number {
    //The equation of a line in general form (Ax + By + C = 0)
    //given 2 points (x�,y�) & (x�,y�) is ...
    //(y� - y�)x + (x� - x�)y + (y� - y�)x� - (x� - x�)y� = 0
    //A = (y� - y�); B = (x� - x�); C = (y� - y�)x� - (x� - x�)y�
    //perpendicular distance of point (x�,y�) = (Ax� + By� + C)/Sqrt(A� + B�)
    //see http://en.wikipedia.org/wiki/Perpendicular_distance
    var A = ln1.Y - ln2.Y;
    var B = ln2.X - ln1.X;
    var C = A * ln1.X + B * ln1.Y;
    C = A * pt.X + B * pt.Y - C;
    return (C * C) / (A * A + B * B);
}

export function slopesNearCollinear(pt1: IntPoint, pt2: IntPoint, pt3: IntPoint, distSqrd: number) {
    return distanceFromLineSqrd(pt2, pt1, pt3) < distSqrd;
}

export function cleanPolygon(path: IntPoint[], distance: number): IntPoint[] {
    //distance = proximity in units/pixels below which vertices will be stripped.
    //Default ~= sqrt(2) so when adjacent vertices or semi-adjacent vertices have
    //both x & y coords within 1 unit, then the second vertex will be stripped.
    let pointCount: number = path.length;
    const outPts: OutPt[] = new Array<OutPt>(pointCount);
    let i: number = 0;

    for (i = 0; i < pointCount; ++i) {
        outPts[i] = new OutPt();
    }

    for (i = 0; i < pointCount; ++i) {
        outPts[i].Pt = path[i] as IntPoint;
        outPts[i].Next = outPts[(i + 1) % pointCount];
        outPts[i].Next.Prev = outPts[i];
        outPts[i].Idx = 0;
    }

    const distSqrd = distance * distance;
    let op: OutPt = outPts[0];

    while (op.Idx === 0 && op.Next != op.Prev) {
        if (pointsAreClose(op.Pt, op.Prev.Pt, distSqrd)) {
            op = op.exclude();
            pointCount--;
        } else if (pointsAreClose(op.Prev.Pt, op.Next.Pt, distSqrd)) {
            op.Next.exclude();
            op = op.exclude();
            pointCount -= 2;
        } else if (slopesNearCollinear(op.Prev.Pt, op.Pt, op.Next.Pt, distSqrd)) {
            op = op.exclude();
            pointCount--;
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
        result[i] = { X: op.Pt.X, Y: op.Pt.Y };
        op = op.Next;
    }

    return result;
}

export function cleanPolygons(polys: IntPoint[][], distance: number): IntPoint[][] {
    const polygonCount: number = polys.length;
    const result: IntPoint[][] = new Array(polygonCount);
    let i: number = 0;

    for (i = 0; i < polygonCount; ++i) {
        result[i] = cleanPolygon(polys[i], distance);
    }

    return result;
}

export function op_Equality(a: IntPoint, b: IntPoint): boolean {
    //return a == b;
    return a.X == b.X && a.Y == b.Y;
}

export function Cast_Int64(a: number): number {
    if (a < -2147483648 || a > 2147483647) {
        return a < 0 ? Math.ceil(a) : Math.floor(a);
    } else {
        return ~~a;
    }
}

export function Int128Mul(lhs: number, rhs: number): bigint {
    return BigInt(lhs << 0) * BigInt(rhs << 0);
}
