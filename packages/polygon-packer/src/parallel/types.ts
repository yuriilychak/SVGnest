import { THREAD_TYPE } from '../types';

export enum OPERATION_STATE {
    NONE = 0,
    SUCESS = 1,
    ERROR = 2
}

export type OperationCallback = (data: unknown) => void;

export interface Options<T = object> {
    id: THREAD_TYPE;
    env: T;
}

export type ThreadTarget = MessagePort | Worker;

export interface IThread {
    trigger(
        data: Record<string, unknown>,
        onMessage: (message: MessageEvent) => void,
        onError: (error: ErrorEvent) => void
    ): void;
    terminate(): void;
    getInstance(target: ThreadTarget): boolean;
    clone(): IThread;
}
