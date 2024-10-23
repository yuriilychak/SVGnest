import Polygon from '../polygon';
import PointPool from '../point-pool';
import Point from '../point';

export type WorkerConfig = {
    pointPool: PointPool;
    isInit: boolean;
    polygons: Polygon[];
    buffer: ArrayBuffer;
    memSeg: Float64Array;
};

export type SegmentCheck = {
    point: Point;
    polygon: Polygon;
    segmentStart: Point;
    segmentEnd: Point;
    checkStart: Point;
    checkEnd: Point;
    target: Point;
    offset: Point;
};
