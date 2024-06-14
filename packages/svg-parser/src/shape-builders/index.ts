import { SVG_TAG } from '../types';
import BasicShapeBuilder from './basic-shape-builder';
import CircleBuilder from './circle-builder';
import EllipseBuilder from './ellipse-builder';
import PathBuilder from './path-builder';
import PolygonBuilder from './polygon-builder';
import RectBuilder from './rect-builder';

const SHAPE_BUILDERS = new Map<SVG_TAG, typeof BasicShapeBuilder>([
    [SVG_TAG.CIRCLE, CircleBuilder],
    [SVG_TAG.ELLIPSE, EllipseBuilder],
    [SVG_TAG.PATH, PathBuilder],
    [SVG_TAG.POLYGON, PolygonBuilder],
    [SVG_TAG.POLYLINE, PolygonBuilder],
    [SVG_TAG.RECT, RectBuilder]
]);

export default SHAPE_BUILDERS;
