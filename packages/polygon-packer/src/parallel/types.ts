export enum OPERATION_STATE {
    NONE = 0,
    SUCESS = 1,
    ERROR = 2
}

export type OperationCallback = (data: unknown) => void;

export type ThreadTarget = MessagePort | Worker;
