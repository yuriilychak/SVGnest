import EllipseBuilder from './ellipse-builder';
import CircleBuilder from './circle-builder';
import LineBuilder from './line-builder';
import PolygonBuilder from './polygon-builder';
import RectBuilder from './rect-builder';
import PathBuilder from './path-builder.';

const TRANSFORM_BUILDERS = new Map([
    ['ellipse', EllipseBuilder],
    ['circle', CircleBuilder],
    ['line', LineBuilder],
    ['polygon', PolygonBuilder],
    ['polyline', PolygonBuilder],
    ['rect', RectBuilder],
    ['path', PathBuilder]
]);

export default TRANSFORM_BUILDERS;
