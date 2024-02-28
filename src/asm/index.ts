import FloatPoint from "../float-point";
import { ArrayPolygon } from "../interfaces";
import { exportPolygon, importPolygons } from "../util";
import { __AdaptedExports, instantiate } from "./glue-code";

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

export function getNfp(
  a: ArrayPolygon,
  b: ArrayPolygon,
  searchEdges: boolean
): ArrayPolygon[] {
  return importPolygons(
    exports.getNfp(exportPolygon(a), exportPolygon(b), searchEdges)
  );
}

export function noFitPolygon(
  a: ArrayPolygon,
  b: ArrayPolygon,
  inside: boolean,
  searchEdges: boolean
): ArrayPolygon[] {
  return importPolygons(
    exports.noFitPolygon(
      exportPolygon(a),
      exportPolygon(b),
      inside,
      searchEdges
    )
  );
}
