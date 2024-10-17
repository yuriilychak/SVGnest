// Import the library if needed for side effects
import { Clipper, ClipperOffset, PolyFillType, Paths, EndType, JoinType, IntPoint } from 'js-clipper';

import { BoundRect, IPoint, NestConfig, PolygonNode } from './types';
import Polygon from './polygon';
import Point from './point';
import { getPolygonNode } from './helpers';

export default class ClipperWrapper {
    private configuration: NestConfig;

    private polygon: Polygon;

    constructor(configuration: NestConfig) {
        this.configuration = configuration;
        this.polygon = Polygon.create();
    }

    public generateBounds(memSeg: Float64Array): {
        binNode: PolygonNode;
        bounds: BoundRect;
        resultBounds: BoundRect;
        area: number;
    } {
        this.polygon.bind(memSeg);

        if (this.polygon.isBroken) {
            return null;
        }

        const binNode: PolygonNode = getPolygonNode(-1, memSeg);
        const bounds: BoundRect = this.polygon.exportBounds();

        this.cleanNode(binNode);
        this.offsetNode(binNode, -1);

        this.polygon.bind(binNode.memSeg);
        this.polygon.resetPosition();

        const resultBounds = this.polygon.exportBounds();
        const area: number = this.polygon.area;

        return { binNode, bounds, resultBounds, area };
    }

    public generateTree(memSegs: Float64Array[]): PolygonNode[] {
        const point: Point = Point.zero();
        const { curveTolerance } = this.configuration;
        const trashold = curveTolerance * curveTolerance;
        const nodes: PolygonNode[] = [];
        const nodeCount: number = memSegs.length;
        let memSeg: Float64Array = null;
        let node: PolygonNode = null;
        let i: number = 0;

        for (i = 0; i < nodeCount; ++i) {
            memSeg = memSegs[i];
            node = getPolygonNode(i, memSeg);

            this.cleanNode(node);

            this.polygon.bind(node.memSeg);

            if (this.polygon.isBroken || this.polygon.absArea <= trashold) {
                console.warn('Can not parse polygon', i);
                continue;
            }

            nodes.push(node);
        }

        // turn the list into a tree
        this.nestPolygons(point, nodes);
        this.offsetNodes(nodes, 1);

        return nodes;
    }

    // Main function to nest polygons
    private nestPolygons(point: Point, nodes: PolygonNode[]): void {
        const parents: PolygonNode[] = [];
        let i: number = 0;
        let j: number = 0;

        // assign a unique id to each leaf
        let nodeCount: number = nodes.length;
        let outerNode: PolygonNode = null;
        let innerNode: PolygonNode = null;
        let isChild: boolean = false;

        for (i = 0; i < nodeCount; ++i) {
            outerNode = nodes[i];
            isChild = false;
            point.fromMemSeg(outerNode.memSeg, 0);

            for (j = 0; j < nodeCount; ++j) {
                innerNode = nodes[j];
                this.polygon.bind(innerNode.memSeg);

                if (j !== i && this.polygon.pointIn(point)) {
                    innerNode.children.push(outerNode);
                    isChild = true;
                    break;
                }
            }

            if (!isChild) {
                parents.push(outerNode);
            }
        }

        for (i = 0; i < nodeCount; ++i) {
            if (parents.indexOf(nodes[i]) < 0) {
                nodes.splice(i, 1);
                --nodeCount;
                --i;
            }
        }

        const parentCount: number = parents.length;
        let parent: PolygonNode = null;

        for (i = 0; i < parentCount; ++i) {
            parent = parents[i];

            if (parent.children) {
                this.nestPolygons(point, parent.children);
            }
        }
    }

    private offsetNodes(nodes: PolygonNode[], sign: number): void {
        const nodeCont: number = nodes.length;
        let node: PolygonNode = null;
        let i: number = 0;

        for (i = 0; i < nodeCont; ++i) {
            node = nodes[i];
            this.offsetNode(node, sign);
            this.offsetNodes(node.children, -sign);
        }
    }

    private offsetNode(node: PolygonNode, sign: number): void {
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

        this.polygon.bind(node.memSeg);

        node.memSeg = this.polygon.normalize();
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
        polygon: Polygon,
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
