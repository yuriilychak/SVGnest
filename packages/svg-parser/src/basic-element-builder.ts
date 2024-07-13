import { INode } from 'svgson';

import { IPoint } from './types';

export default class BasicElementBuilder {
    #element: INode;

    protected constructor(element: INode) {
        this.#element = element;
    }

    protected getFloatAtrribute(key: string): number {
        return parseFloat(this.#element.attributes[key]) || 0;
    }

    protected convertPointsToArray(): IPoint[] {
        const pointsString: string = this.element.attributes.points;
        // Split the string by whitespace and newlines
        const pointsArray: string[] = pointsString.split(/[\s,]+/);
        const points: IPoint[] = [];
        const cordCount: number = pointsArray.length;
        let i: number = 0;
        let x: number = 0;
        let y: number = 0;

        // Iterate over the array two items at a time
        for (i = 0; i < cordCount; i = i + 2) {
            x = parseFloat(pointsArray[i]);
            y = parseFloat(pointsArray[i + 1]);

            if (!isNaN(x) && !isNaN(y)) {
                points.push({ x, y });
            }
        }

        return points;
    }

    protected get element(): INode {
        return this.#element;
    }
}
