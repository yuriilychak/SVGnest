//@ts-ignore
import ClipperLib from "js-clipper";

import { almostEqual } from "../../geometry-util";
import {
  ArrayPolygon,
  ClipperPoint,
  SvgNestConfiguration
} from "../../interfaces";

export default class SharedPolygon {
  private _curveTolerance: number;
  private _clipperScale: number;
  private _spacing: number;

  protected _polygons: Array<ArrayPolygon>;

  constructor(
    configuration: SvgNestConfiguration,
    polygons: Array<ArrayPolygon>
  ) {
    this._curveTolerance = configuration.curveTolerance;
    this._clipperScale = configuration.clipperScale;
    this._spacing = configuration.spacing;
    this._polygons = polygons;
  }

  // use the clipper library to return an offset to the given polygon. Positive offset expands the polygon, negative contracts
  // note that this returns an array of polygons
  protected _polygonOffset(
    polygon: ArrayPolygon,
    offset: number
  ): Array<ArrayPolygon> {
    if (almostEqual(offset, 0)) {
      return [polygon];
    }

    const p = this._svgToClipper(polygon);
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

    const result: Array<ArrayPolygon> = [];
    let i: number = 0;

    for (i = 0; i < newPaths.length; ++i) {
      result.push(this._clipperToSvg(newPaths[i]));
    }

    return result;
  }

  // converts a polygon from normal float coordinates to integer coordinates used by clipper, as well as x/y -> X/Y
  private _svgToClipper(polygon: ArrayPolygon): Array<ClipperPoint> {
    const result: Array<ClipperPoint> = [];
    let i: number = 0;

    for (i = 0; i < polygon.length; ++i) {
      result.push({
        X: polygon[i].x,
        Y: polygon[i].y
      });
    }

    ClipperLib.JS.ScaleUpPath(result, this._clipperScale);

    return result;
  }

  private _clipperToSvg(polygon: Array<ClipperPoint>): ArrayPolygon {
    const count: number = polygon.length;
    const result: ArrayPolygon = [] as ArrayPolygon;
    let i: number = 0;

    for (i = 0; i < count; ++i) {
      result.push({
        x: polygon[i].X / this._clipperScale,
        y: polygon[i].Y / this._clipperScale
      });
    }

    return result;
  }

  protected get curveTolerance(): number {
    return this._curveTolerance;
  }

  protected get clipperScale(): number {
    return this._clipperScale;
  }

  protected get spacing(): number {
    return this._spacing;
  }

  public get polygons(): Array<ArrayPolygon> {
    return this._polygons.slice();
  }

  public get first(): ArrayPolygon {
    return this._polygons[0];
  }

  public set first(value: ArrayPolygon) {
    this._polygons[0] = value;
  }
}
