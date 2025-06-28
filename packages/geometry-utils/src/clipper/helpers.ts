import { cycle_index_wasm } from 'wasm-nesting';
import { PointI32 } from '../geometry';

export function getArea(poly: PointI32[]): number {
    const pointCount: number = poly.length;

    if (pointCount < 3) {
        return 0;
    }

    let result: number = 0;
    let i: number = 0;
    let j: number = 0;

    for (i = 0, j = pointCount - 1; i < pointCount; ++i) {
        result += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
        j = i;
    }

    return -result * 0.5;
}

export function absArea(poly: PointI32[]): number {
    return Math.abs(getArea(poly));
}

export function cleanPolygon(path: PointI32[], distance: number): PointI32[] {
    //distance = proximity in units/pixels below which vertices will be stripped.
    //Default ~= sqrt(2) so when adjacent vertices or semi-adjacent vertices have
    //both x & y coords within 1 unit, then the second vertex will be stripped.
    let pointCount: number = path.length;
    const result: PointI32[] = new Array<PointI32>(pointCount);
    const marked: boolean[] = new Array<boolean>(false);
    let i: number = 0;

    for (i = 0; i < pointCount; ++i) {
        result[i] = path[i].clone();
    }

    const distSqrd = distance * distance;
    let currIndex: number = 0;
    let prevIndex: number = 0; 
    let nextIndex: number = 0;

    while(!marked[currIndex] && pointCount > 2) {
        prevIndex = cycle_index_wasm(currIndex, pointCount, -1);
        nextIndex = cycle_index_wasm(currIndex, pointCount, 1);

        if (result[currIndex].closeTo(result[prevIndex], distSqrd)) {
            marked[prevIndex] = false;
            result.splice(currIndex, 1);
            marked.splice(currIndex, 1);
            --pointCount;
            continue;
        } 
        
        if (result[prevIndex].closeTo(result[nextIndex], distSqrd)) {
            marked[prevIndex] = false;
            result.splice(currIndex, 2);
            marked.splice(currIndex, 2);
            pointCount -= 2;
            continue;
        }
        
        if (PointI32.slopesNearCollinear(result[prevIndex], result[currIndex], result[nextIndex], distSqrd)) {
            marked[prevIndex] = false;
            result.splice(currIndex, 1);
            marked.splice(currIndex, 1);
            --pointCount;
            continue;
        }

        marked[currIndex] = true;
        currIndex = cycle_index_wasm(currIndex, pointCount, 1);
    }

    return pointCount < 3 ? [] : result;
}

export function cleanPolygons(polys: PointI32[][], distance: number): PointI32[][] {
    const polygonCount: number = polys.length;
    const result: PointI32[][] = new Array(polygonCount);
    let i: number = 0;

    for (i = 0; i < polygonCount; ++i) {
        result[i] = cleanPolygon(polys[i], distance);
    }

    return result;
}

export function showError(message: string): void {
    try {
        throw new Error(message);
    } catch (err) {
        console.warn(err.message);
    }
}
