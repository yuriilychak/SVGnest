import Polygon from '../polygon';
import PointPool from '../point-pool';
import Point from '../point';

export type WorkerConfig = { pointPool: PointPool; isInit: boolean; polygons: Polygon[] };

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

export type Vector = {
    value: Point;
    start: number;
    end: number;
};
