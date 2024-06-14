import { SVGPathSeg } from './svg-path-seg';
import { SVGPathSegList } from './svg-path-seg-list';

export default interface SVGPathSegElement extends SVGSVGElement {
    pathSegList: SVGPathSegList
    createSVGPathSegLinetoHorizontalAbs(x: number): SVGPathSeg
    createSVGPathSegLinetoHorizontalRel(x: number): SVGPathSeg
    createSVGPathSegLinetoVerticalAbs(y: number): SVGPathSeg
    createSVGPathSegLinetoVerticalRel(x: number, y: number): SVGPathSeg
    createSVGPathSegLinetoAbs(x: number, y: number): SVGPathSeg
    createSVGPathSegLinetoRel(x: number, y: number): SVGPathSeg
    createSVGPathSegMovetoAbs(x: number, y: number): SVGPathSeg
    createSVGPathSegMovetoRel(x: number, y: number): SVGPathSeg
    createSVGPathSegCurvetoQuadraticSmoothAbs(x: number, y: number): SVGPathSeg
    createSVGPathSegCurvetoQuadraticSmoothRel(x: number, y: number): SVGPathSeg
    createSVGPathSegCurvetoCubicAbs(x: number, y: number, x1: number, y1: number, x2: number, y2: number): SVGPathSeg
    createSVGPathSegCurvetoCubicRel(x: number, y: number, x1: number, y1: number, x2: number, y2: number): SVGPathSeg
    createSVGPathSegCurvetoCubicSmoothAbs(x: number, y: number, x1: number, y1: number): SVGPathSeg
    createSVGPathSegCurvetoCubicSmoothRel(x: number, y: number, x1: number, y1: number): SVGPathSeg
    createSVGPathSegCurvetoQuadraticAbs(x: number, y: number, x1: number, y1: number): SVGPathSeg
    createSVGPathSegCurvetoQuadraticRel(x: number, y: number, x1: number, y1: number): SVGPathSeg
    createSVGPathSegArcAbs(
        x: number,
        y: number,
        rx: number,
        ry: number,
        angle: number,
        theta: number,
        exteent: number
    ): SVGPathSeg
    createSVGPathSegArcRel(
        x: number,
        y: number,
        rx: number,
        ry: number,
        angle: number,
        theta: number,
        exteent: number
    ): SVGPathSeg
    createSVGPathSegClosePath(): SVGPathSeg
    getPathSegAtLength(distance?: number): number
    getTotalLength(): number
}
