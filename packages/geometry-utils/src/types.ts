export interface IPoint {
    x: number;
    y: number;
}

export interface IPolygon extends Array<IPoint> {
    id: number;
    source: number;
    hole?: boolean;
    parent: IPolygon;
    children: IPolygon[];
    x?: number;
    y?: number;
    rotation?: number;
    width?: number;
    height?: number;
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

export type NFPContent = {
    A: number;
    B: number;
    inside: boolean;
    Arotation: number;
    Brotation: number;
};

export type NFPPair = {
    A: IPolygon;
    B: IPolygon;
    key: number;
};

export type PlacementWorkerData = {
    angleSplit: number;
    binPolygon: IPolygon;
    paths: IPolygon[];
    ids: number[];
    rotations: number[];
    config: NestConfig;
    nfpCache: Map<number, ArrayBuffer>;
};

export type DisplayCallback = (placement: string, placePerecntage: number, lacedParts: number, partCount: number) => void;
