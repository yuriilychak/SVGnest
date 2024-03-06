import Polygon from "./polygon";
import Point from "./point";

export default class Vector extends Point {
  private _polygon: Polygon;
  private _startIndex: u16;
  private _endIndex: u16;
  private _isMain: boolean;

  constructor(
    offset: Point,
    main: Point,
    polygon: Polygon,
    startIndex: u16,
    endIndex: u16,
    isMain: boolean
  ) {
    super();

    this._startIndex = startIndex;
    this._endIndex = endIndex;
    this._polygon = polygon;
    this._isMain = isMain;

    this.set(main).sub(offset);
  }

  public get start(): Point {
    return this._polygon.at(this._startIndex);
  }

  public get end(): Point {
    return this._polygon.at(this._endIndex);
  }

  public get startIndex(): u16 {
    return this._startIndex;
  }

  public get endIndex(): u16 {
    return this._endIndex;
  }

  public get isMain(): boolean {
    return this._isMain;
  }
}
