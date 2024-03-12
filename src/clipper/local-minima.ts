import TEdge from "./t-edge";

export default class LocalMinima {
  public Y: number = 0;
  public LeftBound: TEdge = null;
  public RightBound: TEdge = null;
  public Next: LocalMinima = null;

  constructor() {}
}
