export type NestingExecutionMode = 'workers' | 'main-thread';

export interface NestingExecutor {
	request(request: Uint8Array): Promise<Uint8Array>;
	requestAll(requests: Uint8Array[], onProgress?: (completed: number, total: number) => void): Promise<Uint8Array[]>;
	drain(): void;
	terminate(): void;
}
