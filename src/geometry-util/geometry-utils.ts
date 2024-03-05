//@ts-ignore
// returns the area of the polygon, assuming no self-intersections

import Point from "../point";
import Rect from "../rect";
import { IPolygon, ClipperPoint, IPoint } from "../interfaces";

//TODO: depreacete when polygone will be moved to class

// private shared variables/methods

// a negative area indicates counter-clockwise winding direction
export function polygonArea(polygon: IPolygon): number {
  const pointCount: number = polygon.length;
  let result: number = 0;
  let i: number = 0;
  let currentPoint: IPoint;
  let prevPoint: IPoint;

  for (i = 0; i < pointCount; ++i) {
    prevPoint = polygon.at((i - 1 + pointCount) % pointCount);
    currentPoint = polygon.at(i);
    result += (prevPoint.x + currentPoint.x) * (prevPoint.y - currentPoint.y);
  }

  return 0.5 * result;
}

// returns the rectangular bounding box of the given polygon
export function getPolygonBounds(polygon: IPolygon): Rect | null {
  if (polygon.length < 3) {
    return null;
  }

  const pointCount: number = polygon.length;
  const min: Point = Point.from(polygon.at(0));
  const max: Point = Point.from(polygon.at(0));
  let i: number = 0;

  for (i = 1; i < pointCount; ++i) {
    max.max(polygon.at(i));
    min.min(polygon.at(i));
  }

  return Rect.fromPoints(min, max);
}

export function rotatePolygon(polygon: IPolygon, angle: number): IPolygon {
  const result: IPolygon = new Array<IPoint>() as IPolygon;
  const pointCount: number = polygon.length;
  const radianAngle: number = (angle * Math.PI) / 180;
  let i: number = 0;

  for (i = 0; i < pointCount; ++i) {
    result.push(Point.from(polygon.at(i)).rotate(radianAngle));
  }

  if (polygon.children && polygon.children.length > 0) {
    const childCount = polygon.children.length;

    result.children = [];

    for (i = 0; i < childCount; ++i) {
      result.children.push(rotatePolygon(polygon.children[i], angle));
    }
  }

  // reset bounding box
  const bounds = getPolygonBounds(result);
  result.x = bounds.x;
  result.y = bounds.y;
  result.width = bounds.width;
  result.height = bounds.height;

  return result;
}

// return true if point is in the polygon, false if outside, and null if exactly on a point or edge
export function pointInPolygon(point: IPoint, polygon: IPolygon): number {
  if (polygon.length < 3) {
    return -1;
  }

  if (!polygon.offset) {
    polygon.offset = Point.empty();
  }

  const innerPoint: Point = Point.from(point);
  const pointCount = polygon.length;
  let result: boolean = false;
  const currentPoint: Point = Point.empty();
  const prevPoint: Point = Point.empty();
  let i: number = 0;

  for (i = 0; i < pointCount; ++i) {
    currentPoint.set(polygon.at(i)).add(polygon.offset);
    prevPoint
      .set(polygon.at((i - 1 + pointCount) % pointCount))
      .add(polygon.offset);

    if (
      innerPoint.almostEqual(currentPoint) ||
      innerPoint.onSegment(currentPoint, prevPoint)
    ) {
      return -1; // no result or exactly on the segment
    }

    if (Point.almostEqual(currentPoint, prevPoint)) {
      // ignore very small lines
      continue;
    }

    if (
      currentPoint.y - point.y > 0 !== prevPoint.y - point.y > 0 &&
      point.x - currentPoint.x <
        ((prevPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (prevPoint.y - currentPoint.y)
    ) {
      result = !result;
    }
  }

  return result ? 1 : 0;
}

// jsClipper uses X/Y instead of x/y...
export function toClipperCoordinates(
  polygon: IPolygon,
  scale: number = 1
): ClipperPoint[] {
  const size: number = polygon.length;
  const result: ClipperPoint[] = [];
  let i: number = 0;
  let point: IPoint;

  for (i = 0; i < size; ++i) {
    point = polygon[i];
    result.push({ X: point.x * scale, Y: point.y * scale });
  }

  return result;
}

export function toNestCoordinates(
  polygon: ClipperPoint[],
  scale: number
): IPolygon {
  const size: number = polygon.length;
  const result: IPolygon = new Array<IPoint>() as IPolygon;
  let i: number = 0;
  let point: ClipperPoint;

  for (i = 0; i < size; ++i) {
    point = polygon[i];
    result.push({
      x: point.X / scale,
      y: point.Y / scale
    });
  }

  return result;
}
