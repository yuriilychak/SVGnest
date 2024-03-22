import LocalMinima from "./local-minima";
import Scanbeam from "./scanbeam";

export default class ScanbeamStore {
  private _data: Scanbeam | null;

  constructor() {
    this._data = null;
  }

  public fromLocalMinima(inputMinima: LocalMinima): void {
    this._data = null;

    let localMinima: LocalMinima = inputMinima;

    while (localMinima !== null) {
      this.insert(localMinima.y);
      localMinima = localMinima.next;
    }
  }

  public insert(y: number): void {
    this._data = this._data === null ? new Scanbeam(y) : this._data.insert(y);
  }

  public pop(): number {
    if (this._data === null) {
      return -1;
    }

    const result: number = this._data.y;
    this._data = this._data.next;

    return result;
  }

  public clean(): void {
    this._data = null;
  }

  public get isEmpty(): boolean {
    return this._data === null;
  }
}
