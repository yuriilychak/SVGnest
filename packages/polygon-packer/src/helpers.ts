// Import the library if needed for side effects
// @ts-ignore
import { Clipper, ClipperOffset, PolyFillType, Paths, EndType, JoinType } from 'js-clipper';

import { BoundRect, IClipperPoint, IPoint, IPolygon, NestConfig } from './types';

export function toClipperCoordinates(polygon: IPoint[], scale: number): IClipperPoint[] {
    const pointCount: number = polygon.length;
    const result = [];
    let i: number = 0;
    let point: IPoint = null;

    for (i = 0; i < pointCount; ++i) {
        point = polygon[i];
        result.push({ X: point.x * scale, Y: point.y * scale });
    }

    return result;
}

export function toNestCoordinates(polygon: IClipperPoint[], scale: number): IPoint[] {
    const pointCount: number = polygon.length;
    const result: IPoint[] = [];
    let i: number = 0;
    let point: IClipperPoint = null;

    for (i = 0; i < pointCount; ++i) {
        point = polygon[i];
        result.push({ x: point.X / scale, y: point.Y / scale });
    }

    return result;
}

export function cleanPolygon(polygon: IPolygon, scale: number, tolerance: number): IPoint[] {
    const clipperPolygon = toClipperCoordinates(polygon, scale);
    // @ts-ignore
    const simple: IClipperPoint[][] = Clipper.SimplifyPolygon(clipperPolygon, PolyFillType.pftNonZero) as IClipperPoint[][];

    if (!simple || simple.length === 0) {
        return null;
    }

    let i: number = 0;
    let biggest: IClipperPoint[] = simple[0];
    // @ts-ignore
    let biggestArea: number = Math.abs(Clipper.Area(biggest));
    let area: number = 0;
    let pointCount: number = simple.length;

    for (i = 1; i < pointCount; ++i) {
        // @ts-ignore
        area = Math.abs(Clipper.Area(simple[i]));

        if (area > biggestArea) {
            biggest = simple[i];
            biggestArea = area;
        }
    }

    // clean up singularities, coincident points and edges
    // @ts-ignore
    const cleanPolygon: IClipperPoint[] = Clipper.CleanPolygon(biggest, tolerance * scale) as IClipperPoint[];
    pointCount = cleanPolygon && cleanPolygon.length ? cleanPolygon.length : 0;

    if (!pointCount) {
        return null;
    }

    return toNestCoordinates(cleanPolygon, scale);
}

export function offsetPolygon(polygon: IPolygon, configuration: NestConfig, sign: number): boolean {
    if (configuration.spacing === 0) {
        return false;
    }

    const { clipperScale, curveTolerance, spacing } = configuration;
    const offset: number = 0.5 * spacing * sign;
    const miterLimit: number = 2;
    const path: IClipperPoint[] = toClipperCoordinates(polygon, clipperScale);
    const clipper: ClipperOffset = new ClipperOffset(miterLimit, curveTolerance * clipperScale);
    const resultPath: Paths = new Paths();

    let i: number = 0;

    clipper.AddPath(path, JoinType.jtRound, EndType.etClosedPolygon);
    clipper.Execute(resultPath, offset * clipperScale);

    if (resultPath.length === 1) {
        const offsetPaths: IPoint[] = toNestCoordinates(resultPath[0] as IClipperPoint[], clipperScale);
        // replace array items in place
        polygon.length = 0;

        const pointCount: number = offsetPaths.length;

        for (i = 0; i < pointCount; ++i) {
            polygon.push(offsetPaths[i]);
        }
    }

    const childCount: number = polygon.children ? polygon.children.length : 0;

    if (childCount === 0) {
        return true;
    }

    for (i = 0; i < childCount; ++i) {
        offsetPolygon(polygon.children[i], configuration, sign * -1);
    }

    return true;
}

// returns the rectangular bounding box of the given polygon
export function getPolygonBounds(polygon: IPolygon): BoundRect {
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
export function polygonArea(polygon: IPolygon): number {
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
