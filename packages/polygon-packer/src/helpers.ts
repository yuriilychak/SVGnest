import { BoundRect, IPoint, IPolygon } from './types';

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

const TOL: number = Math.pow(10, -9);

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
