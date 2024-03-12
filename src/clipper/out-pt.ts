import IntPoint from "./int-point";

export default class OutPt {
  public Idx: number = 0;
  public Pt: IntPoint = new IntPoint();
  public Next: OutPt = null;
  public Prev: OutPt = null;
}
