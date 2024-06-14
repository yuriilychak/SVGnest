import { PATH_TAG, PATH_SEGMENT_TYPE } from '../types';
import { TAGS_TO_TYPES } from './constants';
import {
    SVGPathSeg,
    SVGPathSegLinetoAbs,
    SVGPathSegLinetoVerticalAbs,
    SVGPathSegLinetoHorizontalAbs,
    SVGPathSegLinetoHorizontalRel,
    SVGPathSegLinetoRel,
    SVGPathSegLinetoVerticalRel,
    SVGPathSegMovetoRel,
    SVGPathSegClosePath,
    SVGPathSegMovetoAbs,
    SVGPathSegCurvetoCubicRel,
    SVGPathSegCurvetoCubicAbs,
    SVGPathSegArcAbs,
    SVGPathSegArcRel,
    SVGPathSegCurvetoQuadraticSmoothAbs,
    SVGPathSegCurvetoQuadraticSmoothRel,
    SVGPathSegCurvetoQuadraticAbs,
    SVGPathSegCurvetoQuadraticRel,
    SVGPathSegCurvetoCubicSmoothRel,
    SVGPathSegCurvetoCubicSmoothAbs
} from '../svg-path-seg';

export default class Source {
    #string: string;

    #currentIndex: number;

    #endIndex: number;

    #previousCommand: PATH_SEGMENT_TYPE;

    public constructor(value: string) {
        this.#string = value;
        this.#currentIndex = 0;
        this.#endIndex = this.#string.length;
        this.#previousCommand = PATH_SEGMENT_TYPE.UNKNOWN;

        this.skipOptionalSpaces();
    }

    private get isCurrentSpace(): boolean {
        const character = this.#string[this.#currentIndex];
        const charsToCheck: string[] = [' ', '\n', '\t', '\r', '\f'];

        return character <= ' ' && charsToCheck.includes(character);
    }

    private skipOptionalSpaces(): boolean {
        while (this.#currentIndex < this.#endIndex && this.isCurrentSpace) {
            ++this.#currentIndex;
        }

        return this.#currentIndex < this.#endIndex;
    }

    private skipOptionalSpacesOrDelimiter(): boolean {
        if (this.#currentIndex < this.#endIndex && !this.isCurrentSpace && this.#string.charAt(this.#currentIndex) !== ',') {
            return false;
        }

        if (this.skipOptionalSpaces()) {
            if (this.#currentIndex < this.#endIndex && this.#string.charAt(this.#currentIndex) === ',') {
                this.#currentIndex++;
                this.skipOptionalSpaces();
            }
        }

        return this.#currentIndex < this.#endIndex;
    }

    public get hasMoreData(): boolean {
        return this.#currentIndex < this.#endIndex;
    }

    private get peekSegmentType(): PATH_SEGMENT_TYPE {
        const lookahead: PATH_TAG = this.#string[this.#currentIndex] as PATH_TAG;

        return this.pathSegTypeFromChar(lookahead);
    }

    private pathSegTypeFromChar(lookahead: PATH_TAG): PATH_SEGMENT_TYPE {
        return TAGS_TO_TYPES.has(lookahead) ? TAGS_TO_TYPES.get(lookahead) : PATH_SEGMENT_TYPE.UNKNOWN;
    }

    private nextCommandHelper(lookahead: string, previousCommand: PATH_SEGMENT_TYPE): PATH_SEGMENT_TYPE {
        // Check for remaining coordinates in the current command.
        if (
            (lookahead === '+' || lookahead === '-' || lookahead === '.' || lookahead >= '0' && lookahead <= '9') &&
            previousCommand !== PATH_SEGMENT_TYPE.CLOSEPATH
        ) {
            if (previousCommand === PATH_SEGMENT_TYPE.MOVETO_ABS) {
                return PATH_SEGMENT_TYPE.LINETO_ABS;
            }
            if (previousCommand === PATH_SEGMENT_TYPE.MOVETO_REL) {
                return PATH_SEGMENT_TYPE.LINETO_REL;
            }

            return previousCommand;
        }

        return PATH_SEGMENT_TYPE.UNKNOWN;
    }

    public get initialCommandIsMoveTo(): boolean {
        // If the path is empty it is still valid, so return true.
        if (!this.hasMoreData) {
            return true;
        }
        const command = this.peekSegmentType;

        // Path must start with moveTo.
        return command === PATH_SEGMENT_TYPE.MOVETO_ABS || command === PATH_SEGMENT_TYPE.MOVETO_REL;
    }

    // Parse a number from an SVG path. This very closely follows genericParseNumber(...) from Source/core/svg/SVGParserUtilities.cpp.
    // Spec: http://www.w3.org/TR/SVG11/single-page.html#paths-PathDataBNF
    private parseNumber(): number {
        let exponent: number = 0;
        let integer: number = 0;
        let frac: number = 1;
        let decimal: number = 0;
        let sign: number = 1;
        let expsign: number = 1;

        const startIndex = this.#currentIndex;

        this.skipOptionalSpaces();

        // Read the sign.
        if (this.#currentIndex < this.#endIndex && this.#string.charAt(this.#currentIndex) == '+') {
            ++this.#currentIndex;
        } else if (this.#currentIndex < this.#endIndex && this.#string.charAt(this.#currentIndex) == '-') {
            ++this.#currentIndex;
            sign = -1;
        }

        if (
            this.#currentIndex == this.#endIndex ||
            (this.#string.charAt(this.#currentIndex) < '0' || this.#string.charAt(this.#currentIndex) > '9') &&
                this.#string.charAt(this.#currentIndex) != '.'
        ) {
            // The first character of a number must be one of [0-9+-.].
            return 0;
        }

        // Read the integer part, build right-to-left.
        const startIntPartIndex = this.#currentIndex;
        while (
            this.#currentIndex < this.#endIndex &&
            this.#string.charAt(this.#currentIndex) >= '0' &&
            this.#string.charAt(this.#currentIndex) <= '9'
        ) {
            this.#currentIndex++;
        } // Advance to first non-digit.

        if (this.#currentIndex !== startIntPartIndex) {
            let scanIntPartIndex = this.#currentIndex - 1;
            let multiplier = 1;
            while (scanIntPartIndex >= startIntPartIndex) {
                integer = integer + multiplier * parseFloat(this.#string.charAt(scanIntPartIndex--));
                multiplier = multiplier * 10;
            }
        }

        // Read the decimals.
        if (this.#currentIndex < this.#endIndex && this.#string.charAt(this.#currentIndex) == '.') {
            this.#currentIndex++;

            // There must be a least one digit following the .
            if (
                this.#currentIndex >= this.#endIndex ||
                this.#string.charAt(this.#currentIndex) < '0' ||
                this.#string.charAt(this.#currentIndex) > '9'
            ) {
                return undefined;
            }
            while (
                this.#currentIndex < this.#endIndex &&
                this.#string.charAt(this.#currentIndex) >= '0' &&
                this.#string.charAt(this.#currentIndex) <= '9'
            ) {
                frac = frac * 10;
                decimal = decimal + parseFloat(this.#string.charAt(this.#currentIndex)) / frac;
                this.#currentIndex = this.#currentIndex + 1;
            }
        }

        // Read the exponent part.
        if (
            this.#currentIndex !== startIndex &&
            this.#currentIndex + 1 < this.#endIndex &&
            (this.#string.charAt(this.#currentIndex) === 'e' || this.#string.charAt(this.#currentIndex) === 'E') &&
            this.#string.charAt(this.#currentIndex + 1) !== 'x' &&
            this.#string.charAt(this.#currentIndex + 1) !== 'm'
        ) {
            this.#currentIndex++;

            // Read the sign of the exponent.
            if (this.#string.charAt(this.#currentIndex) === '+') {
                ++this.#currentIndex;
            } else if (this.#string.charAt(this.#currentIndex) === '-') {
                ++this.#currentIndex;
                expsign = -1;
            }

            // There must be an exponent.
            if (
                this.#currentIndex >= this.#endIndex ||
                this.#string.charAt(this.#currentIndex) < '0' ||
                this.#string.charAt(this.#currentIndex) > '9'
            ) {
                return undefined;
            }

            while (
                this.#currentIndex < this.#endIndex &&
                this.#string.charAt(this.#currentIndex) >= '0' &&
                this.#string.charAt(this.#currentIndex) <= '9'
            ) {
                exponent = exponent * 10;
                exponent = exponent + parseFloat(this.#string.charAt(this.#currentIndex));
                ++this.#currentIndex;
            }
        }

        let number = integer + decimal;
        number = number * sign;

        if (exponent) {
            number = number * Math.pow(10, expsign * exponent);
        }

        if (startIndex === this.#currentIndex) {
            return undefined;
        }

        this.skipOptionalSpacesOrDelimiter();

        return number;
    }

    private parseArcFlag(): number {
        if (this.#currentIndex >= this.#endIndex) {
            return 0;
        }

        const flagChar = this.#string.charAt(this.#currentIndex++);
        const flag = flagChar === '1' ? 1 : 0;

        if (flagChar !== '0' && flagChar !== '1') {
            return flag;
        }

        this.skipOptionalSpacesOrDelimiter();

        return flag;
    }

    parseNumbers(count: number): number[] {
        let i = 0;
        const result: number[] = [];

        for (i = 0; i < count; ++i) {
            result.push(this.parseNumber());
        }

        return result;
    }

    parseArcFlags(count: number): number[] {
        let i = 0;
        const result: number[] = [];

        for (i = 0; i < count; ++i) {
            result.push(this.parseArcFlag());
        }

        return result;
    }

    public parseSegment(owningPathSegList: unknown): SVGPathSeg | null {
        const lookahead = this.#string[this.#currentIndex] as PATH_TAG;
        let command = this.pathSegTypeFromChar(lookahead);
        if (command === PATH_SEGMENT_TYPE.UNKNOWN) {
            // Possibly an implicit command. Not allowed if this is the first command.
            if (this.#previousCommand === PATH_SEGMENT_TYPE.UNKNOWN) {
                return null;
            }
            command = this.nextCommandHelper(lookahead, this.#previousCommand);
            if (command === PATH_SEGMENT_TYPE.UNKNOWN) {
                return null;
            }
        } else {
            this.#currentIndex++;
        }

        this.#previousCommand = command;

        let points: number[];
        let x: number;
        let y: number;
        let x1: number;
        let y1: number;
        let arcAngle: number;
        let arcLarge: number;
        let arcSweep: number;

        switch (command) {
            case PATH_SEGMENT_TYPE.MOVETO_REL:
                points = this.parseNumbers(2);

                return new SVGPathSegMovetoRel(owningPathSegList, points[0], points[1]);
            case PATH_SEGMENT_TYPE.MOVETO_ABS:
                points = this.parseNumbers(2);

                return new SVGPathSegMovetoAbs(owningPathSegList, points[0], points[1]);
            case PATH_SEGMENT_TYPE.LINETO_REL:
                points = this.parseNumbers(2);

                return new SVGPathSegLinetoRel(owningPathSegList, points[0], points[1]);
            case PATH_SEGMENT_TYPE.LINETO_ABS:
                points = this.parseNumbers(2);

                return new SVGPathSegLinetoAbs(owningPathSegList, points[0], points[1]);
            case PATH_SEGMENT_TYPE.LINETO_HORIZONTAL_REL:
                points = this.parseNumbers(1);

                return new SVGPathSegLinetoHorizontalRel(owningPathSegList, points[0]);
            case PATH_SEGMENT_TYPE.LINETO_HORIZONTAL_ABS:
                points = this.parseNumbers(1);

                return new SVGPathSegLinetoHorizontalAbs(owningPathSegList, points[0]);
            case PATH_SEGMENT_TYPE.LINETO_VERTICAL_REL:
                points = this.parseNumbers(1);

                return new SVGPathSegLinetoVerticalRel(owningPathSegList, points[0]);
            case PATH_SEGMENT_TYPE.LINETO_VERTICAL_ABS:
                points = this.parseNumbers(1);

                return new SVGPathSegLinetoVerticalAbs(owningPathSegList, points[0]);
            case PATH_SEGMENT_TYPE.CLOSEPATH:
                this.skipOptionalSpaces();

                return new SVGPathSegClosePath(owningPathSegList);
            case PATH_SEGMENT_TYPE.CURVETO_CUBIC_REL:
                points = this.parseNumbers(6);

                return new SVGPathSegCurvetoCubicRel(
                    owningPathSegList,
                    points[4],
                    points[5],
                    points[0],
                    points[1],
                    points[2],
                    points[3]
                );
            case PATH_SEGMENT_TYPE.CURVETO_CUBIC_ABS:
                points = this.parseNumbers(6);

                return new SVGPathSegCurvetoCubicAbs(
                    owningPathSegList,
                    points[4],
                    points[5],
                    points[0],
                    points[1],
                    points[2],
                    points[3]
                );
            case PATH_SEGMENT_TYPE.CURVETO_CUBIC_SMOOTH_REL:
                points = this.parseNumbers(4);

                return new SVGPathSegCurvetoCubicSmoothRel(owningPathSegList, points[2], points[3], points[0], points[1]);
            case PATH_SEGMENT_TYPE.CURVETO_CUBIC_SMOOTH_ABS:
                points = this.parseNumbers(4);

                return new SVGPathSegCurvetoCubicSmoothAbs(owningPathSegList, points[2], points[3], points[0], points[1]);
            case PATH_SEGMENT_TYPE.CURVETO_QUADRATIC_REL:
                points = this.parseNumbers(4);

                return new SVGPathSegCurvetoQuadraticRel(owningPathSegList, points[2], points[3], points[0], points[1]);
            case PATH_SEGMENT_TYPE.CURVETO_QUADRATIC_ABS:
                points = this.parseNumbers(4);

                return new SVGPathSegCurvetoQuadraticAbs(owningPathSegList, points[2], points[3], points[0], points[1]);
            case PATH_SEGMENT_TYPE.CURVETO_QUADRATIC_SMOOTH_REL:
                points = this.parseNumbers(2);

                return new SVGPathSegCurvetoQuadraticSmoothRel(owningPathSegList, points[0], points[1]);
            case PATH_SEGMENT_TYPE.CURVETO_QUADRATIC_SMOOTH_ABS:
                points = this.parseNumbers(2);

                return new SVGPathSegCurvetoQuadraticSmoothAbs(owningPathSegList, points[0], points[1]);
            case PATH_SEGMENT_TYPE.ARC_REL:
                [x1, y1, arcAngle] = this.parseNumbers(3)
                ;[arcLarge, arcSweep] = this.parseArcFlags(2)
                ;[x, y] = this.parseNumbers(2);

                return new SVGPathSegArcRel(owningPathSegList, x, y, x1, y1, arcAngle, arcLarge, arcSweep);
            case PATH_SEGMENT_TYPE.ARC_ABS:
                [x1, y1, arcAngle] = this.parseNumbers(3)
                ;[arcLarge, arcSweep] = this.parseArcFlags(2)
                ;[x, y] = this.parseNumbers(2);

                return new SVGPathSegArcAbs(owningPathSegList, x, y, x1, y1, arcAngle, arcLarge, arcSweep);
            default:
                throw new Error('Unknown path seg type.');
        }
    }
}
