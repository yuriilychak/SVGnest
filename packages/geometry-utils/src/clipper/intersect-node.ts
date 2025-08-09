export default class IntersectNode {
    private items: number[][];

    constructor() {
        this.items = [];
    }

    public add(edg1Index: number, edge2Index: number, x: number, y: number): void {
        this.items.push([edg1Index, edge2Index, x, y]);
    }

    public swap(index1: number, index2: number): void {
        const temp = this.items[index1];
        this.items[index1] = this.items[index2];
        this.items[index2] = temp;
    }

    public sort(): void {
        this.items.sort(IntersectNode.sortMiddleware);
    }

    public clean(): void {
        this.items.length = 0;
    }

    public getEdge1Index(index: number): number {
        return this.items[index][0];
    }

    public getEdge2Index(index: number): number {
        return this.items[index][1];
    }

    public getX(index: number): number {
        return this.items[index][2];
    }

    public getY(index: number): number {
        return this.items[index][3];
    }

    public get length(): number {
        return this.items.length;
    }

    public get isEmpty(): boolean {
        return this.items.length === 0;
    }

    private static sortMiddleware(node1: number[], node2: number[]): number {
        //the following typecast is safe because the differences in Pt.Y will
        //be limited to the height of the scanbeam.
        return node2[3] - node1[3];
    }
}