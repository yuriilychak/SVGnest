export type NestConfig = {
    curveTolerance: number;
    spacing: number;
    rotations: number;
    populationSize: number;
    mutationRate: number;
    useHoles: boolean;
};

export type NFPContent = {
    A: number;
    B: number;
    inside: boolean;
    Arotation: number;
    Brotation: number;
};

export type DisplayCallback = (placement: string, placePerecntage: number, lacedParts: number, partCount: number) => void;

export type PolygonNode = {
    source: number;
    rotation: number;
    memSeg: Float64Array;
    children: PolygonNode[];
};

export type NFPCache = Map<number, ArrayBuffer>;

export enum THREAD_TYPE {
    PLACEMENT = 1,
    PAIR = 0
}
