import Matrix from './matrix';
import SHAPE_BUILDERS from './shape-builders';
import TRANSFORM_BUILDERS from './transform-builders';
import { getNewSegment } from './helpers';

export default class SvgParser {
    // the SVG document
    #svg = null;

    // the top level SVG element of the SVG document
    #svgRoot = null;

    // max bound for bezier->line segment conversion, in native SVG units
    #tolerance = 2;

    setTolerance(value) {
        this.#tolerance = value;
    }

    // return style node, if any
    getStyle() {
        if (this.#svgRoot) {
            return null;
        }

        const nodes = this.#svgRoot.childNodes;
        const nodeCount = nodes.length;
        let i = 0;

        for (i = 0; i < nodeCount; ++i) {
            if (nodes[i].tagName === 'style') {
                return nodes[i];
            }
        }

        return null;
    }

    // set the given path as absolute coords (capital commands)
    // from http://stackoverflow.com/a/9677915/433888
    pathToAbsolute(path) {
        if (!path || path.tagName !== 'path') {
            throw Error('invalid path');
        }

        const segmentList = path.pathSegList;
        const segmentCount = segmentList.numberOfItems;
        const currentPoint = { x: 0, y: 0 };
        const points = [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 }
        ];
        let i = 0;
        let segment = null;
        let command = '';
        let newSegment = null;

        for (i = 0; i < segmentCount; ++i) {
            segment = segmentList.getItem(i);
            command = segment.pathSegTypeAsLetter;

            if (SvgParser.POSITION_COMMANDS.includes(command)) {
                if ('x' in segment) {
                    points[0].x = segment.x;
                }
                if ('y' in segment) {
                    points[0].y = segment.y;
                }
            } else {
                if ('x1' in segment) {
                    points[1].x = points[0].x + segment.x1;
                }
                if ('x2' in segment) {
                    points[2].x = points[0].x + segment.x2;
                }
                if ('y1' in segment) {
                    points[1].y = points[0].y + segment.y1;
                }
                if ('y2' in segment) {
                    points[2].y = points[0].y + segment.y2;
                }
                if ('x' in segment) {
                    points[0].x = points[0].x + segment.x;
                }
                if ('y' in segment) {
                    points[0].y = points[0].y + segment.y;
                }

                if (command.toUpperCase() === 'Z') {
                    points[0].x = currentPoint.x;
                    points[0].y = currentPoint.y;
                    continue;
                }

                newSegment = getNewSegment(path, points, segment, command);

                if (newSegment !== null) {
                    segmentList.replaceItem(newSegment, i);
                }
            }
            // Record the start of a subpath
            if (command.toUpperCase() === 'M') {
                currentPoint.x = points[0].x;
                currentPoint.y = points[0].y;
            }
        }
    }

    transformParse(transformString = '') {
        if (!transformString) {
            return new Matrix();
        }

        const cmdSplit = /\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(\s*(.+?)\s*\)[\s,]*/;
        const paramsSplit = /[\s,]+/;

        // Split value into ['', 'translate', '10 50', '', 'scale', '2', '', 'rotate',  '-45', '']
        const { matrix } = transformString.split(cmdSplit).reduce(
            (result, item) => {
                // Skip empty elements
                if (item) {
                    // remember operation
                    if (Matrix.AVAILABLE_OPERATIONS.includes(item)) {
                        result.command = item;
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
            { matrix: new Matrix(), command: '' }
        );

        return matrix;
    }

    // recursively apply the transform property to the given element
    applyTransform(element = this.#svgRoot, globalTransform = '') {
        const transformAttribute = element.getAttribute('transform');
        const transformString = transformAttribute ? globalTransform + transformAttribute : globalTransform;
        const transform = this.transformParse(transformString);

        if (SvgParser.TRANSFORM_TAGS.includes(element.tagName)) {
            element.removeAttribute('transform');
            const children = Array.prototype.slice.call(element.childNodes);
            const childCount = children.length;
            let i = 0;
            let child = null;

            for (i = 0; i < childCount; ++i) {
                child = children[i];

                if (child.tagName) {
                    // skip text nodes
                    this.applyTransform(child, transformString);
                }
            }
        } else if (transform && !transform.isIdentity && TRANSFORM_BUILDERS.has(element.tagName)) {
            // decompose affine matrix to rotate, scale components (translate is just the 3rd column)
            const builder = TRANSFORM_BUILDERS.get(element.tagName);

            builder.create(element, transform, this.#svg, this.#svgRoot).getResult();
        }
    }

    // bring all child elements to the top level
    flatten(element = this.#svgRoot) {
        const nodeCount = element.childNodes.length;
        let i = 0;

        for (i = 0; i < nodeCount; ++i) {
            this.flatten(element.childNodes[i]);
        }

        if (element.tagName === 'svg') {
            return;
        }

        while (element.childNodes.length > 0) {
            element.parentElement.appendChild(element.childNodes[0]);
        }
    }

    // remove all elements with tag name not in the whitelist
    // use this to remove <text>, <g> etc that don't represent shapes
    filter(element = this.#svgRoot) {
        const nodeCount = element.childNodes.length;

        if (nodeCount !== 0) {
            let i = 0;

            for (i = 0; i < nodeCount; ++i) {
                this.filter(element.childNodes[i]);
            }
        } else if (SvgParser.ALLOWED_TAGS.indexOf(element.tagName) === -1) {
            element.parentElement.removeChild(element);
        }
    }

    // split a compound path (paths with M, m commands) into an array of paths
    splitPath(element = this.#svgRoot) {
        // only operate on original DOM tree, ignore any children that are added. Avoid infinite loops
        const children = Array.prototype.slice.call(element.childNodes);
        let i = 0;

        for (i = 0; i < children.length; ++i) {
            this.splitPath(children[i]);
        }

        if (!element || element.tagName !== 'path' || !element.parentElement) {
            return;
        }

        const segmentList = [];
        let segment = null;
        let lastM = 0;

        // make copy of seglist (appending to new path removes it from the original pathseglist)
        for (i = 0; i < element.pathSegList.numberOfItems; ++i) {
            segmentList.push(element.pathSegList.getItem(i));
        }

        for (i = segmentList.length - 1; i >= 0; --i) {
            segment = segmentList[i];

            if (i > 0 && segment.pathSegTypeAsLetter.toUpperCase() === 'M') {
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
        let path = null;

        for (i = 0; i < segmentList.length; ++i) {
            segment = segmentList[i];
            command = segment.pathSegTypeAsLetter;

            if (command.toUpperCase() === 'M') {
                path = element.cloneNode();
                path.setAttribute('d', '');
                paths.push(path);
            }

            offsetCoef = SvgParser.POSITION_COMMANDS.includes(command) ? 0 : 1;

            if ('x' in segment) {
                currentPoint.x = currentPoint.x * offsetCoef + segment.x;
            }
            if ('y' in segment) {
                currentPoint.y = currentPoint.y * offsetCoef + segment.y;
            }

            if (command === 'm') {
                segment = element.createSVGPathSegMovetoAbs(currentPoint.x, currentPoint.y);
            } else if (command.toUpperCase() === 'Z') {
                currentPoint.x = startPoint.x;
                currentPoint.y = startPoint.y;
            }

            path.pathSegList.appendItem(segment);

            // Record the start of a subpath
            if (command.toUpperCase() === 'M') {
                startPoint.x = currentPoint.x;
                startPoint.y = currentPoint.y;
            }
        }

        for (i = 0; i < paths.length; ++i) {
            // don't add trivial paths from sequential M commands
            if (paths[i].pathSegList.numberOfItems > 1) {
                element.parentElement.insertBefore(paths[i], element);
            }
        }

        element.remove();

        return;
    }

    // return a polygon from the given SVG element in the form of an array of points
    polygonify(element) {
        return SHAPE_BUILDERS.has(element.tagName) ?
            SHAPE_BUILDERS.get(element.tagName).create(this.#tolerance, SvgParser.SVG_TOLERANCE).getResult(element) :
            [];
    }

    parse(svgString) {
        if (!svgString || typeof svgString !== 'string') {
            throw Error('Invalid SVG string');
        }

        const parser = new DOMParser();
        const svg = parser.parseFromString(svgString, 'image/svg+xml');

        this.#svgRoot = null;

        if (!svg) {
            throw new Error('Failed to parse SVG string');
        }

        this.#svg = svg;

        const nodeCount = svg.childNodes.length;
        let i = 0;
        let child = null;

        for (i = 0; i < nodeCount; ++i) {
            // svg document may start with comments or text nodes
            child = svg.childNodes[i];

            if (child.tagName === 'svg') {
                this.#svgRoot = child;
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

    static TRANSFORM_TAGS = ['g', 'svg', 'defs', 'clipPath'];

    static ALLOWED_TAGS = ['svg', 'circle', 'ellipse', 'path', 'polygon', 'polyline', 'rect', 'line'];

    static SVG_TOLERANCE = 0.005; // fudge factor for browser inaccuracy in SVG unit handling

    static POSITION_COMMANDS = ['M', 'L', 'H', 'V', 'C', 'S', 'Q', 'T', 'A'];
}
