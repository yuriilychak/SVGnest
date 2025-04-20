import PointPool from '../point-pool';
import { PointF64 } from '../point';
import PlaceContent from './place-content';
import PairContent from './pair-content';
import PolygonF32 from '../polygon-f32';
import PointPoolF32 from '../point-pool-f32';

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

export type SegmentCheck = {
    point: PointF64;
    polygon: PolygonF32;
    segmentStart: PointF64;
    segmentEnd: PointF64;
    checkStart: PointF64;
    checkEnd: PointF64;
    target: PointF64;
    offset: PointF64;
};
