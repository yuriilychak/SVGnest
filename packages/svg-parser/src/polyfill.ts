import {
    SVGPathSegLinetoAbs,
    SVGPathSegLinetoVerticalAbs,
    SVGPathSegLinetoHorizontalAbs,
    SVGPathSegLinetoHorizontalRel,
    SVGPathSegLinetoRel,
    SVGPathSegLinetoVerticalRel,
    SVGPathSegMovetoRel,
    SVGPathSegClosePath,
    SVGPathSegMovetoAbs,
    SVGPathSegCurvetoCubicRel,
    SVGPathSegCurvetoCubicAbs,
    SVGPathSegArcAbs,
    SVGPathSegArcRel,
    SVGPathSegCurvetoQuadraticSmoothAbs,
    SVGPathSegCurvetoQuadraticSmoothRel,
    SVGPathSegCurvetoQuadraticAbs,
    SVGPathSegCurvetoQuadraticRel,
    SVGPathSegCurvetoCubicSmoothRel,
    SVGPathSegCurvetoCubicSmoothAbs
} from './svg-path-seg';
import SVGPathSegElement from './svg-path-seg-element';
import { SVGPathSegList } from './svg-path-seg-list';

export default function initPathSegPolyFill() {
    const prototype = window.SVGPathElement.prototype as unknown as SVGPathSegElement;

    // Add createSVGPathSeg* functions to window.SVGPathElement.
    // Spec: http://www.w3.org/TR/SVG11/single-page.html#paths-Interfacewindow.SVGPathElement.
    // Spec: http://www.w3.org/TR/SVG11/single-page.html#paths-InterfaceSVGPathSegList

    // Add the pathSegList accessors to window.SVGPathElement.
    // Spec: http://www.w3.org/TR/SVG11/single-page.html#paths-InterfaceSVGAnimatedPathData
    Object.defineProperty(prototype, 'pathSegList', {
        get() {
            if (!this._pathSegList) {
                this._pathSegList = new SVGPathSegList(this);
            }

            return this._pathSegList;
        },
        enumerable: true
    });
    // FIXME: The following are not implemented and simply return window.SVGPathElement.pathSegList.
    Object.defineProperty(prototype, 'normalizedPathSegList', {
        get() {
            return this.pathSegList;
        },
        enumerable: true
    });
    Object.defineProperty(prototype, 'animatedPathSegList', {
        get() {
            return this.pathSegList;
        },
        enumerable: true
    });
    Object.defineProperty(prototype, 'animatedNormalizedPathSegList', {
        get() {
            return this.pathSegList;
        },
        enumerable: true
    });

    prototype.createSVGPathSegClosePath = () => new SVGPathSegClosePath(undefined);
    prototype.createSVGPathSegMovetoAbs = (x: number, y: number) => new SVGPathSegMovetoAbs(undefined, x, y);
    prototype.createSVGPathSegMovetoRel = (x: number, y: number) => new SVGPathSegMovetoRel(undefined, x, y);
    prototype.createSVGPathSegLinetoAbs = (x: number, y: number) => new SVGPathSegLinetoAbs(undefined, x, y);
    prototype.createSVGPathSegLinetoRel = (x: number, y: number) => new SVGPathSegLinetoRel(undefined, x, y);
    prototype.createSVGPathSegCurvetoCubicAbs = (x: number, y: number, x1: number, y1: number, x2: number, y2: number) =>
        new SVGPathSegCurvetoCubicAbs(undefined, x, y, x1, y1, x2, y2);
    prototype.createSVGPathSegCurvetoCubicRel = (x: number, y: number, x1: number, y1: number, x2: number, y2: number) =>
        new SVGPathSegCurvetoCubicRel(undefined, x, y, x1, y1, x2, y2);
    prototype.createSVGPathSegCurvetoQuadraticAbs = (x: number, y: number, x1: number, y1: number) =>
        new SVGPathSegCurvetoQuadraticAbs(undefined, x, y, x1, y1);
    prototype.createSVGPathSegCurvetoQuadraticRel = (x: number, y: number, x1: number, y1: number) =>
        new SVGPathSegCurvetoQuadraticRel(undefined, x, y, x1, y1);
    prototype.createSVGPathSegArcAbs = (
        x: number,
        y: number,
        r1: number,
        r2: number,
        angle: number,
        largeArcFlag: number,
        sweepFlag: number
    ) => new SVGPathSegArcAbs(undefined, x, y, r1, r2, angle, largeArcFlag, sweepFlag);
    prototype.createSVGPathSegArcRel = (
        x: number,
        y: number,
        r1: number,
        r2: number,
        angle: number,
        largeArcFlag: number,
        sweepFlag: number
    ) => new SVGPathSegArcRel(undefined, x, y, r1, r2, angle, largeArcFlag, sweepFlag);
    prototype.createSVGPathSegLinetoHorizontalAbs = (x: number) => new SVGPathSegLinetoHorizontalAbs(undefined, x);
    prototype.createSVGPathSegLinetoHorizontalRel = (x: number) => new SVGPathSegLinetoHorizontalRel(undefined, x);
    prototype.createSVGPathSegLinetoVerticalAbs = (y: number) => new SVGPathSegLinetoVerticalAbs(undefined, y);
    prototype.createSVGPathSegLinetoVerticalRel = (y: number) => new SVGPathSegLinetoVerticalRel(undefined, y);
    prototype.createSVGPathSegCurvetoCubicSmoothAbs = (x: number, y: number, x2: number, y2: number) =>
        new SVGPathSegCurvetoCubicSmoothAbs(undefined, x, y, x2, y2);
    prototype.createSVGPathSegCurvetoCubicSmoothRel = (x: number, y: number, x2: number, y2: number) =>
        new SVGPathSegCurvetoCubicSmoothRel(undefined, x, y, x2, y2);
    prototype.createSVGPathSegCurvetoQuadraticSmoothAbs = (x: number, y: number) =>
        new SVGPathSegCurvetoQuadraticSmoothAbs(undefined, x, y);
    prototype.createSVGPathSegCurvetoQuadraticSmoothRel = (x: number, y: number) =>
        new SVGPathSegCurvetoQuadraticSmoothRel(undefined, x, y);

    // Add getPathSegAtLength to SVGPathElement.
    // Spec: https://www.w3.org/TR/SVG11/single-page.html#paths-__svg__SVGPathElement__getPathSegAtLength
    // This polyfill requires SVGPathElement.getTotalLength to implement the distance-along-a-path algorithm.
    prototype.getPathSegAtLength = function(distance?: number): number {
        if (distance === undefined || !isFinite(distance)) {
            throw new Error('Invalid arguments.');
        }

        const measurementElement: SVGPathSegElement = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'path'
        ) as unknown as SVGPathSegElement;

        measurementElement.setAttribute('d', this.getAttribute('d'));

        let lastPathSegment: number = measurementElement.pathSegList.numberOfItems - 1;

        // If the path is empty, return 0.
        if (lastPathSegment <= 0) {
            return 0;
        }

        do {
            measurementElement.pathSegList.removeItem(lastPathSegment);
            if (distance > measurementElement.getTotalLength()) {
                break;
            }
            --lastPathSegment;
        } while (lastPathSegment > 0);

        return lastPathSegment;
    };
}
