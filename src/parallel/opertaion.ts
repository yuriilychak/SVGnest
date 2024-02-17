import { OperationStatus } from "./enums";

export default class Operation {
  private _successCallbacks: Array<Function>;
  private _errorCallbacks: Array<Function>;
  private _status: OperationStatus;
  private _result: any;

  constructor(result: any = null) {
    this._successCallbacks = [];
    this._errorCallbacks = [];
    this._status = result ? OperationStatus.Success : OperationStatus.Empty;
    this._result = result;
  }

  public resolve(value: any): void {
    this._proceed(OperationStatus.Success, value);
  }

  public reject(value: any): void {
    this._proceed(OperationStatus.Error, value);
  }

  public then(resolve?: Function, reject?: Function): void {
    switch (this._status) {
      case OperationStatus.Success:
        return resolve && resolve(this._result);
      case OperationStatus.Error:
        return reject && reject(this._result);
      default: {
        resolve && this._successCallbacks.push(resolve);
        reject && this._errorCallbacks.push(reject);
      }
    }
  }

  private _proceed(status: OperationStatus, result: any): void {
    this._status = status;
    this._result = result;

    const callbacks: Array<Function> =
      status === OperationStatus.Error
        ? this._errorCallbacks
        : this._successCallbacks;
    const count: number = callbacks.length;
    let i: number = 0;

    for (i = 0; i < count; ++i) {
      callbacks[i](result);
    }

    this._successCallbacks = [];
    this._errorCallbacks = [];
  }
}
