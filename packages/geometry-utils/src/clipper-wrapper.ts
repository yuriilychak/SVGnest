import type { BoundRect, NestConfig, Point, Polygon, PolygonNode } from './types';
import { generateNFPCacheKey, getPolygonNode } from './helpers';
import PlaceContent from './worker-flow/place-content';
import { PointF32, PointI32, PolygonF32 } from './geometry';
import NFPWrapper from './worker-flow/nfp-wrapper';
import { clean_polygon_wasm, clean_node_inner_wasm, offset_node_inner_wasm, get_final_nfp_wasm, get_combined_nfps_wasm, polygon_area_i32 } from 'wasm-nesting';

export default class ClipperWrapper {
    private configuration: NestConfig;

    private polygon: Polygon<Float32Array>;

    constructor(configuration: NestConfig) {
        this.configuration = configuration;
        this.polygon = new PolygonF32();
    }

    public generateBounds(memSeg: Float32Array): {
        binNode: PolygonNode;
        bounds: BoundRect<Float32Array>;
        resultBounds: BoundRect<Float32Array>;
        area: number;
    } {
        this.polygon.bind(memSeg);

        if (this.polygon.isBroken) {
            return null;
        }

        const binNode: PolygonNode = getPolygonNode(-1, memSeg);
        const bounds: BoundRect<Float32Array> = this.polygon.exportBounds();

        this.cleanNode(binNode);
        this.offsetNode(binNode, -1);

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

        this.offsetNodes(nodes, 1);

        this.simplifyNodes(nodes);

        return nodes;
    }


    private simplifyNodes(nodes: PolygonNode[]): void {
        const nodeCount: number = nodes.length;
        let size: number = 0;
        let i: number = 0;
        let j: number = 0;

        for (i = 0; i < nodeCount; ++i) {
            size = nodes[i].memSeg.length;

            this.simplifyNodes(nodes[i].children);

            for (j = 0; j < size; ++j) {
                nodes[i].memSeg[j] = Math.round(nodes[i].memSeg[j] * 100) / 100;
            }
        }
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
        node.memSeg = offset_node_inner_wasm(node.memSeg, sign, this.configuration.spacing, this.configuration.curveTolerance);
    }


    private cleanNode(node: PolygonNode): void {
        const { curveTolerance } = this.configuration;

        const res = clean_node_inner_wasm(node.memSeg, curveTolerance);

        if (res.length) {
            node.memSeg = res;
        }
    }

    public static fromMemSeg(
        memSeg: Float32Array,
        offset: Point<Float32Array> = null,
        isRound: boolean = false
    ): Point<Int32Array>[] {
        const cleanTrashold: number = offset === null ? -1 : ClipperWrapper.CLEAN_TRASHOLD;
        const pointCount: number = memSeg.length >> 1;
        const result: PointI32[] = [];
        const point: PointF32 = PointF32.create();
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            point.fromMemSeg(memSeg, i);

            if (offset !== null) {
                point.add(offset);
            }

            point.scaleUp(ClipperWrapper.CLIPPER_SCALE);

            if (isRound) {
                point.round();
            }

            result.push(PointI32.from(point));
        }

        return cleanTrashold !== -1 ? ClipperWrapper.cleanPolygon(result, cleanTrashold) : result;
    }

    public static toMemSeg(polygon: Point<Int32Array>[], memSeg: Float32Array = null): Float32Array {
        const pointCount: number = polygon.length;
        const result: Float32Array = memSeg ? memSeg : new Float32Array(pointCount << 1);
        const tempPoint: PointF32 = PointF32.create();
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            tempPoint.update(polygon[i]).scaleDown(ClipperWrapper.CLIPPER_SCALE);
            tempPoint.fill(result, i);
        }

        return result;
    }

    public static applyNfps(nfpBuffer: ArrayBuffer, offset: Point<Float32Array>): Point<Int32Array>[][] {
        const nfpWrapper: NFPWrapper = new NFPWrapper(nfpBuffer);
        const nfpCount: number = nfpWrapper.count;
        let clone: Point<Int32Array>[] = null;
        let memSeg: Float32Array = null;
        let i: number = 0;

        const result: Point<Int32Array>[][] = [];

        for (i = 0; i < nfpCount; ++i) {
            memSeg = nfpWrapper.getNFPMemSeg(i);
            clone = ClipperWrapper.fromMemSeg(memSeg, offset);

            if (ClipperWrapper.absArea(clone) > ClipperWrapper.AREA_TRASHOLD) {
                result.push(clone);
            }
        }

        return result;
    }

    public static nfpToClipper(nfpWrapper: NFPWrapper): Point<Int32Array>[][] {
        const nfpCount: number = nfpWrapper.count;
        const result = [];
        let memSeg: Float32Array = null;
        let i: number = 0;

        for (i = 0; i < nfpCount; ++i) {
            memSeg = nfpWrapper.getNFPMemSeg(i)
            result.push(ClipperWrapper.fromMemSeg(memSeg, null, true));
        }

        return result;
    }

    public static getFinalNfps(
        placeContent: PlaceContent,
        placed: PolygonNode[],
        path: PolygonNode,
        binNfp: NFPWrapper,
        placement: number[]
    ): Point<Int32Array>[][] | null {
        const tmpPoint: Point<Float32Array> = PointF32.create();
        let i: number = 0;
        let key: number = 0;

        let totalNfps: Point<Int32Array>[][] = [];

        for (i = 0; i < placed.length; ++i) {
            key = generateNFPCacheKey(placeContent.rotations, false, placed[i], path);

            if (!placeContent.nfpCache.has(key)) {
                continue;
            }

            tmpPoint.fromMemSeg(placement, i);

            totalNfps = totalNfps.concat(
                ClipperWrapper.applyNfps(placeContent.nfpCache.get(key), tmpPoint)
            );
        }

            const wasmRes = get_combined_nfps_wasm(
                ClipperWrapper.serializePolygons(totalNfps)
            );

            const combinedNfp = ClipperWrapper.deserializePolygons(wasmRes);


        if (combinedNfp.length === 0) {
            return null;
        }

        // difference with bin polygon
        const clipperBinNfp: Point<Int32Array>[][] = ClipperWrapper.nfpToClipper(binNfp);

        const wasmResult = get_final_nfp_wasm(
            ClipperWrapper.serializePolygons(combinedNfp),
            ClipperWrapper.serializePolygons(clipperBinNfp)
        )

        const finalNfp = ClipperWrapper.deserializePolygons(wasmResult);


        return finalNfp.length === 0 ? null : finalNfp;
    }

    /**
     * Serialize polygons to a flat Int32Array
     * Format: [polygon_count, size1, size2, ..., sizeN, x0, y0, x1, y1, ...]
     * 
     * @param polygons - Array of polygons to serialize
     * @returns Flat Int32Array containing polygon count, sizes, and coordinates
     */
    public static serializePolygons(polygons: Point<Int32Array>[][]): Int32Array {
        const polygonCount = polygons.length;

        if (polygonCount === 0) {
            return new Int32Array([0]);
        }

        // Calculate total size needed
        let totalCoords = 0;
        for (let i = 0; i < polygonCount; ++i) {
            totalCoords += polygons[i].length * 2; // x, y for each point
        }

        const result = new Int32Array(1 + polygonCount + totalCoords);
        let index = 0;

        // Write polygon count
        result[index++] = polygonCount;

        // Write sizes
        for (let i = 0; i < polygonCount; ++i) {
            result[index++] = polygons[i].length * 2; // Size in coordinates (x, y pairs)
        }

        // Write coordinates
        for (let i = 0; i < polygonCount; ++i) {
            const polygon = polygons[i];
            for (let j = 0; j < polygon.length; ++j) {
                result[index++] = polygon[j].x;
                result[index++] = polygon[j].y;
            }
        }

        return result;
    }

    /**
     * Deserialize polygons from a flat Int32Array
     * Format: [polygon_count, size1, size2, ..., sizeN, x0, y0, x1, y1, ...]
     * 
     * @param data - Flat Int32Array containing serialized polygon data
     * @returns Array of polygons
     */
    public static deserializePolygons(data: Int32Array): Point<Int32Array>[][] {
        if (data.length === 0) {
            return [];
        }

        const polygonCount = data[0];
        if (polygonCount === 0 || data.length < 1 + polygonCount) {
            return [];
        }

        const result: Point<Int32Array>[][] = [];
        let dataIndex = 1 + polygonCount; // Skip count + all sizes

        for (let i = 0; i < polygonCount; ++i) {
            const size = data[1 + i];
            const pointCount = size / 2;

            if (dataIndex + size > data.length) {
                // Invalid data - not enough coordinates
                break;
            }

            const polygon: Point<Int32Array>[] = [];
            for (let j = 0; j < pointCount; ++j) {
                const x = data[dataIndex + j * 2];
                const y = data[dataIndex + j * 2 + 1];
                polygon.push(PointI32.create(x, y));
            }

            result.push(polygon);
            dataIndex += size;
        }

        return result;
    }

    private static cleanPolygon(path: Point<Int32Array>[], distance: number): Point<Int32Array>[] {
        const polyData = new Int32Array(path.reduce<number[]>((acc: number[], point: Point<Int32Array>) => acc.concat([point.x, point.y]), []));
        const cleanedData = clean_polygon_wasm(polyData, distance);
        const pointCount = cleanedData.length / 2;

        const result: Point<Int32Array>[] = new Array(pointCount);

        for (let i = 0; i < pointCount; i++) {
            result[i] = PointI32.create(cleanedData[i * 2], cleanedData[i * 2 + 1]);
        }

        return result;
    }

    private static absArea(poly: Point<Int32Array>[]): number {
        const polyData = new Int32Array(poly.reduce<number[]>((acc: number[], point: Point<Int32Array>) => acc.concat([point.x, point.y]), []));
    
        return Math.abs(polygon_area_i32(polyData));
    }

    private static CLIPPER_SCALE: number = 100;

    public static AREA_TRASHOLD: number = 0.1 * ClipperWrapper.CLIPPER_SCALE * ClipperWrapper.CLIPPER_SCALE;

    public static CLEAN_TRASHOLD: number = 0.0001 * ClipperWrapper.CLIPPER_SCALE;
}
