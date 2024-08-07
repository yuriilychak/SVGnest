export enum PATH_COMMAND {
    M = 'M',
    L = 'L',
    H = 'H',
    V = 'V',
    C = 'C',
    S = 'S',
    Q = 'Q',
    T = 'T',
    A = 'A',
    Z = 'Z',
    m = 'm',
    l = 'l',
    h = 'h',
    v = 'v',
    c = 'c',
    s = 's',
    q = 'q',
    t = 't',
    a = 'a',
    z = 'z'
}

export enum SVG_TAG {
    LINE = 'line',
    CIRCLE = 'circle',
    ELLIPSE = 'ellipse',
    PATH = 'path',
    POLYGON = 'polygon',
    POLYLINE = 'polyline',
    RECT = 'rect',
    G = 'g',
    SVG = 'svg',
    DEFS = 'defs',
    CLIP_PATH = 'clipPath'
}

export interface IPoint {
    id?: number;
    rotation?: number;
    x: number;
    y: number;
}

export type SVGProperty = number | string;

export enum SEGMENT_KEYS {
    X = 'x',
    Y = 'y',
    X1 = 'x1',
    Y1 = 'y1',
    X2 = 'x2',
    Y2 = 'y2'
}

export enum MATRIX_OPERATIONS {
    MATRIX = 'matrix',
    SCALE = 'scale',
    ROTATE = 'rotate',
    TRANSLATE = 'translate',
    SKEW_X = 'skewX',
    SKEW_Y = 'skewY',
    NONE = ''
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

export interface IClipperWrapper {
    cleanPolygon(polygon: IPoint[]): IPoint[];
    generateTree(tree: IPolygon[]): void;
}
