import CircleBuilder from './circle-builder';
import EllipseBuilder from './ellipse-builder';
import PathBuilder from './path-builder';
import PolygonBuilder from './polygon-builder';
import RectBuilder from './rect-builder';

const SHAPE_BUILDERS = new Map([
    ['circle', CircleBuilder],
    ['ellipse', EllipseBuilder],
    ['path', PathBuilder],
    ['polygon', PolygonBuilder],
    ['polyline', PolygonBuilder],
    ['rect', RectBuilder]
]);

export default SHAPE_BUILDERS;