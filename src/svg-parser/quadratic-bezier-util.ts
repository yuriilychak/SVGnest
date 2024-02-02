import FloatPoint from "../float-point";
import { Point } from "../interfaces";

interface Segment {
  p1: Point;
  p2: Point;
  c1: Point;
}

function isFlat(p1: Point, p2: Point, c1: Point, tol: number): boolean {
  const ux: number = 2 * c1.x - p1.x - p2.x;
  const uy: number = 2 * c1.y - p1.y - p2.y;

  return ux * ux + uy * uy <= 4 * tol * tol;
}

// subdivide a single Bezier
// t is the percent along the Bezier to divide at. eg. 0.5
function subdivide(p1: Point, p2: Point, c1: Point, t: number): Array<Segment> {
  const mid1 = new FloatPoint(
    p1.x + (c1.x - p1.x) * t,
    p1.y + (c1.y - p1.y) * t
  );

  const mid2 = new FloatPoint(
    c1.x + (p2.x - c1.x) * t,
    c1.y + (p2.y - c1.y) * t
  );

  const mid3 = new FloatPoint(
    mid1.x + (mid2.x - mid1.x) * t,
    mid1.y + (mid2.y - mid1.y) * t
  );

  return [
    { p1: p1, p2: mid3, c1: mid1 },
    { p1: mid3, p2: p2, c1: mid2 }
  ];
}

// Bezier algos from http://algorithmist.net/docs/subdivision.pdf
// Roger Willcocks bezier flatness criterion
// turn Bezier into line segments via de Casteljau, returns an array of points
export default function linearize(
  p1: Point,
  p2: Point,
  c1: Point,
  tol: number
): Array<Point> {
  const result: Array<Point> = [p1]; // list of points to return
  const todo: Array<Segment> = [{ p1: p1, p2: p2, c1: c1 }]; // list of Beziers to divide
  let segment: Segment;

  // recursion could stack overflow, loop instead
  while (todo.length > 0) {
    segment = todo[0];

    if (isFlat(segment.p1, segment.p2, segment.c1, tol)) {
      // reached subdivision limit
      result.push(new FloatPoint(segment.p2.x, segment.p2.y));
      todo.shift();
    } else {
      var divided = subdivide(segment.p1, segment.p2, segment.c1, 0.5);
      todo.splice(0, 1, divided[0], divided[1]);
    }
  }
  return result;
}
