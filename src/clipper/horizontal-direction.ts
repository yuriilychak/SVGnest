import { TEdge } from "./edge";
import { Direction } from "./enums";

export default class HorizontalDirection {
  Left: number;
  Right: number;
  Dir: Direction;

  constructor(edge: TEdge) {
    if (edge.Bot.X < edge.Top.X) {
      this.Left = edge.Bot.X;
      this.Right = edge.Top.X;
      this.Dir = Direction.LeftToRight;
    } else {
      this.Left = edge.Top.X;
      this.Right = edge.Bot.X;
      this.Dir = Direction.RightToLeft;
    }
  }
}
