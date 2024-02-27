import { ArrayPolygon, Point } from "./interfaces";

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

export function importPolygon(
  polygonData: Float32Array,
  offset: number = 0
): ArrayPolygon {
  const innerOffset: number = 14 + offset;
  const size: number = polygonData[0];
  const pointCount: number = polygonData[11];
  const result: ArrayPolygon = new Array<Point>(pointCount) as ArrayPolygon;
  const hasParent: boolean = polygonData[offset + 12] === 1;
  let i: number = 0;

  result.id = polygonData[offset + 1];
  result.source = polygonData[offset + 2];
  result.hole = polygonData[offset + 3] === 1;
  result.rotation = polygonData[offset + 4];
  result.x = polygonData[offset + 5];
  result.y = polygonData[offset + 6];
  result.width = polygonData[offset + 7];
  result.height = polygonData[offset + 8];
  result.offsetx = polygonData[offset + 9];
  result.offsety = polygonData[offset + 10];

  for (i = 0; i < pointCount; ++i) {
    result[i] = {
      x: polygonData[innerOffset + (i << 1)],
      y: polygonData[innerOffset + (i << 1) + 1]
    };
  }

  if (hasParent) {
    result.parent = importPolygon(polygonData, size);
  }

  return result;
}

export function exportPolygon(polygon: ArrayPolygon): Float32Array {
  const offset: number = 14;
  const pointCount: number = polygon.length;
  const size: number = offset + (pointCount << 1);
  const polygonData: Float32Array = new Float32Array(size);
  let i: number = 0;
  let result: Float32Array;

  polygonData[0] = size;
  polygonData[1] = polygon.id || -1;
  polygonData[2] = polygon.source || -1;
  polygonData[3] = polygon.hole ? 1 : 0;
  polygonData[4] = polygon.rotation || 0;
  polygonData[5] = polygon.x || 0;
  polygonData[6] = polygon.y || 0;
  polygonData[7] = polygon.width || 0;
  polygonData[8] = polygon.height || 0;
  polygonData[9] = polygon.offsetx || 0;
  polygonData[10] = polygon.offsety || 0;
  polygonData[11] = pointCount;
  polygonData[12] = polygon.parent ? 1 : 0;
  polygonData[13] = polygon.children ? polygon.children.length : 0;

  for (i = 0; i < pointCount; ++i) {
    polygonData[offset + (i << 1)] = polygon.at(i).x;
    polygonData[offset + (i << 1) + 1] = polygon.at(i).y;
  }

  if (polygon.parent) {
    const parentData: Float32Array = exportPolygon(polygon.parent);

    result = new Float32Array(size + parentData.length);

    result.set(polygonData);
    result.set(parentData, size);

    return result;
  } else {
    return polygonData;
  }
}
