import { IntPoint } from './types';
import OutPt from './out-pt';
import { HORIZONTAL } from './constants';

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
    const A: number = ln1.Y - ln2.Y;
    const B: number = ln2.X - ln1.X;
    let C: number = A * ln1.X + B * ln1.Y;

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
    return a < 0 ? Math.ceil(a) : Math.floor(a);
}

export function Pt2IsBetweenPt1AndPt3(point1: IntPoint, point2: IntPoint, point3: IntPoint): boolean {
    if (op_Equality(point1, point3) || op_Equality(point1, point2) || op_Equality(point3, point2)) {
        return false;
    } else if (point1.X != point3.X) {
        return point2.X > point1.X === point2.X < point3.X;
    } else {
        return point2.Y > point1.Y == point2.Y < point3.Y;
    }
}

function splitTo16Bits(value: number): Uint16Array {
    const mask: number = 0xffff;
    const splitSize: number = 4;
    const result = new Uint16Array(splitSize);
    let currentValue: number = Math.abs(value << 0);
    let i: number = 0;

    for (i = 0; i < splitSize; ++i) {
        result[i] = currentValue & mask;
        currentValue = currentValue >>> 16;
    }

    return result;
}

export function mulInt128(x: number, y: number): Uint32Array {
    const xParts: Uint16Array = splitTo16Bits(x);
    const yParts: Uint16Array = splitTo16Bits(y);
    const result = new Uint32Array(5);
    const mask: number = 0xffffffff;
    let i: number = 0;

    result[0] = 0;
    result[1] = (xParts[0] * yParts[0]) & mask;
    result[2] = (xParts[1] * yParts[0] + xParts[0] * yParts[1]) & mask;
    result[3] = (xParts[2] * yParts[0] + xParts[0] * yParts[2] + xParts[1] * yParts[1]) & mask;
    result[4] = (xParts[3] * yParts[3] + xParts[3] * yParts[0] + xParts[2] * yParts[1]) & mask;

    for (i = 4; i > 0; --i) {
        result[i] += result[i - 1] >>> 16;
    }

    result[0] = 1 + Math.sign(x) * Math.sign(y);

    return result;
}

export function op_EqualityInt128(left: Uint32Array, right: Uint32Array): boolean {
    const iterationCount: number = left.length;
    let i: number = 0;

    for (i = 0; i < iterationCount; ++i) {
        if (left[i] !== right[i]) {
            return false;
        }
    }

    return true;
}

export function SlopesEqualPoints(pt1: IntPoint, pt2: IntPoint, pt3: IntPoint, useFullRange: boolean): boolean {
    return useFullRange
        ? op_EqualityInt128(mulInt128(pt1.Y - pt2.Y, pt2.X - pt3.X), mulInt128(pt1.X - pt2.X, pt2.Y - pt3.Y))
        : Cast_Int64((pt1.Y - pt2.Y) * (pt2.X - pt3.X)) - Cast_Int64((pt1.X - pt2.X) * (pt2.Y - pt3.Y)) === 0;
}

export function clipperRound(a: number): number {
    return a < 0 ? -Math.round(Math.abs(a)) : Math.round(a);
}

export function showError(message: string): void {
    try {
        throw new Error(message);
    } catch (err) {
        console.warn(err.message);
    }
}

export function GetDx(pt1: IntPoint, pt2: IntPoint): number {
    return pt1.Y == pt2.Y ? HORIZONTAL : (pt2.X - pt1.X) / (pt2.Y - pt1.Y);
}

export function HorzSegmentsOverlap(Pt1a: IntPoint, Pt1b: IntPoint, Pt2a: IntPoint, Pt2b: IntPoint): boolean {
    //precondition: both segments are horizontal
    if (Pt1a.X > Pt2a.X == Pt1a.X < Pt2b.X) return true;
    else if (Pt1b.X > Pt2a.X == Pt1b.X < Pt2b.X) return true;
    else if (Pt2a.X > Pt1a.X == Pt2a.X < Pt1b.X) return true;
    else if (Pt2b.X > Pt1a.X == Pt2b.X < Pt1b.X) return true;
    else if (Pt1a.X == Pt2a.X && Pt1b.X == Pt2b.X) return true;
    else if (Pt1a.X == Pt2b.X && Pt1b.X == Pt2a.X) return true;
    else return false;
}
