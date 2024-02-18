import ClipperLib from "js-clipper";

import { almostEqual } from "../../util";

export default class SharedPolygon {
  constructor(configuration, polygons) {
    this._curveTolerance = configuration.curveTolerance;
    this._clipperScale = configuration.clipperScale;
    this._spacing = configuration.spacing;
    this._polygons = polygons;
  }

  // use the clipper library to return an offset to the given polygon. Positive offset expands the polygon, negative contracts
  // note that this returns an array of polygons
  _polygonOffset(polygon, offset) {
    if (almostEqual(offset, 0)) {
      return polygon;
    }

    const p = this.svgToClipper(polygon);
    const miterLimit = 2;
    const co = new ClipperLib.ClipperOffset(
      miterLimit,
      this._curveTolerance * this._clipperScale
    );
    co.AddPath(
      p,
      ClipperLib.JoinType.jtRound,
      ClipperLib.EndType.etClosedPolygon
    );

    const newPaths = new ClipperLib.Paths();
    co.Execute(newPaths, offset * this._clipperScale);

    const result = [];
    let i = 0;

    for (i = 0; i < newPaths.length; ++i) {
      result.push(this.clipperToSvg(newPaths[i]));
    }

    return result;
  }

  // converts a polygon from normal float coordinates to integer coordinates used by clipper, as well as x/y -> X/Y
  svgToClipper(polygon) {
    const result = [];
    let i = 0;

    for (i = 0; i < polygon.length; ++i) {
      result.push({
        X: polygon[i].x,
        Y: polygon[i].y
      });
    }

    ClipperLib.JS.ScaleUpPath(result, this._clipperScale);

    return result;
  }

  clipperToSvg(polygon) {
    const count = polygon.length;
    const result = [];
    let i = 0;

    for (i = 0; i < count; ++i) {
      result.push({
        x: polygon[i].X / this._clipperScale,
        y: polygon[i].Y / this._clipperScale
      });
    }

    return result;
  }

  get curveTolerance() {
    return this._curveTolerance;
  }

  get clipperScale() {
    return this._clipperScale;
  }

  get spacing() {
    return this._spacing;
  }
}
