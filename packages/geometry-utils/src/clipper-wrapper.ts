import { PolyFillType, PolyType, ClipType, absArea, cleanPolygon, cleanPolygons, ClipperOffset, Clipper } from './clipper';

import { NestConfig, PolygonNode } from './types';
import { generateNFPCacheKey, getPolygonNode, getUint16 } from './helpers';
import PointPool from './point-pool';
import { NFP_INFO_START_INDEX } from './constants';
import PlaceContent from './worker-flow/place-content';
import PolygonF32 from './polygon-f32';
import BoundRectF32 from './bound-rect-f32';
import { PointF32, PointF64 } from './point';

export default class ClipperWrapper {
    private configuration: NestConfig;

    private polygon: PolygonF32;

    constructor(configuration: NestConfig) {
        this.configuration = configuration;
        this.polygon = PolygonF32.create();
    }

    public generateBounds(memSeg: Float32Array): {
        binNode: PolygonNode;
        bounds: BoundRectF32;
        resultBounds: BoundRectF32;
        area: number;
    } {
        this.polygon.bind(memSeg);

        if (this.polygon.isBroken) {
            return null;
        }

        const binNode: PolygonNode = getPolygonNode(-1, memSeg);
        const bounds: BoundRectF32 = this.polygon.exportBounds();
        const clipperOffset: ClipperOffset = ClipperOffset.create();

        this.cleanNode(binNode);
        this.offsetNode(clipperOffset, binNode, -1);

        this.polygon.bind(binNode.memSeg);
        this.polygon.resetPosition();

        const resultBounds = this.polygon.exportBounds();
        const area: number = this.polygon.area;

        return { binNode, bounds, resultBounds, area };
    }

    public generateTree(memSegs: Float32Array[]): PolygonNode[] {
        const point: PointF32 = PointF32.create();
        const { curveTolerance } = this.configuration;
        const trashold = curveTolerance * curveTolerance;
        const nodes: PolygonNode[] = [];
        const nodeCount: number = memSegs.length;
        let memSeg: Float32Array = null;
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
    private nestPolygons(point: PointF32, nodes: PolygonNode[]): void {
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
            const path: PointF64[] = ClipperWrapper.fromMemSeg(node.memSeg);

            const resultPath: PointF64[][] = clipperOffset.execute(path, offset * ClipperWrapper.CLIPPER_SCALE);

            if (resultPath.length !== 1) {
                throw new Error(`Error while offset ${JSON.stringify(node)}`);
            }

            node.memSeg = ClipperWrapper.toMemSegF32(resultPath[0]);

            this.cleanNode(node);
        }

        this.polygon.bind(node.memSeg);

        node.memSeg = this.polygon.normalize();
    }

    private cleanNode(node: PolygonNode): void {
        const { curveTolerance } = this.configuration;
        const clipperPolygon = ClipperWrapper.fromMemSeg(node.memSeg);
        const simple: PointF64[][] = [];
        const clipper = new Clipper();

        clipper.StrictlySimple = true;
        clipper.addPath(clipperPolygon, PolyType.SUBJECT);
        clipper.execute(ClipType.UNION, simple, PolyFillType.NON_ZERO);

        if (!simple || simple.length === 0) {
            return;
        }

        let i: number = 0;
        let biggest: PointF64[] = simple[0];
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
        const clearedPolygon: PointF64[] = cleanPolygon(biggest, curveTolerance * ClipperWrapper.CLIPPER_SCALE);
        pointCount = clearedPolygon && clearedPolygon.length ? clearedPolygon.length : 0;

        if (!pointCount) {
            return;
        }

        node.memSeg = ClipperWrapper.toMemSegF32(clearedPolygon);
    }

    private static fromNfp(memSeg: Float64Array, index: number, offset: PointF64 = null): PointF64[] {
        const cleanTrashold: number = offset === null ? -1 : ClipperWrapper.CLEAN_TRASHOLD;
        const isRound: boolean = offset === null;
        const compressedInfo: number = memSeg[NFP_INFO_START_INDEX + index];
        const memOffset: number = getUint16(compressedInfo, 1);
        const pointCount: number = getUint16(compressedInfo, 0) >>> 1;

        return ClipperWrapper.fromMemSeg(Float32Array.from(memSeg), memOffset, pointCount, 1, offset, isRound, cleanTrashold);
    }

    public static fromMemSeg(
        memSeg: Float32Array | Float64Array,
        memOffset: number = 0,
        pointCount: number = memSeg.length >> 1,
        scale: number = 1,
        offset: PointF64 = null,
        isRound: boolean = false,
        cleanTrashold: number = -1
    ): PointF64[] {
        const resultScale = scale * ClipperWrapper.CLIPPER_SCALE;
        const result: PointF64[] = [];
        const point: PointF64 = PointF64.create();
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

            result.push(PointF64.from(point));
        }

        return cleanTrashold !== -1 ? cleanPolygon(result, cleanTrashold) : result;
    }

    public static toMemSeg(polygon: PointF64[], memSeg: Float64Array = null): Float64Array {
        const pointCount: number = polygon.length;
        const result: Float64Array = memSeg ? memSeg : new Float64Array(pointCount << 1);
        const tempPoint: PointF64 = PointF64.create();
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            tempPoint.fromClipper(polygon[i]).scaleDown(ClipperWrapper.CLIPPER_SCALE);
            tempPoint.fill(result, i);
        }

        return result;
    }

    public static toMemSegF32(polygon: PointF64[], memSeg: Float32Array = null): Float32Array {
        const pointCount: number = polygon.length;
        const result: Float32Array = memSeg ? memSeg : new Float32Array(pointCount << 1);
        const tempPoint: PointF32 = PointF32.create();
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            tempPoint.fromClipper(polygon[i]).scaleDown(ClipperWrapper.CLIPPER_SCALE);
            tempPoint.fill(result, i);
        }

        return result;
    }

    public static applyNfps(clipper: Clipper, nfpBuffer: ArrayBuffer, offset: PointF64): void {
        const nfpMemSeg: Float64Array = new Float64Array(nfpBuffer);
        const nfpCount: number = nfpMemSeg[1];
        let clone: PointF64[] = null;
        let i: number = 0;

        for (i = 0; i < nfpCount; ++i) {
            clone = ClipperWrapper.fromNfp(nfpMemSeg, i, offset);

            if (absArea(clone) > ClipperWrapper.AREA_TRASHOLD) {
                clipper.addPath(clone, PolyType.SUBJECT);
            }
        }
    }

    public static nfpToClipper(pointPool: PointPool, nfpMmSeg: Float64Array): PointF64[][] {
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
        const tmpPoint: PointF64 = pointPool.get(pointIndices, 0);
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

        const combinedNfp: PointF64[][] = [];

        if (!clipper.execute(ClipType.UNION, combinedNfp, PolyFillType.NON_ZERO)) {
            return null;
        }

        // difference with bin polygon
        let finalNfp: PointF64[][] = [];
        const clipperBinNfp: PointF64[][] = ClipperWrapper.nfpToClipper(pointPool, binNfp);

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
