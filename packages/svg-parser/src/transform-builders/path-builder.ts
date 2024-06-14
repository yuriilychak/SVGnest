import Matrix from '../matrix';
import {
    SVGPathSeg,
    SVGPathSegArcAbs,
    SVGPathSegLinetoHorizontalAbs,
    SVGPathSegLinetoVerticalAbs,
    SVGPathPointSeg,
    SVGPathSegCurvetoCubicAbs
} from '../svg-path-seg';
import SVGPathSegElement from '../svg-path-seg-element';
import { SVGPathSegList } from '../svg-path-seg-list';
import { IPoint, SEGMENT_KEYS, SVGProperty, PATH_TAG, SVG_TAG } from '../types';
import BasicTransformBuilder from './basic-transform-builder';

export default class PathBuilder extends BasicTransformBuilder {
    private getNewSegment(command: PATH_TAG, segment: SVGPathSeg, prev: IPoint): SVGPathSeg | null {
        const path: SVGPathSegElement = this.element as SVGPathSegElement;

        switch (command) {
            case PATH_TAG.H:
                const horizontalSegment = segment as SVGPathSegLinetoHorizontalAbs;

                return path.createSVGPathSegLinetoAbs(horizontalSegment.x, prev.y);
            case PATH_TAG.V:
                const verticalSegment = segment as SVGPathSegLinetoVerticalAbs;

                return path.createSVGPathSegLinetoAbs(prev.x, verticalSegment.y);
            // TODO: currently only works for uniform scale, no skew. fully support arbitrary affine transforms...
            case PATH_TAG.A:
                const arcSegment = segment as SVGPathSegArcAbs;

                return path.createSVGPathSegArcAbs(
                    arcSegment.x,
                    arcSegment.y,
                    arcSegment.r1 * this.scale,
                    arcSegment.r2 * this.scale,
                    arcSegment.angle + this.rotate,
                    arcSegment.largeArcFlag,
                    arcSegment.sweepFlag
                );
            default:
                return null;
        }
    }

    public getResult(): SVGElement {
        PathBuilder.pathToAbsolute(this.element as SVGPathSegElement);
        // @ts-ignore
        const segmentList: SVGPathSegList = (this.element as SVGPathSegElement).pathSegList;
        const segmentCount: number = segmentList.numberOfItems;
        const prevPoint: IPoint = { x: 0, y: 0 };
        const transPoints: IPoint[] = [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 }
        ];
        const pointCount: number = transPoints.length;
        let transformedPath: string = '';
        let segment: SVGPathSeg;
        let command: PATH_TAG;
        let commandData: SVGProperty[];
        let newSegment: SVGPathPointSeg;
        let transformed: IPoint;
        let keys: SEGMENT_KEYS[];
        let i: number = 0;
        let j: number = 0;

        for (i = 0; i < segmentCount; ++i) {
            segment = segmentList.getItem(i);
            command = segment.pathSegTypeAsLetter as PATH_TAG;
            newSegment = this.getNewSegment(command, segment, prevPoint) as SVGPathPointSeg;

            if (newSegment !== null) {
                segmentList.replaceItem(newSegment, i);
                segment = segmentList.getItem(i);
            }

            transformed = null;

            if (SEGMENT_KEYS.X in segment && SEGMENT_KEYS.Y in segment) {
                prevPoint.x = segment.x;
                prevPoint.y = segment.y;
            }

            for (j = 0; j < pointCount; ++i) {
                keys = PathBuilder.SEGMENT_KEYS[j];
                transformed =
                    keys[0] in segment && keys[1] in segment ? // @ts-ignore
                        this.transform.calc(segment[keys[0]], segment[keys[1]]) :
                        { x: 0, y: 0 };
                transPoints[j].x = transformed.x;
                transPoints[j].y = transformed.y;
            }

            commandData = PathBuilder.getCommandData(command, transPoints, segment);
            transformedPath = transformedPath + commandData.join(' ');
        }

        this.element.setAttribute('d', transformedPath);
        this.element.removeAttribute('transform');

        return super.getResult();
    }

    static getCommandData(command: PATH_TAG, transPoints: IPoint[], segment: SVGPathSeg): SVGProperty[] {
        // MLHVCSQTA
        // H and V are transformed to "L" commands above so we don't need to handle them. All lowercase (relative) are already handled too (converted to absolute)
        switch (command) {
            case PATH_TAG.L:
            case PATH_TAG.M:
            case PATH_TAG.T:
                return [command, transPoints[0].x, transPoints[0].y];
            case PATH_TAG.C:
                return [
                    command,
                    transPoints[1].x,
                    transPoints[1].y,
                    transPoints[2].x,
                    transPoints[2].y,
                    transPoints[0].x,
                    transPoints[0].y
                ];
            case PATH_TAG.S:
                return [command, transPoints[2].x, transPoints[2].y, transPoints[0].x, transPoints[0].y];
            case PATH_TAG.Q:
                return [command, transPoints[1].x, transPoints[1].y, transPoints[0].x, transPoints[0].y];
            case PATH_TAG.A:
                const arcSegment = segment as SVGPathSegArcAbs;

                return [
                    command,
                    arcSegment.r1,
                    arcSegment.r2,
                    arcSegment.angle,
                    arcSegment.largeArcFlag ? 1 : 0,
                    arcSegment.sweepFlag ? 1 : 0,
                    transPoints[0].x,
                    transPoints[0].y
                ];
            case PATH_TAG.H:
            case PATH_TAG.V:
                return [PATH_TAG.L, transPoints[0].x, transPoints[0].y];
            case PATH_TAG.Z:
            case PATH_TAG.z:
                return [command];
            default:
                console.log('FOUND COMMAND NOT HANDLED BY COMMAND STRING BUILDER', command);
                return [];
        }
    }

    static getNewSegment(path: SVGPathSegElement, points: IPoint[], segment: SVGPathSeg, command: PATH_TAG): SVGPathSeg | null {
        switch (command) {
            case PATH_TAG.m:
                return path.createSVGPathSegMovetoAbs(points[0].x, points[0].y);
            case PATH_TAG.l:
                return path.createSVGPathSegLinetoAbs(points[0].x, points[0].y);
            case PATH_TAG.h:
                return path.createSVGPathSegLinetoHorizontalAbs(points[0].x);
            case PATH_TAG.v:
                return path.createSVGPathSegLinetoVerticalAbs(points[0].y);
            case PATH_TAG.c:
                return path.createSVGPathSegCurvetoCubicAbs(
                    points[0].x,
                    points[0].y,
                    points[1].x,
                    points[1].y,
                    points[2].x,
                    points[2].y
                );
            case PATH_TAG.s:
                return path.createSVGPathSegCurvetoCubicSmoothAbs(points[0].x, points[0].y, points[2].x, points[2].y);
            case PATH_TAG.q:
                return path.createSVGPathSegCurvetoQuadraticAbs(points[0].x, points[0].y, points[1].x, points[1].y);
            case PATH_TAG.t:
                return path.createSVGPathSegCurvetoQuadraticSmoothAbs(points[0].x, points[0].y);
            case PATH_TAG.a:
                const arcSegment = segment as SVGPathSegArcAbs;

                return path.createSVGPathSegArcAbs(
                    points[0].x,
                    points[0].y,
                    arcSegment.r1,
                    arcSegment.r2,
                    arcSegment.angle,
                    arcSegment.largeArcFlag,
                    arcSegment.sweepFlag
                );
            default:
                return null;
        }
    }

    // set the given path as absolute coords (capital commands)
    // from http://stackoverflow.com/a/9677915/433888
    private static pathToAbsolute(path?: SVGPathSegElement): void {
        if (!path || path.tagName !== SVG_TAG.PATH) {
            throw Error('invalid path');
        }

        // @ts-ignore
        const segmentList: SVGPathSegList = path.pathSegList;
        const segmentCount: number = segmentList.numberOfItems;
        const currentPoint: IPoint = { x: 0, y: 0 };
        const points: IPoint[] = [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 }
        ];
        let i: number = 0;
        let segment: SVGPathSeg;
        let command: PATH_TAG;
        let newSegment: SVGPathSeg;

        for (i = 0; i < segmentCount; ++i) {
            segment = segmentList.getItem(i);
            command = segment.pathSegTypeAsLetter as PATH_TAG;

            if (PathBuilder.POSITION_COMMANDS.includes(command)) {
                if (SEGMENT_KEYS.X in segment) {
                    points[0].x = segment.x;
                }
                if (SEGMENT_KEYS.Y in segment) {
                    points[0].y = segment.y;
                }
            } else {
                if (SEGMENT_KEYS.X1 in segment) {
                    points[1].x = points[0].x + (segment as SVGPathSegCurvetoCubicAbs).x1;
                }

                if (SEGMENT_KEYS.X2 in segment) {
                    points[2].x = points[0].x + (segment as SVGPathSegCurvetoCubicAbs).x2;
                }

                if (SEGMENT_KEYS.Y1 in segment) {
                    points[1].y = points[0].y + (segment as SVGPathSegCurvetoCubicAbs).y1;
                }

                if (SEGMENT_KEYS.Y2 in segment) {
                    points[2].y = points[0].y + (segment as SVGPathSegCurvetoCubicAbs).y2;
                }

                if (SEGMENT_KEYS.X in segment) {
                    points[0].x = points[0].x + segment.x;
                }

                if (SEGMENT_KEYS.Y in segment) {
                    points[0].y = points[0].y + segment.y;
                }

                if (command.toUpperCase() === PATH_TAG.Z) {
                    points[0].x = currentPoint.x;
                    points[0].y = currentPoint.y;
                    continue;
                }

                newSegment = PathBuilder.getNewSegment(path, points, segment, command);

                if (newSegment !== null) {
                    segmentList.replaceItem(newSegment, i);
                }
            }
            // Record the start of a subpath
            if (command.toUpperCase() === PATH_TAG.M) {
                currentPoint.x = points[0].x;
                currentPoint.y = points[0].y;
            }
        }
    }

    public static create(element: SVGElement, transform: Matrix, svg: Document, svgRoot: SVGSVGElement): BasicTransformBuilder {
        return new PathBuilder(element, transform, svg, svgRoot);
    }

    private static POSITION_COMMANDS: PATH_TAG[] = [
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

    private static SEGMENT_KEYS: SEGMENT_KEYS[][] = [
        [SEGMENT_KEYS.X, SEGMENT_KEYS.Y],
        [SEGMENT_KEYS.X1, SEGMENT_KEYS.Y1],
        [SEGMENT_KEYS.X2, SEGMENT_KEYS.Y2]
    ];
}
