import { degreesToRadians } from '../helpers';
import { IPoint, MATRIX_OPERATIONS } from '../types';

export default class Matrix {
    // combined matrix cache
    #cache: number[] = null;

    // list of matrixes to apply
    #queue: number[][] = [];

    public get isIdentity(): boolean {
        if (this.#cache === null) {
            this.#cache = this.toArray();
        }

        return Matrix.getIndent(this.#cache);
    }

    // Apply list of matrixes to (x,y) point.
    // If `isRelative` set, `translate` component of matrix will be skipped
    //
    public calc(x: number, y: number, isRelative: boolean = false): IPoint {
        // Don't change point on empty transforms queue
        if (!this.#queue.length) {
            return { x, y };
        }

        // Calculate final matrix, if not exists
        //
        // NB. if you deside to apply transforms to point one-by-one,
        // they should be taken in reverse order

        if (this.#cache === null) {
            this.#cache = this.toArray();
        }

        // Apply matrix to point
        return {
            x: x * this.#cache[0] + y * this.#cache[2] + (isRelative ? 0 : this.#cache[4]),
            y: x * this.#cache[1] + y * this.#cache[3] + (isRelative ? 0 : this.#cache[5])
        };
    }

    private matrix(matrix: number[]): void {
        if (Matrix.getIndent(matrix)) {
            return;
        }

        this.#cache = null;
        this.#queue.push(matrix);
    }

    private add(values: number[], indices: number[]): void {
        const transform = Matrix.BASIC_MATRIX.slice();
        const updateCount = values.length;
        let i = 0;

        for (i = 0; i < updateCount; ++i) {
            transform[indices[i]] = values[i];
        }

        this.#cache = null;
        this.#queue.push(transform);
    }

    private translate(tx: number, ty: number = 0): void {
        if (tx !== 0 || ty !== 0) {
            this.add([tx, ty], [4, 5]);
        }
    }

    private scale(sx: number, sy: number = sx): void {
        if (sx !== 1 || sy !== 1) {
            this.add([sx, sy], [0, 3]);
        }
    }

    private rotate(angle: number, rx: number = 0, ry: number = 0): void {
        if (angle !== 0) {
            this.translate(rx, ry);

            const rad = degreesToRadians(angle);
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);

            this.add([cos, sin, -sin, cos], [0, 1, 2, 3]);

            this.translate(-rx, -ry);
        }
    }

    private skewX(angle: number): void {
        if (angle !== 0) {
            this.add([Math.tan(degreesToRadians(angle))], [2]);
        }
    }

    private skewY(angle: number): void {
        if (angle !== 0) {
            this.add([Math.tan(degreesToRadians(angle))], [1]);
        }
    }

    // Flatten queue
    public toArray(): number[] {
        if (this.#cache) {
            return this.#cache;
        }

        switch (this.#queue.length) {
            case 0:
                return Matrix.BASIC_MATRIX.slice();
            case 1:
                return this.#queue[0];
            default:
        }

        this.#cache = this.#queue[0];

        let i = 0;
        let transform = null;

        // combine matrixes
        // m1, m2 - [a, b, c, d, e, g]
        //
        for (i = 1; i < this.#queue.length; ++i) {
            transform = this.#queue[i];

            this.#cache = [
                this.#cache[0] * transform[0] + this.#cache[2] * transform[1],
                this.#cache[1] * transform[0] + this.#cache[3] * transform[1],
                this.#cache[0] * transform[2] + this.#cache[2] * transform[3],
                this.#cache[1] * transform[2] + this.#cache[3] * transform[3],
                this.#cache[0] * transform[4] + this.#cache[2] * transform[5] + this.#cache[4],
                this.#cache[1] * transform[4] + this.#cache[3] * transform[5] + this.#cache[5]
            ];
        }

        return this.#cache;
    }

    public execute(command: MATRIX_OPERATIONS, params: number[]): void {
        if (params.length === 0) {
            return;
        }
        // If params count is not correct - ignore command
        switch (command) {
            case MATRIX_OPERATIONS.MATRIX:
                if (params.length === 6) {
                    this.matrix(params);
                }
                break;
            case MATRIX_OPERATIONS.SCALE:
                if (params.length === 1) {
                    this.scale(params[0]);
                } else if (params.length === 2) {
                    this.scale(params[0], params[1]);
                }
                break;
            case MATRIX_OPERATIONS.ROTATE:
                if (params.length === 1) {
                    this.rotate(params[0]);
                } else if (params.length === 3) {
                    this.rotate(params[0], params[1], params[2]);
                }
                break;
            case MATRIX_OPERATIONS.TRANSLATE:
                if (params.length === 1) {
                    this.translate(params[0]);
                } else if (params.length === 2) {
                    this.translate(params[0], params[1]);
                }
                break;
            case MATRIX_OPERATIONS.SKEW_X:
                if (params.length === 1) {
                    this.skewX(params[0]);
                }
                break;
            case MATRIX_OPERATIONS.SKEW_Y:
                if (params.length === 1) {
                    this.skewY(params[0]);
                }
                break;
            default:
        }
    }

    private static getIndent(matrix: number[]): boolean {
        const count: number = Matrix.BASIC_MATRIX.length;
        let i: number = 0;

        for (i = 0; i < count; ++i) {
            if (Matrix.BASIC_MATRIX[i] !== matrix[i]) {
                return false;
            }
        }

        return true;
    }

    private static BASIC_MATRIX: number[] = [1, 0, 0, 1, 0, 0];

    public static AVAILABLE_OPERATIONS: MATRIX_OPERATIONS[] = [
        MATRIX_OPERATIONS.MATRIX,
        MATRIX_OPERATIONS.SCALE,
        MATRIX_OPERATIONS.ROTATE,
        MATRIX_OPERATIONS.TRANSLATE,
        MATRIX_OPERATIONS.SKEW_X,
        MATRIX_OPERATIONS.SKEW_Y
    ];
}
