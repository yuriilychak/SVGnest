import { IPlacementWrapper, SourceItem } from "./types";
import { deserializeSourceItems } from "./helpers";

export default class PlacementWrapper implements IPlacementWrapper {
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

    get boundsX(): number {
        return this.#view.getFloat32(10, true);
    }

    get boundsY(): number {
        return this.#view.getFloat32(14, true);
    }

    get boundsWidth(): number {
        return this.#view.getFloat32(18, true);
    }

    get boundsHeight(): number {
        return this.#view.getFloat32(22, true);
    }

    get sources(): SourceItem[] {
        // Buffer structure:
        // 0-4: placePercentage (f32)
        // 4-6: numPlacedParts (u16)
        // 6-8: numParts (u16)
        // 8-9: angleSplit (u8)
        // 9-10: hasResult (u8)
        // 10-14: boundsX (f32)
        // 14-18: boundsY (f32)
        // 18-22: boundsWidth (f32)
        // 22-26: boundsHeight (f32)
        // 26-30: sourcesSize (u32)
        // 30-34: placementsDataSize (u32)
        // 34+: serialized sources

        const sourcesSize = this.#view.getUint32(26, true);

        if (sourcesSize === 0) {
            return [];
        }

        // Sources segment starts at offset 34
        const sourcesData = new Uint8Array(this.#buffer, 34, sourcesSize);

        return deserializeSourceItems(sourcesData);
    }

    get placementsData(): Float32Array {
        // Buffer structure:
        // 26-30: sourcesSize (u32)
        // 30-34: placementsDataSize (u32)
        // 34+sourcesSize: placements data

        const sourcesSize = this.#view.getUint32(26, true);
        const placementsDataSize = this.#view.getUint32(30, true);

        if (placementsDataSize === 0) {
            return new Float32Array(0);
        }

        // Placements data starts after sources segment
        const placementsOffset = 34 + sourcesSize;

        // Create Float32Array view of the placements data
        return new Float32Array(
            this.#buffer,
            placementsOffset,
            placementsDataSize / Float32Array.BYTES_PER_ELEMENT
        );
    }
}