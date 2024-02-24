import { SharedWorker } from "./shared-worker";
import Operation from "./opertaion";
import { Options } from "./interfaces";

export default class Parallel {
  private _data: Array<object>;
  private _options: Options;
  private _maxWorkers: number;
  private _operation: Operation;
  private _onSpawn: Function;

  constructor(
    id: string,
    data: Array<object>,
    env: object,
    onSpawn: Function = null
  ) {
    this._data = data;
    this._maxWorkers = navigator.hardwareConcurrency || 4;
    this._options = { id, env };
    this._operation = new Operation(this._data);
    this._onSpawn = onSpawn;
  }

  public then<T>(
    successCallback: (result: T[]) => void,
    errorCallback: (error: Error[]) => void = () => {}
  ): void {
    const dataOperation = new Operation();
    const chainOperation = new Operation();

    this._triggerOperation(
      dataOperation,
      this._getDataResolveCallback(dataOperation),
      (error: Error) => dataOperation.reject(error)
    );

    this._triggerOperation(
      chainOperation,
      () => {
        try {
          this._processResult<T>(successCallback, chainOperation, this._data);
        } catch (error) {
          this._processResult<Error>(errorCallback, chainOperation, error);
        }
      },
      (error: Error) =>
        this._processResult<Error>(errorCallback, chainOperation, error)
    );
  }

  private _spawnWorker(inputWorker?: Worker): Worker {
    let worker: Worker = inputWorker;

    if (!worker) {
      try {
        worker = new SharedWorker();
        worker.postMessage(this._options);
      } catch (e) {
        throw e;
      }
    }

    return worker;
  }

  private _triggerWorker(
    worker: Worker,
    data: object,
    onMessage: (message: MessageEvent) => void,
    onError: (error: ErrorEvent) => void
  ): void {
    if (!worker) {
      return;
    }

    worker.onmessage = onMessage;
    worker.onerror = onError;
    worker.postMessage(data);
  }

  private _spawnMapWorker(i: number, done: Function, worker?: Worker): void {
    this._onSpawn !== null && this._onSpawn();

    const resultWorker = this._spawnWorker(worker);
    const onMessage = (message: MessageEvent) => {
      this._data[i] = message.data;
      done(null, resultWorker);
    };
    const onError = (error: ErrorEvent) => {
      resultWorker.terminate();
      done(error);
    };

    this._triggerWorker(resultWorker, this._data[i], onMessage, onError);
  }

  private _triggerOperation(
    operation: Operation,
    resolve: Function,
    reject: Function
  ): void {
    this._operation.then(resolve, reject);
    this._operation = operation;
  }

  private _processResult<T>(
    callback: (data: T[]) => void,
    operation: Operation,
    data: any
  ): void {
    if (callback) {
      callback(data);

      operation.resolve(this._data);
    } else {
      operation.resolve(data);
    }
  }

  private _getDataResolveCallback(operation: Operation): Function {
    if (!this._data.length) {
      return () => {
        const worker = this._spawnWorker();
        const onMessage = (message: MessageEvent) => {
          worker.terminate();
          console.log();
          this._data = message.data;
          operation.resolve(this._data);
        };
        const onError = (error: ErrorEvent) => {
          worker.terminate();
          operation.reject(error);
        };

        this._triggerWorker(worker, this._data, onMessage, onError);
      };
    }

    let startedOps: number = 0;
    let doneOps: number = 0;

    const done = (error: Error, worker: Worker): void => {
      if (error) {
        operation.reject(error);
      } else if (++doneOps === this._data.length) {
        operation.resolve(this._data);
        if (worker) {
          worker.terminate();
        }
      } else if (startedOps < this._data.length) {
        this._spawnMapWorker(startedOps++, done, worker);
      } else if (worker) {
        worker.terminate();
      }
    };

    return () => {
      for (
        ;
        startedOps - doneOps < this._maxWorkers &&
        startedOps < this._data.length;
        ++startedOps
      ) {
        this._spawnMapWorker(startedOps, done);
      }
    };
  }
}
