import { i32, isize } from "./types";

export default class IntersectNode {
    // Should be tuple Vector (edg1Index: isize, edge2Index: isize, x: i32, y: i32)
    private items: number[][];

    constructor() {
        this.items = [];
    }

    public add(edg1Index: isize, edge2Index: isize, x: i32, y: i32): void {
        this.items.push([edg1Index, edge2Index, x, y]);
    }

    public swap(index1: isize, index2: isize): void {
        const temp = this.items[index1];
        this.items[index1] = this.items[index2];
        this.items[index2] = temp;
    }

    public sort(): void {
        this.items.sort((node1: number[], node2: number[]) => {
            //the following typecast is safe because the differences in Pt.Y will
            //be limited to the height of the scanbeam.
            return node2[3] - node1[3];
        });
    }

    public clean(): void {
        this.items.length = 0;
    }

    public getEdge1Index(index: isize): isize {
        return this.items[index][0];
    }

    public getEdge2Index(index: isize): isize {
        return this.items[index][1];
    }

    public getX(index: isize): i32 {
        return this.items[index][2];
    }

    public getY(index: isize): i32 {
        return this.items[index][3];
    }

    public get length(): isize {
        return this.items.length;
    }

    public get isEmpty(): boolean {
        return this.items.length === 0;
    }
}