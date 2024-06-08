import Matrix from './matrix';
import SHAPE_BUILDERS from './shape-builders';
import { getNewSegment } from './helpers';

export default class SvgParser {
    constructor() {
        // the SVG document
        this.svg;

        // the top level SVG element of the SVG document
        this.svgRoot;

        this.allowedElements = [
            'svg',
            'circle',
            'ellipse',
            'path',
            'polygon',
            'polyline',
            'rect',
            'line'
        ];

        this.conf = {
            tolerance: 2, // max bound for bezier->line segment conversion, in native SVG units
            toleranceSvg: 0.005 // fudge factor for browser inaccuracy in SVG unit handling
        };
    }

    config(config) {
        this.conf.tolerance = config.tolerance;
    }

    load(svgString) {
        if (!svgString || typeof svgString !== 'string') {
            throw Error('invalid SVG string');
        }

        const parser = new DOMParser();
        const svg = parser.parseFromString(svgString, 'image/svg+xml');

        this.svgRoot = null;

        if (svg) {
            this.svg = svg;

            const nodeCount = svg.childNodes.length;
            let i = 0;
            let child = null;

            for (i = 0; i < nodeCount; ++i) {
                // svg document may start with comments or text nodes
                child = svg.childNodes[i];

                if (child.tagName && child.tagName === 'svg') {
                    this.svgRoot = child;
                    break;
                }
            }
        } else {
            throw new Error('Failed to parse SVG string');
        }

        if (!this.svgRoot) {
            throw new Error('SVG has no children');
        }
        return this.svgRoot;
    }

    // use the utility functions in this class to prepare the svg for CAD-CAM/nest related operations
    clean() {
        // apply any transformations, so that all path positions etc will be in the same coordinate space
        this.applyTransform(this.svgRoot);

        // remove any g elements and bring all elements to the top level
        this.flatten(this.svgRoot);

        // remove any non-contour elements like text
        this.filter(this.allowedElements);

        // split any compound paths into individual path elements
        this.recurse(this.svgRoot, this.splitPath);

        return this.svgRoot;
    }

    // return style node, if any
    getStyle() {
        if (!this.svgRoot) {
            return null;
        }

        const nodeCount = this.svgRoot.childNodes.length;
        const nodes = this.svgRoot.childNodes;
        let i = 0;
        let result = null;

        for (i = 0; i < nodeCount; ++i) {
            result = nodes[i];

            if (result.tagName === 'style') {
                return result;
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

        const positionCommands = 'MLHVCSQTA';
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

            if (positionCommands.indexOf(command) !== -1) {
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

    // takes an SVG transform string and returns corresponding SVGMatrix
    // from https://github.com/fontello/svgpath
    transformParse(transformString = '') {
        if (!transformString) {
            return new Matrix();
        }

        const operations = [
            'matrix',
            'scale',
            'rotate',
            'translate',
            'skewX',
            'skewY'
        ];
        const cmdSplit =
            /\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(\s*(.+?)\s*\)[\s,]*/;
        const paramsSplit = /[\s,]+/;

        // Split value into ['', 'translate', '10 50', '', 'scale', '2', '', 'rotate',  '-45', '']
        const { matrix } = transformString.split(cmdSplit).reduce(
            (result, item) => {
                // Skip empty elements
                if (item) {
                    // remember operation
                    if (operations.includes(item)) {
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
    applyTransform(element, globalTransform = '') {
        let transformString = element.getAttribute('transform') || '';
        transformString = globalTransform + transformString;

        const transform = this.transformParse(transformString);
        const tarray = transform.toArray();
        // decompose affine matrix to rotate, scale components (translate is just the 3rd column)
        const rotate = Math.atan2(tarray[1], tarray[3]) * 180 / Math.PI;
        const scale = Math.sqrt(tarray[0] * tarray[0] + tarray[2] * tarray[2]);
        const transformTags = ['g', 'svg', 'defs', 'clipPath'];

        if (transformTags.includes(element.tagName)) {
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
        } else if (transform && !transform.isIdentity()) {
            const id = element.getAttribute('id');
            const className = element.getAttribute('class');
            let i = 0;

            switch (element.tagName) {
                case 'ellipse':
                    // the goal is to remove the transform property, but an ellipse without a transform will have no rotation
                    // for the sake of simplicity, we will replace the ellipse with a path, and apply the transform to that path
                    var path = this.svg.createElementNS(
                        element.namespaceURI,
                        'path'
                    );
                    var move = path.createSVGPathSegMovetoAbs(
                        parseFloat(element.getAttribute('cx')) -
                            parseFloat(element.getAttribute('rx')),
                        element.getAttribute('cy')
                    );
                    var arc1 = path.createSVGPathSegArcAbs(
                        parseFloat(element.getAttribute('cx')) +
                            parseFloat(element.getAttribute('rx')),
                        element.getAttribute('cy'),
                        element.getAttribute('rx'),
                        element.getAttribute('ry'),
                        0,
                        1,
                        0
                    );
                    var arc2 = path.createSVGPathSegArcAbs(
                        parseFloat(element.getAttribute('cx')) -
                            parseFloat(element.getAttribute('rx')),
                        element.getAttribute('cy'),
                        element.getAttribute('rx'),
                        element.getAttribute('ry'),
                        0,
                        1,
                        0
                    );

                    path.pathSegList.appendItem(move);
                    path.pathSegList.appendItem(arc1);
                    path.pathSegList.appendItem(arc2);
                    path.pathSegList.appendItem(
                        path.createSVGPathSegClosePath()
                    );

                    var transformProperty = element.getAttribute('transform');
                    if (transformProperty) {
                        path.setAttribute('transform', transformProperty);
                    }

                    element.parentElement.replaceChild(path, element);

                    element = path;

                case 'path':
                    this.pathToAbsolute(element);
                    var seglist = element.pathSegList;
                    var prevx = 0;
                    var prevy = 0;

                    let transformedPath = '';

                    for (i = 0; i < seglist.numberOfItems; ++i) {
                        let s = seglist.getItem(i);
                        const command = s.pathSegTypeAsLetter;

                        if (command == 'H') {
                            seglist.replaceItem(
                                element.createSVGPathSegLinetoAbs(s.x, prevy),
                                i
                            );
                            s = seglist.getItem(i);
                        } else if (command == 'V') {
                            seglist.replaceItem(
                                element.createSVGPathSegLinetoAbs(prevx, s.y),
                                i
                            );
                            s = seglist.getItem(i);
                        }
                        // currently only works for uniform scale, no skew
                        // todo: fully support arbitrary affine transforms...
                        else if (command == 'A') {
                            seglist.replaceItem(
                                element.createSVGPathSegArcAbs(
                                    s.x,
                                    s.y,
                                    s.r1 * scale,
                                    s.r2 * scale,
                                    s.angle + rotate,
                                    s.largeArcFlag,
                                    s.sweepFlag
                                ),
                                i
                            );
                            s = seglist.getItem(i);
                        }

                        const transPoints = {};

                        if ('x' in s && 'y' in s) {
                            var transformed = transform.calc(s.x, s.y);
                            prevx = s.x;
                            prevy = s.y;
                            transPoints.x = transformed[0];
                            transPoints.y = transformed[1];
                        }
                        if ('x1' in s && 'y1' in s) {
                            var transformed = transform.calc(s.x1, s.y1);
                            transPoints.x1 = transformed[0];
                            transPoints.y1 = transformed[1];
                        }
                        if ('x2' in s && 'y2' in s) {
                            var transformed = transform.calc(s.x2, s.y2);
                            transPoints.x2 = transformed[0];
                            transPoints.y2 = transformed[1];
                        }

                        let commandStringTransformed = '';

                        // MLHVCSQTA
                        // H and V are transformed to "L" commands above so we don't need to handle them. All lowercase (relative) are already handled too (converted to absolute)
                        switch (command) {
                            case 'M':
                                commandStringTransformed = `${commandStringTransformed}${command} ${transPoints.x} ${transPoints.y}`;
                                break;
                            case 'L':
                                commandStringTransformed = `${commandStringTransformed}${command} ${transPoints.x} ${transPoints.y}`;
                                break;
                            case 'C':
                                commandStringTransformed = `${commandStringTransformed}${command} ${transPoints.x1} ${transPoints.y1}  ${transPoints.x2} ${transPoints.y2} ${transPoints.x} ${transPoints.y}`;
                                break;
                            case 'S':
                                commandStringTransformed = `${commandStringTransformed}${command} ${transPoints.x2} ${transPoints.y2} ${transPoints.x} ${transPoints.y}`;
                                break;
                            case 'Q':
                                commandStringTransformed = `${commandStringTransformed}${command} ${transPoints.x1} ${transPoints.y1} ${transPoints.x} ${transPoints.y}`;
                                break;
                            case 'T':
                                commandStringTransformed = `${commandStringTransformed}${command} ${transPoints.x} ${transPoints.y}`;
                                break;
                            case 'A':
                                const largeArcFlag = s.largeArcFlag ? 1 : 0;
                                const sweepFlag = s.sweepFlag ? 1 : 0;
                                commandStringTransformed = `${commandStringTransformed}${command} ${s.r1} ${s.r2} ${s.angle} ${largeArcFlag} ${sweepFlag} ${transPoints.x} ${transPoints.y}`;
                                break;
                            case 'H':
                                commandStringTransformed = `${commandStringTransformed}L ${transPoints.x} ${transPoints.y}`;
                                break;
                            case 'V':
                                commandStringTransformed = `${commandStringTransformed}L ${transPoints.x} ${transPoints.y}`;
                                break;
                            case 'Z':
                            case 'z':
                                commandStringTransformed =
                                    commandStringTransformed + command;
                                break;
                            default:
                                console.log(
                                    'FOUND COMMAND NOT HANDLED BY COMMAND STRING BUILDER',
                                    command
                                );
                                break;
                        }

                        transformedPath =
                            transformedPath + commandStringTransformed;
                    }

                    element.setAttribute('d', transformedPath);
                    element.removeAttribute('transform');
                    break;
                case 'circle':
                    var transformed = transform.calc(
                        element.getAttribute('cx'),
                        element.getAttribute('cy')
                    );
                    element.setAttribute('cx', transformed[0]);
                    element.setAttribute('cy', transformed[1]);

                    // skew not supported
                    element.setAttribute('r', element.getAttribute('r') * scale);
                    break;
                case 'line':
                    const transformedStartPt = transform.calc(
                        element.getAttribute('x1'),
                        element.getAttribute('y1')
                    );
                    const transformedEndPt = transform.calc(
                        element.getAttribute('x2'),
                        element.getAttribute('y2')
                    );
                    element.setAttribute('x1', transformedStartPt[0].toString());
                    element.setAttribute('y1', transformedStartPt[1].toString());
                    element.setAttribute('x2', transformedEndPt[0].toString());
                    element.setAttribute('y2', transformedEndPt[1].toString());
                    break;
                case 'rect':
                    // similar to the ellipse, we'll replace rect with polygon
                    var polygon = this.svg.createElementNS(
                        element.namespaceURI,
                        'polygon'
                    );

                    var p1 = this.svgRoot.createSVGPoint();
                    var p2 = this.svgRoot.createSVGPoint();
                    var p3 = this.svgRoot.createSVGPoint();
                    var p4 = this.svgRoot.createSVGPoint();

                    p1.x = parseFloat(element.getAttribute('x')) || 0;
                    p1.y = parseFloat(element.getAttribute('y')) || 0;

                    p2.x = p1.x + parseFloat(element.getAttribute('width'));
                    p2.y = p1.y;

                    p3.x = p2.x;
                    p3.y = p1.y + parseFloat(element.getAttribute('height'));

                    p4.x = p1.x;
                    p4.y = p3.y;

                    polygon.points.appendItem(p1);
                    polygon.points.appendItem(p2);
                    polygon.points.appendItem(p3);
                    polygon.points.appendItem(p4);

                    var transformProperty = element.getAttribute('transform');
                    if (transformProperty) {
                        polygon.setAttribute('transform', transformProperty);
                    }

                    element.parentElement.replaceChild(polygon, element);
                    element = polygon;
                case 'polygon':
                case 'polyline':
                    let transformedPoly = '';
                    for (i = 0; i < element.points.numberOfItems; i++) {
                        const point = element.points.getItem(i);
                        var transformed = transform.calc(point.x, point.y);
                        const pointPairString = `${transformed[0]},${transformed[1]} `;
                        transformedPoly = transformedPoly + pointPairString;
                    }

                    element.setAttribute('points', transformedPoly);
                    element.removeAttribute('transform');
                    break;
                default:
            }
            if (id) {
                element.setAttribute('id', id);
            }
            if (className) {
                element.setAttribute('class', className);
            }
        }
    }

    // bring all child elements to the top level
    flatten(element) {
        for (let i = 0; i < element.childNodes.length; i++) {
            this.flatten(element.childNodes[i]);
        }

        if (element.tagName !== 'svg') {
            while (element.childNodes.length > 0) {
                element.parentElement.appendChild(element.childNodes[0]);
            }
        }
    }

    // remove all elements with tag name not in the whitelist
    // use this to remove <text>, <g> etc that don't represent shapes
    filter(whitelist, element) {
        if (!whitelist || whitelist.length === 0) {
            throw Error('invalid whitelist');
        }

        element = element || this.svgRoot;

        for (let i = 0; i < element.childNodes.length; i++) {
            this.filter(whitelist, element.childNodes[i]);
        }

        if (
            element.childNodes.length === 0 &&
            whitelist.indexOf(element.tagName) < 0
        ) {
            element.parentElement.removeChild(element);
        }
    }

    // split a compound path (paths with M, m commands) into an array of paths
    splitPath(path) {
        if (!path || path.tagName !== 'path' || !path.parentElement) {
            return false;
        }

        const seglist = [];
        let i = 0;

        // make copy of seglist (appending to new path removes it from the original pathseglist)
        for (i = 0; i < path.pathSegList.numberOfItems; ++i) {
            seglist.push(path.pathSegList.getItem(i));
        }

        let x = 0,
            y = 0,
            x0 = 0,
            y0 = 0;
        const paths = [];

        let p = null;

        let lastM = 0;

        for (i = seglist.length - 1; i >= 0; --i) {
            if (
                i > 0 && seglist[i].pathSegTypeAsLetter === 'M' ||
                seglist[i].pathSegTypeAsLetter === 'm'
            ) {
                lastM = i;
                break;
            }
        }

        if (lastM === 0) {
            return false; // only 1 M command, no need to split
        }

        for (i = 0; i < seglist.length; i++) {
            const s = seglist[i];
            const command = s.pathSegTypeAsLetter;

            if (command === 'M' || command === 'm') {
                p = path.cloneNode();
                p.setAttribute('d', '');
                paths.push(p);
            }

            if ((/[MLHVCSQTA]/).test(command)) {
                if ('x' in s) {
                    x = s.x;
                }
                if ('y' in s) {
                    y = s.y;
                }

                p.pathSegList.appendItem(s);
            } else {
                if ('x' in s) {
                    x = x + s.x;
                }
                if ('y' in s) {
                    y = y + s.y;
                }
                if (command === 'm') {
                    p.pathSegList.appendItem(
                        path.createSVGPathSegMovetoAbs(x, y)
                    );
                } else {
                    if (command === 'Z' || command === 'z') {
                        x = x0;
                        y = y0;
                    }
                    p.pathSegList.appendItem(s);
                }
            }
            // Record the start of a subpath
            if (command === 'M' || command === 'm') {
                x0 = x;
                y0 = y;
            }
        }

        const addedPaths = [];
        for (i = 0; i < paths.length; i++) {
            // don't add trivial paths from sequential M commands
            if (paths[i].pathSegList.numberOfItems > 1) {
                path.parentElement.insertBefore(paths[i], path);
                addedPaths.push(paths[i]);
            }
        }

        path.remove();

        return addedPaths;
    }

    // recursively run the given function on the given element
    recurse(element, callback) {
        // only operate on original DOM tree, ignore any children that are added. Avoid infinite loops
        const children = Array.prototype.slice.call(element.childNodes);
        for (let i = 0; i < children.length; i++) {
            this.recurse(children[i], callback);
        }

        callback(element);
    }

    // return a polygon from the given SVG element in the form of an array of points
    polygonify(element) {
        return SHAPE_BUILDERS.has(element.tagName) ?
            SHAPE_BUILDERS.get(element.tagName)
                .create(this.conf.tolerance, this.conf.toleranceSvg)
                .getResult(element) :
            [];
    }
}
