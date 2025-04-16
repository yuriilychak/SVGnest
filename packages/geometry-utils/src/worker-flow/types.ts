import Polygon from '../polygon';
import PointPool from '../point-pool';
import { PointF64 } from '../point';
import PlaceContent from './place-content';
import PairContent from './pair-content';

export type WorkerConfig = {
    pointPool: PointPool;
    isInit: boolean;
    polygons: Polygon[];
    buffer: ArrayBuffer;
    memSeg: Float64Array;
    placeContent: PlaceContent;
    pairContent: PairContent;
};

export type SegmentCheck = {
    point: PointF64;
    polygon: Polygon;
    segmentStart: PointF64;
    segmentEnd: PointF64;
    checkStart: PointF64;
    checkEnd: PointF64;
    target: PointF64;
    offset: PointF64;
};
