export interface SvgConfig {
  tolerance: number; // max bound for bezier->line segment conversion, in native SVG units
  toleranceSvg: number; // fudge factor for browser inaccuracy in SVG unit handling
}

export interface DOMSegment extends DOMPoint {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  r1: number;
  r2: number;
  angle: number;
  largeArcFlag: number;
  sweepFlag: number;
  pathSegTypeAsLetter: string;
}

export interface SVGSegList {
  readonly length: number;
  readonly numberOfItems: number;
  appendItem(newItem: DOMSegment): DOMSegment;
  clear(): void;
  getItem(index: number): DOMSegment;
  initialize(newItem: DOMPoint): DOMSegment;
  insertItemBefore(newItem: DOMSegment, index: number): DOMSegment;
  removeItem(index: number): DOMSegment;
  replaceItem(newItem: DOMSegment, index: number): DOMSegment;
  [index: number]: DOMSegment;
}

export interface SVGPathSegElement extends SVGSVGElement {
  createSVGPathSegMovetoAbs(x: number, y: number): DOMSegment;
  createSVGPathSegLinetoAbs(x: number, y: number): DOMSegment;
  createSVGPathSegLinetoHorizontalAbs(x: number): DOMSegment;
  createSVGPathSegLinetoVerticalAbs(y: number): DOMSegment;
  createSVGPathSegCurvetoCubicAbs(
    x: number,
    y: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): DOMSegment;
  createSVGPathSegCurvetoCubicSmoothAbs(
    x: number,
    y: number,
    x2: number,
    y2: number
  ): DOMSegment;
  createSVGPathSegCurvetoQuadraticAbs(
    x: number,
    y: number,
    x1: number,
    y1: number
  ): DOMSegment;
  createSVGPathSegCurvetoQuadraticSmoothAbs(x: number, y: number): DOMSegment;
  createSVGPathSegArcAbs(
    x: number,
    y: number,
    r1: number,
    r2: number,
    angle: number,
    largeArcFlag: number,
    sweepFlag: number
  ): DOMSegment;
  createSVGPathSegClosePath(): DOMSegment;
  pathSegList: SVGSegList;
  points: SVGPointList;
}
