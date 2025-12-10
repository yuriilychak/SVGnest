

// Use importScripts to load the external script
declare function importScripts(...urls: string[]): void;

declare module WasmNesting {
    export function calculate_wasm(data: Uint8Array): Float32Array;
}


importScripts(self.location.href.replace(/^(.*\/)[^\/]+(?=\.js$)/, `$1wasm-nesting`));

let isWasmInitialized = false;

const trigger = (event: MessageEvent<ArrayBuffer>) => {
    if (isWasmInitialized) {
        const buffer = WasmNesting.calculate_wasm(new Uint8Array(event.data)).buffer as ArrayBuffer;

        //@ts-ignore
        self.postMessage(buffer, [buffer]);
    } else {
        const handler = () => {
            self.removeEventListener('wasmReady', handler);
            isWasmInitialized = true;
            trigger(event);
        }
        self.addEventListener('wasmReady', handler)
    }
}

self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
    trigger(event);
};
