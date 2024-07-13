import { INode } from 'svgson';
import {
    parseSVG,
    makeAbsolute,
    CommandMadeAbsolute,
    Command,
    EllipticalArcCommandMadeAbsolute,
    SmoothCurveToCommandMadeAbsolute,
    QuadraticCurveToCommandMadeAbsolute,
    CurveToCommandMadeAbsolute
} from 'svg-path-parser';

import Matrix from '../matrix';
import { IPoint, SEGMENT_KEYS, PATH_COMMAND } from '../../types';
import BasicTransformBuilder from './basic-transform-builder';

export default class PathBuilder extends BasicTransformBuilder {
    private getNewSegment(command: PATH_COMMAND, segment: CommandMadeAbsolute, prev: IPoint): void {
        switch (command) {
            case PATH_COMMAND.H: {
                segment.code = 'L';
                segment.command = 'lineto';
                segment.y = prev.y;
                segment.y0 = prev.y;
                break;
            }
            case PATH_COMMAND.V: {
                segment.code = 'L';
                segment.command = 'lineto';
                segment.x = prev.x;
                segment.x0 = prev.x;
                break;
            }
            case PATH_COMMAND.A: {
                const arcSegment = segment as EllipticalArcCommandMadeAbsolute;

                arcSegment.code = 'A';
                arcSegment.command = 'elliptical arc';
                arcSegment.rx = arcSegment.rx * this.scale;
                arcSegment.ry = arcSegment.ry * this.scale;
                arcSegment.xAxisRotation = arcSegment.xAxisRotation + this.rotate;
                break;
            }
            default:
        }
    }

    public getResult(): INode {
        const rawSegments: Command[] = parseSVG(this.element.attributes.d);
        const segments: CommandMadeAbsolute[] = makeAbsolute(rawSegments);
        const segmentCount: number = segments.length;
        const prevPoint: IPoint = { x: 0, y: 0 };
        let segment: CommandMadeAbsolute = null;
        let command: PATH_COMMAND = null;
        let transformed: IPoint = null;
        let i: number = 0;

        for (i = 0; i < segmentCount; ++i) {
            segment = segments[i];
            command = segment.code as PATH_COMMAND;
            this.getNewSegment(command, segment, prevPoint);

            transformed = null;

            if (SEGMENT_KEYS.X in segment && SEGMENT_KEYS.Y in segment) {
                prevPoint.x = segment.x;
                prevPoint.y = segment.y;
            }

            if (SEGMENT_KEYS.X in segment && SEGMENT_KEYS.Y in segment) {
                transformed = this.transform.calc(segment.x, segment.y);
                segment.x = transformed.x;
                segment.y = transformed.y;
            }

            if (SEGMENT_KEYS.X1 in segment && SEGMENT_KEYS.Y1 in segment) {
                transformed = this.transform.calc(segment.x1, segment.y1);
                segment.x1 = transformed.x;
                segment.y1 = transformed.y;
            }

            if (SEGMENT_KEYS.X2 in segment && SEGMENT_KEYS.Y2 in segment) {
                transformed = this.transform.calc(segment.x2, segment.y2);
                segment.x2 = transformed.x;
                segment.y2 = transformed.y;
            }
        }

        this.element.attributes.d = PathBuilder.generateDFromPathSegments(segments);

        return super.getResult();
    }

    public static generateDFromPathSegments(segments: CommandMadeAbsolute[]): string {
        return segments
            .map(segment => {
                const { code } = segment;

                let paramValues: number[] = null;

                switch (code.toUpperCase()) {
                    case 'M':
                    case 'L':
                    case 'T':
                        paramValues = [segment.x, segment.y];
                        break;
                    case 'H':
                        paramValues = [segment.x];
                        break;
                    case 'V':
                        paramValues = [segment.y];
                        break;
                    case 'C': {
                        const cubicSegment = segment as CurveToCommandMadeAbsolute;

                        paramValues = [
                            cubicSegment.x1,
                            cubicSegment.y1,
                            cubicSegment.x2,
                            cubicSegment.y2,
                            cubicSegment.x,
                            cubicSegment.y
                        ];
                        break;
                    }
                    case 'S': {
                        const quadraticSegment = segment as SmoothCurveToCommandMadeAbsolute;
                        paramValues = [quadraticSegment.x2, quadraticSegment.y2, quadraticSegment.x, quadraticSegment.y];
                        break;
                    }
                    case 'Q': {
                        const quadraticSegment = segment as QuadraticCurveToCommandMadeAbsolute;
                        paramValues = [quadraticSegment.x1, quadraticSegment.y1, quadraticSegment.x, quadraticSegment.y];
                        break;
                    }
                    case 'A': {
                        const arcSegment = segment as EllipticalArcCommandMadeAbsolute;

                        paramValues = [
                            arcSegment.rx,
                            arcSegment.ry,
                            arcSegment.xAxisRotation,
                            arcSegment.largeArc ? 1 : 0,
                            arcSegment.sweep ? 1 : 0,
                            arcSegment.x,
                            arcSegment.y
                        ];
                        break;
                    }
                    case 'Z':
                        paramValues = [];
                        break;
                    default:
                        throw new Error(`Unknown command: ${code}`);
                }

                return `${code}${paramValues.join(',')}`;
            })
            .join(' ');
    }

    public static create(element: INode, transform: Matrix): BasicTransformBuilder {
        return new PathBuilder(element, transform);
    }
}
