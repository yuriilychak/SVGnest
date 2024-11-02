export type NestConfig = {
    readonly curveTolerance: number;
    readonly spacing: number;
    readonly rotations: number;
    readonly populationSize: number;
    readonly mutationRate: number;
    readonly useHoles: boolean;
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
