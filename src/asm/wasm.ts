import { __AdaptedExports, instantiate } from "./release";

// Initialization.

let exports: typeof __AdaptedExports;

/* Promise resolving when WebAssembly is ready. */
export const ready = /* #__PURE__ */ new Promise<void>(
  async (resolve, reject) => {
    try {
      exports = await fetch("release.wasm")
        .then((response) => response.arrayBuffer())
        .then((bytes) => instantiate(bytes));
      resolve();
    } catch (e) {
      reject(e);
    }
  }
);

// Wrapper API.
export function segmentDistance(
  inputA: Float32Array,
  inputB: Float32Array,
  inputE: Float32Array,
  inputF: Float32Array,
  inputDirection: Float32Array
): number {
  if (!exports) {
    throw new Error('WebAssembly not yet initialized: await "ready" export.');
  }

  return exports.segmentDistance(
    inputA,
    inputB,
    inputE,
    inputF,
    inputDirection
  );
}

export function lineIntersect(
  importA: Float32Array,
  importB: Float32Array,
  importE: Float32Array,
  importF: Float32Array,
  infinite?: boolean
): boolean {
  if (!exports) {
    throw new Error('WebAssembly not yet initialized: await "ready" export.');
  }

  return exports.lineIntersect(importA, importB, importE, importF, infinite);
}

export function noFitPolygonRectangle(
  dataA: Float32Array,
  dataB: Float32Array
): Float32Array {
  return exports.noFitPolygonRectangle(dataA, dataB);
}
