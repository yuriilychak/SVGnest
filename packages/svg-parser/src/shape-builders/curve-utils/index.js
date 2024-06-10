import ArcSegment from './arc-segment';
import CubicSegment from './cubic-segment';
import QuadraticSegment from './quadratic-segment';

const SEGMENT_BUILDERS = new Map([
    ['T', QuadraticSegment],
    ['t', QuadraticSegment],
    ['Q', QuadraticSegment],
    ['q', QuadraticSegment],
    ['S', CubicSegment],
    ['s', CubicSegment],
    ['C', CubicSegment],
    ['c', CubicSegment],
    ['A', ArcSegment],
    ['a', ArcSegment]
]);

export default SEGMENT_BUILDERS;
