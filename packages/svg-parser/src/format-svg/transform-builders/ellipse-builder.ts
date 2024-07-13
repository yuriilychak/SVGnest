import { CommandMadeAbsolute } from 'svg-path-parser';
import { INode } from 'svgson';

import Matrix from '../matrix';
import BasicTransformBuilder from './basic-transform-builder';
import { SVG_TAG } from '../../types';
import PathBuilder from './path-builder';

export default class EllipseBuilder extends PathBuilder {
    public getResult(): INode {
        // the goal is to remove the transform property, but an ellipse without a transform will have no rotation
        // for the sake of simplicity, we will replace the ellipse with a path, and apply the transform to that path
        const cx: number = this.getFloatAtrribute('cx');
        const cy: number = this.getFloatAtrribute('cy');
        const rx: number = this.getFloatAtrribute('rx');
        const ry: number = this.getFloatAtrribute('ry');
        const segments: CommandMadeAbsolute[] = [
            {
                code: 'M',
                command: 'moveto',
                relative: false,
                x: cx - rx,
                y: cy,
                x0: cx - rx,
                y0: cy
            },
            {
                code: 'A',
                command: 'elliptical arc',
                relative: false,
                rx,
                ry,
                xAxisRotation: 0,
                largeArc: true,
                sweep: false,
                x: cx + rx,
                y: cy,
                x0: cx + rx,
                y0: cy
            },
            {
                code: 'Z',
                command: 'closepath',
                relative: false,
                x: cx - rx,
                y: cy,
                x0: cx - rx,
                y0: cy
            }
        ];

        this.element.name = SVG_TAG.PATH;
        this.element.attributes.d = PathBuilder.generateDFromPathSegments(segments);

        return super.getResult();
    }

    public static create(element: INode, transform: Matrix): BasicTransformBuilder {
        return new EllipseBuilder(element, transform);
    }
}
