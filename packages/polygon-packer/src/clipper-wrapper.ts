// Import the library if needed for side effects
import { Clipper, ClipperOffset, PolyFillType, Paths, EndType, JoinType, IntPoint } from 'js-clipper';

import { IClipperPoint, IPoint, IPolygon, NestConfig } from './types';

export default class ClipperWrapper {
    #configuration: NestConfig;

    constructor(configuration: NestConfig) {
        this.#configuration = configuration;
    }

    public offsetPolygon(polygon: IPolygon, sign: number): boolean {
        if (this.#configuration.spacing === 0) {
            return false;
        }

        const { clipperScale, curveTolerance, spacing } = this.#configuration;
        const offset: number = 0.5 * spacing * sign;
        const miterLimit: number = 2;
        const path: IntPoint[] = ClipperWrapper.toClipperCoordinates(polygon, clipperScale);
        const clipper: ClipperOffset = new ClipperOffset(miterLimit, curveTolerance * clipperScale);
        const resultPath: Paths = new Paths();

        let i: number = 0;

        // eslint-disable-next-line new-cap
        clipper.AddPath(path, JoinType.jtRound, EndType.etClosedPolygon);
        // eslint-disable-next-line new-cap
        clipper.Execute(resultPath, offset * clipperScale);

        if (resultPath.length === 1) {
            const offsetPaths: IPoint[] = ClipperWrapper.toNestCoordinates(resultPath[0], clipperScale);
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
            this.offsetPolygon(polygon.children[i], sign * -1);
        }

        return true;
    }

    public cleanPolygon(polygon: IPolygon): IPoint[] {
        const { clipperScale, curveTolerance } = this.#configuration;
        const clipperPolygon = ClipperWrapper.toClipperCoordinates(polygon, clipperScale);
        // eslint-disable-next-line new-cap
        const simple: IClipperPoint[][] = Clipper.SimplifyPolygon(clipperPolygon, PolyFillType.pftNonZero) as IClipperPoint[][];

        if (!simple || simple.length === 0) {
            return null;
        }

        let i: number = 0;
        let biggest: IClipperPoint[] = simple[0];
        // eslint-disable-next-line new-cap
        let biggestArea: number = Math.abs(Clipper.Area(biggest));
        let area: number = 0;
        let pointCount: number = simple.length;

        for (i = 1; i < pointCount; ++i) {
            // eslint-disable-next-line new-cap
            area = Math.abs(Clipper.Area(simple[i]));

            if (area > biggestArea) {
                biggest = simple[i];
                biggestArea = area;
            }
        }

        // clean up singularities, coincident points and edges
        // eslint-disable-next-line new-cap
        const cleanPolygon: IClipperPoint[] = Clipper.CleanPolygon(biggest, curveTolerance * clipperScale) as IClipperPoint[];
        pointCount = cleanPolygon && cleanPolygon.length ? cleanPolygon.length : 0;

        if (!pointCount) {
            return null;
        }

        return ClipperWrapper.toNestCoordinates(cleanPolygon, clipperScale);
    }

    private static toClipperCoordinates(polygon: IPoint[], scale: number): IntPoint[] {
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

    private static toNestCoordinates(polygon: IntPoint[], scale: number): IPoint[] {
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
}
