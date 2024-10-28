export enum PolyFillType {
    pftEvenOdd = 0,
    pftNonZero = 1,
    pftPositive = 2,
    pftNegative = 3
}

export enum JoinType {
    jtSquare = 0,
    jtRound = 1,
    jtMiter = 2
}

export enum EndType {
    etOpenSquare = 0,
    etOpenRound = 1,
    etOpenButt = 2,
    etClosedLine = 3,
    etClosedPolygon = 4
}

export enum PolyType {
    ptSubject = 0,
    ptClip = 1
}

export enum ClipType {
    ctIntersection = 0,
    ctUnion = 1,
    ctDifference = 2,
    ctXor = 3
}

export enum EdgeSide {
    esLeft = 0,
    esRight = 1
}

export enum Direction {
    dRightToLeft = 0,
    dLeftToRight = 1
}

export type IClipperPoint = { X: number; Y: number };
