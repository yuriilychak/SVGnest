// matrix utility from SvgPath
// https://github.com/fontello/svgpath

export default class Matrix {
  private _cache?: Float32Array;
  private _queue: Array<Float32Array>;

  constructor() {
    this._queue = new Array<Float32Array>(); // list of matrixes to apply
    this._cache = null; // combined matrix cache
  }

  public isIdentity(): boolean {
    return Matrix._getIdentity(this.cache);
  }

  public matrix(m: Float32Array): Matrix {
    if (!Matrix._getIdentity(m)) {
      this._updateQueue(m[0], m[1], m[2], m[3], m[4], m[5]);
    }

    return this;
  }

  public translate(tx: number, ty: number): Matrix {
    if (tx !== 0 || ty !== 0) {
      this._updateQueue(1, 0, 0, 1, tx, ty);
    }

    return this;
  }

  public scale(sx: number, sy: number): Matrix {
    if (sx !== 1 || sy !== 1) {
      this._updateQueue(sx, 0, 0, sy, 0, 0);
    }

    return this;
  }

  public rotate(angle: number, rx: number, ry: number): Matrix {
    if (angle !== 0) {
      this.translate(rx, ry);

      const rad: number = (angle * Math.PI) / 180;
      const cos: number = Math.cos(rad);
      const sin: number = Math.sin(rad);

      this._updateQueue(cos, sin, -sin, cos, 0, 0);

      this.translate(-rx, -ry);
    }

    return this;
  }

  public skewX(angle: number): Matrix {
    if (angle !== 0) {
      this._updateQueue(1, 0, Math.tan((angle * Math.PI) / 180), 1, 0, 0);
    }

    return this;
  }

  public skewY(angle: number): Matrix {
    if (angle !== 0) {
      this._updateQueue(1, Math.tan((angle * Math.PI) / 180), 0, 1, 0, 0);
    }

    return this;
  }

  // Flatten queue
  //
  public toArray(): Float32Array {
    if (this._cache) {
      return this._cache;
    }

    const size: number = this._queue.length;

    switch (size) {
      case 0:
        this._cache = Matrix._getCache(1, 0, 0, 1, 0, 0);
        break;
      case 1:
        this._cache = this._queue[0];
        break;
      default: {
        this._cache = this._queue[0];

        let i: number = 0;

        for (i = 1; i < size; ++i) {
          this._cache = Matrix.combine(this._cache, this._queue[i]);
        }
      }
    }

    return this._cache;
  }

  // Apply list of matrixes to (x,y) point.
  // If `isRelative` set, `translate` component of matrix will be skipped
  //
  public calc(x: number, y: number, isRelative: boolean = false): Float32Array {
    const result = new Float32Array(2);

    // Don't change point on empty transforms queue
    if (!this._queue.length) {
      result[0] = x;
      result[1] = y;

      return result;
    }

    // Calculate final matrix, if not exists
    //
    // NB. if you deside to apply transforms to point one-by-one,
    // they should be taken in reverse order

    const m: Float32Array = this.cache;

    result[0] = x * m[0] + y * m[2] + (isRelative ? 0 : m[4]);
    result[1] = x * m[1] + y * m[3] + (isRelative ? 0 : m[5]);

    // Apply matrix to point
    return result;
  }

  public get cache(): Float32Array {
    if (!this._cache) {
      this._cache = this.toArray();
    }

    return this._cache;
  }

  public transform(cmd: string, params: Array<number>): void {
    // If params count is not correct - ignore command
    switch (cmd) {
      case "matrix":
        if (params.length === 6) {
          this.matrix(new Float32Array(params));
        }
        break;
      case "scale":
        if (params.length === 1) {
          this.scale(params[0], params[0]);
        } else if (params.length === 2) {
          this.scale(params[0], params[1]);
        }
        break;
      case "rotate":
        if (params.length === 1) {
          this.rotate(params[0], 0, 0);
        } else if (params.length === 3) {
          this.rotate(params[0], params[1], params[2]);
        }
        break;
      case "translate":
        if (params.length === 1) {
          this.translate(params[0], 0);
        } else if (params.length === 2) {
          this.translate(params[0], params[1]);
        }
        break;
      case "skewX":
        if (params.length === 1) {
          this.skewX(params[0]);
        }
        break;
      case "skewY":
        if (params.length === 1) {
          this.skewY(params[0]);
        }
        break;
    }
  }

  private _updateQueue(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number
  ): void {
    this._cache = null;
    this._queue.push(Matrix._getCache(a, b, c, d, e, f));
  }

  private static _getCache(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number
  ): Float32Array {
    const result = new Float32Array(6);

    result[0] = a;
    result[1] = b;
    result[2] = c;
    result[3] = d;
    result[4] = e;
    result[5] = f;

    return result;
  }

  private static _getIdentity(m: Float32Array): boolean {
    return (
      m[0] === 1 &&
      m[1] === 0 &&
      m[2] === 0 &&
      m[3] === 1 &&
      m[4] === 0 &&
      m[5] === 0
    );
  }

  // combine 2 matrixes
  // m1, m2 - [a, b, c, d, e, f]
  //
  private static combine(m1: Float32Array, m2: Float32Array): Float32Array {
    return Matrix._getCache(
      m1[0] * m2[0] + m1[2] * m2[1],
      m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3],
      m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
      m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
    );
  }
}
