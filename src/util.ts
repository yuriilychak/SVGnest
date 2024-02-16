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
