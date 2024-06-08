// matrix utility from SvgPath
// https://github.com/fontello/svgpath

export default class Matrix {
    constructor() {
        this.queue = []; // list of matrixes to apply
        this.cache = null; // combined matrix cache
    }

    // combine 2 matrixes
    // m1, m2 - [a, b, c, d, e, g]
    //
    combine(m1, m2) {
        return [
            m1[0] * m2[0] + m1[2] * m2[1],
            m1[1] * m2[0] + m1[3] * m2[1],
            m1[0] * m2[2] + m1[2] * m2[3],
            m1[1] * m2[2] + m1[3] * m2[3],
            m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
            m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
        ];
    }

    isIdentity() {
        if (!this.cache) {
            this.cache = this.toArray();
        }

        const m = this.cache;

        if (
            m[0] === 1 &&
            m[1] === 0 &&
            m[2] === 0 &&
            m[3] === 1 &&
            m[4] === 0 &&
            m[5] === 0
        ) {
            return true;
        }
        return false;
    }

    matrix(m) {
        if (
            m[0] === 1 &&
            m[1] === 0 &&
            m[2] === 0 &&
            m[3] === 1 &&
            m[4] === 0 &&
            m[5] === 0
        ) {
            return this;
        }
        this.cache = null;
        this.queue.push(m);
        return this;
    }

    translate(tx, ty) {
        if (tx !== 0 || ty !== 0) {
            this.cache = null;
            this.queue.push([1, 0, 0, 1, tx, ty]);
        }
        return this;
    }

    scale(sx, sy = sx) {
        if (sx !== 1 || sy !== 1) {
            this.cache = null;
            this.queue.push([sx, 0, 0, sy, 0, 0]);
        }
        return this;
    }

    rotate(angle, rx = 0, ry = 0) {
        let rad = 0;
        let cos = 0;
        let sin = 0;

        if (angle !== 0) {
            this.translate(rx, ry);

            rad = angle * Math.PI / 180;
            cos = Math.cos(rad);
            sin = Math.sin(rad);

            this.queue.push([cos, sin, -sin, cos, 0, 0]);
            this.cache = null;

            this.translate(-rx, -ry);
        }
        return this;
    }

    skewX(angle) {
        if (angle !== 0) {
            this.cache = null;
            this.queue.push([1, 0, Math.tan(angle * Math.PI / 180), 1, 0, 0]);
        }
        return this;
    }

    skewY(angle) {
        if (angle !== 0) {
            this.cache = null;
            this.queue.push([1, Math.tan(angle * Math.PI / 180), 0, 1, 0, 0]);
        }
        return this;
    }

    // Flatten queue
    //
    toArray() {
        if (this.cache) {
            return this.cache;
        }

        if (!this.queue.length) {
            this.cache = [1, 0, 0, 1, 0, 0];
            return this.cache;
        }

        this.cache = this.queue[0];

        if (this.queue.length === 1) {
            return this.cache;
        }

        for (let i = 1; i < this.queue.length; i++) {
            this.cache = this.combine(this.cache, this.queue[i]);
        }

        return this.cache;
    }

    // Apply list of matrixes to (x,y) point.
    // If `isRelative` set, `translate` component of matrix will be skipped
    //
    calc(x, y, isRelative) {
        let m = 0;

        // Don't change point on empty transforms queue
        if (!this.queue.length) {
            return [x, y];
        }

        // Calculate final matrix, if not exists
        //
        // NB. if you deside to apply transforms to point one-by-one,
        // they should be taken in reverse order

        if (!this.cache) {
            this.cache = this.toArray();
        }

        m = this.cache;

        // Apply matrix to point
        return [
            x * m[0] + y * m[2] + (isRelative ? 0 : m[4]),
            x * m[1] + y * m[3] + (isRelative ? 0 : m[5])
        ];
    }

    execute(command, params) {
        // If params count is not correct - ignore command
        switch (command) {
            case 'matrix':
                if (params.length === 6) {
                    this.matrix(params);
                }
                return;
            case 'scale':
                if (params.length === 1) {
                    this.scale(params[0], params[0]);
                } else if (params.length === 2) {
                    this.scale(params[0], params[1]);
                }
                return;
            case 'rotate':
                if (params.length === 1) {
                    this.rotate(params[0], 0, 0);
                } else if (params.length === 3) {
                    this.rotate(params[0], params[1], params[2]);
                }
                return;

            case 'translate':
                if (params.length === 1) {
                    this.translate(params[0], 0);
                } else if (params.length === 2) {
                    this.translate(params[0], params[1]);
                }
                return;

            case 'skewX':
                if (params.length === 1) {
                    this.skewX(params[0]);
                }
                return;

            case 'skewY':
                if (params.length === 1) {
                    this.skewY(params[0]);
                }
                return;
            default:
        }
    }
}
