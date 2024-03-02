import Polygon from "./polygon";
import { noFitPolygonRectangle } from "./pair-worker-flow";

export function isRectangle(polygon: Float64Array): boolean {
  return new Polygon(polygon).isRectangle;
}

export function tmpNoFitPolygonRectangle(
  a: Float64Array,
  b: Float64Array
): Float64Array {
  return Polygon.exportPolygons(
    noFitPolygonRectangle(new Polygon(a), new Polygon(b))
  );
}
