export default class Matrix {
    // combined matrix cache
    #cache = null;

    // list of matrixes to apply
    #queue = [];

    get isIdentity() {
        if (this.#cache === null) {
            this.#cache = this.toArray();
        }

        return Matrix.getIndent(this.#cache);
    }

    // Apply list of matrixes to (x,y) point.
    // If `isRelative` set, `translate` component of matrix will be skipped
    //
    calc(x, y, isRelative = false) {
        // Don't change point on empty transforms queue
        if (!this.#queue.length) {
            return [x, y];
        }

        // Calculate final matrix, if not exists
        //
        // NB. if you deside to apply transforms to point one-by-one,
        // they should be taken in reverse order

        if (this.#cache === null) {
            this.#cache = this.toArray();
        }

        // Apply matrix to point
        return [
            x * this.#cache[0] + y * this.#cache[2] + (isRelative ? 0 : this.#cache[4]),
            x * this.#cache[1] + y * this.#cache[3] + (isRelative ? 0 : this.#cache[5])
        ];
    }

    matrix(matrix) {
        if (Matrix.getIndent(matrix)) {
            return this;
        }

        this.#cache = null;
        this.#queue.push(matrix);
        return this;
    }

    add(values, indices) {
        const transform = Matrix.BASIC_MATRIX.slice();
        const updateCount = values.length;
        let i = 0;

        for (i = 0; i < updateCount; ++i) {
            transform[indices[i]] = values[i];
        }

        this.#cache = null;
        this.#queue.push(transform);
    }

    translate(tx, ty = 0) {
        if (tx !== 0 || ty !== 0) {
            this.add([tx, ty], [4, 5]);
        }
    }

    scale(sx, sy = sx) {
        if (sx !== 1 || sy !== 1) {
            this.add([sx, sy], [0, 3]);
        }
    }

    rotate(angle, rx = 0, ry = 0) {
        if (angle !== 0) {
            this.translate(rx, ry);

            const rad = angle * Math.PI / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);

            this.add([cos, sin, -sin, cos], [0, 1, 2, 3]);

            this.translate(-rx, -ry);
        }
    }

    // Flatten queue
    toArray() {
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

    execute(command, params) {
        if (params.length === 0) {
            return;
        }
        // If params count is not correct - ignore command
        switch (command) {
            case 'matrix':
                if (params.length === 6) {
                    this.matrix(params);
                }
                break;
            case 'scale':
                if (params.length === 1) {
                    this.scale(params[0]);
                } else if (params.length === 2) {
                    this.scale(params[0], params[1]);
                }
                break;
            case 'rotate':
                if (params.length === 1) {
                    this.rotate(params[0]);
                } else if (params.length === 3) {
                    this.rotate(params[0], params[1], params[2]);
                }
                break;

            case 'translate':
                if (params.length === 1) {
                    this.translate(params[0]);
                } else if (params.length === 2) {
                    this.translate(params[0], params[1]);
                }
                break;
            case 'skewX':
                if (params[0] !== 0) {
                    this.add([Math.tan(params[0] * Math.PI / 180)], [2]);
                }
                break;
            case 'skewY':
                if (params[0] !== 0) {
                    this.add([Math.tan(params[0] * Math.PI / 180)], [1]);
                }
                break;
            default:
        }
    }

    static getIndent(matrix) {
        const count = 6;
        let i = 0;

        for (i = 0; i < count; ++i) {
            if (Matrix.BASIC_MATRIX[i] !== matrix[i]) {
                return false;
            }
        }

        return true;
    }

    static BASIC_MATRIX = [1, 0, 0, 1, 0, 0];

    static AVAILABLE_OPERATIONS = ['matrix', 'scale', 'rotate', 'translate', 'skewX', 'skewY'];
}
