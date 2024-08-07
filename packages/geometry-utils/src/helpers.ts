import { BoundRect, IPoint, IPolygon, NFPContent } from './types';

// returns true if p lies on the line segment defined by AB, but not at any endpoints
// may need work!
export function onSegment(A: IPoint, B: IPoint, p: IPoint): boolean {
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
// return true if point is in the polygon, false if outside, and null if exactly on a point or edge
export function pointInPolygon(point: IPoint, polygon: IPolygon): boolean {
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

// returns the rectangular bounding box of the given polygon
export function getPolygonBounds(polygon: IPoint[]): BoundRect {
    if (!polygon || polygon.length < 3) {
        return null;
    }

    const pointCount: number = polygon.length;
    let minX: number = polygon[0].x;
    let maxX: number = polygon[0].x;
    let minY: number = polygon[0].y;
    let maxY: number = polygon[0].y;
    let i: number = 0;

    for (i = 1; i < pointCount; ++i) {
        maxX = Math.max(maxX, polygon[i].x);
        minX = Math.min(minX, polygon[i].x);
        maxY = Math.max(maxY, polygon[i].y);
        minY = Math.min(minY, polygon[i].y);
    }

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function rotatePolygon(polygon: IPolygon, angle: number): IPolygon {
    const pointCount: number = polygon.length;
    const rotated: IPolygon = [] as IPolygon;
    const radianAngle: number = (angle * Math.PI) / 180;
    let i: number = 0;
    let x: number = 0;
    let y: number = 0;
    let x1: number = 0;
    let y1: number = 0;

    for (i = 0; i < pointCount; ++i) {
        x = polygon[i].x;
        y = polygon[i].y;
        x1 = x * Math.cos(radianAngle) - y * Math.sin(radianAngle);
        y1 = x * Math.sin(radianAngle) + y * Math.cos(radianAngle);

        rotated.push({ x: x1, y: y1 });
    }
    // reset bounding box
    const bounds: BoundRect = getPolygonBounds(rotated);

    rotated.x = bounds.x;
    rotated.y = bounds.y;
    rotated.width = bounds.width;
    rotated.height = bounds.height;

    return rotated;
}

// returns the area of the polygon, assuming no self-intersections
// a negative area indicates counter-clockwise winding direction
export function polygonArea(polygon: IPoint[]): number {
    let result: number = 0;
    let i: number = 0;
    let j: number = 0;

    for (i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        result = result + (polygon[j].x + polygon[i].x) * (polygon[j].y - polygon[i].y);
    }

    return 0.5 * result;
}

export const TOL: number = Math.pow(10, -9);

export function almostEqual(a: number, b: number = 0, tolerance: number = TOL): boolean {
    return Math.abs(a - b) < tolerance;
}

export function normalizePolygon(polygon: IPolygon): void {
    // remove duplicate endpoints, ensure counterclockwise winding direction
    const start: IPoint = polygon[0];
    const end: IPoint = polygon[polygon.length - 1];

    if (start === end || (almostEqual(start.x, end.x) && almostEqual(start.y, end.y))) {
        polygon.pop();
    }

    if (polygonArea(polygon) > 0) {
        polygon.reverse();
    }
}

export function generateNFPCacheKey(
    rotationSplit: number,
    inside: boolean,
    polygon1: IPolygon,
    polygon2: IPolygon,
    rotation1: number = polygon1.rotation,
    rotation2: number = polygon2.rotation
) {
    const rotationOffset: number = Math.round(360 / rotationSplit);
    const rotationIndex1: number = Math.round(rotation1 / rotationOffset);
    const rotationIndex2: number = Math.round(rotation2 / rotationOffset);

    return (
        ((polygon1.id + 1) << 0) +
        ((polygon2.id + 1) << 10) +
        (rotationIndex1 << 19) +
        (rotationIndex2 << 23) +
        ((inside ? 1 : 0) << 27)
    );
}

export function keyToNFPData(numKey: number, rotationSplit: number): NFPContent {
    const rotationOffset: number = Math.round(360 / rotationSplit);
    const result = new Float32Array(5);
    let accumulator: number = 0;
    const inside = numKey >> 27;

    accumulator = accumulator + (inside << 27);

    const rotationIndexB = (numKey - accumulator) >> 23;

    accumulator = accumulator + (rotationIndexB << 23);

    const rotationIndexA = (numKey - accumulator) >> 19;

    accumulator = accumulator + (rotationIndexA << 19);

    const idB = (numKey - accumulator) >> 10;

    accumulator = accumulator + (idB << 10);

    const idA = numKey - accumulator;

    result[4] = inside;
    result[3] = rotationIndexB * rotationOffset;
    result[2] = rotationIndexA * rotationOffset;
    result[1] = idB - 1;
    result[0] = idA - 1;

    return {
        A: idA,
        B: idB,
        inside: Boolean(inside),
        Arotation: rotationIndexA * rotationOffset,
        Brotation: rotationIndexB * rotationOffset
    };
}

// Main function to nest polygons
export function nestPolygons(polygons: IPolygon[], startId: number = 0): number {
    const parents: IPolygon[] = [];
    let i: number = 0;
    let j: number = 0;

    // assign a unique id to each leaf
    let outerNode: IPolygon = null;
    let innerNode: IPolygon = null;
    let isChild: boolean = false;

    for (i = 0; i < polygons.length; ++i) {
        outerNode = polygons[i];
        isChild = false;

        for (j = 0; j < polygons.length; ++j) {
            innerNode = polygons[j];

            if (j !== i && pointInPolygon(outerNode[0], innerNode)) {
                if (!innerNode.children) {
                    innerNode.children = [];
                }

                innerNode.children.push(outerNode);
                outerNode.parent = innerNode;
                isChild = true;
                break;
            }
        }

        if (!isChild) {
            parents.push(outerNode);
        }
    }

    for (i = 0; i < polygons.length; ++i) {
        if (parents.indexOf(polygons[i]) < 0) {
            polygons.splice(i, 1);
            i--;
        }
    }

    const parentCount: number = parents.length;
    let childId: number = startId + parentCount;
    let parent: IPolygon = null;

    for (i = 0; i < parentCount; ++i) {
        parent = parents[i];
        parent.id = startId + i;

        if (parent.children) {
            childId = nestPolygons(parent.children, childId);
        }
    }

    return childId;
}
