import { BoundRect, IPoint, IPolygon, NFPContent } from './types';
import Point from './point';
import { TOL } from './constants';
import { almostEqual, cycleIndex, midValue } from './shared-helpers';

// returns true if p lies on the line segment defined by AB, but not at any endpoints
// may need work!
export function onSegment(A: IPoint, B: IPoint, p: IPoint): boolean {
    const innerP: Point = Point.from(p);
    const innerA: Point = Point.from(A);
    const midX: number = midValue(innerP.x, A.x, B.x);
    const midY: number = midValue(innerP.y, A.y, B.y);
    // vertical line
    if (almostEqual(A.x, B.x) && almostEqual(p.x, A.x)) {
        return !almostEqual(p.y, B.y) && !almostEqual(p.y, A.y) && midY < 0;
    }

    // horizontal line
    if (almostEqual(A.y, B.y) && almostEqual(p.y, A.y)) {
        return !almostEqual(p.x, B.x) && !almostEqual(p.x, A.x) && midX < 0;
    }

    if (
        // range check
        midX > 0 ||
        midY > 0 ||
        // exclude end points
        innerP.almostEqual(A) ||
        innerP.almostEqual(B)
    ) {
        return false;
    }

    const subA = Point.from(p).sub(A);
    const subAB = Point.from(B).sub(A);

    if (Math.abs(subA.cross(subAB)) > TOL) {
        return false;
    }

    const dot = subA.dot(subAB);

    if (dot < TOL) {
        return false;
    }

    const len2 = innerA.len2(B);

    return !(dot > len2 || almostEqual(dot, len2));
}

// return true if point is in the polygon, false if outside, and null if exactly on a point or edge
export function pointInPolygon(point: IPoint, polygon: IPolygon): boolean {
    if (!polygon || polygon.length < 3) {
        return null;
    }

    const offset: Point = Point.create(polygon.offsetx || 0, polygon.offsety || 0);
    const innerPoint: Point = Point.from(point);
    const currPoint: Point = Point.zero();
    const prevPoint: Point = Point.zero();
    const pointCount: number = polygon.length;
    let inside: boolean = false;
    let i: number = 0;

    for (i = 0; i < pointCount; ++i) {
        currPoint.update(polygon[i]).add(offset);
        prevPoint.update(polygon[cycleIndex(i, pointCount, -1)]).add(offset);

        //  no result                            exactly on the segment
        if (currPoint.almostEqual(innerPoint) || innerPoint.onSegment(currPoint, prevPoint)) {
            return null;
        }

        if (currPoint.almostEqual(prevPoint)) {
            // ignore very small lines
            continue;
        }

        if (
            currPoint.y > innerPoint.y !== prevPoint.y > innerPoint.y &&
            innerPoint.x < innerPoint.interpolateX(prevPoint, currPoint)
        ) {
            inside = !inside;
        }
    }

    return inside;
}

// returns the rectangular bounding box of the given polygon
export function getPolygonBounds(polygon: IPoint[]): BoundRect {
    if (!polygon || polygon.length < 3) {
        return null;
    }

    const pointCount: number = polygon.length;
    const min: Point = Point.from(polygon[0]);
    const size: Point = Point.from(polygon[0]);
    let i: number = 0;

    for (i = 1; i < pointCount; ++i) {
        min.min(polygon[i]);
        size.max(polygon[i]);
    }

    size.sub(min);
    const result = { x: min.x, y: min.y, width: size.x, height: size.y };

    return result;
}

export function rotatePolygon(polygon: IPolygon, angle: number): IPolygon {
    const pointCount: number = polygon.length;
    const rotated: IPolygon = [] as IPolygon;
    const radianAngle: number = (angle * Math.PI) / 180;
    const point: Point = Point.zero();
    let i: number = 0;

    for (i = 0; i < pointCount; ++i) {
        rotated.push(point.update(polygon[i]).rotate(radianAngle).export());
    }
    // reset bounding box
    const bounds: BoundRect = getPolygonBounds(rotated);

    rotated.x = bounds.x;
    rotated.y = bounds.y;
    rotated.width = bounds.width;
    rotated.height = bounds.height;

    return rotated;
}

// returns the area of the polygon, assuming no self-intersections
// a negative area indicates counter-clockwise winding direction
export function polygonArea(polygon: IPoint[]): number {
    const pointCount = polygon.length;
    let prevPoint: IPoint = null;
    let currPoint: IPoint = null;
    let result: number = 0;
    let i: number = 0;

    for (i = 0; i < pointCount; ++i) {
        prevPoint = polygon[cycleIndex(i, pointCount, -1)];
        currPoint = polygon[i];
        result += (prevPoint.x + currPoint.x) * (prevPoint.y - currPoint.y);
    }

    return 0.5 * result;
}

export function normalizePolygon(polygon: IPolygon): void {
    // remove duplicate endpoints, ensure counterclockwise winding direction
    const start: IPoint = polygon[0];
    const end: IPoint = polygon[polygon.length - 1];

    if (start === end || (almostEqual(start.x, end.x) && almostEqual(start.y, end.y))) {
        polygon.pop();
    }

    if (polygonArea(polygon) > 0) {
        polygon.reverse();
    }
}

export function generateNFPCacheKey(
    rotationSplit: number,
    inside: boolean,
    polygon1: IPolygon,
    polygon2: IPolygon,
    rotation1: number = polygon1.rotation,
    rotation2: number = polygon2.rotation
) {
    const rotationOffset: number = Math.round(360 / rotationSplit);
    const rotationIndex1: number = Math.round(rotation1 / rotationOffset);
    const rotationIndex2: number = Math.round(rotation2 / rotationOffset);

    return (
        ((polygon1.id + 1) << 0) +
        ((polygon2.id + 1) << 10) +
        (rotationIndex1 << 19) +
        (rotationIndex2 << 23) +
        ((inside ? 1 : 0) << 27)
    );
}

export function keyToNFPData(numKey: number, rotationSplit: number): NFPContent {
    const rotationOffset: number = Math.round(360 / rotationSplit);
    const result = new Float32Array(5);
    let accumulator: number = 0;
    const inside = numKey >> 27;

    accumulator = accumulator + (inside << 27);

    const rotationIndexB = (numKey - accumulator) >> 23;

    accumulator = accumulator + (rotationIndexB << 23);

    const rotationIndexA = (numKey - accumulator) >> 19;

    accumulator = accumulator + (rotationIndexA << 19);

    const idB = (numKey - accumulator) >> 10;

    accumulator = accumulator + (idB << 10);

    const idA = numKey - accumulator;

    result[4] = inside;
    result[3] = rotationIndexB * rotationOffset;
    result[2] = rotationIndexA * rotationOffset;
    result[1] = idB - 1;
    result[0] = idA - 1;

    return {
        A: idA,
        B: idB,
        inside: Boolean(inside),
        Arotation: rotationIndexA * rotationOffset,
        Brotation: rotationIndexB * rotationOffset
    };
}

// Main function to nest polygons
export function nestPolygons(polygons: IPolygon[], startId: number = 0): number {
    const parents: IPolygon[] = [];
    let i: number = 0;
    let j: number = 0;

    // assign a unique id to each leaf
    let outerNode: IPolygon = null;
    let innerNode: IPolygon = null;
    let isChild: boolean = false;

    for (i = 0; i < polygons.length; ++i) {
        outerNode = polygons[i];
        isChild = false;

        for (j = 0; j < polygons.length; ++j) {
            innerNode = polygons[j];

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

    for (i = 0; i < polygons.length; ++i) {
        if (parents.indexOf(polygons[i]) < 0) {
            polygons.splice(i, 1);
            i--;
        }
    }

    const parentCount: number = parents.length;
    let childId: number = startId + parentCount;
    let parent: IPolygon = null;

    for (i = 0; i < parentCount; ++i) {
        parent = parents[i];
        parent.id = startId + i;

        if (parent.children) {
            childId = nestPolygons(parent.children, childId);
        }
    }

    return childId;
}
