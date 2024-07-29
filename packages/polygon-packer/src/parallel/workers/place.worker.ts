import type { IPolygon, PlacementWorkerData, PlacementWorkerResult } from '../../types';
import type { Options } from '../types';

// Use importScripts to load the external script
declare function importScripts(...urls: string[]): void;

declare module geometryUtils {
    export function placePaths(paths: IPolygon[], config: PlacementWorkerData): PlacementWorkerResult | null;
}

importScripts(self.location.href.replace('place.worker', 'geometry-utils'));

const ctx: Worker = self as unknown as Worker;

function onMessage(this: Worker, code: MessageEvent<Options<PlacementWorkerData>>) {
    function onInnerMessage(this: Worker, e: MessageEvent<IPolygon[]>) {
        this.postMessage(geometryUtils.placePaths(e.data, code.data.env));
    }

    this.onmessage = onInnerMessage;
}

ctx.onmessage = onMessage;
