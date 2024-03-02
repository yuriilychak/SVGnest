declare namespace __AdaptedExports {
  /** Exported memory */
  export const memory: WebAssembly.Memory;
  /**
   * assembly/index/isRectangle
   * @param polygon `~lib/typedarray/Float64Array`
   * @returns `bool`
   */
  export function isRectangle(polygon: Float64Array): boolean;
  /**
   * assembly/index/tmpNoFitPolygonRectangle
   * @param a `~lib/typedarray/Float64Array`
   * @param b `~lib/typedarray/Float64Array`
   * @returns `~lib/typedarray/Float64Array`
   */
  export function tmpNoFitPolygonRectangle(a: Float64Array, b: Float64Array): Float64Array;
}
/** Instantiates the compiled WebAssembly module with the given imports. */
export declare function instantiate(module: WebAssembly.Module, imports?: {
  env: unknown,
}): Promise<typeof __AdaptedExports>;
