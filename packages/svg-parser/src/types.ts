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

export enum PATH_SEGMENT_TYPE {
    UNKNOWN = 0,
    CLOSEPATH = 1,
    MOVETO_ABS = 2,
    MOVETO_REL = 3,
    LINETO_ABS = 4,
    LINETO_REL = 5,
    CURVETO_CUBIC_ABS = 6,
    CURVETO_CUBIC_REL = 7,
    CURVETO_QUADRATIC_ABS = 8,
    CURVETO_QUADRATIC_REL = 9,
    ARC_ABS = 10,
    ARC_REL = 11,
    LINETO_HORIZONTAL_ABS = 12,
    LINETO_HORIZONTAL_REL = 13,
    LINETO_VERTICAL_ABS = 14,
    LINETO_VERTICAL_REL = 15,
    CURVETO_CUBIC_SMOOTH_ABS = 16,
    CURVETO_CUBIC_SMOOTH_REL = 17,
    CURVETO_QUADRATIC_SMOOTH_ABS = 18,
    CURVETO_QUADRATIC_SMOOTH_REL = 19
}
