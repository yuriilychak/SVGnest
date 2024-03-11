import { EdgeSide, PolyType } from "../enums";
import IntPoint from "./int-point";

export default class TEdge {
  public Bot: IntPoint = new IntPoint();
  public Curr: IntPoint = new IntPoint();
  public Top: IntPoint = new IntPoint();
  public Delta: IntPoint = new IntPoint();
  public Dx: number = 0;
  public PolyTyp: PolyType = PolyType.ptSubject;
  public Side: EdgeSide = EdgeSide.esLeft;
  public WindDelta: number = 0;
  public WindCnt: number = 0;
  public WindCnt2: number = 0;
  public OutIdx: number = 0;
  public Next: TEdge = null;
  public Prev: TEdge = null;
  public NextInLML: TEdge = null;
  public NextInAEL: TEdge = null;
  public PrevInAEL: TEdge = null;
  public NextInSEL: TEdge = null;
  public PrevInSEL: TEdge = null;

  constructor() {}
}
