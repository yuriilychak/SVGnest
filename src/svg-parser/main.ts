//@ts-ignore
import ClipperLib from "js-clipper";

/*!
 * SvgParser
 * A library to convert an SVG string to parse-able segments for CAD/CAM use
 * Licensed under the MIT license
 */

import Matrix from "./matrix";
import FloatPoint from "../float-point";
import { poligonify } from "./poligonify";
import { PrimitiveTagName } from "./enums";
import {
  DOMSegment,
  SVGPathSegElement,
  SVGSegList,
  SvgConfig
} from "./interfaces";
import { pointInPolygon, polygonArea } from "../geometry-util";
import { ArrayPolygon, Point } from "../interfaces";

export default class SvgParser {
  private allowedElements: Array<PrimitiveTagName> = [
    PrimitiveTagName.Svg,
    PrimitiveTagName.Circle,
    PrimitiveTagName.Ellipse,
    PrimitiveTagName.Path,
    PrimitiveTagName.Polygon,
    PrimitiveTagName.Polyline,
    PrimitiveTagName.Rect,
    PrimitiveTagName.Line
  ];
  private conf: SvgConfig = {
    tolerance: 2, // max bound for bezier->line segment conversion, in native SVG units
    toleranceSvg: 0.005 // fudge factor for browser inaccuracy in SVG unit handling
  };
  // the top level SVG element of the SVG document
  private svgRoot: SVGSVGElement = null;
  // the SVG document
  private svg: Document = null;

  constructor() {}

  public config(config: SvgConfig): void {
    this.conf.tolerance = config.tolerance;
  }

  public load(svgString: string): SVGElement {
    if (!svgString) {
      throw Error("invalid SVG string");
    }

    var parser = new DOMParser();
    var svg: Document = parser.parseFromString(
      svgString,
      "image/svg+xml"
    ) as Document;

    this.svgRoot = null;

    if (svg) {
      this.svg = svg;

      const childCount: number = svg.childNodes.length;
      let i: number = 0;
      let child: Element;

      for (i = 0; i < childCount; ++i) {
        // svg document may start with comments or text nodes
        child = svg.childNodes[i] as Element;

        if (child.tagName && child.tagName == PrimitiveTagName.Svg) {
          this.svgRoot = child as SVGSVGElement;
          break;
        }
      }
    } else {
      throw new Error("Failed to parse SVG string");
    }

    if (!this.svgRoot) {
      throw new Error("SVG has no children");
    }
    return this.svgRoot;
  }

  // use the utility functions in this class to prepare the svg for CAD-CAM/nest related operations
  public clean(): SVGElement {
    // apply any transformations, so that all path positions etc will be in the same coordinate space
    this.applyTransform(this.svgRoot as SVGPathSegElement);

    // remove any g elements and bring all elements to the top level
    this.flatten(this.svgRoot);

    // remove any non-contour elements like text
    this.filter(this.allowedElements);

    // split any compound paths into individual path elements
    this.recurse(this.svgRoot, this.splitPath);

    return this.svgRoot;
  }

  // return style node, if any
  getStyle(): SVGElement | null {
    if (!this.svgRoot) {
      return null;
    }

    const childCount: number = this.svgRoot.childNodes.length;
    let i: number = 0;
    let element: SVGElement;

    for (i = 0; i < childCount; ++i) {
      element = this.svgRoot.childNodes[i] as SVGElement;

      if (element.tagName == PrimitiveTagName.Style) {
        return element;
      }
    }

    return null;
  }

  // set the given path as absolute coords (capital commands)
  // from http://stackoverflow.com/a/9677915/433888
  pathToAbsolute(path: SVGPathSegElement) {
    if (path.tagName != PrimitiveTagName.Path) {
      throw Error("invalid path");
    }

    const segList: SVGSegList = path.pathSegList;
    const itenCount: number = segList.numberOfItems;
    let x: number = 0;
    let y: number = 0;
    let x0: number = 0;
    let y0: number = 0;
    let x1: number = 0;
    let y1: number = 0;
    let x2: number = 0;
    let y2: number = 0;
    let i: number = 0;
    let segment: DOMSegment;
    let command: string;

    for (i = 0; i < itenCount; ++i) {
      command = segList.getItem(i).pathSegTypeAsLetter;
      segment = segList.getItem(i);

      if (/[MLHVCSQTA]/.test(command)) {
        if ("x" in segment) x = segment.x;
        if ("y" in segment) y = segment.y;
      } else {
        if ("x1" in segment) x1 = x + segment.x1;
        if ("x2" in segment) x2 = x + segment.x2;
        if ("y1" in segment) y1 = y + segment.y1;
        if ("y2" in segment) y2 = y + segment.y2;
        if ("x" in segment) x += segment.x;
        if ("y" in segment) y += segment.y;
        switch (command) {
          case "m":
            segList.replaceItem(path.createSVGPathSegMovetoAbs(x, y), i);
            break;
          case "l":
            segList.replaceItem(path.createSVGPathSegLinetoAbs(x, y), i);
            break;
          case "h":
            segList.replaceItem(path.createSVGPathSegLinetoHorizontalAbs(x), i);
            break;
          case "v":
            segList.replaceItem(path.createSVGPathSegLinetoVerticalAbs(y), i);
            break;
          case "c":
            segList.replaceItem(
              path.createSVGPathSegCurvetoCubicAbs(x, y, x1, y1, x2, y2),
              i
            );
            break;
          case "s":
            segList.replaceItem(
              path.createSVGPathSegCurvetoCubicSmoothAbs(x, y, x2, y2),
              i
            );
            break;
          case "q":
            segList.replaceItem(
              path.createSVGPathSegCurvetoQuadraticAbs(x, y, x1, y1),
              i
            );
            break;
          case "t":
            segList.replaceItem(
              path.createSVGPathSegCurvetoQuadraticSmoothAbs(x, y),
              i
            );
            break;
          case "a":
            segList.replaceItem(
              path.createSVGPathSegArcAbs(
                x,
                y,
                segment.r1,
                segment.r2,
                segment.angle,
                segment.largeArcFlag,
                segment.sweepFlag
              ),
              i
            );
            break;
          case "z":
          case "Z":
            x = x0;
            y = y0;
            break;
        }
      }
      // Record the start of a subpath
      if (command == "M" || command == "m") (x0 = x), (y0 = y);
    }
  }

  // takes an SVG transform string and returns corresponding SVGMatrix
  // from https://github.com/fontello/svgpath
  transformParse(transformString: string): Matrix {
    const operations: Map<string, boolean> = new Map([
      ["matrix", true],
      ["scale", true],
      ["rotate", true],
      ["translate", true],
      ["skewX", true],
      ["skewY", true]
    ]);

    var CMD_SPLIT_RE =
      /\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(\s*(.+?)\s*\)[\s,]*/;
    var PARAMS_SPLIT_RE = /[\s,]+/;

    const matrix: Matrix = new Matrix();
    let cmd: string = "";
    let params: Array<number>;

    // Split value into ['', 'translate', '10 50', '', 'scale', '2', '', 'rotate',  '-45', '']
    transformString.split(CMD_SPLIT_RE).forEach((item: string) => {
      // Skip empty elements
      if (!item.length) {
        return;
      }

      // remember operation
      if (operations.get(item)) {
        cmd = item;
        return;
      }

      // extract params & att operation to matrix
      params = item.split(PARAMS_SPLIT_RE).map((i) => +i || 0);

      matrix.transform(cmd, params);
    });

    return matrix;
  }

  // recursively apply the transform property to the given element
  applyTransform(element: SVGPathSegElement, globalTransform: string = "") {
    globalTransform = globalTransform || "";

    var transformString = element.getAttribute("transform") || "";
    transformString = globalTransform + transformString;

    const transform: Matrix =
      transformString && transformString.length > 0
        ? this.transformParse(transformString)
        : new Matrix();

    const transformArray: Float32Array = transform.toArray();
    // decompose affine matrix to rotate, scale components (translate is just the 3rd column)
    const rotate: number =
      (Math.atan2(transformArray[1], transformArray[3]) * 180) / Math.PI;
    const scale: number = Math.sqrt(
      transformArray[0] * transformArray[0] +
        transformArray[2] * transformArray[2]
    );

    if (
      element.tagName == "g" ||
      element.tagName == "svg" ||
      element.tagName == "defs" ||
      element.tagName == "clipPath"
    ) {
      element.removeAttribute("transform");
      const children: Array<SVGElement> = Array.prototype.slice.call(
        element.childNodes
      );
      let i: number = 0;
      let child: SVGPathSegElement;

      for (i = 0; i < children.length; ++i) {
        child = children[i] as SVGPathSegElement;

        if (child.tagName) {
          // skip text nodes
          this.applyTransform(child, transformString);
        }
      }
    } else if (transform && !transform.isIdentity()) {
      const id = element.getAttribute("id");
      const className = element.getAttribute("class");
      const point1: FloatPoint = new FloatPoint();
      const point2: FloatPoint = new FloatPoint();
      let transformProperty: string;
      let transformed: Float32Array;
      let i: number = 0;

      switch (element.tagName) {
        case PrimitiveTagName.Ellipse:
          // the goal is to remove the transform property, but an ellipse without a transform will have no rotation
          // for the sake of simplicity, we will replace the ellipse with a path, and apply the transform to that path
          const path: SVGPathSegElement = this.svg.createElementNS(
            element.namespaceURI,
            PrimitiveTagName.Path
          ) as SVGPathSegElement;
          point1.x = parseFloat(element.getAttribute("cx"));
          point1.y = parseFloat(element.getAttribute("cy"));
          point2.x = parseFloat(element.getAttribute("rx"));
          point2.y = parseFloat(element.getAttribute("ry"));
          var move = path.createSVGPathSegMovetoAbs(
            point1.x - point2.x,
            point1.y
          );
          var arc1 = path.createSVGPathSegArcAbs(
            point1.x + point2.x,
            point1.y,
            point2.x,
            point2.y,
            0,
            1,
            0
          );
          var arc2 = path.createSVGPathSegArcAbs(
            point1.x - point2.x,
            point1.y,
            point2.x,
            point2.y,
            0,
            1,
            0
          );

          path.pathSegList.appendItem(move);
          path.pathSegList.appendItem(arc1);
          path.pathSegList.appendItem(arc2);
          path.pathSegList.appendItem(path.createSVGPathSegClosePath());

          transformProperty = element.getAttribute("transform");

          if (transformProperty) {
            path.setAttribute("transform", transformProperty);
          }

          element.parentElement.replaceChild(path, element);

          element = path;

        case PrimitiveTagName.Path:
          this.pathToAbsolute(element);
          const segList: SVGSegList = element.pathSegList;
          const prev: FloatPoint = new FloatPoint();
          const itemCount: number = segList.numberOfItems;
          let transformedPath = "";
          let s: DOMSegment;
          let command: string = "";

          for (i = 0; i < itemCount; ++i) {
            s = segList.getItem(i);
            command = s.pathSegTypeAsLetter;

            if (command == "H") {
              segList.replaceItem(
                element.createSVGPathSegLinetoAbs(s.x, prev.y),
                i
              );
              s = segList.getItem(i);
            } else if (command == "V") {
              segList.replaceItem(
                element.createSVGPathSegLinetoAbs(prev.x, s.y),
                i
              );
              s = segList.getItem(i);
            }
            // currently only works for uniform scale, no skew
            // todo: fully support arbitrary affine transforms...
            else if (command == "A") {
              segList.replaceItem(
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
              s = segList.getItem(i);
            }

            const transPoint: FloatPoint = new FloatPoint();
            const transPoint1: FloatPoint = new FloatPoint();
            const transPoint2: FloatPoint = new FloatPoint();
            let transformed: Float32Array;

            if ("x" in s && "y" in s) {
              transformed = transform.calc(s.x, s.y);
              prev.x = s.x;
              prev.y = s.y;
              transPoint.x = transformed[0];
              transPoint.y = transformed[1];
            }
            if ("x1" in s && "y1" in s) {
              transformed = transform.calc(s.x1, s.y1);
              transPoint1.x = transformed[0];
              transPoint1.y = transformed[1];
            }
            if ("x2" in s && "y2" in s) {
              transformed = transform.calc(s.x2, s.y2);
              transPoint2.x = transformed[0];
              transPoint2.y = transformed[1];
            }

            let commandStringTransformed = ``;

            //MLHVCSQTA
            //H and V are transformed to "L" commands above so we don't need to handle them. All lowercase (relative) are already handled too (converted to absolute)
            switch (command) {
              case "M":
                commandStringTransformed += `${command} ${transPoint.x} ${transPoint.y}`;
                break;
              case "L":
                commandStringTransformed += `${command} ${transPoint.x} ${transPoint.y}`;
                break;
              case "C":
                commandStringTransformed += `${command} ${transPoint1.x} ${transPoint1.y}  ${transPoint2.x} ${transPoint2.y} ${transPoint.x} ${transPoint.y}`;
                break;
              case "S":
                commandStringTransformed += `${command} ${transPoint2.x} ${transPoint2.y} ${transPoint.x} ${transPoint.y}`;
                break;
              case "Q":
                commandStringTransformed += `${command} ${transPoint1.x} ${transPoint1.y} ${transPoint.x} ${transPoint.y}`;
                break;
              case "T":
                commandStringTransformed += `${command} ${transPoint.x} ${transPoint.y}`;
                break;
              case "A":
                const largeArcFlag = s.largeArcFlag ? 1 : 0;
                const sweepFlag = s.sweepFlag ? 1 : 0;
                commandStringTransformed += `${command} ${s.r1} ${s.r2} ${s.angle} ${largeArcFlag} ${sweepFlag} ${transPoint.x} ${transPoint.y}`;
                break;
              case "H":
                commandStringTransformed += `L ${transPoint.x} ${transPoint.y}`;
                break;
              case "V":
                commandStringTransformed += `L ${transPoint.x} ${transPoint.y}`;
                break;
              case "Z":
              case "z":
                commandStringTransformed += command;
                break;
              default:
                console.log(
                  "FOUND COMMAND NOT HANDLED BY COMMAND STRING BUILDER",
                  command
                );
                break;
            }

            transformedPath += commandStringTransformed;
          }

          element.setAttribute("d", transformedPath);
          element.removeAttribute("transform");
          break;
        case PrimitiveTagName.Circle:
          point1.x = parseFloat(element.getAttribute("cx"));
          point1.y = parseFloat(element.getAttribute("cy"));
          const r: number = parseFloat(element.getAttribute("r"));
          transformed = transform.calc(point1.x, point1.y);
          element.setAttribute("cx", transformed[0].toString());
          element.setAttribute("cy", transformed[1].toString());
          // skew not supported
          element.setAttribute("r", (r * scale).toString());
          break;
        case PrimitiveTagName.Line:
          point1.x = parseFloat(element.getAttribute("x1"));
          point1.y = parseFloat(element.getAttribute("y1"));
          point2.x = parseFloat(element.getAttribute("x2"));
          point2.y = parseFloat(element.getAttribute("y2"));
          const transformedStartPt = transform.calc(point1.x, point1.y);
          const transformedEndPt = transform.calc(point2.x, point2.y);
          element.setAttribute("x1", transformedStartPt[0].toString());
          element.setAttribute("y1", transformedStartPt[1].toString());
          element.setAttribute("x2", transformedEndPt[0].toString());
          element.setAttribute("y2", transformedEndPt[1].toString());
          break;
        case PrimitiveTagName.Rect:
          // similar to the ellipse, we'll replace rect with polygon
          const polygon: SVGPathSegElement = this.svg.createElementNS(
            element.namespaceURI,
            PrimitiveTagName.Polygon
          ) as SVGPathSegElement;

          const p1 = this.svgRoot.createSVGPoint();
          const p2 = this.svgRoot.createSVGPoint();
          const p3 = this.svgRoot.createSVGPoint();
          const p4 = this.svgRoot.createSVGPoint();

          p1.x = parseFloat(element.getAttribute("x")) || 0;
          p1.y = parseFloat(element.getAttribute("y")) || 0;

          p2.x = p1.x + parseFloat(element.getAttribute("width"));
          p2.y = p1.y;

          p3.x = p2.x;
          p3.y = p1.y + parseFloat(element.getAttribute("height"));

          p4.x = p1.x;
          p4.y = p3.y;

          polygon.points.appendItem(p1);
          polygon.points.appendItem(p2);
          polygon.points.appendItem(p3);
          polygon.points.appendItem(p4);

          transformProperty = element.getAttribute("transform");

          if (transformProperty) {
            polygon.setAttribute("transform", transformProperty);
          }

          element.parentElement.replaceChild(polygon, element);
          element = polygon;
        case PrimitiveTagName.Polygon:
        case PrimitiveTagName.Polyline:
          const pointCount: number = element.points.numberOfItems;
          let transformedPoly = "";
          let point: DOMPoint;

          for (i = 0; i < pointCount; ++i) {
            point = element.points.getItem(i);
            transformed = transform.calc(point.x, point.y);
            transformedPoly += `${transformed[0]},${transformed[1]} `;
          }

          element.setAttribute("points", transformedPoly);
          element.removeAttribute("transform");
          break;
      }
      if (id) {
        element.setAttribute("id", id);
      }
      if (className) {
        element.setAttribute("class", className);
      }
    }
  }

  // bring all child elements to the top level
  flatten(element: SVGElement) {
    const childCount: number = element.childNodes.length;
    let i: number = 0;

    for (i = 0; i < childCount; ++i) {
      this.flatten(element.childNodes[i] as SVGElement);
    }

    if (element.tagName != "svg") {
      while (element.childNodes.length > 0) {
        element.parentElement.appendChild(element.childNodes[0]);
      }
    }
  }

  // remove all elements with tag name not in the whitelist
  // use this to remove <text>, <g> etc that don't represent shapes
  filter(whiteList: Array<PrimitiveTagName>, element: SVGElement = null): void {
    if (!whiteList || whiteList.length == 0) {
      throw Error("invalid whitelist");
    }

    const elementItem: SVGElement = element || this.svgRoot;
    const childCount: number = elementItem.childNodes.length;
    let i: number = 0;

    for (i = 0; i < childCount; ++i) {
      this.filter(whiteList, elementItem.childNodes[i] as SVGElement);
    }

    if (
      childCount == 0 &&
      whiteList.indexOf(element.tagName as PrimitiveTagName) < 0
    ) {
      element.parentElement.removeChild(element);
    }
  }

  // split a compound path (paths with M, m commands) into an array of paths
  splitPath(path: SVGPathSegElement): Array<Node> {
    if (!path || path.tagName != "path" || !path.parentElement) {
      return null;
    }

    const segList: Array<DOMSegment> = [];
    let i: number = 0;
    let p: SVGPathSegElement;
    let segmant: DOMSegment;
    let lastM: number = 0;

    // make copy of seglist (appending to new path removes it from the original pathseglist)
    for (i = 0; i < path.pathSegList.numberOfItems; ++i) {
      segList.push(path.pathSegList.getItem(i));
    }

    for (i = segList.length - 1; i >= 0; --i) {
      segmant = segList[i];

      if (
        (i > 0 && segmant.pathSegTypeAsLetter == "M") ||
        segmant.pathSegTypeAsLetter == "m"
      ) {
        lastM = i;
        break;
      }
    }

    if (lastM == 0) {
      return null; // only 1 M command, no need to split
    }

    const paths: Array<SVGPathSegElement> = [];
    let command: string = "";
    let x: number = 0;
    let y: number = 0;
    let x0: number = 0;
    let y0: number = 0;

    for (i = 0; i < segList.length; ++i) {
      segmant = segList[i];
      command = segmant.pathSegTypeAsLetter;

      if (command == "M" || command == "m") {
        p = path.cloneNode() as SVGPathSegElement;
        p.setAttribute("d", "");
        paths.push(p);
      }

      if (/[MLHVCSQTA]/.test(command)) {
        if ("x" in segmant) x = segmant.x;
        if ("y" in segmant) y = segmant.y;

        p.pathSegList.appendItem(segmant);
      } else {
        if ("x" in segmant) x += segmant.x;
        if ("y" in segmant) y += segmant.y;
        if (command == "m") {
          p.pathSegList.appendItem(path.createSVGPathSegMovetoAbs(x, y));
        } else {
          if (command == "Z" || command == "z") {
            x = x0;
            y = y0;
          }
          p.pathSegList.appendItem(segmant);
        }
      }
      // Record the start of a subpath
      if (command == "M" || command == "m") {
        (x0 = x), (y0 = y);
      }
    }

    const addedPaths: Array<Node> = [];
    const pathCount: number = paths.length;
    let pathElement: SVGPathSegElement;

    for (i = 0; i < pathCount; ++i) {
      pathElement = paths[i] as SVGPathSegElement;
      // don't add trivial paths from sequential M commands
      if (pathElement.pathSegList.numberOfItems > 1) {
        path.parentElement.insertBefore(pathElement, path);
        addedPaths.push(pathElement);
      }
    }

    path.remove();

    return addedPaths;
  }

  // recursively run the given function on the given element
  recurse(element: Element | ChildNode, func: Function): void {
    // only operate on original DOM tree, ignore any children that are added. Avoid infinite loops
    const children: Array<ChildNode> = Array.prototype.slice.call(
      element.childNodes
    );
    const count: number = children.length;
    let i: number = 0;

    for (i = 0; i < count; ++i) {
      this.recurse(children[i], func);
    }

    func(element);
  }

  public svgToPolygon(
    svgPolygon: Element,
    curveTolerance: number,
    clipperScale: number
  ) {
    //@ts-ignore
    const polygon = poligonify(
      svgPolygon,
      this.conf.tolerance,
      this.conf.toleranceSvg
    ) as ArrayPolygon;
    const p = this.svgToClipper(polygon, clipperScale);
    // remove self-intersections and find the biggest polygon that's left
    const simple = ClipperLib.Clipper.SimplifyPolygon(
      p,
      ClipperLib.PolyFillType.pftNonZero
    );

    if (!simple || simple.length == 0) {
      return null;
    }

    let i = 0;
    let biggest = simple[0];
    let biggestArea = Math.abs(ClipperLib.Clipper.Area(biggest));
    let area;

    for (i = 1; i < simple.length; ++i) {
      area = Math.abs(ClipperLib.Clipper.Area(simple[i]));

      if (area > biggestArea) {
        biggest = simple[i];
        biggestArea = area;
      }
    }

    // clean up singularities, coincident points and edges
    const clean = ClipperLib.Clipper.CleanPolygon(
      biggest,
      curveTolerance * clipperScale
    );

    if (!clean || clean.length === 0) {
      return null;
    }

    return this.clipperToSvg(clean, clipperScale);
  }

  public svgToTreePolygon(
    paths: Array<Element>,
    curveTolerance: number,
    clipperScale: number
  ): Array<ArrayPolygon> {
    let i;
    const result: Array<ArrayPolygon> = new Array<ArrayPolygon>();
    const numChildren = paths.length;
    const trashold: number = curveTolerance * curveTolerance;
    let poly;

    for (i = 0; i < numChildren; ++i) {
      poly = this.svgToPolygon(paths[i], curveTolerance, clipperScale);

      // todo: warn user if poly could not be processed and is excluded from the nest
      if (poly && poly.length > 2 && Math.abs(polygonArea(poly)) > trashold) {
        //@ts-ignore
        poly.source = i;
        //@ts-ignore
        result.push(poly);
      }
    }

    SvgParser.toTree(result);

    return result;
  }

  // converts a polygon from normal float coordinates to integer coordinates used by clipper, as well as x/y -> X/Y
  svgToClipper(
    polygon: ArrayPolygon,
    clipperScale: number
  ): Array<{ X: number; Y: number }> {
    const result = [];
    let i = 0;

    for (i = 0; i < polygon.length; ++i) {
      result.push({
        X: polygon[i].x,
        Y: polygon[i].y
      });
    }

    ClipperLib.JS.ScaleUpPath(result, clipperScale);

    return result;
  }

  clipperToSvg(
    polygon: Array<{ X: number; Y: number }>,
    clipperScale: number
  ): ArrayPolygon {
    const count = polygon.length;
    const result: ArrayPolygon = new Array<Point>() as ArrayPolygon;
    let i = 0;

    for (i = 0; i < count; ++i) {
      result.push({
        x: polygon[i].X / clipperScale,
        y: polygon[i].Y / clipperScale
      });
    }

    return result;
  }

  static toTree(list: Array<ArrayPolygon>, idStart = 0) {
    const parents = [];
    let i: number = 0;
    let j: number = 0;
    // assign a unique id to each leaf
    let outerNode: ArrayPolygon;
    let innerNode: ArrayPolygon;
    let isChild: boolean = false;

    for (i = 0; i < list.length; ++i) {
      outerNode = list[i];
      isChild = false;

      for (j = 0; j < list.length; ++j) {
        innerNode = list[j];

        if (j !== i && pointInPolygon(outerNode[0], innerNode)) {
          if (!innerNode.children) {
            innerNode.children = [];
          }

          innerNode.children.push(outerNode);
          outerNode.parent = innerNode;
          isChild = true;
          break;
        }
      }

      if (!isChild) {
        parents.push(outerNode);
      }
    }

    for (i = 0; i < list.length; ++i) {
      if (parents.indexOf(list[i]) < 0) {
        list.splice(i, 1);
        i--;
      }
    }

    const parentCount = parents.length;
    let childId = idStart + parentCount;
    let parent;

    for (i = 0; i < parentCount; ++i) {
      parent = parents[i];
      parent.id = idStart + i;

      if (parent.children) {
        childId = SvgParser.toTree(parent.children, childId);
      }
    }

    return childId;
  }
}
