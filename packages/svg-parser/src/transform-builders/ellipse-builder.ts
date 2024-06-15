import { getFloatAtrribute } from '../helpers';
import Matrix from '../matrix';
import BasicTransformBuilder from './basic-transform-builder';
import SVGPathSegElement from '../svg-path-seg-element';
import { SVGPathArcSeg, SVGPathBaseSeg, SVGPathPointSeg } from '../svg-path-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class EllipseBuilder extends BasicTransformBuilder {
    public getResult(): SVGElement {
        // the goal is to remove the transform property, but an ellipse without a transform will have no rotation
        // for the sake of simplicity, we will replace the ellipse with a path, and apply the transform to that path
        const path: SVGPathSegElement = this.svg.createElementNS(this.element.namespaceURI, 'path') as SVGPathSegElement;
        const cx: number = getFloatAtrribute(this.element, 'cx');
        const cy: number = getFloatAtrribute(this.element, 'cy');
        const rx: number = getFloatAtrribute(this.element, 'rx');
        const ry: number = getFloatAtrribute(this.element, 'ry');
        const move = new SVGPathPointSeg(PATH_SEGMENT_TYPE.MOVETO_ABS, [cx - rx, cy]);
        const arc1 = new SVGPathArcSeg(PATH_SEGMENT_TYPE.ARC_ABS, [cx + rx, cy, rx, ry, 0, 1, 0]);
        const arc2 = new SVGPathArcSeg(PATH_SEGMENT_TYPE.ARC_ABS, [cx - rx, cy, rx, ry, 0, 1, 0]);

        path.pathSegList.appendItem(move);
        path.pathSegList.appendItem(arc1);
        path.pathSegList.appendItem(arc2);
        path.pathSegList.appendItem(new SVGPathBaseSeg(PATH_SEGMENT_TYPE.CLOSEPATH));

        const transformProperty = this.element.getAttribute('transform');

        if (transformProperty) {
            path.setAttribute('transform', transformProperty);
        }

        this.element.parentElement.replaceChild(path, this.element);
        this.element = path;

        return super.getResult();
    }

    public static create(
        element: SVGAElement,
        transform: Matrix,
        svg: Document,
        svgRoot: SVGSVGElement
    ): BasicTransformBuilder {
        return new EllipseBuilder(element, transform, svg, svgRoot);
    }
}
