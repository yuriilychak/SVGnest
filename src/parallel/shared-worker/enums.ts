export enum PolyType {
  Subject = 0,
  Clip = 1
}

export enum ClipType {
  Intersection = 0,
  Union = 1,
  Difference = 2,
  Xor = 3
}

export enum PolyFillType {
  EvenOdd = 0,
  NonZero = 1,
  Positive = 2,
  Negative = 3
}

export enum EdgeSide {
  Left = 0,
  Right = 1
}

export enum Direction {
  RightToLeft = 0,
  LeftToRight = 1
}

export enum EndType {
  OpenSquare = 0,
  OpenRound = 1,
  OpenButt = 2,
  ClosedLine = 3,
  ClosedPolygon = 4
}

export enum JoinType {
  Square = 0,
  Round = 1,
  Miter = 2
}
