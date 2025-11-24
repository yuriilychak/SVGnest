import { i32 } from "./types";

export default class Scanbeam {
    private values: i32[];

    constructor() {
        this.values = [];
    }

    public insert(y: i32): void {
        for (let i = 0; i < this.values.length; ++i) {
            if (y === this.values[i]) {
                return;
            }
        
            if (y > this.values[i]) {
                this.values.splice(i, 0, y);
                return;
            } 
        }
        
        this.values.push(y);
    }

    public pop(): i32 {
        if (this.isEmpty) {
            throw new Error('ScanbeamManager is empty');
        }

        return this.values.shift();
    }

    public clean(): void {
        this.values.length = 0;
    }

    public get isEmpty(): boolean {
        return this.values.length === 0;
    }
}