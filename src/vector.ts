import { IPoint, IPolygon } from "./interfaces";
import Point from "./point";

export default class Vector extends Point {
  private _polygon: IPolygon;
  private _startIndex: number;
  private _endIndex: number;
  private _isMain: boolean;

  constructor(
    offset: IPoint,
    main: IPoint,
    polygon: IPolygon,
    startIndex: number,
    endIndex: number,
    isMain: boolean
  ) {
    super();

    this.set(main).sub(offset);

    this._startIndex = startIndex;
    this._endIndex = endIndex;
    this._polygon = polygon;
  }

  public get start(): IPoint {
    return this._polygon.at(this._startIndex);
  }

  public get end(): IPoint {
    return this._polygon.at(this._endIndex);
  }

  public get startIndex(): number {
    return this._startIndex;
  }

  public get endIndex(): number {
    return this._endIndex;
  }

  public get isMain(): boolean {
    return this._isMain;
  }
}
