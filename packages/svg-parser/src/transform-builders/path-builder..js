import BasicTransformBuilder from './basic-transform-builder';

export default class PathBuilder extends BasicTransformBuilder {
    getResult() {
        this.pathToAbsolute(this.element);
        const segmentList = this.element.pathSegList;
        let prevx = 0;
        let prevy = 0;

        let transformedPath = '';
        let segment = null;
        let command = '';
        let i = 0;

        for (i = 0; i < segmentList.numberOfItems; ++i) {
            segment = segmentList.getItem(i);
            command = segment.pathSegTypeAsLetter;

            switch (command) {
                case 'H': {
                    segmentList.replaceItem(this.element.createSVGPathSegLinetoAbs(segment.x, prevy), i);
                    segment = segmentList.getItem(i);
                    break;
                }
                case 'V': {
                    segmentList.replaceItem(this.element.createSVGPathSegLinetoAbs(prevx, segment.y), i);
                    segment = segmentList.getItem(i);
                    break;
                }
                // currently only works for uniform scale, no skew
                // todo: fully support arbitrary affine transforms...
                case 'A': {
                    segmentList.replaceItem(
                        this.element.createSVGPathSegArcAbs(
                            segment.x,
                            segment.y,
                            segment.r1 * this.scale,
                            segment.r2 * this.scale,
                            segment.angle + this.rotate,
                            segment.largeArcFlag,
                            segment.sweepFlag
                        ),
                        i
                    );
                    segment = segmentList.getItem(i);
                    break;
                }
                default:
            }

            const transPoints = {};
            let transformed = null;

            if ('x' in segment && 'y' in segment) {
                transformed = this.transform.calc(segment.x, segment.y);
                prevx = segment.x;
                prevy = segment.y;
                transPoints.x = transformed[0];
                transPoints.y = transformed[1];
            }
            if ('x1' in segment && 'y1' in segment) {
                transformed = this.transform.calc(segment.x1, segment.y1);
                transPoints.x1 = transformed[0];
                transPoints.y1 = transformed[1];
            }
            if ('x2' in segment && 'y2' in segment) {
                transformed = this.transform.calc(segment.x2, segment.y2);
                transPoints.x2 = transformed[0];
                transPoints.y2 = transformed[1];
            }

            let commandStringTransformed = '';

            // MLHVCSQTA
            // H and V are transformed to "L" commands above so we don't need to handle them. All lowercase (relative) are already handled too (converted to absolute)
            switch (command) {
                case 'M':
                    commandStringTransformed = `${commandStringTransformed}${command} ${transPoints.x} ${transPoints.y}`;
                    break;
                case 'L':
                    commandStringTransformed = `${commandStringTransformed}${command} ${transPoints.x} ${transPoints.y}`;
                    break;
                case 'C':
                    commandStringTransformed = `${commandStringTransformed}${command} ${transPoints.x1} ${transPoints.y1}  ${transPoints.x2} ${transPoints.y2} ${transPoints.x} ${transPoints.y}`;
                    break;
                case 'S':
                    commandStringTransformed = `${commandStringTransformed}${command} ${transPoints.x2} ${transPoints.y2} ${transPoints.x} ${transPoints.y}`;
                    break;
                case 'Q':
                    commandStringTransformed = `${commandStringTransformed}${command} ${transPoints.x1} ${transPoints.y1} ${transPoints.x} ${transPoints.y}`;
                    break;
                case 'T':
                    commandStringTransformed = `${commandStringTransformed}${command} ${transPoints.x} ${transPoints.y}`;
                    break;
                case 'A':
                    const largeArcFlag = segment.largeArcFlag ? 1 : 0;
                    const sweepFlag = segment.sweepFlag ? 1 : 0;
                    commandStringTransformed = `${commandStringTransformed}${command} ${segment.r1} ${segment.r2} ${segment.angle} ${largeArcFlag} ${sweepFlag} ${transPoints.x} ${transPoints.y}`;
                    break;
                case 'H':
                    commandStringTransformed = `${commandStringTransformed}L ${transPoints.x} ${transPoints.y}`;
                    break;
                case 'V':
                    commandStringTransformed = `${commandStringTransformed}L ${transPoints.x} ${transPoints.y}`;
                    break;
                case 'Z':
                case 'z':
                    commandStringTransformed = commandStringTransformed + command;
                    break;
                default:
                    console.log('FOUND COMMAND NOT HANDLED BY COMMAND STRING BUILDER', command);
                    break;
            }

            transformedPath = transformedPath + commandStringTransformed;
        }

        this.element.setAttribute('d', transformedPath);
        this.element.removeAttribute('transform');

        return super.getResult();
    }

    static create(element, transform, svg, svgRoot) {
        return new PathBuilder(element, transform, svg, svgRoot);
    }
}
