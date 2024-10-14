export interface IPoint {
    x: number;
    y: number;
}

export interface IPolygon extends Array<IPoint> {
    source: number;
    rotation?: number;
    children: IPolygon[];
}

export type NestConfig = {
    curveTolerance: number;
    spacing: number;
    rotations: number;
    populationSize: number;
    mutationRate: number;
    useHoles: boolean;
    exploreConcave: boolean;
};

export type BoundRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type NFPPair = {
    A: PolygonNode;
    B: PolygonNode;
    key: number;
};

export enum THREAD_TYPE {
    PLACEMENT = 'placement',
    PAIR = 'pair'
}

export type NFPCache = Map<number, ArrayBuffer>;

export type PlacementWorkerData = {
    angleSplit: number;
    binPolygon: IPolygon;
    paths: IPolygon[];
    ids: number[];
    rotations: number[];
    config: NestConfig;
    nfpCache: NFPCache;
};

export type DisplayCallback = (
    placementsData: PlacementData,
    placePerecntage: number,
    lacedParts: number,
    partCount: number
) => void;

export type PlacementData = {
    placementsData: Float64Array;
    tree: IPolygon[];
    bounds: BoundRect;
    angleSplit: number;
};

export type ThreadData = {
    env: NestConfig;
    id: string;
    data: IPolygon[] | NFPPair;
};

export type ThreadInput = IPolygon[] | NFPPair;

export type PolygonNode = {
    source: number;
    rotation: number;
    memSeg: Float64Array;
    children: PolygonNode[];
};
