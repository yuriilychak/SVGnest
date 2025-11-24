import { clean_polygon_wasm, polygon_area_i32 } from 'wasm-nesting';
import { PointI32 } from '../geometry';
import { Point } from '../types';

export function getArea(poly: Point<Int32Array>[]): number {
    const polyData = new Int32Array(poly.reduce<number[]>((acc: number[], point: Point<Int32Array>) => acc.concat([point.x, point.y]), []));

    return -polygon_area_i32(polyData);
}

export function absArea(poly: Point<Int32Array>[]): number {
    return Math.abs(getArea(poly));
}

export function cleanPolygon(path: Point<Int32Array>[], distance: number): Point<Int32Array>[] {
    const polyData = new Int32Array(path.reduce<number[]>((acc: number[], point: Point<Int32Array>) => acc.concat([point.x, point.y]), []));
    const cleanedData = clean_polygon_wasm(polyData, distance);
    const pointCount = cleanedData.length / 2;

    const result: Point<Int32Array>[] = new Array(pointCount);

    for (let i = 0; i < pointCount; i++) {
        result[i] = PointI32.create(cleanedData[i * 2], cleanedData[i * 2 + 1]);
    }

    return result;
}

export function cleanPolygons(polys: Point<Int32Array>[][], distance: number): Point<Int32Array>[][] {
    const polygonCount: number = polys.length;
    const result: Point<Int32Array>[][] = new Array(polygonCount);
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
