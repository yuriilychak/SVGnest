export type NestConfig = {
    curveTolerance: number;
    spacing: number;
    rotations: number;
    populationSize: number;
    mutationRate: number;
    useHoles: boolean;
};

export enum THREAD_TYPE {
    PLACEMENT = 1,
    PAIR = 0
}

export type NFPCache = Map<number, ArrayBuffer>;

export interface BoundRect<T extends TypedArray> {
    clone(): BoundRect<T>;

    from(rect: BoundRect<T>): void;

    clean(): void;

    readonly x: number;

    readonly y: number;

    readonly width: number;

    readonly height: number;
}

export type SourceItem = {
    source: u16;
    children: SourceItem[];
} 
export interface IPlacementWrapper {
    readonly placePercentage: number; 
    readonly numPlacedParts: number; 
    readonly numParts: number;
    readonly boundsX: number;
    readonly boundsY: number;
    readonly boundsWidth: number;
    readonly boundsHeight: number;
    readonly angleSplit: number;
    readonly hasResult: boolean;
    readonly sources: SourceItem[];
    readonly placementsData: Float32Array;
}

export type DisplayCallback = (placementWrapper: IPlacementWrapper) => void;

export type PolygonNode = {
    source: number;
    rotation: number;
    memSeg: Float32Array;
    children: PolygonNode[];
};

export type FlattenedData = { sources: number[]; holes: number[] };

export type CalculateConfig = { pointPool: unknown; isInit: boolean };

export type TypedArray = Float32Array | Float64Array | Uint16Array | Uint8Array | Uint32Array | Int16Array | Int8Array | Int32Array;

export type f32 = number;

export type u32 = number;

export type i32 = number;

export type u16 = number;

export type usize = number;

export type isize = number;

export type u8 = number;