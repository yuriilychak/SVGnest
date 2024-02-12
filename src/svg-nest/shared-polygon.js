import ClipperLib from "js-clipper";

import { almostEqual } from "../geometry-util";

export default class SharedPolygon {
  constructor(configuration, polygons = []) {
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

  // returns a less complex polygon that satisfies the curve tolerance
  _cleanPolygon(polygon) {
    const p = this.svgToClipper(polygon);
    // remove self-intersections and find the biggest polygon that's left
    const simple = ClipperLib.Clipper.SimplifyPolygon(
      p,
      ClipperLib.PolyFillType.pftNonZero
    );

    if (!simple || simple.length == 0) {
      return null;
    }

    let i = 0;
    let biggest = simple[0];
    let biggestArea = Math.abs(ClipperLib.Clipper.Area(biggest));
    let area;

    for (i = 1; i < simple.length; ++i) {
      area = Math.abs(ClipperLib.Clipper.Area(simple[i]));

      if (area > biggestArea) {
        biggest = simple[i];
        biggestArea = area;
      }
    }

    // clean up singularities, coincident points and edges
    const clean = ClipperLib.Clipper.CleanPolygon(
      biggest,
      this._curveTolerance * this._clipperScale
    );

    if (!clean || clean.length === 0) {
      return null;
    }

    return this.clipperToSvg(clean);
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
