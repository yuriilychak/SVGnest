export type NestConfig = {
    curveTolerance: number;
    spacing: number;
    rotations: number;
    populationSize: number;
    mutationRate: number;
    useHoles: boolean;
};

export type BoundRectF32 = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export enum THREAD_TYPE {
    PLACEMENT = 1,
    PAIR = 0
}

export type NFPCache = Map<number, ArrayBuffer>;

export type PlacementData = {
    placementsData: Float32Array;
    nodes: PolygonNode[];
    bounds: BoundRectF32;
    angleSplit: number;
};

export type DisplayCallback = (
    placementsData: PlacementData,
    placePerecntage: number,
    lacedParts: number,
    partCount: number
) => void;

export type PolygonNode = {
    source: number;
    rotation: number;
    memSeg: Float32Array;
    children: PolygonNode[];
};

export type CalculateConfig = { pointPool: unknown; isInit: boolean };
