// Import the library if needed for side effects
import { Clipper } from 'js-clipper';
import {
    PolyFillType,
    JoinType,
    EndType,
    IntPoint,
    PolyType,
    ClipType,
    absArea,
    simplifyPolygon,
    cleanPolygon,
    cleanPolygons,
    ClipperOffset
} from './clipper';

import { BoundRect, NestConfig, NFPCache, PolygonNode } from './types';
import Polygon from './polygon';
import Point from './point';
import { generateNFPCacheKey, getPolygonNode } from './helpers';
import PointPool from './point-pool';

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
        const start = performance.now();
        this.offsetNodes(nodes, 1);
        const end = performance.now();

        console.log(end - start);

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
            point.fromMemSeg(outerNode.memSeg);

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
            const { spacing } = this.configuration;
            const offset: number = 0.5 * spacing * sign;
            const path: IntPoint[] = ClipperWrapper.fromMemSeg(node.memSeg);

            const resultPath: IntPoint[][] = ClipperOffset.create().execute(path, offset * ClipperWrapper.CLIPPER_SCALE);

            if (resultPath.length !== 1) {
                throw new Error(`Error while offset ${JSON.stringify(node)}`);
            }

            node.memSeg = ClipperWrapper.toMemSeg(resultPath[0]);

            this.cleanNode(node);
        }

        this.polygon.bind(node.memSeg);

        node.memSeg = this.polygon.normalize();
    }

    private cleanNode(node: PolygonNode): void {
        const { curveTolerance } = this.configuration;
        const clipperPolygon = ClipperWrapper.fromMemSeg(node.memSeg);
        const simple: IntPoint[][] = simplifyPolygon(clipperPolygon, PolyFillType.pftNonZero);

        if (!simple || simple.length === 0) {
            return;
        }

        let i: number = 0;
        let biggest: IntPoint[] = simple[0];
        let biggestArea: number = absArea(biggest);
        let area: number = 0;
        let pointCount: number = simple.length;

        for (i = 1; i < pointCount; ++i) {
            area = absArea(simple[i]);

            if (area > biggestArea) {
                biggest = simple[i];
                biggestArea = area;
            }
        }

        // clean up singularities, coincident points and edges
        const clearedPolygon: IntPoint[] = cleanPolygon(biggest, curveTolerance * ClipperWrapper.CLIPPER_SCALE);
        pointCount = clearedPolygon && clearedPolygon.length ? clearedPolygon.length : 0;

        if (!pointCount) {
            return;
        }

        node.memSeg = ClipperWrapper.toMemSeg(clearedPolygon);
    }

    public static toClipper(
        polygon: Polygon,
        scale: number = 1,
        offset: Point = null,
        isRound: boolean = false,
        cleanTrashold: number = -1
    ): IntPoint[] {
        const resultScale = scale * ClipperWrapper.CLIPPER_SCALE;
        const pointCount: number = polygon.length;
        const result = [];
        let i: number = 0;
        let point: Point = null;
        let x: number = 0;
        let y: number = 0;

        for (i = 0; i < pointCount; ++i) {
            //@ts-ignore
            point = polygon.at(i);
            if (offset === null) {
                x = point.x * resultScale;
                y = point.y * resultScale;
            } else {
                x = (point.x + offset.x) * resultScale;
                y = (point.y + offset.y) * resultScale;
            }

            if (isRound) {
                x = Math.round(x);
                y = Math.round(y);
            }

            result.push({ X: x, Y: y });
        }

        return cleanTrashold !== -1 ? cleanPolygon(result, cleanTrashold) : result;
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

    public static toMemSeg(polygon: IntPoint[], memSeg: Float64Array = null, offset: Point = null): Float64Array {
        const pointCount: number = polygon.length;
        const result: Float64Array = memSeg ? memSeg : new Float64Array(pointCount << 1);
        const tempPoint: Point = Point.zero();
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            tempPoint.fromClipper(polygon[i]).scaleDown(ClipperWrapper.CLIPPER_SCALE);

            if (offset !== null) {
                tempPoint.add(offset);
            }

            tempPoint.fill(result, i);
        }

        return result;
    }

    public static applyNfps(polygon: Polygon, clipper: Clipper, nfpBuffer: ArrayBuffer, offset: Point): void {
        const nfpMemSeg: Float64Array = new Float64Array(nfpBuffer);
        const nfpCount: number = nfpMemSeg[1];
        let clone: IntPoint[] = null;
        let i: number = 0;

        for (i = 0; i < nfpCount; ++i) {
            polygon.bindNFP(nfpMemSeg, i);
            clone = ClipperWrapper.toClipper(polygon, 1, offset, false, ClipperWrapper.CLEAN_TRASHOLD);

            if (absArea(clone) > ClipperWrapper.AREA_TRASHOLD) {
                clipper.AddPath(clone, PolyType.ptSubject, true);
            }
        }
    }

    public static nfpToClipper(polygon: Polygon, pointPool: PointPool, nfpMmSeg: Float64Array): IntPoint[][] {
        const pointIndices = pointPool.alloc(1);
        const offset: Point = pointPool.get(pointIndices, 0).set(0, 0);
        const nfpCount: number = nfpMmSeg[1];
        let i: number = 0;
        const result = [];

        for (i = 0; i < nfpCount; ++i) {
            polygon.bindNFP(nfpMmSeg, i);
            result.push(ClipperWrapper.toClipper(polygon, 1, offset, true));
        }

        pointPool.malloc(pointIndices);

        return result;
    }

    public static getFinalNfps(
        polygon: Polygon,
        pointPool: PointPool,
        nfpCache: NFPCache,
        rotations: number,
        placed: PolygonNode[],
        path: PolygonNode,
        binNfp: Float64Array,
        placement: number[]
    ) {
        const pointIndices: number = pointPool.alloc(1);
        const tmpPoint: Point = pointPool.get(pointIndices, 0);
        let clipper = new Clipper();
        let i: number = 0;
        let key: number = 0;

        for (i = 0; i < placed.length; ++i) {
            key = generateNFPCacheKey(rotations, false, placed[i], path);

            if (!nfpCache.has(key)) {
                continue;
            }

            tmpPoint.fromMemSeg(placement, i);

            ClipperWrapper.applyNfps(polygon, clipper, nfpCache.get(key), tmpPoint);
        }

        pointPool.malloc(pointIndices);

        const combinedNfp: IntPoint[][] = [];

        if (!clipper.Execute(ClipType.ctUnion, combinedNfp, PolyFillType.pftNonZero, PolyFillType.pftNonZero)) {
            return null;
        }

        // difference with bin polygon
        let finalNfp: IntPoint[][] = [];
        const clipperBinNfp: IntPoint[][] = ClipperWrapper.nfpToClipper(polygon, pointPool, binNfp);

        clipper = new Clipper();
        clipper.AddPaths(combinedNfp, PolyType.ptClip, true);
        clipper.AddPaths(clipperBinNfp, PolyType.ptSubject, true);

        if (!clipper.Execute(ClipType.ctDifference, finalNfp, PolyFillType.pftNonZero, PolyFillType.pftNonZero)) {
            return null;
        }

        finalNfp = cleanPolygons(finalNfp, ClipperWrapper.CLEAN_TRASHOLD);

        for (i = 0; i < finalNfp.length; ++i) {
            if (absArea(finalNfp[i]) < ClipperWrapper.AREA_TRASHOLD) {
                finalNfp.splice(i, 1);
                --i;
            }
        }

        return finalNfp.length === 0 ? null : finalNfp;
    }

    private static CLIPPER_SCALE: number = 10000000;

    public static AREA_TRASHOLD: number = 0.1 * ClipperWrapper.CLIPPER_SCALE * ClipperWrapper.CLIPPER_SCALE;

    public static CLEAN_TRASHOLD: number = 0.0001 * ClipperWrapper.CLIPPER_SCALE;
}
