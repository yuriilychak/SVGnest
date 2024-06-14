export enum PATH_TAG {
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
    x: number
    y: number
}

export interface ISvgPath {
    x: number
    y: number
    x1: number
    y1: number
    x2: number
    y2: number
    r1: number
    r2: number
    angle: number
    largeArcFlag: number
    sweepFlag: number
    pathSegTypeAsLetter: string
}

export interface ISVGPathList {
    readonly length: number
    readonly numberOfItems: number
    appendItem(newItem: ISvgPath): ISvgPath
    clear(): void
    getItem(index: number): ISvgPath
    initialize(newItem: ISvgPath): ISvgPath
    insertItemBefore(newItem: ISvgPath, index: number): ISvgPath
    removeItem(index: number): ISvgPath
    replaceItem(newItem: ISvgPath, index: number): ISvgPath
    [index: number]: ISvgPath
}

export type SVGProperty = number | string

export interface ISVGPathElement extends SVGSVGElement {
    pathSegList: ISVGPathList
    createSVGPathSegLinetoHorizontalAbs(x: SVGProperty): ISvgPath
    createSVGPathSegLinetoVerticalAbs(y: SVGProperty): ISvgPath
    createSVGPathSegLinetoAbs(x: SVGProperty, y: SVGProperty): ISvgPath
    createSVGPathSegMovetoAbs(x: SVGProperty, y: SVGProperty): ISvgPath
    createSVGPathSegCurvetoQuadraticSmoothAbs(x: SVGProperty, y: SVGProperty): ISvgPath
    createSVGPathSegCurvetoCubicAbs(
        x: SVGProperty,
        y: SVGProperty,
        x1: SVGProperty,
        y1: SVGProperty,
        x2: SVGProperty,
        y2: SVGProperty
    ): ISvgPath
    createSVGPathSegCurvetoCubicSmoothAbs(x: SVGProperty, y: SVGProperty, x1: SVGProperty, y1: SVGProperty): ISvgPath
    createSVGPathSegCurvetoQuadraticAbs(x: SVGProperty, y: SVGProperty, x1: SVGProperty, y1: SVGProperty): ISvgPath
    createSVGPathSegArcAbs(
        x: SVGProperty,
        y: SVGProperty,
        rx: SVGProperty,
        ry: SVGProperty,
        angle: SVGProperty,
        theta: SVGProperty,
        exteent: SVGProperty
    ): ISvgPath
    createSVGPathSegClosePath(): ISvgPath
}

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
