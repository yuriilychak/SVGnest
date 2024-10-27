import { IntPoint, EndType, JoinType } from './types';

export default class PolyNode {
    public m_Parent: PolyNode | null;
    public m_polygon: IntPoint[];
    public m_Index: number;
    public m_jointype: JoinType;
    public m_endtype: EndType;
    public m_Childs: PolyNode[];
    public IsOpen: boolean;

    constructor(joinType: JoinType = JoinType.jtSquare, endType: EndType = EndType.etOpenSquare) {
        this.m_Parent = null;
        this.m_polygon = [];
        this.m_Index = 0;
        this.m_jointype = joinType;
        this.m_endtype = endType;
        this.m_Childs = [];
        this.IsOpen = false;
    }
}
