declare namespace __AdaptedExports {
  /** Exported memory */
  export const memory: WebAssembly.Memory;
  /**
   * assembly/index/lineIntersect
   * @param importA `~lib/typedarray/Float32Array`
   * @param importB `~lib/typedarray/Float32Array`
   * @param importE `~lib/typedarray/Float32Array`
   * @param importF `~lib/typedarray/Float32Array`
   * @param infinite `bool`
   * @returns `bool`
   */
  export function lineIntersect(
    importA: Float32Array,
    importB: Float32Array,
    importE: Float32Array,
    importF: Float32Array,
    infinite?: boolean
  ): boolean;
  /**
   * assembly/index/segmentDistance
   * @param inputA `~lib/typedarray/Float32Array`
   * @param inputB `~lib/typedarray/Float32Array`
   * @param inputE `~lib/typedarray/Float32Array`
   * @param inputF `~lib/typedarray/Float32Array`
   * @param inputDirection `~lib/typedarray/Float32Array`
   * @returns `f64`
   */
  export function segmentDistance(
    inputA: Float32Array,
    inputB: Float32Array,
    inputE: Float32Array,
    inputF: Float32Array,
    inputDirection: Float32Array
  ): number;
}
/** Instantiates the compiled WebAssembly module with the given imports. */
export declare function instantiate(
  module: WebAssembly.Module,
  imports?: {
    env: unknown;
  }
): Promise<typeof __AdaptedExports>;
