import { INode } from 'svgson';
import {
    parseSVG,
    makeAbsolute,
    CommandMadeAbsolute,
    Command,
    EllipticalArcCommandMadeAbsolute,
    CurveToCommandMadeAbsolute
} from 'svg-path-parser';

import { IPoint, PATH_COMMAND } from '../../types';
import BasicShapeBuilder from '../basic-shape-builder';
import SEGMENT_BUILDERS from './segments';
import BasicSegment from './segments/basic-segment';
import { ICubicSegmentData, IQuadraticSegmentData, IBasicSegmentData, IArcSegmentData } from './types';

export default class PathBuilder extends BasicShapeBuilder {
    public getResult(): IPoint[] {
        const definition: string = this.element.attributes.d;
        const rawSegments: Command[] = parseSVG(definition);
        const segments: CommandMadeAbsolute[] = makeAbsolute(rawSegments);
        const segmentCount: number = segments.length;
        const point: IPoint = { x: 0, y: 0 };
        const point0: IPoint = { x: 0, y: 0 };
        const point1: IPoint = { x: 0, y: 0 };
        const point2: IPoint = { x: 0, y: 0 };
        const prev: IPoint = { x: 0, y: 0 };
        const prev1: IPoint = { x: 0, y: 0 };
        const prev2: IPoint = { x: 0, y: 0 };
        let i: number = 0;
        let segment: CommandMadeAbsolute = null;
        let curveSegment: CurveToCommandMadeAbsolute = null;
        let command: PATH_COMMAND = null;
        let config: IBasicSegmentData = null;
        let segmentBuilder: typeof BasicSegment = null;

        for (i = 0; i < segmentCount; ++i) {
            config = null;
            segment = segments[i];
            command = segment.code as PATH_COMMAND;

            prev.x = point.x;
            prev.y = point.y;

            prev1.x = point1.x;
            prev1.y = point1.y;

            prev2.x = point2.x;
            prev2.y = point2.y;
            curveSegment = segment as CurveToCommandMadeAbsolute;

            if ('x1' in segment) {
                point1.x = curveSegment.x1;
            }

            if ('y1' in segment) {
                point1.y = curveSegment.y1;
            }

            if ('x2' in segment) {
                point2.x = curveSegment.x2;
            }

            if ('y1' in segment) {
                point2.y = curveSegment.y2;
            }

            if ('x' in segment) {
                point.x = curveSegment.x;
            }

            if ('y' in segment) {
                point.y = curveSegment.y;
            }

            switch (command) {
                // linear line types
                case PATH_COMMAND.M:
                case PATH_COMMAND.L:
                case PATH_COMMAND.H:
                case PATH_COMMAND.V:
                    this.result.push({ ...point });
                    break;
                // Quadratic Beziers
                case PATH_COMMAND.T:
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
                case PATH_COMMAND.Q:
                    config = PathBuilder.getQuadraticConfig(prev, point, point1);
                    break;
                case PATH_COMMAND.S:
                    if (PathBuilder.checkPrevSegment(segments, i, PathBuilder.CUBIC_COMMANDS)) {
                        point1.x = prev.x + (prev.x - prev2.x);
                        point1.y = prev.y + (prev.y - prev2.y);
                    } else {
                        point1.x = prev.x;
                        point1.y = prev.y;
                    }

                    config = PathBuilder.getCubicConfig(prev, point, point1, point2);
                    break;
                case PATH_COMMAND.C:
                    config = PathBuilder.getCubicConfig(prev, point, point1, point2);
                    break;
                case PATH_COMMAND.A:
                    config = PathBuilder.getArcConfig(prev, point, segment as EllipticalArcCommandMadeAbsolute);
                    break;
                case PATH_COMMAND.Z:
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

        const result = super.getResult();

        return result;
    }

    private static getQuadraticConfig(point1: IPoint, point2: IPoint, control: IPoint): IQuadraticSegmentData {
        return { point1, point2, control };
    }

    private static getCubicConfig(point1: IPoint, point2: IPoint, control1: IPoint, control2: IPoint): ICubicSegmentData {
        return { point1, point2, control1, control2 };
    }

    private static getArcConfig(point1: IPoint, point2: IPoint, segment: EllipticalArcCommandMadeAbsolute): IArcSegmentData {
        return {
            point1,
            point2,
            rx: segment.rx,
            ry: segment.ry,
            angle: segment.xAxisRotation,
            largeArc: segment.largeArc ? 1 : 0,
            sweep: segment.sweep ? 1 : 0
        };
    }

    private static checkPrevSegment(segments: CommandMadeAbsolute[], index: number, commands: string[]) {
        if (index === 0) {
            return false;
        }

        const command = segments[index - 1].code.toUpperCase();

        return commands.includes(command);
    }

    private static SUBPATH_COMMANDS: PATH_COMMAND[] = [PATH_COMMAND.M, PATH_COMMAND.m];

    private static QUADRATIC_COMMANDS: PATH_COMMAND[] = [PATH_COMMAND.Q, PATH_COMMAND.T];

    private static CUBIC_COMMANDS: PATH_COMMAND[] = [PATH_COMMAND.C, PATH_COMMAND.S];

    public static create(element: INode, tolerance: number, svgTolerance: number): BasicShapeBuilder {
        return new PathBuilder(element, tolerance, svgTolerance);
    }
}
