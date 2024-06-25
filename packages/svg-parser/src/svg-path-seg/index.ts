import { default as SVGPathQuadraticSeg } from './svg-path-quadratic-seg';
import { default as SVGPathCubicSeg } from './svg-path-cubic-seg';
import { default as SVGPathPointSeg } from './svg-path-point-seg';
import { default as SVGPathCubicSmoothSeg } from './svg-path-cubic-smooth-seg';
import { default as SVGPathHorizontalSeg } from './svg-path-horizontal-seg';
import { default as SVGPathVerticalSeg } from './svg-path-vertical-seg';
import { default as SVGPathArcSeg } from './svg-path-arc-seg';
import { default as SVGPathBaseSeg } from './svg-path-base-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export { default as SVGPathCubicSeg } from './svg-path-cubic-seg';
export { default as SVGPathPointSeg } from './svg-path-point-seg';
export { default as SVGPathCubicSmoothSeg } from './svg-path-cubic-smooth-seg';
export { default as SVGPathHorizontalSeg } from './svg-path-horizontal-seg';
export { default as SVGPathVerticalSeg } from './svg-path-vertical-seg';
export { default as SVGPathArcSeg } from './svg-path-arc-seg';
export { default as SVGPathBaseSeg } from './svg-path-base-seg';

export type SVGPathSeg =
    | SVGPathBaseSeg
    | SVGPathArcSeg
    | SVGPathQuadraticSeg
    | SVGPathCubicSeg
    | SVGPathCubicSmoothSeg
    | SVGPathHorizontalSeg
    | SVGPathVerticalSeg
    | SVGPathPointSeg;

export const TYPE_TO_SEGMENT = new Map<PATH_SEGMENT_TYPE, typeof SVGPathBaseSeg>([
    [PATH_SEGMENT_TYPE.LINETO_ABS, SVGPathPointSeg],
    [PATH_SEGMENT_TYPE.LINETO_REL, SVGPathPointSeg],
    [PATH_SEGMENT_TYPE.MOVETO_ABS, SVGPathPointSeg],
    [PATH_SEGMENT_TYPE.MOVETO_REL, SVGPathPointSeg],
    [PATH_SEGMENT_TYPE.CURVETO_QUADRATIC_SMOOTH_ABS, SVGPathPointSeg],
    [PATH_SEGMENT_TYPE.CURVETO_QUADRATIC_SMOOTH_REL, SVGPathPointSeg],
    [PATH_SEGMENT_TYPE.LINETO_HORIZONTAL_REL, SVGPathHorizontalSeg],
    [PATH_SEGMENT_TYPE.LINETO_HORIZONTAL_ABS, SVGPathHorizontalSeg],
    [PATH_SEGMENT_TYPE.LINETO_VERTICAL_REL, SVGPathVerticalSeg],
    [PATH_SEGMENT_TYPE.LINETO_VERTICAL_ABS, SVGPathVerticalSeg],
    [PATH_SEGMENT_TYPE.CLOSEPATH, SVGPathBaseSeg],
    [PATH_SEGMENT_TYPE.CURVETO_CUBIC_REL, SVGPathCubicSeg],
    [PATH_SEGMENT_TYPE.CURVETO_CUBIC_ABS, SVGPathCubicSeg],
    [PATH_SEGMENT_TYPE.CURVETO_CUBIC_SMOOTH_ABS, SVGPathCubicSmoothSeg],
    [PATH_SEGMENT_TYPE.CURVETO_CUBIC_SMOOTH_REL, SVGPathCubicSmoothSeg],
    [PATH_SEGMENT_TYPE.CURVETO_QUADRATIC_ABS, SVGPathQuadraticSeg],
    [PATH_SEGMENT_TYPE.CURVETO_QUADRATIC_REL, SVGPathQuadraticSeg],
    [PATH_SEGMENT_TYPE.ARC_ABS, SVGPathArcSeg],
    [PATH_SEGMENT_TYPE.ARC_REL, SVGPathArcSeg]
]);
