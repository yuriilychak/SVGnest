export enum PolyFillType {
    NonZero = 1,
    Positive = 2,
    Negative = 3
}

export enum PolyType {
    Subject = 0,
    Clip = 1
}

export enum ClipType {
    Union = 1,
    Difference = 2
}

export enum Direction {
    Left = 0,
    Right = 1
}

export enum EdgeSide {
    Current = 0,
    Bottom = 1,
    Top = 2,
    Delta = 3
}

export enum BoolCondition {
    Unequal = 0,
    Equal = 1,
    Greater = 2,
    GreaterOrEqual = 3,
    Less = 4,
    LessOrEqual = 5
}