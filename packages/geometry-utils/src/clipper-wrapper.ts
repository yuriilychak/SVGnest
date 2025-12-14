import type { BoundRect, NestConfig, Polygon, PolygonNode } from './types';
import { getPolygonNode } from './helpers';
import { PointF32, PolygonF32 } from './geometry';
import { clean_node_inner_wasm, offset_node_inner_wasm } from 'wasm-nesting';
export default class ClipperWrapper {

    private polygon: Polygon<Float32Array>;

    constructor() {
        this.polygon = new PolygonF32();
    }

    public generateBounds(memSeg: Float32Array, spacing: number, curveTolerance: number): {
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

        this.cleanNode(binNode, curveTolerance);
        this.offsetNode(binNode, -1, spacing, curveTolerance);

        this.polygon.bind(binNode.memSeg);
        this.polygon.resetPosition();

        const resultBounds = this.polygon.exportBounds();
        const area: number = this.polygon.area;

        return { binNode, bounds, resultBounds, area };
    }

    public generateTree(memSegs: Float32Array[], spacing: number, curveTolerance: number): PolygonNode[] {
        const point: PointF32 = PointF32.create();
        const trashold = curveTolerance * curveTolerance;
        const nodes: PolygonNode[] = [];
        const nodeCount: number = memSegs.length;
        let memSeg: Float32Array = null;
        let node: PolygonNode = null;
        let i: number = 0;

        for (let i = 0; i < nodeCount; ++i) {
            memSeg = memSegs[i];
            node = getPolygonNode(i, memSeg);

            this.cleanNode(node, curveTolerance);

            this.polygon.bind(node.memSeg);

            if (this.polygon.isBroken || this.polygon.absArea <= trashold) {
                console.warn('Can not parse polygon', i);
                continue;
            }

            nodes.push(node);
        }

        // turn the list into a tree
        this.nestPolygons(point, nodes);

        this.offsetNodes(nodes, 1, spacing, curveTolerance);

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
        // assign a unique id to each leaf
        let nodeCount: number = nodes.length;
        let outerNode: PolygonNode = null;
        let innerNode: PolygonNode = null;
        let isChild: boolean = false;

        for (let i = 0; i < nodeCount; ++i) {
            outerNode = nodes[i];
            isChild = false;
            point.fromMemSeg(outerNode.memSeg);

            for (let j = 0; j < nodeCount; ++j) {
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

        for (let i = 0; i < nodeCount; ++i) {
            if (parents.indexOf(nodes[i]) < 0) {
                nodes.splice(i, 1);
                --nodeCount;
                --i;
            }
        }

        const parentCount: number = parents.length;
        let parent: PolygonNode = null;

        for (let i = 0; i < parentCount; ++i) {
            parent = parents[i];

            if (parent.children) {
                this.nestPolygons(point, parent.children);
            }
        }
    }

    private offsetNodes(nodes: PolygonNode[], sign: number, spacing: number, curveTolerance: number): void {
        const nodeCont: number = nodes.length;
        let node: PolygonNode = null;
        let i: number = 0;

        for (i = 0; i < nodeCont; ++i) {
            node = nodes[i];
            this.offsetNode(node, sign, spacing, curveTolerance);
            this.offsetNodes(node.children, -sign, spacing, curveTolerance);
        }
    }

    private offsetNode(node: PolygonNode, sign: number, spacing: number, curveTolerance: number): void {
        node.memSeg = offset_node_inner_wasm(node.memSeg, sign, spacing, curveTolerance);
    }


    private cleanNode(node: PolygonNode, curveTolerance: number): void {
        const res = clean_node_inner_wasm(node.memSeg, curveTolerance);

        if (res.length) {
            node.memSeg = res;
        }
    }

    public static CLIPPER_SCALE: number = 100;

    public static AREA_TRASHOLD: number = 0.1 * ClipperWrapper.CLIPPER_SCALE * ClipperWrapper.CLIPPER_SCALE;

    public static CLEAN_TRASHOLD: number = 0.0001 * ClipperWrapper.CLIPPER_SCALE;
}
