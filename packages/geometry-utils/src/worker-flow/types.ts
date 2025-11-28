import PlaceContent from './place-content';
import type { Point, PointPool, Polygon, TypedArray } from '../types';

export type TypedConfig<T extends TypedArray = Float64Array> = {
    pointPool: PointPool<T>;
    polygons: Polygon<T>[];
    memSeg: T;
}

export type WorkerConfig = {
    f32: TypedConfig<Float32Array>;
    f64: TypedConfig<Float64Array>;
    isInit: boolean;
    buffer: ArrayBuffer;
    placeContent: PlaceContent;
};

export type SegmentCheck<T extends TypedArray = Float64Array> = {
    point: Point<T>;
    polygon: Polygon<T>;
    segmentStart: Point<T>;
    segmentEnd: Point<T>;
    checkStart: Point<T>;
    checkEnd: Point<T>;
    target: Point<T>;
    offset: Point<T>;
};
