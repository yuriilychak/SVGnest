import BasicShapeBuilder from "./basic-shape-builder";
import { Arc, CubicBezier, QuadraticBezier } from "./curve-utils";

export default class PathBuilder extends BasicShapeBuilder {
    addPointsFromCurve(points) {
        const pointCount = points.length;
        let i = 0;

        points.shift(); // firstpoint would already be in the poly

        for (i = 0; i < pointCount; ++i) {
          this.result.push({ x: points[j].x, y: points[j].y });
        }
    }

    getResult(element) {
        // we'll assume that splitpath has already been run on this path, and it only has one M/m command
        const segments = element.pathSegList;
        let x = 0;
        let y = 0;
        let x0 = 0;
        let y0 = 0;
        let x1 = 0;
        let y1 = 0;
        let x2 = 0;
        let y2 = 0;
        let prevx = 0;
        let prevy = 0;
        let prevx1 = 0;
        let prevy1 = 0;
        let prevx2 = 0;
        let prevy2 = 0;
        let i = 0;
        let segment;
        let command;

        for (i = 0; i < segments.numberOfItems; ++i) {
          segment = segments.getItem(i);
          command = segment.pathSegTypeAsLetter;

          prevx = x;
          prevy = y;

          prevx1 = x1;
          prevy1 = y1;

          prevx2 = x2;
          prevy2 = y2;

          if (/[MLHVCSQTA]/.test(command)) {
            if ("x1" in segment) x1 = segment.x1;
            if ("x2" in segment) x2 = segment.x2;
            if ("y1" in segment) y1 = segment.y1;
            if ("y2" in segment) y2 = segment.y2;
            if ("x" in segment) x = segment.x;
            if ("y" in segment) y = segment.y;
          } else {
            if ("x1" in segment) x1 = x + segment.x1;
            if ("x2" in segment) x2 = x + segment.x2;
            if ("y1" in segment) y1 = y + segment.y1;
            if ("y2" in segment) y2 = y + segment.y2;
            if ("x" in segment) x += segment.x;
            if ("y" in segment) y += segment.y;
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
              this.result.push({ x, y });
              break;
            // Quadratic Beziers
            case "t":
            case "T":
              // implicit control point
              if (
                i > 0 &&
                /[QqTt]/.test(segments.getItem(i - 1).pathSegTypeAsLetter)
              ) {
                x1 = -prevx1;
                y1 = -prevy1;
              } else {
                x1 = prevx;
                y1 = prevy;
              }
            case "q":
            case "Q":
                this.addPointsFromCurve(QuadraticBezier(
                { x: prevx, y: prevy },
                { x: x, y: y },
                { x: x1, y: y1 },
                this.tolerance
              ))
              break;
            case "s":
            case "S":
              if (
                i > 0 &&
                /[CcSs]/.test(segments.getItem(i - 1).pathSegTypeAsLetter)
              ) {
                x1 = prevx + (prevx - prevx2);
                y1 = prevy + (prevy - prevy2);
              } else {
                x1 = prevx;
                y1 = prevy;
              }
            case "c":
            case "C":
                this.addPointsFromCurve(CubicBezier(
                { x: prevx, y: prevy },
                { x: x, y: y },
                { x: x1, y: y1 },
                { x: x2, y: y2 },
                this.tolerance
              ));
              break;
            case "a":
            case "A":
              this.addPointsFromCurve(Arc(
                { x: prevx, y: prevy },
                { x: x, y: y },
                segment.r1,
                segment.r2,
                segment.angle,
                segment.largeArcFlag,
                segment.sweepFlag,
                this.tolerance
              ));
              break;
            case "z":
            case "Z":
              x = x0;
              y = y0;
              break;
          }
          // Record the start of a subpath
          if (PathBuilder.SUBPATH_COMMANDS.includes(command)) {
            x0 = x; 
            y0 = y;
        }
        }

        return super.getResult(element);
    }

    static SUBPATH_COMMANDS = ['M', 'm'];

    static create(tolerance, svgTolerance) {
        return new PathBuilder(tolerance, svgTolerance);
    }
}