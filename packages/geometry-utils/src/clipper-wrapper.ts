import { PolyFillType, PolyType, ClipType, absArea, cleanPolygon, cleanPolygons, ClipperOffset, Clipper } from './clipper';

import { NestConfig, PolygonNode } from './types';
import Polygon from './polygon';
import Point from './point';
import { generateNFPCacheKey, getPolygonNode, getUint16 } from './helpers';
import PointPool from './point-pool';
import { NFP_INFO_START_INDEX } from './constants';
import BoundRect from './bound-rect';
import PlaceContent from './worker-flow/place-content';

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
        const clipperOffset: ClipperOffset = ClipperOffset.create();

        this.cleanNode(binNode);
        this.offsetNode(clipperOffset, binNode, -1);

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

        const clipperOffset: ClipperOffset = ClipperOffset.create();

        this.offsetNodes(clipperOffset, nodes, 1);

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

    private offsetNodes(clipperOffset: ClipperOffset, nodes: PolygonNode[], sign: number): void {
        const nodeCont: number = nodes.length;
        let node: PolygonNode = null;
        let i: number = 0;

        for (i = 0; i < nodeCont; ++i) {
            node = nodes[i];
            this.offsetNode(clipperOffset, node, sign);
            this.offsetNodes(clipperOffset, node.children, -sign);
        }
    }

    private offsetNode(clipperOffset: ClipperOffset, node: PolygonNode, sign: number): void {
        if (this.configuration.spacing !== 0) {
            const { spacing } = this.configuration;
            const offset: number = 0.5 * spacing * sign;
            const path: Point[] = ClipperWrapper.fromMemSeg(node.memSeg);

            const resultPath: Point[][] = clipperOffset.execute(path, offset * ClipperWrapper.CLIPPER_SCALE);

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
        const simple: Point[][] = [];
        const clipper = new Clipper();

        clipper.StrictlySimple = true;
        clipper.addPath(clipperPolygon, PolyType.SUBJECT);
        clipper.execute(ClipType.UNION, simple, PolyFillType.NON_ZERO);

        if (!simple || simple.length === 0) {
            return;
        }

        let i: number = 0;
        let biggest: Point[] = simple[0];
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
        const clearedPolygon: Point[] = cleanPolygon(biggest, curveTolerance * ClipperWrapper.CLIPPER_SCALE);
        pointCount = clearedPolygon && clearedPolygon.length ? clearedPolygon.length : 0;

        if (!pointCount) {
            return;
        }

        node.memSeg = ClipperWrapper.toMemSeg(clearedPolygon);
    }

    private static fromNfp(memSeg: Float64Array, index: number, offset: Point = null): Point[] {
        const cleanTrashold: number = offset === null ? -1 : ClipperWrapper.CLEAN_TRASHOLD;
        const isRound: boolean = offset === null;
        const compressedInfo: number = memSeg[NFP_INFO_START_INDEX + index];
        const memOffset: number = getUint16(compressedInfo, 1);
        const pointCount: number = getUint16(compressedInfo, 0) >>> 1;

        return ClipperWrapper.fromMemSeg(memSeg, memOffset, pointCount, 1, offset, isRound, cleanTrashold);
    }

    public static fromMemSeg(
        memSeg: Float64Array,
        memOffset: number = 0,
        pointCount: number = memSeg.length >> 1,
        scale: number = 1,
        offset: Point = null,
        isRound: boolean = false,
        cleanTrashold: number = -1
    ): Point[] {
        const resultScale = scale * ClipperWrapper.CLIPPER_SCALE;
        const result: Point[] = [];
        const point: Point = Point.zero();
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            point.fromMemSeg(memSeg, i, memOffset);

            if (offset !== null) {
                point.add(offset);
            }

            point.scaleUp(resultScale);

            if (isRound) {
                point.round();
            }

            result.push(Point.from(point));
        }

        return cleanTrashold !== -1 ? cleanPolygon(result, cleanTrashold) : result;
    }

    public static toMemSeg(polygon: Point[], memSeg: Float64Array = null, offset: Point = null): Float64Array {
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

    public static applyNfps(clipper: Clipper, nfpBuffer: ArrayBuffer, offset: Point): void {
        const nfpMemSeg: Float64Array = new Float64Array(nfpBuffer);
        const nfpCount: number = nfpMemSeg[1];
        let clone: Point[] = null;
        let i: number = 0;

        for (i = 0; i < nfpCount; ++i) {
            clone = ClipperWrapper.fromNfp(nfpMemSeg, i, offset);

            if (absArea(clone) > ClipperWrapper.AREA_TRASHOLD) {
                clipper.addPath(clone, PolyType.SUBJECT);
            }
        }
    }

    public static nfpToClipper(pointPool: PointPool, nfpMmSeg: Float64Array): Point[][] {
        const pointIndices = pointPool.alloc(1);
        const nfpCount: number = nfpMmSeg[1];
        let i: number = 0;
        const result = [];

        for (i = 0; i < nfpCount; ++i) {
            result.push(ClipperWrapper.fromNfp(nfpMmSeg, i));
        }

        pointPool.malloc(pointIndices);

        return result;
    }

    public static getFinalNfps(
        pointPool: PointPool,
        placeContent: PlaceContent,
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
            key = generateNFPCacheKey(placeContent.rotations, false, placed[i], path);

            if (!placeContent.nfpCache.has(key)) {
                continue;
            }

            tmpPoint.fromMemSeg(placement, i);

            ClipperWrapper.applyNfps(clipper, placeContent.nfpCache.get(key), tmpPoint);
        }

        pointPool.malloc(pointIndices);

        const combinedNfp: Point[][] = [];

        if (!clipper.execute(ClipType.UNION, combinedNfp, PolyFillType.NON_ZERO)) {
            return null;
        }

        // difference with bin polygon
        let finalNfp: Point[][] = [];
        const clipperBinNfp: Point[][] = ClipperWrapper.nfpToClipper(pointPool, binNfp);

        clipper = new Clipper();
        clipper.addPaths(combinedNfp, PolyType.CLIP);
        clipper.addPaths(clipperBinNfp, PolyType.SUBJECT);

        if (!clipper.execute(ClipType.DIFFERENCE, finalNfp, PolyFillType.NON_ZERO)) {
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
