import PointPool from '../point-pool';
import PlaceContent from './place-content';
import PairContent from './pair-content';
import PolygonF32 from '../polygon-f32';
import PointPoolF32 from '../point-pool-f32';
import type { Point, TypedArray } from '../types';

export type WorkerConfig = {
    pointPool: PointPool;
    pointPoolF32: PointPoolF32;
    isInit: boolean;
    polygonsF32: PolygonF32[];
    buffer: ArrayBuffer;
    bufferF32: ArrayBuffer;
    memSeg: Float64Array;
    memSegF32: Float32Array;
    placeContent: PlaceContent;
    pairContent: PairContent;
};

export type SegmentCheck<T extends TypedArray = Float64Array> = {
    point: Point<T>;
    polygon: PolygonF32;
    segmentStart: Point<T>;
    segmentEnd: Point<T>;
    checkStart: Point<T>;
    checkEnd: Point<T>;
    target: Point<T>;
    offset: Point<T>;
};
