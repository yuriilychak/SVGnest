import { SVGPathSegList } from './svg-path-seg-list';

export default interface SVGPathSegElement extends SVGSVGElement {
    pathSegList: SVGPathSegList
    getTotalLength(): number
}
