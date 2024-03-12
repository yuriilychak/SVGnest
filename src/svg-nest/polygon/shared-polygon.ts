import { almostEqual } from "../../util";
import { IPolygon, SvgNestConfiguration } from "../../interfaces";
import { toNestCoordinates, toClipperCoordinates } from "../../geometry-util";
import { ClipperOffset, IntPoint, JoinType, EndType } from "../../clipper";

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

    const p: IntPoint[] = this.svgToClipper(polygon);
    const miterLimit: number = 2;
    const co = new ClipperOffset(
      miterLimit,
      this._configuration.curveTolerance * this._configuration.clipperScale
    );
    co.AddPath(p, JoinType.Round, EndType.ClosedPolygon);

    const newPaths: IntPoint[][] = [];
    co.Execute(newPaths, offset * this._configuration.clipperScale);

    const result: IPolygon[] = [];
    let i: number = 0;

    for (i = 0; i < newPaths.length; ++i) {
      result.push(this.clipperToSvg(newPaths[i]));
    }

    return result;
  }

  // converts a polygon from normal float coordinates to integer coordinates used by clipper, as well as x/y -> X/Y
  protected svgToClipper(polygon: IPolygon): IntPoint[] {
    return toClipperCoordinates(polygon, this._configuration.clipperScale);
  }

  protected clipperToSvg(polygon: IntPoint[]): IPolygon {
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
