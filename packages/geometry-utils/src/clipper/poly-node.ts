import { IntPoint, EndType, JoinType } from './types';
import { getArea } from './helpers';

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

    public reverse(): void {
        this.m_polygon.reverse();
    }

    public at(index: number): IntPoint {
        return this.m_polygon[index];
    }

    public push(point: IntPoint): void {
        this.m_polygon.push(point);
    }

    public addChild(node: PolyNode): void {
        node.m_Index = this.m_Childs.length;
        node.m_Parent = this;
        this.m_Childs.push(node);
    }

    public childAt(index: number): PolyNode {
        return this.m_Childs[index];
    }

    public fixOrientations(lowestIndex: number): void {
        if (lowestIndex >= 0 && getArea(this.m_polygon) < 0) {
            this.reverse();
        }
    }

    public get childCount(): number {
        return this.m_Childs.length;
    }

    public get area(): number {
        const pointCount: number = this.m_polygon.length;

        if (pointCount < 3) {
            return 0;
        }

        let result: number = 0;
        let i: number = 0;
        let j: number = 0;

        for (i = 0, j = pointCount - 1; i < pointCount; ++i) {
            result += (this.m_polygon[j].X + this.m_polygon[i].X) * (this.m_polygon[j].Y - this.m_polygon[i].Y);
            j = i;
        }

        return -result * 0.5;
    }

    public get orientation(): boolean {
        return this.area >= 0;
    }
}
