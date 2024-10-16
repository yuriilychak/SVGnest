// Import the library if needed for side effects
import { Clipper, ClipperOffset, PolyFillType, Paths, EndType, JoinType, IntPoint } from 'js-clipper';

import { BoundRect, IPoint, IPolygon, NestConfig, PolygonNode } from './types';
import { getPolygonBounds, legacyToPolygonNode, legacyToPolygonNodes, nestPolygons, polygonArea } from './helpers';
import Polygon from './polygon';
import Point from './point';
import { almostEqual } from './shared-helpers';

export default class ClipperWrapper {
    private configuration: NestConfig;

    constructor(configuration: NestConfig) {
        this.configuration = configuration;
    }

    public generateBounds(points: IPoint[]): {
        binNode: PolygonNode;
        bounds: BoundRect;
        resultBounds: BoundRect;
        area: number;
    } {
        let i: number = 0;

        if (points.length < 3) {
            return null;
        }

        const bounds: BoundRect = getPolygonBounds(points);
        const polygon: IPolygon = this.cleanPolygon(points) as IPolygon;

        polygon.source = -1;
        polygon.rotation = 0;
        polygon.children = [];

        const binPolygon = this.offsetPolygon(polygon, -1);
        const currentBounds = getPolygonBounds(binPolygon);
        const binSize = binPolygon.length;
        let point = null;

        for (i = 0; i < binSize; ++i) {
            point = binPolygon[i];
            point.x = point.x - currentBounds.x;
            point.y = point.y - currentBounds.y;
        }

        const resultBounds = getPolygonBounds(binPolygon);
        const area: number = polygonArea(binPolygon);

        return { binNode: legacyToPolygonNode(binPolygon, []), bounds, resultBounds, area };
    }

    public generateTree(points: IPoint[][]): PolygonNode[] {
        const { curveTolerance } = this.configuration;
        const trashold = curveTolerance * curveTolerance;
        const tree: IPolygon[] = [];
        const nodeCount: number = points.length;
        let node: IPolygon = null;
        let i: number = 0;

        for (i = 0; i < nodeCount; ++i) {
            node = this.cleanPolygon(points[i]) as IPolygon;

            if (node.length < 3 || Math.abs(polygonArea(node)) <= trashold) {
                console.warn('Can not parse polygon', i);
                continue;
            }

            node.source = i;
            node.children = [];
            tree.push(node);
        }
        // turn the list into a tree
        nestPolygons(tree);

        return legacyToPolygonNodes(this.offsetPolygons(tree, 1));
    }

    private offsetPolygons(polygons: IPolygon[], sign: number): IPolygon[] {
        if (!polygons) {
            return [];
        }

        const result: IPolygon[] = [];
        const polygonCount: number = polygons.length;
        let polygon: IPolygon = null;
        let i: number = 0;

        for (i = 0; i < polygonCount; ++i) {
            polygon = this.offsetPolygon(polygons[i], sign);
            polygon.children = this.offsetPolygons(polygon.children, -sign);

            result.push(polygon);
        }

        return result;
    }

    private offsetPolygon(polygon: IPolygon, sign: number): IPolygon {
        let result: IPolygon = polygon;

        if (this.configuration.spacing !== 0) {
            const { curveTolerance, spacing } = this.configuration;
            const offset: number = 0.5 * spacing * sign;
            const miterLimit: number = 2;
            const path: IntPoint[] = ClipperWrapper.toClipper(polygon);
            const clipper: ClipperOffset = new ClipperOffset(miterLimit, curveTolerance * ClipperWrapper.CLIPPER_SCALE);
            const resultPath: Paths = new Paths();

            clipper.AddPath(path, JoinType.jtRound, EndType.etClosedPolygon);
            clipper.Execute(resultPath, offset * ClipperWrapper.CLIPPER_SCALE);

            if (resultPath.length !== 1) {
                throw new Error(`Error while offset ${JSON.stringify(polygon)}`);
            }

            result = ClipperWrapper.toNestLegacy(resultPath[0]) as IPolygon;

            result.source = polygon.source;
            result.rotation = polygon.rotation;
            result.children = polygon.children;
        }

        // remove duplicate endpoints, ensure counterclockwise winding direction
        const start: IPoint = result[0];
        let end: IPoint = result[result.length - 1];

        while (almostEqual(start.x, end.x) && almostEqual(start.y, end.y)) {
            result.pop();
            end = result[result.length - 1];
        }

        if (polygonArea(result) > 0) {
            result.reverse();
        }

        return result;
    }

    private cleanPolygon(polygon: IPoint[]): IPoint[] {
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
