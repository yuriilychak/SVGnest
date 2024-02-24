//@ts-ignore
import ClipperLib from "js-clipper";

import { almostEqual } from "../../util";
import {
  ArrayPolygon,
  ClipperPoint,
  SvgNestConfiguration
} from "../../interfaces";
import { toNestCoordinates, toClipperCoordinates } from "../../geometry-util";

export default class SharedPolygon {
  private _configuration: SvgNestConfiguration;

  constructor(configuration: SvgNestConfiguration) {
    this._configuration = configuration;
  }

  // use the clipper library to return an offset to the given polygon. Positive offset expands the polygon, negative contracts
  // note that this returns an array of polygons
  protected _polygonOffset(
    polygon: ArrayPolygon,
    offset: number
  ): ArrayPolygon[] {
    if (almostEqual(offset, 0)) {
      return [polygon];
    }

    const p: ClipperPoint[] = this.svgToClipper(polygon);
    const miterLimit: number = 2;
    const co = new ClipperLib.ClipperOffset(
      miterLimit,
      this._configuration.curveTolerance * this._configuration.clipperScale
    );
    co.AddPath(
      p,
      ClipperLib.JoinType.jtRound,
      ClipperLib.EndType.etClosedPolygon
    );

    const newPaths = new ClipperLib.Paths();
    co.Execute(newPaths, offset * this._configuration.clipperScale);

    const result: ArrayPolygon[] = [];
    let i: number = 0;

    for (i = 0; i < newPaths.length; ++i) {
      result.push(this.clipperToSvg(newPaths[i]));
    }

    return result;
  }

  // converts a polygon from normal float coordinates to integer coordinates used by clipper, as well as x/y -> X/Y
  protected svgToClipper(polygon: ArrayPolygon): ClipperPoint[] {
    return toClipperCoordinates(polygon, this._configuration.clipperScale);
  }

  protected clipperToSvg(polygon: ClipperPoint[]): ArrayPolygon {
    return toNestCoordinates(polygon, this._configuration.clipperScale);
  }

  protected get curveTolerance(): number {
    return this._configuration.curveTolerance;
  }

  protected get clipperScale(): number {
    return this._configuration.clipperScale;
  }

  protected get spacing(): number {
    return this._configuration.spacing;
  }
}
