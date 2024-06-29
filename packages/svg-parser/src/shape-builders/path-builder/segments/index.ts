import ArcSegment from './arc-segment';
import BasicSegment from './basic-segment';
import CubicSegment from './cubic-segment';
import QuadraticSegment from './quadratic-segment';
import { PATH_COMMAND } from '../../../types';

const SEGMENT_BUILDERS = new Map<PATH_COMMAND, typeof BasicSegment>([
    [PATH_COMMAND.T, QuadraticSegment],
    [PATH_COMMAND.t, QuadraticSegment],
    [PATH_COMMAND.Q, QuadraticSegment],
    [PATH_COMMAND.q, QuadraticSegment],
    [PATH_COMMAND.S, CubicSegment],
    [PATH_COMMAND.s, CubicSegment],
    [PATH_COMMAND.C, CubicSegment],
    [PATH_COMMAND.c, CubicSegment],
    [PATH_COMMAND.A, ArcSegment],
    [PATH_COMMAND.a, ArcSegment]
]);

export default SEGMENT_BUILDERS;
