import { ArrayPolygon } from "./interfaces";

// floating point comparison tolerance
const TOLEARANCE: number = Math.pow(10, -9); // Floating point error is likely to be above 1 epsilon

export function almostEqual(
  a: number,
  b: number,
  tolerance: number = TOLEARANCE
): boolean {
  return Math.abs(a - b) < tolerance;
}

export function generateNFPCacheKey(
  rotationSplit: number,
  inside: boolean,
  polygon1: ArrayPolygon,
  polygon2: ArrayPolygon,
  rotation1: number = polygon1.rotation,
  rotation2: number = polygon2.rotation
) {
  const rotationOffset: number = Math.round(360 / rotationSplit);
  const rotationIndex1: number = Math.round(rotation1 / rotationOffset);
  const rotationIndex2: number = Math.round(rotation2 / rotationOffset);

  return (
    ((polygon1.id + 1) << 0) +
    ((polygon2.id + 1) << 10) +
    (rotationIndex1 << 19) +
    (rotationIndex2 << 23) +
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
