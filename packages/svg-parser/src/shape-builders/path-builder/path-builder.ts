import { SVGPathSeg, SVGPathSegArcAbs, SVGPathSegCurvetoCubicAbs } from '../../svg-path-seg';
import { SVGPathSegList } from '../../svg-path-seg-list';
import { IPoint, PATH_TAG } from '../../types';
import BasicShapeBuilder from '../basic-shape-builder';
import SEGMENT_BUILDERS from './segments';
import BasicSegment from './segments/basic-segment';
import { ICubicSegmentData, IQuadraticSegmentData, IBasicSegmentData, IArcSegmentData } from './types';

export default class PathBuilder extends BasicShapeBuilder {
    public getResult(element: SVGElement): IPoint[] {
        // we'll assume that splitpath has already been run on this path, and it only has one M/m command
        // @ts-ignore
        const segments: SVGPathSegList = element.pathSegList as SVGPathSegList;
        const segmentCount: number = segments.numberOfItems;
        const point: IPoint = { x: 0, y: 0 };
        const point0: IPoint = { x: 0, y: 0 };
        const point1: IPoint = { x: 0, y: 0 };
        const point2: IPoint = { x: 0, y: 0 };
        const prev: IPoint = { x: 0, y: 0 };
        const prev1: IPoint = { x: 0, y: 0 };
        const prev2: IPoint = { x: 0, y: 0 };
        let i: number = 0;
        let segment: SVGPathSeg;
        let command: PATH_TAG;
        let updateMultiplier: number = 0;
        let config: IBasicSegmentData;
        let segmentBuilder: typeof BasicSegment;

        for (i = 0; i < segmentCount; ++i) {
            config = null;
            segment = segments.getItem(i);
            command = segment.pathSegTypeAsLetter as PATH_TAG;

            prev.x = point.x;
            prev.y = point.y;

            prev1.x = point1.x;
            prev1.y = point1.y;

            prev2.x = point2.x;
            prev2.y = point2.y;

            updateMultiplier = PathBuilder.UPDATE_COMMANDS.includes(command) ? 0 : 1;

            if ('x1' in segment) {
                point1.x = point.x * updateMultiplier + (segment as SVGPathSegCurvetoCubicAbs).x1;
            }

            if ('y1' in segment) {
                point1.y = point.y * updateMultiplier + (segment as SVGPathSegCurvetoCubicAbs).y1;
            }

            if ('x2' in segment) {
                point2.x = point.x * updateMultiplier + (segment as SVGPathSegCurvetoCubicAbs).x2;
            }

            if ('y2' in segment) {
                point2.y = point.y * updateMultiplier + (segment as SVGPathSegCurvetoCubicAbs).y2;
            }

            if ('x' in segment) {
                point.x = point.x * updateMultiplier + segment.x;
            }

            if ('y' in segment) {
                point.y = point.y * updateMultiplier + segment.y;
            }

            switch (command.toUpperCase() as PATH_TAG) {
                // linear line types
                case PATH_TAG.M:
                case PATH_TAG.L:
                case PATH_TAG.H:
                case PATH_TAG.V:
                    this.result.push({ ...point });
                    break;
                // Quadratic Beziers
                case PATH_TAG.T:
                    // implicit control point
                    if (PathBuilder.checkPrevSegment(segments, i, PathBuilder.QUADRATIC_COMMANDS)) {
                        point1.x = -prev1.x;
                        point1.y = -prev1.y;
                    } else {
                        point1.x = prev.x;
                        point1.y = prev.y;
                    }

                    config = PathBuilder.getQuadraticConfig(prev, point, point1);
                    break;
                case PATH_TAG.Q:
                    config = PathBuilder.getQuadraticConfig(prev, point, point1);
                    break;
                case PATH_TAG.S:
                    if (PathBuilder.checkPrevSegment(segments, i, PathBuilder.CUBIC_COMMANDS)) {
                        point1.x = prev.x + (prev.x - prev2.x);
                        point1.y = prev.y + (prev.y - prev2.y);
                    } else {
                        point1.x = prev.x;
                        point1.y = prev.y;
                    }

                    config = PathBuilder.getCubicConfig(prev, point, point1, point2);
                    break;
                case PATH_TAG.C:
                    config = PathBuilder.getCubicConfig(prev, point, point1, point2);
                    break;
                case PATH_TAG.A:
                    config = PathBuilder.getArcConfig(prev, point, segment as SVGPathSegArcAbs);
                    break;
                case PATH_TAG.Z:
                    point.x = point0.x;
                    point.y = point0.y;
                    break;
                default:
            }

            if (config !== null) {
                segmentBuilder = SEGMENT_BUILDERS.get(command);

                this.insertPoints(segmentBuilder.lineraize(config, this.tolerance));
            }
            // Record the start of a subpath
            if (PathBuilder.SUBPATH_COMMANDS.includes(command)) {
                point0.x = point.x;
                point0.y = point.y;
            }
        }

        return super.getResult(element);
    }

    private static getQuadraticConfig(point1: IPoint, point2: IPoint, control: IPoint): IQuadraticSegmentData {
        return { point1, point2, control };
    }

    private static getCubicConfig(point1: IPoint, point2: IPoint, control1: IPoint, control2: IPoint): ICubicSegmentData {
        return { point1, point2, control1, control2 };
    }

    private static getArcConfig(point1: IPoint, point2: IPoint, segment: SVGPathSegArcAbs): IArcSegmentData {
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

    private static checkPrevSegment(segments: SVGPathSegList, index: number, commands: string[]) {
        if (index === 0) {
            return false;
        }

        const command = segments.getItem(index - 1).pathSegTypeAsLetter.toUpperCase();

        return commands.includes(command);
    }

    private static UPDATE_COMMANDS: PATH_TAG[] = [
        PATH_TAG.M,
        PATH_TAG.L,
        PATH_TAG.H,
        PATH_TAG.V,
        PATH_TAG.C,
        PATH_TAG.S,
        PATH_TAG.Q,
        PATH_TAG.T,
        PATH_TAG.A
    ];

    private static SUBPATH_COMMANDS: PATH_TAG[] = [PATH_TAG.M, PATH_TAG.m];

    private static QUADRATIC_COMMANDS: PATH_TAG[] = [PATH_TAG.Q, PATH_TAG.T];

    private static CUBIC_COMMANDS: PATH_TAG[] = [PATH_TAG.C, PATH_TAG.S];

    public static create(tolerance: number, svgTolerance: number): BasicShapeBuilder {
        return new PathBuilder(tolerance, svgTolerance);
    }
}
