import { almostEqual } from "../../util";
import { IPolygon, SvgNestConfiguration } from "../../interfaces";
import { toNestCoordinates, toClipperCoordinates } from "../../geometry-util";
import { ClipperOffset, JoinType, EndType } from "../../clipper";
import { Point } from "../../geom";

export default class SharedPolygon {
  private _configuration: SvgNestConfiguration;

  constructor(configuration: SvgNestConfiguration) {
    this._configuration = configuration;
  }

  // use the clipper library to return an offset to the given polygon. Positive offset expands the polygon, negative contracts
  // note that this returns an array of polygons
  protected _polygonOffset(polygon: IPolygon, offset: number): IPolygon[] {
    if (almostEqual(offset)) {
      return [polygon];
    }

    const p: Point[] = this.svgToClipper(polygon);
    const miterLimit: number = 2;
    const co = new ClipperOffset(
      miterLimit,
      this._configuration.curveTolerance * this._configuration.clipperScale
    );
    co.addPath(p, JoinType.Round, EndType.ClosedPolygon);

    const newPaths: Point[][] = [];
    co.execute(newPaths, offset * this._configuration.clipperScale);

    const result: IPolygon[] = [];
    let i: number = 0;

    for (i = 0; i < newPaths.length; ++i) {
      result.push(this.clipperToSvg(newPaths[i]));
    }

    return result;
  }

  // converts a polygon from normal float coordinates to integer coordinates used by clipper, as well as x/y -> X/Y
  protected svgToClipper(polygon: IPolygon): Point[] {
    return toClipperCoordinates(polygon, this._configuration.clipperScale);
  }

  protected clipperToSvg(polygon: Point[]): IPolygon {
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
