import SVGPathSegClosePath from './svg-path-seg-close-path';
import SVGPathSegMovetoAbs from './svg-path-seg-move-to-abs';
import SVGPathSegMovetoRel from './svg-path-seg-move-to-rel';
import SVGPathSegLinetoAbs from './svg-path-seg-line-to-abs';
import SVGPathSegLinetoRel from './svg-path-seg-line-to-rel';
import SVGPathSegCurvetoCubicAbs from './svg-path-seg-curve-to-cubic-abs';
import SVGPathSegCurvetoCubicRel from './svg-path-seg-curve-to-cubic-rel';
import SVGPathSegCurvetoQuadraticAbs from './svg-path-seg-curve-to-quadratic-abs';
import SVGPathSegCurvetoQuadraticRel from './svg-path-seg-curve-to-quadratic-rel';
import SVGPathSegArcAbs from './svg-path-seg-arc-abs';
import SVGPathSegArcRel from './svg-path-seg-arc-rel';
import SVGPathSegLinetoHorizontalAbs from './svg-path-seg-line-to-horizontal-abs';
import SVGPathSegLinetoHorizontalRel from './svg-path-seg-line-to-horizontal-rel';
import SVGPathSegLinetoVerticalAbs from './svg-path-seg-line-to-vertical-abs';
import SVGPathSegLinetoVerticalRel from './svg-path-seg-line-to-vertical-rel';
import SVGPathSegCurvetoCubicSmoothAbs from './svg-path-seg-curve-to-cubic-smooth-abs';
import SVGPathSegCurvetoCubicSmoothRel from './svg-path-seg-curve-to-cubic-smooth-rel';
import SVGPathSegCurvetoQuadraticSmoothAbs from './svg-path-seg-curve-to-quadratic-smooth-abs';
import SVGPathSegCurvetoQuadraticSmoothRel from './svg-path-seg-curve-to-quadratic-smooth-rel';
import SVGPathPointSeg from './svg-path-point-seg';

export type SVGPathSeg =
    | SVGPathSegClosePath
    | SVGPathSegMovetoAbs
    | SVGPathSegMovetoRel
    | SVGPathSegLinetoAbs
    | SVGPathSegLinetoRel
    | SVGPathSegCurvetoCubicAbs
    | SVGPathSegCurvetoCubicRel
    | SVGPathSegCurvetoQuadraticAbs
    | SVGPathSegCurvetoQuadraticRel
    | SVGPathSegArcAbs
    | SVGPathSegArcRel
    | SVGPathSegLinetoHorizontalAbs
    | SVGPathSegLinetoHorizontalRel
    | SVGPathSegLinetoVerticalAbs
    | SVGPathSegLinetoVerticalRel
    | SVGPathSegCurvetoCubicSmoothAbs
    | SVGPathSegCurvetoCubicSmoothRel
    | SVGPathSegCurvetoQuadraticSmoothAbs
    | SVGPathSegCurvetoQuadraticSmoothRel
    | SVGPathPointSeg
