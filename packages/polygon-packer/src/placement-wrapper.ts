import { PolygonNode } from "./types";
import { deserializeNodes } from "./helpers";

export default class PlacementWrapper {
    #buffer: ArrayBuffer;

    #view: DataView;

    constructor(buffer: ArrayBuffer) {
        this.#buffer = buffer;
        this.#view = new DataView(this.#buffer);
    }

    get placePercentage(): number {
        return this.#view.getFloat32(0, true);
    }

    get numPlacedParts(): number {
        return this.#view.getUint16(4, true);
    }

    get numParts(): number {
        return this.#view.getUint16(6, true);
    }

    get angleSplit(): number {
        return this.#view.getUint8(8);
    }

    get hasResult(): boolean {
        return this.#view.getUint8(9) === 1;
    }

    get bounds() {
        const boundsX = this.#view.getFloat32(10, true);
        const boundsY = this.#view.getFloat32(14, true);
        const boundsWidth = this.#view.getFloat32(18, true);
        const boundsHeight = this.#view.getFloat32(22, true);

        return { x: boundsX, y: boundsY, width: boundsWidth, height: boundsHeight };
    }

    get nodes(): PolygonNode[] {
        // Buffer structure from getPlacementResult:
        // 0-4: placePercentage (f32)
        // 4-6: numPlacedParts (u16)
        // 6-8: numParts (u16)
        // 8-9: angleSplit (u8)
        // 9-10: hasResult (u8)
        // 10-26: bounds (4x f32)
        // 26-30: nodesSegmentSize (u32)
        // 30-34: placementSegmentSize (u32)
        // 34+: serialized nodes (includes node count at start)

        const nodesSegmentSize = this.#view.getUint32(26, true);

        if (nodesSegmentSize === 0) {
            return [];
        }

        // Nodes segment starts at offset 34
        // First read the node count from the beginning of the nodes segment
        // Note: serializePolygonNodes writes without little-endian flag, so we read without it too
        const nodeCount = this.#view.getUint32(34);

        if (nodeCount === 0 || isNaN(nodeCount) || nodeCount > 10000) {
            return [];
        }

        const nodes = new Array<PolygonNode>(nodeCount);

        // Deserialize nodes starting after the count (offset 34 + 4 bytes)
        // Note: deserializeNodes expects little-endian, but the data from serializeNodes is big-endian
        // This is a bug in helpers.ts serialize/deserialize mismatch
        deserializeNodes(nodes, this.#view, this.#buffer, 38);

        return nodes;
    }

    get placementsData(): Float32Array {
        // Buffer structure from getPlacementResult:
        // 26-30: nodesSegmentSize (u32)
        // 30-34: placementSegmentSize (u32)
        // 34+nodesSegmentSize: placement data

        const nodesSegmentSize = this.#view.getUint32(26, true);
        const placementSegmentSize = this.#view.getUint32(30, true);

        if (placementSegmentSize === 0) {
            return new Float32Array(0);
        }

        // Placement data starts after nodes segment
        const placementOffset = 34 + nodesSegmentSize;

        // Create Float32Array view of the placement data
        return new Float32Array(
            this.#buffer,
            placementOffset,
            placementSegmentSize / Float32Array.BYTES_PER_ELEMENT
        );
    }
}