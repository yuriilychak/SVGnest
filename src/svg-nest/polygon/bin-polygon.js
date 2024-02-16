import FloatPoint from "../../float-point";
import { getPolygonBounds, polygonArea } from "../../geometry-util";
import SharedPolygon from "./shared-polygon";

export default class BinPolygon extends SharedPolygon {
  constructor(polygons, configuration) {
    super(configuration, polygons);

    this._isValid = this._polygons && this._polygons.length >= 3;
    this._bounds = null;

    if (!this._isValid) {
      return;
    }

    this._bounds = getPolygonBounds(this._polygons);

    if (this.spacing > 0) {
      const offsetBin = this._polygonOffset(
        this._polygons,
        -0.5 * this.spacing
      );

      if (offsetBin.length == 1) {
        // if the offset contains 0 or more than 1 path, something went wrong.
        this._polygons = offsetBin.pop();
      }
    }

    this._polygons.id = -1;

    let point = this._polygons[0];
    // put bin on origin
    let max = FloatPoint.from(point);
    let min = FloatPoint.from(point);

    let i = 0;
    const binSize = this._polygons.length;

    for (i = 1; i < binSize; ++i) {
      point = this._polygons[i];
      min.min(point);
      max.max(point);
    }

    for (i = 0; i < binSize; ++i) {
      point = this._polygons[i];
      point.x -= min.x;
      point.y -= min.y;
    }

    this._polygons.width = max.x - min.x;
    this._polygons.height = max.y - min.y;

    this._area = polygonArea(this._polygons);

    // all paths need to have the same winding direction
    if (this._area > 0) {
      this._polygons.reverse();
      this._area = polygonArea(this._polygons);
    }
  }

  get isValid() {
    return this._isValid;
  }

  get bounds() {
    return this._bounds;
  }

  get polygons() {
    return this._polygons;
  }

  get area() {
    return this._area;
  }
}
