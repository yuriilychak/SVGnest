import FloatPoint from "../../../float-point";

interface Segment {
  p1: FloatPoint;
  p2: FloatPoint;
  c1: FloatPoint;
  c2: FloatPoint;
}

function isFlat(
  p1: FloatPoint,
  p2: FloatPoint,
  c1: FloatPoint,
  c2: FloatPoint,
  tol: number
): boolean {
  const ux: number = 3 * c1.x - 2 * p1.x - p2.x;
  const uy: number = 3 * c1.y - 2 * p1.y - p2.y;
  const vx: number = 3 * c2.x - 2 * p2.x - p1.x;
  const vy: number = 3 * c2.y - 2 * p2.y - p1.y;
  const x = ux * ux < vx * vx ? vx : ux;
  const y = uy * uy < vy * vy ? vy : vx;

  return x * x + y * y <= 16 * tol * tol;
}

function subdivide(
  p1: FloatPoint,
  p2: FloatPoint,
  c1: FloatPoint,
  c2: FloatPoint,
  t: number
): Array<Segment> {
  const mid1: FloatPoint = new FloatPoint(
    p1.x + (c1.x - p1.x) * t,
    p1.y + (c1.y - p1.y) * t
  );
  const mid2: FloatPoint = new FloatPoint(
    c2.x + (p2.x - c2.x) * t,
    c2.y + (p2.y - c2.y) * t
  );
  const mid3: FloatPoint = new FloatPoint(
    c1.x + (c2.x - c1.x) * t,
    c1.y + (c2.y - c1.y) * t
  );
  const mida: FloatPoint = new FloatPoint(
    mid1.x + (mid3.x - mid1.x) * t,
    mid1.y + (mid3.y - mid1.y) * t
  );
  const midb: FloatPoint = new FloatPoint(
    mid3.x + (mid2.x - mid3.x) * t,
    mid3.y + (mid2.y - mid3.y) * t
  );
  const midx: FloatPoint = new FloatPoint(
    mida.x + (midb.x - mida.x) * t,
    mida.y + (midb.y - mida.y) * t
  );

  return [
    { p1: p1, p2: midx, c1: mid1, c2: mida },
    { p1: midx, p2: p2, c1: midb, c2: mid2 }
  ];
}

export default function linearize(
  p1: FloatPoint,
  p2: FloatPoint,
  c1: FloatPoint,
  c2: FloatPoint,
  tol: number
): Array<FloatPoint> {
  const result: Array<FloatPoint> = [p1]; // list of points to return
  const todo: Array<Segment> = [{ p1: p1, p2: p2, c1: c1, c2: c2 }]; // list of Beziers to divide
  let segment: Segment;

  // recursion could stack overflow, loop instead

  while (todo.length > 0) {
    segment = todo[0];

    if (isFlat(segment.p1, segment.p2, segment.c1, segment.c2, tol)) {
      // reached subdivision limit
      result.push(new FloatPoint(segment.p2.x, segment.p2.y));
      todo.shift();
    } else {
      var divided = subdivide(
        segment.p1,
        segment.p2,
        segment.c1,
        segment.c2,
        0.5
      );
      todo.splice(0, 1, divided[0], divided[1]);
    }
  }
  return result;
}
