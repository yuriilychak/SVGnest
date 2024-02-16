import FloatPoint from "../../float-point";
import { getPolygonBounds, polygonArea } from "../../geometry-util";
import {
  ArrayPolygon,
  BoundRect,
  Point,
  SvgNestConfiguration
} from "../../interfaces";
import SharedPolygon from "./shared-polygon";

export default class BinPolygon extends SharedPolygon {
  private _isValid: boolean = true;
  private _bounds: BoundRect | null = null;
  private _area: number = 0;

  constructor(polygon: ArrayPolygon, configuration: SvgNestConfiguration) {
    super(configuration, [polygon]);

    this._isValid = this.first && this.first.length >= 3;

    if (!this._isValid) {
      return;
    }

    this._bounds = getPolygonBounds(this.first);

    if (this.spacing > 0) {
      const offsetBin: Array<ArrayPolygon> = this._polygonOffset(
        this.first,
        -0.5 * this.spacing
      );

      if (offsetBin.length == 1) {
        // if the offset contains 0 or more than 1 path, something went wrong.
        this.first = offsetBin.pop();
      }
    }

    this.first.id = -1;

    let point: Point = this.first[0];
    // put bin on origin
    let max: FloatPoint = FloatPoint.from(this.first[0]);
    let min: FloatPoint = FloatPoint.from(this.first[0]);

    let i: number = 0;
    const binSize: number = this._polygons.length;

    for (i = 1; i < binSize; ++i) {
      min.min(this.first[i]);
      max.max(this.first[i]);
    }

    for (i = 0; i < binSize; ++i) {
      point = this.first[i];
      point.x -= min.x;
      point.y -= min.y;
    }

    this.first.width = max.x - min.x;
    this.first.height = max.y - min.y;

    this._area = polygonArea(this._polygons);

    // all paths need to have the same winding direction
    if (this._area > 0) {
      this.first.reverse();
      this._area = polygonArea(this.first);
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
