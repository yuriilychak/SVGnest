declare namespace __AdaptedExports {
  /** Exported memory */
  export const memory: WebAssembly.Memory;
  /**
   * assembly/index/getNfp
   * @param dataA `~lib/typedarray/Float32Array`
   * @param dataB `~lib/typedarray/Float32Array`
   * @param searchEdges `bool`
   * @returns `~lib/typedarray/Float32Array`
   */
  export function getNfp(dataA: Float32Array, dataB: Float32Array, searchEdges: boolean): Float32Array;
  /**
   * assembly/index/noFitPolygon
   * @param a `~lib/typedarray/Float32Array`
   * @param b `~lib/typedarray/Float32Array`
   * @param inside `bool`
   * @param searchEdges `bool`
   * @returns `~lib/typedarray/Float32Array`
   */
  export function noFitPolygon(a: Float32Array, b: Float32Array, inside: boolean, searchEdges: boolean): Float32Array;
}
/** Instantiates the compiled WebAssembly module with the given imports. */
export declare function instantiate(module: WebAssembly.Module, imports?: {
  env: unknown,
}): Promise<typeof __AdaptedExports>;
