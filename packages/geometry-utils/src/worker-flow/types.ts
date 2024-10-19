import Polygon from '../polygon';
import PointPool from '../point-pool';

export type WorkerConfig = { pointPool: PointPool; isInit: boolean; polygons: Polygon[] };
