import { IPolygon, IPoint } from "./interfaces";
import { Point } from "./geom";

// floating point comparison tolerance
const TOLEARANCE: number = Math.pow(10, -9); // Floating point error is likely to be above 1 epsilon

export function almostEqual(
  a: number,
  b: number = 0,
  tolerance: number = TOLEARANCE
): boolean {
  return Math.abs(a - b) < tolerance;
}

export function generateNFPCacheKey(
  rotationSplit: number,
  inside: boolean,
  polygon1: IPolygon,
  polygon2: IPolygon,
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

export function exportPolygon(polygon: IPolygon): Float64Array {
  const offset: number = 10;
  const pointCount: number = polygon.length;
  const size: number = offset + (pointCount << 1);
  const polygonData: Float64Array = new Float64Array(size);
  let i: number = 0;
  let result: Float64Array;

  polygonData[0] = size;
  polygonData[1] = polygon.id || -1;
  polygonData[2] = polygon.source || -1;
  polygonData[3] = polygon.hole ? 1 : 0;
  polygonData[4] = polygon.rotation || 0;
  polygonData[5] = polygon.offset ? polygon.offset.x : 0;
  polygonData[6] = polygon.offset ? polygon.offset.y : 0;
  polygonData[7] = pointCount;
  polygonData[8] = polygon.parent ? 1 : 0;
  polygonData[9] = polygon.children ? polygon.children.length : 0;

  for (i = 0; i < pointCount; ++i) {
    polygonData[offset + (i << 1)] = polygon.at(i).x;
    polygonData[offset + (i << 1) + 1] = polygon.at(i).y;
  }

  if (polygon.parent) {
    const parentData: Float64Array = exportPolygon(polygon.parent);

    result = new Float64Array(size + parentData.length);

    result.set(polygonData);
    result.set(parentData, size);

    return result;
  } else {
    return polygonData;
  }
}

export function importPolygon(
  polygonData: Float64Array,
  offset: number = 0
): IPolygon {
  const innerOffset: number = 10 + offset;
  const size: number = polygonData[offset];
  const pointCount: number = polygonData[7 + offset];
  const result: IPolygon = new Array<IPoint>(pointCount) as IPolygon;
  const hasParent: boolean = polygonData[offset + 8] === 1;
  let i: number = 0;

  result.id = polygonData[offset + 1];
  result.source = polygonData[offset + 2];
  result.hole = polygonData[offset + 3] === 1;
  result.rotation = polygonData[offset + 4];
  result.offset = Point.fromCords(
    polygonData[offset + 5],
    polygonData[offset + 6]
  );

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

export function importPolygons(data: Float64Array): IPolygon[] {
  if (data.length === 0) {
    return [];
  }

  const polygonCount: number = data[0];
  const result: IPolygon[] = [];
  let offset = polygonCount + 1;
  let i: number = 0;

  for (i = 0; i < polygonCount; ++i) {
    result.push(importPolygon(data, offset));
    offset += data[i + 1];
  }

  return result;
}

export function clipperRound(a: number): number {
  return a < 0 ? -Math.round(Math.abs(a)) : Math.round(a);
}
