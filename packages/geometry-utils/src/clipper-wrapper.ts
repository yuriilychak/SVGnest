// Import the library if needed for side effects
import { Clipper, ClipperOffset, PolyFillType, Paths, EndType, JoinType, IntPoint } from 'js-clipper';

import { BoundRect, IPoint, IPolygon, NestConfig } from './types';
import { getPolygonBounds, nestPolygons, normalizePolygon, polygonArea } from './helpers';
import Polygon from './polygon';
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
        binPolygon.source = -1;

        const currentBounds = getPolygonBounds(binPolygon);
        const binSize = binPolygon.length;
        let point = null;

        for (i = 0; i < binSize; ++i) {
            point = binPolygon[i];
            point.x = point.x - currentBounds.x;
            point.y = point.y - currentBounds.y;
        }

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

        const { curveTolerance, spacing } = this.configuration;
        const offset: number = 0.5 * spacing * sign;
        const miterLimit: number = 2;
        const path: IntPoint[] = ClipperWrapper.toClipper(polygon);
        const clipper: ClipperOffset = new ClipperOffset(miterLimit, curveTolerance * ClipperWrapper.CLIPPER_SCALE);
        const resultPath: Paths = new Paths();

        let i: number = 0;

        clipper.AddPath(path, JoinType.jtRound, EndType.etClosedPolygon);
        clipper.Execute(resultPath, offset * ClipperWrapper.CLIPPER_SCALE);

        if (resultPath.length === 1) {
            const offsetPaths: IPoint[] = ClipperWrapper.toNestLegacy(resultPath[0]);
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
        const { curveTolerance } = this.configuration;
        const clipperPolygon = ClipperWrapper.toClipper(polygon);
        const simple: IntPoint[][] = Clipper.SimplifyPolygon(clipperPolygon, PolyFillType.pftNonZero) as IntPoint[][];

        if (!simple || simple.length === 0) {
            return null;
        }

        let i: number = 0;
        let biggest: IntPoint[] = simple[0];
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
        const cleanPolygon: IntPoint[] = Clipper.CleanPolygon(biggest, curveTolerance * ClipperWrapper.CLIPPER_SCALE);
        pointCount = cleanPolygon && cleanPolygon.length ? cleanPolygon.length : 0;

        if (!pointCount) {
            return null;
        }

        return ClipperWrapper.toNestLegacy(cleanPolygon);
    }

    public static toClipper(
        polygon: IPoint[] | Polygon,
        scale: number = 1,
        offset: IPoint = { x: 0, y: 0 },
        isRound: boolean = false,
        cleanTrashold: number = -1
    ): IntPoint[] {
        const resultScale = scale * ClipperWrapper.CLIPPER_SCALE;
        const pointCount: number = polygon.length;
        const result = [];
        let i: number = 0;
        let point: IPoint = null;
        let x: number = 0;
        let y: number = 0;

        for (i = 0; i < pointCount; ++i) {
            //@ts-ignore
            point = polygon.at(i);
            x = (point.x + offset.x) * resultScale;
            y = (point.y + offset.y) * resultScale;

            if (isRound) {
                x = Math.round(x);
                y = Math.round(y);
            }

            result.push({ X: x, Y: y });
        }

        return cleanTrashold !== -1 ? Clipper.CleanPolygon(result, cleanTrashold) : result;
    }

    public static toNestLegacy(polygon: IntPoint[]): IPoint[] {
        const pointCount: number = polygon.length;
        const result: IPoint[] = [];
        let i: number = 0;
        let point: IntPoint = null;

        for (i = 0; i < pointCount; ++i) {
            point = polygon[i];
            result.push({ x: point.X / ClipperWrapper.CLIPPER_SCALE, y: point.Y / ClipperWrapper.CLIPPER_SCALE });
        }

        return result;
    }

    public static toMemSeg(polygon: IntPoint[], memSeg: Float64Array = null, offset: IPoint = { x: 0, y: 0 }): Float64Array {
        const pointCount: number = polygon.length;
        const result: Float64Array = memSeg ? memSeg : new Float64Array(pointCount << 1);
        const tempPoint: Point = Point.zero();
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            tempPoint.fromClipper(polygon[i]).scaleDown(ClipperWrapper.CLIPPER_SCALE).add(offset).fill(result, i);
        }

        return result;
    }

    private static CLIPPER_SCALE: number = 10000000;

    public static AREA_TRASHOLD: number = 0.1 * ClipperWrapper.CLIPPER_SCALE * ClipperWrapper.CLIPPER_SCALE;
    public static CLEAN_TRASHOLD: number = 0.0001 * ClipperWrapper.CLIPPER_SCALE;
}
