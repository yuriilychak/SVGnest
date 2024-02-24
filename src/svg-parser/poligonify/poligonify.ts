import FloatPoint from "../../float-point";
import { almostEqual } from "../../util";
import { PrimitiveTagName } from "../enums";
import { Arc, CubicBezier, QuadraticBezier } from "./path-util";

function parseElipse(element: Element, tolerance: number): Array<FloatPoint> {
  const result: Array<FloatPoint> = [];
  // same as circle case. There is probably a way to reduce points but for convenience we will just flatten the equivalent circular polygon
  const rx: number = parseFloat(element.getAttribute("rx"));
  const ry: number = parseFloat(element.getAttribute("ry"));
  const cx: number = parseFloat(element.getAttribute("cx"));
  const cy: number = parseFloat(element.getAttribute("cy"));
  const maxRadius: number = Math.max(rx, ry);
  const count: number = Math.max(
    Math.ceil((2 * Math.PI) / Math.acos(1 - tolerance / maxRadius)),
    3
  );
  const step: number = (2 * Math.PI) / count;
  let i: number = 0;
  let theta: number = 0;

  for (i = 0; i < count; ++i) {
    theta = i * step;
    result.push(
      new FloatPoint(rx * Math.cos(theta) + cx, ry * Math.sin(theta) + cy)
    );
  }

  return result;
}

function parseCircle(element: Element, tolerance: number): Array<FloatPoint> {
  const result: Array<FloatPoint> = [];
  const radius: number = parseFloat(element.getAttribute("r"));
  const cx: number = parseFloat(element.getAttribute("cx"));
  const cy: number = parseFloat(element.getAttribute("cy"));
  // num is the smallest number of segments required to approximate the circle to the given tolerance
  const count: number = Math.max(
    Math.ceil((2 * Math.PI) / Math.acos(1 - tolerance / radius)),
    3
  );
  const step: number = (2 * Math.PI) / count;
  let i: number = 0;
  let theta: number = 0;

  for (i = 0; i < count; ++i) {
    theta = i * step;

    result.push(
      new FloatPoint(
        radius * Math.cos(theta) + cx,
        radius * Math.sin(theta) + cy
      )
    );
  }

  return result;
}

function parseRect(element: Element): Array<FloatPoint> {
  const p1: FloatPoint = new FloatPoint(
    parseFloat(element.getAttribute("x")) || 0,
    parseFloat(element.getAttribute("y")) || 0
  );
  const p2: FloatPoint = new FloatPoint(
    p1.x + parseFloat(element.getAttribute("width")),
    p1.y
  );
  const p3: FloatPoint = new FloatPoint(
    p2.x,
    p1.y + parseFloat(element.getAttribute("height"))
  );
  const p4: FloatPoint = new FloatPoint(p1.x, p3.y);

  return [p1, p2, p3, p4];
}

function parsePolygon(element: SVGPolygonElement): Array<FloatPoint> {
  const result: Array<FloatPoint> = [];
  const count: number = element.points.numberOfItems;
  let i: number = 0;

  for (i = 0; i < count; ++i) {
    result.push(FloatPoint.from(element.points.getItem(i)));
  }

  return result;
}

function parsePath(
  element: SVGPathElement,
  tolerance: number
): Array<FloatPoint> {
  const result: Array<FloatPoint> = [];
  let i: number = 0;
  let j: number = 0;
  // we'll assume that splitpath has already been run on this path, and it only has one M/m command
  //@ts-ignore
  const segList = element.pathSegList;
  var x = 0,
    y = 0,
    x0 = 0,
    y0 = 0,
    x1 = 0,
    y1 = 0,
    x2 = 0,
    y2 = 0,
    prevx = 0,
    prevy = 0,
    prevx1 = 0,
    prevy1 = 0,
    prevx2 = 0,
    prevy2 = 0;

  let pointList: Array<FloatPoint>;

  for (i = 0; i < segList.numberOfItems; ++i) {
    var s = segList.getItem(i);
    var command = s.pathSegTypeAsLetter;

    prevx = x;
    prevy = y;

    prevx1 = x1;
    prevy1 = y1;

    prevx2 = x2;
    prevy2 = y2;

    if (/[MLHVCSQTA]/.test(command)) {
      if ("x1" in s) x1 = s.x1;
      if ("x2" in s) x2 = s.x2;
      if ("y1" in s) y1 = s.y1;
      if ("y2" in s) y2 = s.y2;
      if ("x" in s) x = s.x;
      if ("y" in s) y = s.y;
    } else {
      if ("x1" in s) x1 = x + s.x1;
      if ("x2" in s) x2 = x + s.x2;
      if ("y1" in s) y1 = y + s.y1;
      if ("y2" in s) y2 = y + s.y2;
      if ("x" in s) x += s.x;
      if ("y" in s) y += s.y;
    }
    switch (command) {
      // linear line types
      case "m":
      case "M":
      case "l":
      case "L":
      case "h":
      case "H":
      case "v":
      case "V":
        result.push(new FloatPoint(x, y));
        break;
      // Quadratic Beziers
      case "t":
      case "T":
        // implicit control point
        if (
          i > 0 &&
          /[QqTt]/.test(segList.getItem(i - 1).pathSegTypeAsLetter)
        ) {
          x1 = prevx + (prevx - prevx1);
          y1 = prevy + (prevy - prevy1);
        } else {
          x1 = prevx;
          y1 = prevy;
        }
      case "q":
      case "Q":
        pointList = QuadraticBezier(
          new FloatPoint(prevx, prevy),
          new FloatPoint(x, y),
          new FloatPoint(x1, y1),
          tolerance
        );
        pointList.shift(); // firstpoint would already be in the poly
        for (j = 0; j < pointList.length; ++j) {
          result.push(FloatPoint.from(pointList[j]));
        }
        break;
      case "s":
      case "S":
        if (
          i > 0 &&
          /[CcSs]/.test(segList.getItem(i - 1).pathSegTypeAsLetter)
        ) {
          x1 = prevx + (prevx - prevx2);
          y1 = prevy + (prevy - prevy2);
        } else {
          x1 = prevx;
          y1 = prevy;
        }
      case "c":
      case "C":
        pointList = CubicBezier(
          new FloatPoint(prevx, prevy),
          new FloatPoint(x, y),
          new FloatPoint(x1, y1),
          new FloatPoint(x2, y2),
          tolerance
        );
        pointList.shift(); // firstpoint would already be in the poly
        for (j = 0; j < pointList.length; ++j) {
          result.push(FloatPoint.from(pointList[j]));
        }
        break;
      case "a":
      case "A":
        pointList = Arc(
          new FloatPoint(prevx, prevy),
          new FloatPoint(x, y),
          s.r1,
          s.r2,
          s.angle,
          s.largeArcFlag,
          s.sweepFlag,
          tolerance
        );
        pointList.shift();

        for (j = 0; j < pointList.length; ++j) {
          result.push(FloatPoint.from(pointList[j]));
        }
        break;
      case "z":
      case "Z":
        x = x0;
        y = y0;
        break;
    }
    // Record the start of a subpath
    if (command == "M" || command == "m") (x0 = x), (y0 = y);
  }

  return result;
}

function elementToPolygon(
  element: Element,
  tolerance: number
): Array<FloatPoint> {
  switch (element.tagName) {
    case PrimitiveTagName.Polygon:
    case PrimitiveTagName.Polyline:
      return parsePolygon(element as SVGPolygonElement);
    case PrimitiveTagName.Rect:
      return parseRect(element);
    case PrimitiveTagName.Circle:
      return parseCircle(element, tolerance);
    case PrimitiveTagName.Ellipse:
      return parseElipse(element, tolerance);
    case PrimitiveTagName.Path:
      return parsePath(element as SVGPathElement, tolerance);
    default:
      return [];
  }
}

// return a polygon from the given SVG element in the form of an array of points
export default function polygonify(
  element: Element,
  tolerance: number,
  toleranceSvg: number
): Array<FloatPoint> {
  const result: Array<FloatPoint> = elementToPolygon(element, tolerance);

  // do not include last point if coincident with starting point
  while (
    result.length > 0 &&
    almostEqual(result[0].x, result[result.length - 1].x, toleranceSvg) &&
    almostEqual(result[0].y, result[result.length - 1].y, toleranceSvg)
  ) {
    result.pop();
  }

  return result;
}
