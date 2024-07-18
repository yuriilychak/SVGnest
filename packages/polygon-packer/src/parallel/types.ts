import { WORKER_TYPE } from '../types';

export enum OPERATION_STATE {
    NONE = 0,
    SUCESS = 1,
    ERROR = 2
}

export type OperationCallback = (data: unknown) => void;

export interface Options<T = object> {
    id: WORKER_TYPE;
    env: T;
}
