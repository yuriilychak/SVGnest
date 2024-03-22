import Polygon from "./geom/polygon";
import {
  noFitPolygonRectangle,
  noFitPolygon,
  minkowskiDifference
} from "./pair-worker-flow";

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

export function tmpMinkowskiDifference(
  a: Float64Array,
  b: Float64Array
): Float64Array {
  return Polygon.exportPolygons(
    minkowskiDifference(new Polygon(a), new Polygon(b))
  );
}

export function tmpNoFitPolygon(
  a: Float64Array,
  b: Float64Array,
  inside: boolean,
  searchEdges: boolean
): Float64Array {
  return Polygon.exportPolygons(
    noFitPolygon(new Polygon(a), new Polygon(b), inside, searchEdges)
  );
}
