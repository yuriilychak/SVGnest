export interface IPoint {
    x: number;
    y: number;
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
    buffer: ArrayBuffer;
    key: number;
};

export enum THREAD_TYPE {
    PLACEMENT = 'placement',
    PAIR = 'pair'
}

export type NFPCache = Map<number, ArrayBuffer>;

export type PlacementWorkerData = {
    angleSplit: number;
    binArea: number;
    nfpCache: NFPCache;
};

export type PlacementData = {
    placementsData: Float64Array;
    nodes: PolygonNode[];
    bounds: BoundRect;
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
    memSeg: Float64Array;
    children: PolygonNode[];
};

export type ThreadData =
    | {
          env: NestConfig | PlacementWorkerData;
          id: string;
          data: PolygonNode[] | ArrayBuffer;
      }
    | ArrayBuffer;

export type ThreadInput = PolygonNode[] | ArrayBuffer;

export type CalculateConfig = { pointPool: unknown; isInit: boolean };
