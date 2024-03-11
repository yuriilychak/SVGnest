import OutPt from "./out-pt";

export default class OutRec {
  public Idx: number = 0;
  public IsHole: boolean = false;
  public IsOpen: boolean = false;
  public FirstLeft: OutRec = null;
  public Pts: OutPt = null;
  public BottomPt: OutPt = null;
  public PolyNode: any = null;
}
