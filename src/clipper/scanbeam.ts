export default class Scanbeam {
  private _y: number;
  private _next: Scanbeam;

  constructor(y: number, next: Scanbeam = null) {
    this._y = y;
    this._next = next;
  }

  public insert(y: number) {
    if (y > this._y) {
      return new Scanbeam(y, this);
    }

    let scanbeam: Scanbeam = this;

    while (scanbeam.hasNext && y <= scanbeam.next.y) {
      scanbeam = scanbeam.next;
    }

    if (y !== scanbeam.y) {
      //ie ignores duplicates
      scanbeam.next = new Scanbeam(y, scanbeam.next);
    }

    return this;
  }

  public get next(): Scanbeam {
    return this._next;
  }

  public set next(value: Scanbeam) {
    this._next = value;
  }

  public get y(): number {
    return this._y;
  }

  public get hasNext(): boolean {
    return this._next !== null;
  }
}
