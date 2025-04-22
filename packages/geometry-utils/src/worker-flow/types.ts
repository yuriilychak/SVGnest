import PlaceContent from './place-content';
import PairContent from './pair-content';
import type { Point, PointPool, Polygon, TypedArray } from '../types';

export type WorkerConfig = {
    pointPool: PointPool<Float64Array>;
    pointPoolF32: PointPool<Float32Array>;
    isInit: boolean;
    polygons: Polygon<Float64Array>[];
    polygonsF32: Polygon<Float32Array>[];
    buffer: ArrayBuffer;
    bufferF32: ArrayBuffer;
    memSeg: Float64Array;
    memSegF32: Float32Array;
    placeContent: PlaceContent;
    pairContent: PairContent;
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
