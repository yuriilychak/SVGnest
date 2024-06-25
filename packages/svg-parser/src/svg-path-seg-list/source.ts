import { PATH_TAG, PATH_SEGMENT_TYPE } from '../types';
import { TAGS_TO_TYPES } from './constants';
import { SVGPathSeg, TYPE_TO_SEGMENT } from '../svg-path-seg';

export default class Source {
    #string: string;

    #currentIndex: number;

    #endIndex: number;

    #prevCommand: PATH_SEGMENT_TYPE;

    public constructor(value: string) {
        this.#string = value;
        this.#currentIndex = 0;
        this.#endIndex = this.#string.length;
        this.#prevCommand = PATH_SEGMENT_TYPE.UNKNOWN;

        this.skipOptionalSpaces();
    }

    private get isCurrentSpace(): boolean {
        const character = this.#string[this.#currentIndex];
        const charsToCheck: string[] = [' ', '\n', '\t', '\r', '\f'];

        return character <= ' ' && charsToCheck.includes(character);
    }

    private getCurrentChar(offset: number = 0): string {
        return this.#string.charAt(this.#currentIndex + offset);
    }

    private get isCurrentCraNumeric(): boolean {
        return this.getCurrentChar() >= '0' && this.getCurrentChar() <= '9';
    }

    private skipOptionalSpaces(): boolean {
        while (this.#currentIndex < this.#endIndex && this.isCurrentSpace) {
            ++this.#currentIndex;
        }

        return this.#currentIndex < this.#endIndex;
    }

    private skipOptionalSpacesOrDelimiter(): boolean {
        if (this.hasMoreData && !this.isCurrentSpace && this.getCurrentChar() !== ',') {
            return false;
        }

        if (this.skipOptionalSpaces()) {
            if (this.hasMoreData && this.getCurrentChar() === ',') {
                ++this.#currentIndex;
                this.skipOptionalSpaces();
            }
        }

        return this.hasMoreData;
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
        const checkCommands: string[] = ['+', '-', '.'];
        if (
            (checkCommands.includes(lookahead) || (lookahead >= '0' && lookahead <= '9')) &&
            previousCommand !== PATH_SEGMENT_TYPE.CLOSEPATH
        ) {
            switch (previousCommand) {
                case PATH_SEGMENT_TYPE.MOVETO_ABS:
                    return PATH_SEGMENT_TYPE.LINETO_ABS;
                case PATH_SEGMENT_TYPE.MOVETO_REL:
                    return PATH_SEGMENT_TYPE.LINETO_REL;
                default:
                    return previousCommand;
            }
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

    /* Parse a number from an SVG path.
       This very closely follows genericParseNumber(...) from Source/core/svg/SVGParserUtilities.cpp.
       Spec: http://www.w3.org/TR/SVG11/single-page.html#paths-PathDataBNF
    */
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
        if (this.hasMoreData && this.getCurrentChar() === '+') {
            ++this.#currentIndex;
        } else if (this.hasMoreData && this.getCurrentChar() === '-') {
            ++this.#currentIndex;
            sign = -1;
        }

        if (this.#currentIndex === this.#endIndex || (!this.isCurrentCraNumeric && this.getCurrentChar() !== '.')) {
            // The first character of a number must be one of [0-9+-.].
            return 0;
        }

        // Read the integer part, build right-to-left.
        const startIntPartIndex = this.#currentIndex;
        while (this.hasMoreData && this.isCurrentCraNumeric) {
            ++this.#currentIndex;
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
        if (this.hasMoreData && this.getCurrentChar() === '.') {
            ++this.#currentIndex;

            // There must be a least one digit following the .
            if (!this.hasMoreData || !this.isCurrentCraNumeric) {
                return 0;
            }

            while (this.hasMoreData && this.isCurrentCraNumeric) {
                frac = frac * 10;
                decimal = decimal + parseFloat(this.#string.charAt(this.#currentIndex)) / frac;
                this.#currentIndex = this.#currentIndex + 1;
            }
        }

        // Read the exponent part.
        if (
            this.#currentIndex !== startIndex &&
            this.#currentIndex + 1 < this.#endIndex &&
            (this.getCurrentChar() === 'e' || this.getCurrentChar() === 'E') &&
            this.getCurrentChar(1) !== 'x' &&
            this.getCurrentChar(1) !== 'm'
        ) {
            ++this.#currentIndex;

            // Read the sign of the exponent.
            if (this.getCurrentChar() === '+') {
                ++this.#currentIndex;
            } else if (this.getCurrentChar() === '-') {
                ++this.#currentIndex;
                expsign = -1;
            }

            // There must be an exponent.
            if (!this.hasMoreData || !this.isCurrentCraNumeric) {
                return 0;
            }

            while (this.hasMoreData && this.isCurrentCraNumeric) {
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
            return 0;
        }

        this.skipOptionalSpacesOrDelimiter();

        return number;
    }

    private parseArcFlag(): number {
        if (!this.hasMoreData) {
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

    private parseNumbers(count: number): number[] {
        let i = 0;
        const result: number[] = [];

        for (i = 0; i < count; ++i) {
            result.push(this.parseNumber());
        }

        return result;
    }

    private parseArcFlags(count: number): number[] {
        let i = 0;
        const result: number[] = [];

        for (i = 0; i < count; ++i) {
            result.push(this.parseArcFlag());
        }

        return result;
    }

    private getSegmentArgs(command: PATH_SEGMENT_TYPE): number[] {
        let x: number = 0;
        let y: number = 0;
        let x1: number = 0;
        let y1: number = 0;
        let x2: number = 0;
        let y2: number = 0;
        let arcAngle: number = 0;
        let arcLarge: number = 0;
        let arcSweep: number = 0;

        switch (command) {
            case PATH_SEGMENT_TYPE.LINETO_ABS:
            case PATH_SEGMENT_TYPE.LINETO_REL:
            case PATH_SEGMENT_TYPE.MOVETO_ABS:
            case PATH_SEGMENT_TYPE.MOVETO_REL:
            case PATH_SEGMENT_TYPE.CURVETO_QUADRATIC_SMOOTH_ABS:
            case PATH_SEGMENT_TYPE.CURVETO_QUADRATIC_SMOOTH_REL:
                return this.parseNumbers(2);
            case PATH_SEGMENT_TYPE.LINETO_HORIZONTAL_REL:
            case PATH_SEGMENT_TYPE.LINETO_HORIZONTAL_ABS:
            case PATH_SEGMENT_TYPE.LINETO_VERTICAL_REL:
            case PATH_SEGMENT_TYPE.LINETO_VERTICAL_ABS:
                return this.parseNumbers(1);
            case PATH_SEGMENT_TYPE.CLOSEPATH:
                this.skipOptionalSpaces();

                return [];
            case PATH_SEGMENT_TYPE.CURVETO_CUBIC_REL:
            case PATH_SEGMENT_TYPE.CURVETO_CUBIC_ABS:
                [x1, y1, x2, y2, x, y] = this.parseNumbers(6);

                return [x, y, x1, y1, x2, y2];
            case PATH_SEGMENT_TYPE.CURVETO_CUBIC_SMOOTH_ABS:
            case PATH_SEGMENT_TYPE.CURVETO_CUBIC_SMOOTH_REL:
            case PATH_SEGMENT_TYPE.CURVETO_QUADRATIC_ABS:
            case PATH_SEGMENT_TYPE.CURVETO_QUADRATIC_REL:
                [x1, y1, x, y] = this.parseNumbers(4);

                return [x, y, x1, y1];
            case PATH_SEGMENT_TYPE.ARC_ABS:
            case PATH_SEGMENT_TYPE.ARC_REL:
                [x1, y1, arcAngle] = this.parseNumbers(3);
                [arcLarge, arcSweep] = this.parseArcFlags(2);
                [x, y] = this.parseNumbers(2);

                return [x, y, x1, y1, arcAngle, arcLarge, arcSweep];
            default:
                throw new Error('Unknown path seg type.');
        }
    }

    public parseSegment(pathSegList: unknown): SVGPathSeg | null {
        const lookahead = this.#string[this.#currentIndex] as PATH_TAG;
        let command = this.pathSegTypeFromChar(lookahead);
        if (command === PATH_SEGMENT_TYPE.UNKNOWN) {
            // Possibly an implicit command. Not allowed if this is the first command.
            if (this.#prevCommand === PATH_SEGMENT_TYPE.UNKNOWN) {
                return null;
            }
            command = this.nextCommandHelper(lookahead, this.#prevCommand);
            if (command === PATH_SEGMENT_TYPE.UNKNOWN) {
                return null;
            }
        } else {
            ++this.#currentIndex;
        }

        this.#prevCommand = command;

        const points: number[] = this.getSegmentArgs(command);
        const segment = TYPE_TO_SEGMENT.get(command);

        return segment.create(command, points, pathSegList);
    }
}
