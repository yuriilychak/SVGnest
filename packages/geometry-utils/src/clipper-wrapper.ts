// Import the library if needed for side effects
import { Clipper, ClipperOffset, PolyFillType, Paths, EndType, JoinType, IntPoint } from 'js-clipper';

import { BoundRect, IClipperPoint, IPoint, IPolygon, NestConfig } from './types';
import { getPolygonBounds, nestPolygons, normalizePolygon, polygonArea } from './helpers';
import { default as LocalPolygon } from './polygon';
import Point from './point';

export default class ClipperWrapper {
    private configuration: NestConfig;

    constructor(configuration: NestConfig) {
        this.configuration = configuration;
    }

    public generateBounds(binPolygon: IPolygon): { binPolygon: IPolygon; bounds: BoundRect } {
        let i: number = 0;

        if (binPolygon.length < 3) {
            return;
        }

        const bounds = getPolygonBounds(binPolygon);

        this.offsetPolygon(binPolygon, -1);
        binPolygon.id = -1;

        const currentBounds = getPolygonBounds(binPolygon);
        const binSize = binPolygon.length;
        let point = null;

        for (i = 0; i < binSize; ++i) {
            point = binPolygon[i];
            point.x = point.x - currentBounds.x;
            point.y = point.y - currentBounds.y;
        }

        binPolygon.width = currentBounds.width;
        binPolygon.height = currentBounds.height;

        // all paths need to have the same winding direction
        if (polygonArea(binPolygon) > 0) {
            binPolygon.reverse();
        }

        return { binPolygon, bounds };
    }

    public generateTree(tree: IPolygon[]): void {
        // turn the list into a tree
        nestPolygons(tree);
        // build tree without bin
        const polygonCount = tree.length;
        let i = 0;

        for (i = 0; i < polygonCount; ++i) {
            this.offsetPolygon(tree[i], 1);
        }

        // remove duplicate endpoints, ensure counterclockwise winding direction
        for (i = 0; i < polygonCount; ++i) {
            normalizePolygon(tree[i]);
        }
    }

    public offsetPolygon(polygon: IPolygon, sign: number): boolean {
        if (this.configuration.spacing === 0) {
            return false;
        }

        const { clipperScale, curveTolerance, spacing } = this.configuration;
        const offset: number = 0.5 * spacing * sign;
        const miterLimit: number = 2;
        const path: IntPoint[] = ClipperWrapper.toClipper(polygon, clipperScale);
        const clipper: ClipperOffset = new ClipperOffset(miterLimit, curveTolerance * clipperScale);
        const resultPath: Paths = new Paths();

        let i: number = 0;

        clipper.AddPath(path, JoinType.jtRound, EndType.etClosedPolygon);
        clipper.Execute(resultPath, offset * clipperScale);

        if (resultPath.length === 1) {
            const offsetPaths: IPoint[] = ClipperWrapper.toNest(resultPath[0], clipperScale);
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
        const { clipperScale, curveTolerance } = this.configuration;
        const clipperPolygon = ClipperWrapper.toClipper(polygon, clipperScale);
        const simple: IClipperPoint[][] = Clipper.SimplifyPolygon(clipperPolygon, PolyFillType.pftNonZero) as IClipperPoint[][];

        if (!simple || simple.length === 0) {
            return null;
        }

        let i: number = 0;
        let biggest: IClipperPoint[] = simple[0];
        let biggestArea: number = Math.abs(Clipper.Area(biggest));
        let area: number = 0;
        let pointCount: number = simple.length;

        for (i = 1; i < pointCount; ++i) {
            area = Math.abs(Clipper.Area(simple[i]));

            if (area > biggestArea) {
                biggest = simple[i];
                biggestArea = area;
            }
        }

        // clean up singularities, coincident points and edges
        const cleanPolygon: IntPoint[] = Clipper.CleanPolygon(biggest, curveTolerance * clipperScale);
        pointCount = cleanPolygon && cleanPolygon.length ? cleanPolygon.length : 0;

        if (!pointCount) {
            return null;
        }

        return ClipperWrapper.toNest(cleanPolygon, clipperScale);
    }

    public static toClipper(
        polygon: IPoint[] | LocalPolygon,
        scale: number = 1,
        offset: IPoint = { x: 0, y: 0 },
        isRound: boolean = false
    ): IntPoint[] {
        const pointCount: number = polygon.length;
        const result = [];
        let i: number = 0;
        let point: IPoint = null;
        let x: number = 0;
        let y: number = 0;

        for (i = 0; i < pointCount; ++i) {
            //@ts-ignore
            point = polygon.at(i);
            x = (point.x + offset.x) * scale;
            y = (point.y + offset.y) * scale;

            if (isRound) {
                x = Math.round(x);
                y = Math.round(y);
            }

            result.push({ X: x, Y: y });
        }

        return result;
    }

    public static toNest(polygon: IntPoint[], scale: number = 1, offset: IPoint = { x: 0, y: 0 }): IPoint[] {
        const pointCount: number = polygon.length;
        const result: IPoint[] = [];
        let i: number = 0;
        let point: IClipperPoint = null;

        for (i = 0; i < pointCount; ++i) {
            point = polygon[i];
            result.push({ x: point.X / scale + offset.x, y: point.Y / scale + offset.y });
        }

        return result;
    }

    public static toMemSeg(
        polygon: IntPoint[],
        scale: number = 1,
        memSeg: Float64Array = null,
        offset: IPoint = { x: 0, y: 0 }
    ): Float64Array {
        const pointCount: number = polygon.length;
        const result: Float64Array = memSeg ? memSeg : new Float64Array(pointCount << 1);
        const tempPoint: Point = Point.zero();
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            tempPoint.fromClipper(polygon[i]).scaleDown(scale).add(offset).fill(result, i);
        }

        return result;
    }
}
