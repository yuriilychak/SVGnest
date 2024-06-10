import BasicShapeBuilder from './basic-shape-builder';
import SEGMENT_BUILDERS from './curve-utils';

export default class PathBuilder extends BasicShapeBuilder {
    getResult(element) {
        // we'll assume that splitpath has already been run on this path, and it only has one M/m command
        const segments = element.pathSegList;
        const segmentCount = segments.numberOfItems;
        const point = { x: 0, y: 0 };
        const point0 = { x: 0, y: 0 };
        const point1 = { x: 0, y: 0 };
        const point2 = { x: 0, y: 0 };
        const prev = { x: 0, y: 0 };
        const prev1 = { x: 0, y: 0 };
        const prev2 = { x: 0, y: 0 };
        let i = 0;
        let segment = null;
        let command = '';
        let updateMultiplier = 0;
        let config = null;
        let segmentBuilder = null;

        for (i = 0; i < segmentCount; ++i) {
            config = null;
            segment = segments.getItem(i);
            command = segment.pathSegTypeAsLetter;

            prev.x = point.x;
            prev.y = point.y;

            prev1.x = point1.x;
            prev1.y = point1.y;

            prev2.x = point2.x;
            prev2.y = point2.y;

            updateMultiplier = PathBuilder.UPDATE_COMMANDS.includes(command) ?
                0 :
                1;

            if ('x1' in segment) {
                point1.x = point.x * updateMultiplier + segment.x1;
            }

            if ('y1' in segment) {
                point1.y = point.y * updateMultiplier + segment.y1;
            }

            if ('x2' in segment) {
                point2.x = point.x * updateMultiplier + segment.x2;
            }

            if ('y2' in segment) {
                point2.y = point.y * updateMultiplier + segment.y2;
            }

            if ('x' in segment) {
                point.x = point.x * updateMultiplier + segment.x;
            }

            if ('y' in segment) {
                point.y = point.y * updateMultiplier + segment.y;
            }

            switch (command.toUpperCase()) {
                // linear line types
                case 'M':
                case 'L':
                case 'H':
                case 'V':
                    this.result.push({ ...point });
                    break;
                // Quadratic Beziers
                case 'T':
                    // implicit control point
                    if (
                        PathBuilder.checkPrevSegment(
                            segments,
                            i,
                            PathBuilder.QUADRATIC_COMMANDS
                        )
                    ) {
                        point1.x = -prev1.x;
                        point1.y = -prev1.y;
                    } else {
                        point1.x = prev.x;
                        point1.y = prev.y;
                    }

                    config = PathBuilder.getQuadraticConfig(prev, point, point1);
                    break;
                case 'Q':
                    config = PathBuilder.getQuadraticConfig(prev, point, point1);
                    break;
                case 'S':
                    if (
                        PathBuilder.checkPrevSegment(
                            segments,
                            i,
                            PathBuilder.CUBIC_COMMANDS
                        )
                    ) {
                        point1.x = prev.x + (prev.x - prev2.x);
                        point1.y = prev.y + (prev.y - prev2.y);
                    } else {
                        point1.x = prev.x;
                        point1.y = prev.y;
                    }

                    config = PathBuilder.getCubicConfig(
                        prev,
                        point,
                        point1,
                        point2
                    );
                    break;
                case 'C':
                    config = PathBuilder.getCubicConfig(
                        prev,
                        point,
                        point1,
                        point2
                    );
                    break;
                case 'A':
                    config = PathBuilder.getArcConfig(prev, point, segment);
                    break;
                case 'Z':
                    point.x = point0.x;
                    point.y = point0.y;
                    break;
                default:
            }

            if (config) {
                segmentBuilder = SEGMENT_BUILDERS.get(command);

                this.insertPoints(
                    segmentBuilder.lineraize(config, this.tolerance)
                );
            }
            // Record the start of a subpath
            if (PathBuilder.SUBPATH_COMMANDS.includes(command)) {
                point0.x = point.x;
                point0.y = point.y;
            }
        }

        return super.getResult(element);
    }

    static getQuadraticConfig(point1, point2, control) {
        return { point1, point2, control };
    }

    static getCubicConfig(point1, point2, control1, control2) {
        return { point1, point2, control1, control2 };
    }

    static getArcConfig(point1, point2, segment) {
        return {
            point1,
            point2,
            rx: segment.r1,
            ry: segment.r2,
            angle: segment.angle,
            largeArc: segment.largeArcFlag,
            sweep: segment.sweepFlag
        };
    }

    static checkPrevSegment(segments, index, commands) {
        if (index === 0) {
            return false;
        }

        const command = segments
            .getItem(index - 1)
            .pathSegTypeAsLetter.toUpperCase();

        return commands.includes(command);
    }

    static UPDATE_COMMANDS = ['M', 'L', 'H', 'V', 'C', 'S', 'Q', 'T', 'A'];

    static SUBPATH_COMMANDS = ['M', 'm'];

    static QUADRATIC_COMMANDS = ['Q', 'T'];

    static CUBIC_COMMANDS = ['C', 'S'];

    static create(tolerance, svgTolerance) {
        return new PathBuilder(tolerance, svgTolerance);
    }
}
