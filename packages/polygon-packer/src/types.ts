export interface IPoint {
    id?: number;
    rotation?: number;
    x: number;
    y: number;
}

export interface IClipperPoint {
    X: number;
    Y: number;
}

export interface IPolygon extends Array<IPoint> {
    id: number;
    source: number;
    hole?: boolean;
    parent: IPolygon;
    children: IPolygon[];
    x?: number;
    y?: number;
    width?: number;
    height?: number;
}

export type NestConfig = {
    clipperScale: number;
    curveTolerance: number;
    spacing: number;
    rotations: number;
    populationSize: number;
    mutationRate: number;
    useHoles: boolean;
    exploreConcave: boolean;
};

export type Placement = {
    id: number;
    rotation: number;
    x: number;
    y: number;
};

export type BoundRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};
