import EllipseBuilder from './ellipse-builder';
import CircleBuilder from './circle-builder';
import LineBuilder from './line-builder';
import PolygonBuilder from './polygon-builder';
import RectBuilder from './rect-builder';
import PathBuilder from './path-builder';
import BasicTransformBuilder from './basic-transform-builder';
import { SVG_TAG } from '../../types';

const TRANSFORM_BUILDERS = new Map<SVG_TAG, typeof BasicTransformBuilder>([
    [SVG_TAG.ELLIPSE, EllipseBuilder],
    [SVG_TAG.CIRCLE, CircleBuilder],
    [SVG_TAG.LINE, LineBuilder],
    [SVG_TAG.POLYGON, PolygonBuilder],
    [SVG_TAG.POLYLINE, PolygonBuilder],
    [SVG_TAG.RECT, RectBuilder],
    [SVG_TAG.PATH, PathBuilder]
]);

export default TRANSFORM_BUILDERS;
