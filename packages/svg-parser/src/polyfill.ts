import SVGPathSegElement from './svg-path-seg-element';
import { SVGPathSegList } from './svg-path-seg-list';

export default function initPathSegPolyFill() {
    const prototype = window.SVGPathElement.prototype as unknown as SVGPathSegElement;

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
}
