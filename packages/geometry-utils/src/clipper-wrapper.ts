// Import the library if needed for side effects
import { Clipper, ClipperOffset, PolyFillType, Paths, EndType, JoinType, IntPoint } from 'js-clipper';

import { BoundRect, IPoint, NestConfig, PolygonNode } from './types';
import { nestPolygons, pointsToMemSeg } from './helpers';
import Polygon from './polygon';
import Point from './point';

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
        const polygon: Polygon = Polygon.create();
        const binNode: PolygonNode = {
            source: -1,
            rotation: 0,
            memSeg: pointsToMemSeg(points),
            children: []
        };

        polygon.bind(binNode.memSeg);

        if (polygon.isBroken) {
            return null;
        }

        const bounds: BoundRect = polygon.exportBounds();

        this.cleanNode(binNode);
        this.offsetNode(polygon, binNode, -1);

        polygon.bind(binNode.memSeg);
        polygon.resetPosition();

        const resultBounds = polygon.exportBounds();
        const area: number = polygon.area;

        return { binNode, bounds, resultBounds, area };
    }

    public generateTree(points: IPoint[][]): PolygonNode[] {
        const polygon: Polygon = Polygon.create();
        const point: Point = Point.zero();
        const { curveTolerance } = this.configuration;
        const trashold = curveTolerance * curveTolerance;
        const nodes: PolygonNode[] = [];
        const nodeCount: number = points.length;
        let memSeg: Float64Array = null;
        let node: PolygonNode = null;
        let i: number = 0;

        for (i = 0; i < nodeCount; ++i) {
            memSeg = pointsToMemSeg(points[i]);
            node = {
                source: i,
                rotation: 0,
                memSeg,
                children: []
            };

            this.cleanNode(node);

            polygon.bind(node.memSeg);

            if (polygon.isBroken || polygon.absArea <= trashold) {
                console.warn('Can not parse polygon', i);
                continue;
            }

            nodes.push(node);
        }

        // turn the list into a tree
        nestPolygons(polygon, point, nodes);

        this.offsetNodes(polygon, nodes, 1);

        return nodes;
    }

    private offsetNodes(polygon: Polygon, nodes: PolygonNode[], sign: number): void {
        const nodeCont: number = nodes.length;
        let node: PolygonNode = null;
        let i: number = 0;

        for (i = 0; i < nodeCont; ++i) {
            node = nodes[i];
            this.offsetNode(polygon, node, sign);
            this.offsetNodes(polygon, node.children, -sign);
        }
    }

    private offsetNode(polygon: Polygon, node: PolygonNode, sign: number): void {
        if (this.configuration.spacing !== 0) {
            const { curveTolerance, spacing } = this.configuration;
            const offset: number = 0.5 * spacing * sign;
            const miterLimit: number = 2;
            const path: IntPoint[] = ClipperWrapper.fromMemSeg(node.memSeg);
            const clipper: ClipperOffset = new ClipperOffset(miterLimit, curveTolerance * ClipperWrapper.CLIPPER_SCALE);
            const resultPath: Paths = new Paths();

            clipper.AddPath(path, JoinType.jtRound, EndType.etClosedPolygon);
            clipper.Execute(resultPath, offset * ClipperWrapper.CLIPPER_SCALE);

            if (resultPath.length !== 1) {
                throw new Error(`Error while offset ${JSON.stringify(node)}`);
            }

            node.memSeg = ClipperWrapper.toMemSeg(resultPath[0]);
        }

        polygon.bind(node.memSeg);

        node.memSeg = polygon.normalize();
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

    private cleanNode(node: PolygonNode): void {
        const { curveTolerance } = this.configuration;
        const clipperPolygon = ClipperWrapper.fromMemSeg(node.memSeg);
        const simple: IntPoint[][] = Clipper.SimplifyPolygon(clipperPolygon, PolyFillType.pftNonZero) as IntPoint[][];

        if (!simple || simple.length === 0) {
            return;
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
            return;
        }

        node.memSeg = ClipperWrapper.toMemSeg(cleanPolygon);
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

    public static fromMemSeg(memSeg: Float64Array): IntPoint[] {
        const pointCount: number = memSeg.length >> 1;
        const result: IntPoint[] = [];
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            result.push({
                X: memSeg[i << 1] * ClipperWrapper.CLIPPER_SCALE,
                Y: memSeg[(i << 1) + 1] * ClipperWrapper.CLIPPER_SCALE
            });
        }

        return result;
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
