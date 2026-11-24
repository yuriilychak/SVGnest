/*!
 * PolygonPack
 * Licensed under the MIT license
 */

import { MainThreadNestingExecutor } from './executors/main-thread-executor.ts';
import { WorkerNestingExecutor } from './executors/worker-executor.ts';
import type { NestingExecutionMode, NestingExecutor } from './executors/types.ts';
import {
  deserializeGenerationBegin,
  deserializeGenerationComplete,
  deserializePlacement,
  deserializePreparationResult,
  emptyCacheState,
  packWorkerConfig,
  serializeGenerationBegin,
  serializeGenerationComplete,
  serializePreparationRequest
} from "./worker-protocol.ts";
import type { NestingConfig, PlacementResult, PolygonNode, SourcePolygon } from './types.ts';

type ProgressCallback = (progress: number) => void;
type DisplayCallback = (best: PlacementResult | null) => void;
type ExecutorFactory = (mode: NestingExecutionMode) => NestingExecutor;

export class PolygonPack {
	#executorFactory?: ExecutorFactory;
  #prepared: Uint8Array | null = null;
  // Legacy empty-cache payload is one zero f64, represented directly as bytes.
  #nfpCacheState: Uint8Array = emptyCacheState();
  #generationState: Uint8Array = new Uint8Array();
  #hasBest = false;
  #bestFitness = Infinity;
  #generationTimer: ReturnType<typeof setInterval> | null = null;
  #executor: NestingExecutor | null = null;
  #executionMode: NestingExecutionMode | null = null;
  #progress = 0;
  #runId = 0;
  working = false;

  constructor(executorFactory?: ExecutorFactory) {
      this.#executorFactory = executorFactory;
  }

  async #launchGeneration(runId: number, workerConfig: number, displayCallback: DisplayCallback): Promise<void> {
      if (runId !== this.#runId) return;
      const beginRequest = serializeGenerationBegin({
        workerConfig,
        preparation: this.#prepared,
        state: this.#generationState,
        cacheState: this.#nfpCacheState
      });
      let begun;
      try {
        const response = await this.#executor!.request(beginRequest);
        if (!(response instanceof Uint8Array)) return;
        begun = deserializeGenerationBegin(response);
      } catch (err) {
        if (runId === this.#runId) console.warn(err);
        return;
      }
      if (runId !== this.#runId) return;
      if (!begun) {
        this.working = false;
        return;
      }
      try {
        const generatedNfp = await this.#executor!.requestAll(
          begun.jobs,
          (completed, total) => {
            if (runId === this.#runId) this.#progress = completed / total;
          }
        );
        if (runId !== this.#runId) return;
        if (begun.jobs.length === 0) this.#progress = 1;
        const completeRequest = serializeGenerationComplete({
          workerConfig,
          preparation: this.#prepared,
          continuation: begun.continuation,
          results: generatedNfp
        });
        const response = await this.#executor!.request(completeRequest);
        if (!(response instanceof Uint8Array)) return;
        const result = deserializeGenerationComplete(response);
        if (runId !== this.#runId) return;
        if (!result) {
          this.working = false;
          return;
        }
        this.#generationState = result.state;
        this.#nfpCacheState = result.cacheState;
        if (!this.#hasBest || result.fitness < this.#bestFitness) {
          this.#hasBest = true;
          this.#bestFitness = result.fitness;
          displayCallback(deserializePlacement(result.placement, result.partCount));
        } else {
          displayCallback(null);
        }
      } catch (err) {
        if (runId === this.#runId) console.warn(err);
      }
      if (runId === this.#runId) this.working = false;
  }

  // progressCallback is called when progress is made
  // displayCallback is called when a new placement has been made
  start(config: NestingConfig, polygons: SourcePolygon[], binSource: number, progressCallback: ProgressCallback, displayCallback: DisplayCallback, executionMode: NestingExecutionMode = 'workers'): boolean {
      const workerConfig = packWorkerConfig(config);
      if (workerConfig === 0) {
        return false;
      }

      const bin = polygons?.find((polygon) => polygon.source === binSource);
      const parts = polygons?.filter(
        (polygon) => polygon.source !== binSource
      );
      if (!bin || !parts) {
        return false;
      }

      this.stop();
      const executor = this.#ensureExecutor(executionMode);
      this.#progress = 0;
      this.#prepared = null;
      this.#hasBest = false;
      this.#bestFitness = Infinity;
      this.#nfpCacheState = emptyCacheState();
      this.#generationState = new Uint8Array();
      const runId = this.#runId;
      executor
        .request(serializePreparationRequest({ bin, parts, workerConfig }))
        .then(
          (serialized) => {
            if (runId !== this.#runId || !(serialized instanceof Uint8Array)) {
              return;
            }
            // The complete preparation response belongs to Rust. JavaScript
            // retains it without decoding so any pooled worker can recover
            // normalized geometry; UI hydration remains lazy.
            this.#prepared = serialized;
            this.#generationTimer = setInterval(() => {
              if (runId !== this.#runId) return;
              if (!this.working) {
                this.#launchGeneration(runId, workerConfig, displayCallback);
                this.working = true;
              }

              progressCallback(this.#progress);
            }, 100);
          },
          (err) => {
            if (runId === this.#runId) console.warn(err);
          }
        );
      return true;
  }

  // The algorithm produces placement data only. Format plugins combine this
  // polygon context with their source data for display and export.
  get placementContext(): { tree: PolygonNode[]; binBounds: { x: number; y: number; width: number; height: number } } | null {
      const prepared = deserializePreparationResult(this.#prepared);
      return prepared && {
        tree: prepared.tree,
        binBounds: prepared.bounds
      };
  }

  stop() {
      this.#runId += 1;
      this.working = false;
      this.#executor?.drain();
      if (this.#generationTimer) {
        clearInterval(this.#generationTimer);
        this.#generationTimer = null;
      }
  }

  terminate() {
      this.stop();
      this.#executor?.terminate();
      this.#executor = null;
      this.#executionMode = null;
  }

  #ensureExecutor(executionMode: NestingExecutionMode): NestingExecutor {
      if (this.#executor && this.#executionMode === executionMode) return this.#executor;
      this.#executor?.terminate();
      this.#executionMode = executionMode;
      this.#executor = this.#executorFactory?.(executionMode) ?? (executionMode === 'workers'
        ? new WorkerNestingExecutor()
        : new MainThreadNestingExecutor());
      return this.#executor;
  }

}
