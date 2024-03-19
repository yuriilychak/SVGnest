import { TEdge } from "./edge";
import { Direction } from "./enums";
import IntPoint from "./int-point";

export default class HorizontalDirection {
  private _left: number;
  private _right: number;
  private _direction: Direction;

  constructor(edge: TEdge) {
    if (edge.bottom.x < edge.top.x) {
      this._left = edge.bottom.x;
      this._right = edge.top.x;
      this._direction = Direction.LeftToRight;
    } else {
      this._left = edge.top.x;
      this._right = edge.bottom.x;
      this._direction = Direction.RightToLeft;
    }
  }

  getIncluded(point: IntPoint): boolean {
    return (
      (this._direction === Direction.LeftToRight && point.x <= this._right) ||
      (this._direction === Direction.RightToLeft && point.x >= this._left)
    );
  }

  getExcluded(point: IntPoint): boolean {
    return (
      (this._direction == Direction.LeftToRight && point.x >= this._right) ||
      (this._direction == Direction.RightToLeft && point.x <= this._left)
    );
  }

  update(edge: TEdge): void {
    if (edge.bottom.x < edge.top.x) {
      this._left = edge.bottom.x;
      this._right = edge.top.x;
      this._direction = Direction.LeftToRight;
    } else {
      this._left = edge.top.x;
      this._right = edge.bottom.x;
      this._direction = Direction.RightToLeft;
    }
  }

  public get direction(): Direction {
    return this._direction;
  }
}
