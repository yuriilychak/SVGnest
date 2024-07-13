// Import the library if needed for side effects
// @ts-ignore
import { Clipper, ClipperOffset, PolyFillType, Paths, EndType, JoinType } from 'js-clipper';

import { IClipperPoint, IPoint, IPolygon, NestConfig } from './types';

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
