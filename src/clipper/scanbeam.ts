export default class Scanbeam {
  private _y: number;
  private _next: Scanbeam | null;

  constructor(y: number, next: Scanbeam | null = null) {
    this._y = y;
    this._next = next;
  }

  public insert(y: number): Scanbeam {
    if (y > this._y) {
      return new Scanbeam(y, this);
    }

    let scanbeam: Scanbeam | null = this;

    while (
      scanbeam !== null &&
      scanbeam.hasNext &&
      y <= scanbeam.unsafeNext.y
    ) {
      scanbeam = scanbeam.next;
    }

    if (scanbeam !== null && y !== scanbeam.y) {
      scanbeam.next = new Scanbeam(y, scanbeam.next);
    }

    return this;
  }

  public get unsafeNext(): Scanbeam {
    return this._next as Scanbeam;
  }

  public get next(): Scanbeam | null {
    return this._next;
  }

  protected set next(value: Scanbeam | null) {
    this._next = value;
  }

  public get y(): number {
    return this._y;
  }

  public get hasNext(): boolean {
    return this._next !== null;
  }
}
