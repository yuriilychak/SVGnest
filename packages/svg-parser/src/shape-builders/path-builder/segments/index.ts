import ArcSegment from './arc-segment';
import BasicSegment from './basic-segment';
import CubicSegment from './cubic-segment';
import QuadraticSegment from './quadratic-segment';
import { PATH_TAG } from '../../../types';

const SEGMENT_BUILDERS = new Map<PATH_TAG, typeof BasicSegment>([
    [PATH_TAG.T, QuadraticSegment],
    [PATH_TAG.t, QuadraticSegment],
    [PATH_TAG.Q, QuadraticSegment],
    [PATH_TAG.q, QuadraticSegment],
    [PATH_TAG.S, CubicSegment],
    [PATH_TAG.s, CubicSegment],
    [PATH_TAG.C, CubicSegment],
    [PATH_TAG.c, CubicSegment],
    [PATH_TAG.A, ArcSegment],
    [PATH_TAG.a, ArcSegment]
]);

export default SEGMENT_BUILDERS;
