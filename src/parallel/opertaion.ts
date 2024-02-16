export default class Operation {
  private _successCallbacks: Array<Function>;
  private _errorCallbacks: Array<Function>;
  private _status: number;
  private _result: any;

  constructor(result: any = null) {
    this._successCallbacks = [];
    this._errorCallbacks = [];
    this._status = result ? 1 : 0;
    this._result = result;
  }

  public resolve(value: any): void {
    this._proceed(1, value);
  }

  public reject(value: any): void {
    this._proceed(2, value);
  }

  public then(resolve?: Function, reject?: Function): void {
    switch (this._status) {
      case 1:
        return resolve && resolve(this._result);
      case 2:
        return reject && reject(this._result);
      default: {
        resolve && this._successCallbacks.push(resolve);
        reject && this._errorCallbacks.push(reject);
      }
    }
  }

  private _proceed(status: number, result: any): void {
    this._status = status;
    this._result = result;

    const callbacks =
      status === 2 ? this._errorCallbacks : this._successCallbacks;
    const count = callbacks.length;
    let i = 0;

    for (i = 0; i < count; ++i) {
      callbacks[i](result);
    }

    this._successCallbacks = [];
    this._errorCallbacks = [];
  }
}
