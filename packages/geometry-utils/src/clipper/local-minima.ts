import { i32, isize } from "./types";

export default class LocalMinima {
    // Convert to tuple Vector (i32, isize, isize) for easier access in Rust
    private items: number[][];

    constructor() {
        this.items = [];
    }

    public getLeftBound(index: isize): isize {
        return this.items[index][1];
    }

    public getRightBound(index: isize): isize {
        return this.items[index][2];
    }

    public getY(index: isize): i32 {
        return this.items[index][0];
    }

    public insert(y: i32, left: isize, right: isize): isize {
        const localMinima = [y, left, right];

        for (let i = 0; i < this.items.length; ++i) {
            if (y >= this.getY(i)) {
                this.items.splice(i, 0, localMinima);
                return i;
            }
        }
            
        this.items.push(localMinima);

        return this.items.length - 1;
    }

    // Should return tuple (isize, isize)
    public pop(): isize[] {
        if (this.isEmpty) {
            throw new Error("No minima to pop");
        }

        const result = [this.getLeftBound(0), this.getRightBound(0)];
        
        this.items.shift();

        return result;
    }

    public get minY(): i32 {
        return this.items.length === 0 ? NaN : this.getY(0);
    }

    public get isEmpty(): boolean {
        return this.items.length === 0;
    }

    public get length(): isize {
        return this.items.length;
    }
}