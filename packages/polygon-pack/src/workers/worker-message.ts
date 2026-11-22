export enum WorkerMessageType {
	INIT = 1,
	WORK = 2,
	READY = 3,
	INIT_ERROR = 4,
	RESULT = 5,
	WORK_BATCH = 6,
	BATCH_RESULT = 7
}

export type WorkerMessage = {
	type: WorkerMessageType.INIT | WorkerMessageType.WORK | WorkerMessageType.READY | WorkerMessageType.INIT_ERROR | WorkerMessageType.RESULT;
	bin: Uint8Array;
} | {
	type: WorkerMessageType.WORK_BATCH | WorkerMessageType.BATCH_RESULT;
	bins: Uint8Array[];
};
