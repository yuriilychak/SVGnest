import { BoundRect, IPoint, IPolygon } from './types';
import Point from './point';
import { cycleIndex } from './shared-helpers';

// return true if point is in the polygon, false if outside, and null if exactly on a point or edge
export function pointInPolygon(point: IPoint, polygon: IPolygon): boolean {
    if (!polygon || polygon.length < 3) {
        return null;
    }

    const innerPoint: Point = Point.from(point);
    const currPoint: Point = Point.zero();
    const prevPoint: Point = Point.zero();
    const pointCount: number = polygon.length;
    let inside: boolean = false;
    let i: number = 0;

    for (i = 0; i < pointCount; ++i) {
        currPoint.update(polygon[i]);
        prevPoint.update(polygon[cycleIndex(i, pointCount, -1)]);

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

// Main function to nest polygons
export function nestPolygons(polygons: IPolygon[]): void {
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
    let parent: IPolygon = null;

    for (i = 0; i < parentCount; ++i) {
        parent = parents[i];

        if (parent.children) {
            nestPolygons(parent.children);
        }
    }
}

export function getPlacementData(binPolygon: IPolygon, tree: IPolygon[], placementsData: Float64Array): number {
    const placementCount = placementsData[1];
    const binArea: number = Math.abs(polygonArea(binPolygon));
    let placedCount: number = 0;
    let placedArea: number = 0;
    let totalArea: number = 0;
    let pathId: number = 0;
    let itemData: number = 0;
    let offset: number = 0;
    let size: number = 0;
    let i: number = 0;
    let j: number = 0;

    for (i = 0; i < placementCount; ++i) {
        totalArea += binArea;
        itemData = placementsData[2 + i];
        offset = itemData >>> 16;
        size = itemData - (offset << 16);
        placedCount += size;

        for (j = 0; j < size; ++j) {
            pathId = placementsData[offset + j] >>> 16;
            placedArea += Math.abs(polygonArea(tree[pathId]));
        }
    }

    return placedCount + placedArea / totalArea;
}

export function getAdam(tree: IPolygon[]): IPolygon[] {
    const result: IPolygon[] = tree.slice();

    return result.sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));
}

// returns a random angle of insertion
export function randomAngle(part: IPolygon, angleCount: number, binBounds: BoundRect): number {
    const lastIndex: number = angleCount - 1;
    const angles: number[] = [];
    const step: number = 360 / angleCount;
    let angle: number = 0;
    let bounds: BoundRect = null;
    let i: number = 0;
    let j: number = 0;

    for (i = 0; i < angleCount; ++i) {
        angles.push(i * step);
    }

    for (i = lastIndex; i > 0; --i) {
        j = Math.floor(Math.random() * (i + 1));
        angle = angles[i];
        angles[i] = angles[j];
        angles[j] = angle;
    }

    let rotatedPart: IPolygon = null;

    for (i = 0; i < angleCount; ++i) {
        rotatedPart = rotatePolygon(part, angles[i]);
        bounds = getPolygonBounds(rotatedPart);

        // don't use obviously bad angles where the part doesn't fit in the bin
        if (bounds.width < binBounds.width && bounds.height < binBounds.height) {
            return angles[i];
        }
    }

    return 0;
}
