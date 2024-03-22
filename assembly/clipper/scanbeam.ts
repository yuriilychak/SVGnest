export default class Scanbeam {
  private _y: f64;
  private _next: Scanbeam | null;

  constructor(y: f64, next: Scanbeam | null = null) {
    this._y = y;
    this._next = next;
  }

  public insert(y: f64): Scanbeam {
    if (y > this._y) {
      return new Scanbeam(y, this);
    }

    let scanbeam: Scanbeam = this;

    while (scanbeam.next !== null && y <= scanbeam.next.y) {
      scanbeam = scanbeam.next;
    }

    if (y !== scanbeam.y) {
      scanbeam.next = new Scanbeam(y, scanbeam.next);
    }

    return this;
  }

  public get next(): Scanbeam | null {
    return this._next;
  }

  protected set next(value: Scanbeam) {
    this._next = value;
  }

  public get y(): f64 {
    return this._y;
  }
}
