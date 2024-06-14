import Matrix from './matrix';
import SHAPE_BUILDERS from './shape-builders';
import TRANSFORM_BUILDERS from './transform-builders';
import { IPoint, ISvgPath, ISVGPathElement, MATRIX_OPERATIONS, SVG_TAG, PATH_TAG } from './types';

export default class SvgParser {
    // the SVG document
    #svg: Document = null;

    // the top level SVG element of the SVG document
    #svgRoot: SVGSVGElement = null;

    // max bound for bezier->line segment conversion, in native SVG units
    #tolerance: number = 2;

    public setTolerance(value: number): void {
        this.#tolerance = value;
    }

    // return style node, if any
    public getStyle(): SVGElement | null {
        if (this.#svgRoot) {
            return null;
        }

        const nodes: NodeListOf<SVGElement> = this.#svgRoot.childNodes as NodeListOf<SVGElement>;
        const nodeCount: number = nodes.length;
        let i: number = 0;

        for (i = 0; i < nodeCount; ++i) {
            if (nodes[i].tagName === 'style') {
                return nodes[i];
            }
        }

        return null;
    }

    private transformParse(transformString: string = ''): Matrix {
        if (!transformString) {
            return new Matrix();
        }

        const cmdSplit: RegExp = /\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(\s*(.+?)\s*\)[\s,]*/;
        const paramsSplit: RegExp = /[\s,]+/;

        // Split value into ['', 'translate', '10 50', '', 'scale', '2', '', 'rotate',  '-45', '']
        const { matrix } = transformString.split(cmdSplit).reduce(
            (result, item) => {
                // Skip empty elements
                if (item) {
                    // remember operation
                    if (Matrix.AVAILABLE_OPERATIONS.includes(item as MATRIX_OPERATIONS)) {
                        result.command = item as MATRIX_OPERATIONS;
                    } else {
                        // If params count is not correct - ignore command
                        result.matrix.execute(
                            result.command,
                            item.split(paramsSplit).map(i => Number(i) || 0)
                        );
                    }
                }

                return result;
            },
            { matrix: new Matrix(), command: MATRIX_OPERATIONS.NONE }
        );

        return matrix;
    }

    // recursively apply the transform property to the given element
    private applyTransform(element: SVGSVGElement = this.#svgRoot, globalTransform: string = ''): void {
        const transformAttribute: string = element.getAttribute('transform');
        const transformString: string = transformAttribute ? globalTransform + transformAttribute : globalTransform;
        const transform: Matrix = this.transformParse(transformString);

        if (SvgParser.TRANSFORM_TAGS.includes(element.tagName as SVG_TAG)) {
            element.removeAttribute('transform');
            const children: SVGSVGElement[] = Array.prototype.slice.call(element.childNodes) as SVGSVGElement[];
            const childCount: number = children.length;
            let i: number = 0;
            let child: SVGSVGElement;

            for (i = 0; i < childCount; ++i) {
                child = children[i];

                if (child.tagName) {
                    // skip text nodes
                    this.applyTransform(child, transformString);
                }
            }
        } else if (transform && !transform.isIdentity && TRANSFORM_BUILDERS.has(element.tagName as SVG_TAG)) {
            // decompose affine matrix to rotate, scale components (translate is just the 3rd column)
            const builder = TRANSFORM_BUILDERS.get(element.tagName as SVG_TAG);

            builder.create(element, transform, this.#svg, this.#svgRoot).getResult();
        }
    }

    // bring all child elements to the top level
    private flatten(element: SVGSVGElement = this.#svgRoot): void {
        const nodeCount: number = element.childNodes.length;
        let i: number = 0;

        for (i = 0; i < nodeCount; ++i) {
            this.flatten(element.childNodes[i] as SVGSVGElement);
        }

        if (element.tagName === SVG_TAG.SVG) {
            return;
        }

        while (element.childNodes.length > 0) {
            element.parentElement.appendChild(element.childNodes[0]);
        }
    }

    // remove all elements with tag name not in the whitelist
    // use this to remove <text>, <g> etc that don't represent shapes
    private filter(element: SVGSVGElement = this.#svgRoot): void {
        const nodeCount: number = element.childNodes.length;

        if (nodeCount !== 0) {
            let i: number = 0;

            for (i = 0; i < nodeCount; ++i) {
                this.filter(element.childNodes[i] as SVGSVGElement);
            }
        } else if (SvgParser.ALLOWED_TAGS.indexOf(element.tagName as SVG_TAG) === -1) {
            element.parentElement.removeChild(element);
        }
    }

    // split a compound path (paths with M, m commands) into an array of paths
    private splitPath(element: SVGSVGElement = this.#svgRoot): void {
        // only operate on original DOM tree, ignore any children that are added. Avoid infinite loops
        const children = Array.prototype.slice.call(element.childNodes);
        let i = 0;

        for (i = 0; i < children.length; ++i) {
            this.splitPath(children[i]);
        }

        if (!element || element.tagName !== SVG_TAG.PATH || !element.parentElement) {
            return;
        }

        const segmentList: ISvgPath[] = [];
        let segment = null;
        let lastM = 0;

        // make copy of seglist (appending to new path removes it from the original pathseglist)
        for (i = 0; i < (element as ISVGPathElement).pathSegList.numberOfItems; ++i) {
            segmentList.push((element as ISVGPathElement).pathSegList.getItem(i));
        }

        for (i = segmentList.length - 1; i >= 0; --i) {
            segment = segmentList[i];

            if (i > 0 && segment.pathSegTypeAsLetter.toUpperCase() === PATH_TAG.M) {
                lastM = i;
                break;
            }
        }

        if (lastM === 0) {
            return; // only 1 M command, no need to split
        }

        const paths = [];
        const startPoint = { x: 0, y: 0 };
        const currentPoint = { x: 0, y: 0 };
        let command = '';
        let offsetCoef = 0;
        let path: ISVGPathElement;

        for (i = 0; i < segmentList.length; ++i) {
            segment = segmentList[i];
            command = segment.pathSegTypeAsLetter;

            if (command.toUpperCase() === PATH_TAG.M) {
                path = element.cloneNode() as ISVGPathElement;
                path.setAttribute('d', '');
                paths.push(path);
            }

            offsetCoef = SvgParser.POSITION_COMMANDS.includes(command as PATH_TAG) ? 0 : 1;

            if ('x' in segment) {
                currentPoint.x = currentPoint.x * offsetCoef + segment.x;
            }
            if ('y' in segment) {
                currentPoint.y = currentPoint.y * offsetCoef + segment.y;
            }

            if (command === PATH_TAG.m) {
                segment = (element as ISVGPathElement).createSVGPathSegMovetoAbs(currentPoint.x, currentPoint.y);
            } else if (command.toUpperCase() === PATH_TAG.Z) {
                currentPoint.x = startPoint.x;
                currentPoint.y = startPoint.y;
            }

            path.pathSegList.appendItem(segment);

            // Record the start of a subpath
            if (command.toUpperCase() === PATH_TAG.M) {
                startPoint.x = currentPoint.x;
                startPoint.y = currentPoint.y;
            }
        }

        for (i = 0; i < paths.length; ++i) {
            // don't add trivial paths from sequential M commands
            if ((paths[i] as ISVGPathElement).pathSegList.numberOfItems > 1) {
                element.parentElement.insertBefore(paths[i], element);
            }
        }

        element.remove();

        return;
    }

    // return a polygon from the given SVG element in the form of an array of points
    public polygonify(element: SVGElement): IPoint[] {
        return SHAPE_BUILDERS.has(element.tagName as SVG_TAG) ?
            SHAPE_BUILDERS.get(element.tagName as SVG_TAG)
                .create(this.#tolerance, SvgParser.SVG_TOLERANCE)
                .getResult(element) :
            [];
    }

    public parse(svgString: string): { svg: SVGSVGElement; style: SVGElement } {
        if (!svgString || typeof svgString !== 'string') {
            throw Error('Invalid SVG string');
        }

        const parser: DOMParser = new DOMParser();
        const svg: Document = parser.parseFromString(svgString, 'image/svg+xml');

        this.#svgRoot = null;

        if (!svg) {
            throw new Error('Failed to parse SVG string');
        }

        this.#svg = svg;

        const nodeCount: number = svg.childNodes.length;
        let i: number = 0;
        let child: SVGElement;

        for (i = 0; i < nodeCount; ++i) {
            // svg document may start with comments or text nodes
            child = svg.childNodes[i] as SVGElement;

            if (child.tagName === SVG_TAG.SVG) {
                this.#svgRoot = child as SVGSVGElement;
                break;
            }
        }

        if (this.#svgRoot === null) {
            throw new Error('SVG has no children');
        }

        const style = this.getStyle();
        // apply any transformations, so that all path positions etc will be in the same coordinate space
        this.applyTransform();
        // remove any g elements and bring all elements to the top level
        this.flatten();
        // remove any non-contour elements like text
        this.filter();
        // split any compound paths into individual path elements
        this.splitPath();

        return { svg: this.#svgRoot, style };
    }

    private static TRANSFORM_TAGS: SVG_TAG[] = [SVG_TAG.G, SVG_TAG.SVG, SVG_TAG.DEFS, SVG_TAG.CLIP_PATH];

    private static ALLOWED_TAGS: SVG_TAG[] = [
        SVG_TAG.SVG,
        SVG_TAG.CIRCLE,
        SVG_TAG.ELLIPSE,
        SVG_TAG.PATH,
        SVG_TAG.POLYGON,
        SVG_TAG.POLYLINE,
        SVG_TAG.RECT,
        SVG_TAG.LINE
    ];

    private static SVG_TOLERANCE: number = 0.005; // fudge factor for browser inaccuracy in SVG unit handling

    private static POSITION_COMMANDS: PATH_TAG[] = [
        PATH_TAG.M,
        PATH_TAG.L,
        PATH_TAG.H,
        PATH_TAG.V,
        PATH_TAG.C,
        PATH_TAG.S,
        PATH_TAG.Q,
        PATH_TAG.T,
        PATH_TAG.A
    ];
}
