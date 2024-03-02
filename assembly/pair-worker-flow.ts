import Point from "./point";
import Polygon from "./polygon";

// returns an interior NFP for the special case where A is a rectangle
export function noFitPolygonRectangle(a: Polygon, b: Polygon): Polygon[] {
  const firstB: Point = b.firstPoint as Point;
  const minA: Point = a.min;
  const maxA: Point = a.max;
  const minB: Point = b.min;
  const maxB: Point = b.max;
  const offsetA: Point = Point.sub(minA, maxA);
  const offsetB: Point = Point.sub(minB, maxB);

  if (offsetB.x > offsetA.x || offsetB.y > offsetA.y) {
    return [];
  }

  const minOffsetAB: Point = Point.from(minA).add(firstB).sub(minB);
  const maxOffsetAB: Point = Point.from(maxA).add(firstB).sub(maxB);
  const polygon = Polygon.fromPoints([
    new Point(minOffsetAB.x, minOffsetAB.y),
    new Point(maxOffsetAB.x, minOffsetAB.y),
    new Point(maxOffsetAB.x, maxOffsetAB.y),
    new Point(minOffsetAB.x, maxOffsetAB.y)
  ]);

  return [polygon];
}
