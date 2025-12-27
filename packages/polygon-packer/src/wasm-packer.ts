import { get_u16_from_u32, abs_polygon_area } from 'wasm-nesting';
import GeneticAlgorithm from './genetic-algorithm';
import NFPStore from './nfp-store';
import { f32, NestConfig, SourceItem } from './types';
import { readUint32FromF32, generateTree, generateBounds, deserializeConfig } from './helpers';
import { BoundRectF32 } from './geometry';
import PolygonNode from './polygon-node';

export default class WasmPacker {

    #binNode: PolygonNode = null;

    #binArea: f32 = 0;

    #binBounds: BoundRectF32 = null;

    #resultBounds: BoundRectF32 = null;

    #best: Float32Array = null;

    #nodes: PolygonNode[] = [];

    #config: NestConfig = null;
    // progressCallback is called when progress is made
    // displayCallback is called when a new placement has been made
    public init(
        configuration: number,
        polygonData: Float32Array,
        sizes: Uint16Array,
    ): void {
        let offset = 0;
        const polygons: Float32Array[] = [];

        sizes.forEach((size: number) => {
            polygons.push(polygonData.subarray(offset, offset + size));
            offset += size;
        });

        const binPolygon = polygons.pop();
        this.#config = deserializeConfig(configuration);
        const binData = generateBounds(binPolygon, this.#config.spacing, this.#config.curveTolerance);

        this.#binNode = binData.binNode;
        this.#binBounds = binData.bounds;
        this.#resultBounds = binData.resultBounds;
        this.#binArea = binData.area;
        this.#nodes = generateTree(polygons, this.#config.spacing, this.#config.curveTolerance);

        GeneticAlgorithm.instance.init(this.#nodes, this.#resultBounds, this.#config);
    }

    public getPairs(): Float32Array {
        const individual = GeneticAlgorithm.instance.getIndividual(this.#nodes);
        NFPStore.instance.init(this.#nodes, this.#binNode, this.#config, individual.source, individual.placement, individual.rotation);

        const pairs = NFPStore.instance.nfpPairs;

        // Serialize pairs: count (f32) + [size (f32) + data] for each pair
        let totalSize = 1; // count as f32
        for (const pair of pairs) {
            totalSize += 1 + pair.length; // size as f32 + data
        }

        const buffer = new Float32Array(totalSize);
        let offset = 0;

        // Write count (as bits of u32)
        buffer[offset] = new Float32Array(new Uint32Array([pairs.length]).buffer)[0];
        offset += 1;

        // Write each pair
        for (const pair of pairs) {
            buffer[offset] = new Float32Array(new Uint32Array([pair.length]).buffer)[0];
            offset += 1;

            buffer.set(pair, offset);
            offset += pair.length;
        }

        return buffer;
    }

    public getPlacementData(generatedNfp: ArrayBuffer[]): Uint8Array {
        NFPStore.instance.update(generatedNfp);

        return NFPStore.instance.getPlacementData(this.#nodes, this.#binArea);
    }

    public getPlacemehntResult(placements: ArrayBuffer[]): Uint8Array {
        let placementsData: Float32Array = new Float32Array(placements[0]);
        let currentPlacement: Float32Array = null;

        GeneticAlgorithm.instance.updateFitness(NFPStore.instance.phenotypeSource, placementsData[0]);

        for (let i = 1; i < placements.length; ++i) {
            currentPlacement = new Float32Array(placements[i]);
            if (currentPlacement[0] < placementsData[0]) {
                placementsData = currentPlacement;
            }
        }

        let result = null;
        let numParts: number = 0;
        let numPlacedParts: number = 0;
        let placePerecntage: number = 0;

        if (!this.#best || placementsData[0] < this.#best[0]) {
            this.#best = placementsData;

            const binArea: number = Math.abs(this.#binArea);
            const placementCount = placementsData[1];
            let placedCount: number = 0;
            let placedArea: number = 0;
            let totalArea: number = 0;
            let pathId: number = 0;
            let itemData: number = 0;
            let offset: number = 0;
            let size: number = 0;

            for (let i = 0; i < placementCount; ++i) {
                totalArea += binArea;
                itemData = readUint32FromF32(placementsData, 2 + i);
                offset = get_u16_from_u32(itemData, 1);
                size = get_u16_from_u32(itemData, 0);
                placedCount += size;

                for (let j = 0; j < size; ++j) {
                    pathId = get_u16_from_u32(readUint32FromF32(placementsData, offset + j), 1);
                    placedArea += abs_polygon_area(this.#nodes[pathId].memSeg);
                }
            }

            numParts = NFPStore.instance.placementCount;
            numPlacedParts = placedCount;
            placePerecntage = placedArea / totalArea;
            result = { placementsData };
        }

        const serializedResult = WasmPacker.serializePlacementResult(
            placePerecntage,
            numPlacedParts,
            numParts,
            this.#config.rotations,
            result !== null,
            this.#binBounds,
            result ? WasmPacker.convertPolygonNodesToSourceItems(this.#nodes) : [],
            result ? result.placementsData : new Float32Array(0)
        );


        return serializedResult;
    }

    public stop(): void {
        this.#nodes = [];
        this.#best = null;
        this.#binNode = null;
        GeneticAlgorithm.instance.clean();
        NFPStore.instance.clean();
    }

    public get pairCount(): number {
        return NFPStore.instance.nfpPairsCount;
    }

    static serializePlacementResult(
        placePercentage: number,
        numPlacedParts: number,
        numParts: number,
        angleSplit: number,
        hasResult: boolean,
        bounds: BoundRectF32,
        sources: SourceItem[],
        placementsData: Float32Array
    ): Uint8Array {
        // Serialize sources to get the size
        const serializedSources = WasmPacker.serializeSourceItems(sources);
        const sourcesSize = serializedSources.byteLength;
        const placementsDataSize = placementsData.byteLength;

        // Calculate total buffer size:
        // placePercentage (4) + numPlacedParts (2) + numParts (2) + angleSplit (1) + hasResult (1)
        // + boundsX (4) + boundsY (4) + boundsWidth (4) + boundsHeight (4)
        // + sourcesSize (4) + placementsDataSize (4)
        // + serializedSources + serializedPlacementsData
        const headerSize = 4 + 2 + 2 + 1 + 1 + 4 + 4 + 4 + 4 + 4 + 4;
        const totalSize = headerSize + sourcesSize + placementsDataSize;

        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);
        let offset = 0;

        // Write header
        view.setFloat32(offset, placePercentage, true);
        offset += 4;

        view.setUint16(offset, numPlacedParts, true);
        offset += 2;

        view.setUint16(offset, numParts, true);
        offset += 2;

        view.setUint8(offset, angleSplit);
        offset += 1;

        view.setUint8(offset, hasResult ? 1 : 0);
        offset += 1;

        view.setFloat32(offset, bounds.x, true);
        offset += 4;

        view.setFloat32(offset, bounds.y, true);
        offset += 4;

        view.setFloat32(offset, bounds.width, true);
        offset += 4;

        view.setFloat32(offset, bounds.height, true);
        offset += 4;

        view.setUint32(offset, sourcesSize, true);
        offset += 4;

        view.setUint32(offset, placementsDataSize, true);
        offset += 4;

        // Write serialized sources
        new Uint8Array(buffer, offset, sourcesSize).set(serializedSources);
        offset += sourcesSize;

        // Write placements data
        new Uint8Array(buffer, offset, placementsDataSize).set(new Uint8Array(placementsData.buffer));

        return new Uint8Array(buffer);
    }

    private static convertPolygonNodesToSourceItems(nodes: PolygonNode[]): SourceItem[] {
        return nodes.map(node => WasmPacker.convertPolygonNodeToSourceItem(node));
    }

    private static convertPolygonNodeToSourceItem(node: PolygonNode): SourceItem {
        return {
            source: node.source,
            children: node.children.map(child => WasmPacker.convertPolygonNodeToSourceItem(child))
        };
    }

    private static calculateSourceItemsSize(items: SourceItem[]): number {
        return items.reduce((total, item) => {
            // Each item: u16 (source) + u16 (children count) = 4 bytes
            const itemSize = Uint16Array.BYTES_PER_ELEMENT * 2;
            return total + itemSize + WasmPacker.calculateSourceItemsSize(item.children);
        }, 0);
    }

    private static serializeSourceItemsInternal(items: SourceItem[], view: DataView, offset: number): number {
        let currentOffset = offset;

        for (const item of items) {
            // Write source (u16)
            view.setUint16(currentOffset, item.source, true);
            currentOffset += Uint16Array.BYTES_PER_ELEMENT;

            // Write children count (u16)
            view.setUint16(currentOffset, item.children.length, true);
            currentOffset += Uint16Array.BYTES_PER_ELEMENT;

            // Recursively serialize children
            currentOffset = WasmPacker.serializeSourceItemsInternal(item.children, view, currentOffset);
        }

        return currentOffset;
    }

    private static serializeSourceItems(items: SourceItem[]): Uint8Array {
        // Calculate total size: u16 (count) + items data
        const itemsSize = WasmPacker.calculateSourceItemsSize(items);
        const totalSize = Uint16Array.BYTES_PER_ELEMENT + itemsSize;

        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);

        // Write items count
        view.setUint16(0, items.length, true);

        // Serialize items
        WasmPacker.serializeSourceItemsInternal(items, view, Uint16Array.BYTES_PER_ELEMENT);

        return new Uint8Array(buffer);
    }
}
