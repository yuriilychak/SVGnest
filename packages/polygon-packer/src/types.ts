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
