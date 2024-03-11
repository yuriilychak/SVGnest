import IntPoint from "./int-point";

export default class PolyNode {
  public m_Parent: PolyNode = null;
  public m_polygon: IntPoint[] = [];
  public m_Index: number = 0;
  public m_jointype: number = 0;
  public m_endtype: number = 0;
  public m_Childs: PolyNode[] = [];
  public IsOpen: boolean = false;

  public AddChild(Child: PolyNode): void {
    var cnt = this.m_Childs.length;
    this.m_Childs.push(Child);
    Child.m_Parent = this;
    Child.m_Index = cnt;
  }

  public Childs(): PolyNode[] {
    return this.m_Childs;
  }

  public ChildCount(): number {
    return this.m_Childs.length;
  }
}
