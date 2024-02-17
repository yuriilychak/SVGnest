export function generateNFPCacheKey(
  idA: number,
  idB: number,
  roationA: number,
  rotationB: number,
  inside: boolean,
  rotationSplit: number
) {
  const rotationOffset: number = Math.round(360 / rotationSplit);
  const rotationIndexA: number = Math.round(roationA / rotationOffset);
  const rotationIndexB: number = Math.round(rotationB / rotationOffset);

  return (
    ((idA + 1) << 0) +
    ((idB + 1) << 10) +
    (rotationIndexA << 19) +
    (rotationIndexB << 23) +
    ((inside ? 1 : 0) << 27)
  );
}

export function keyToNFPData(
  numKey: number,
  rotationSplit: number
): Float32Array {
  const rotationOffset: number = Math.round(360 / rotationSplit);
  const result = new Float32Array(5);
  let accumulator: number = 0;
  const inside = numKey >> 27;

  accumulator += inside << 27;

  const rotationIndexB = (numKey - accumulator) >> 23;

  accumulator += rotationIndexB << 23;

  const rotationIndexA = (numKey - accumulator) >> 19;

  accumulator += rotationIndexA << 19;

  const idB = (numKey - accumulator) >> 10;

  accumulator += idB << 10;

  const idA = numKey - accumulator;

  result[4] = inside;
  result[3] = rotationIndexB * rotationOffset;
  result[2] = rotationIndexA * rotationOffset;
  result[1] = idB - 1;
  result[0] = idA - 1;

  return result;
}
