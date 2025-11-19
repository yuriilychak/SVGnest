import { Point } from "../types";
import { i32, isize } from "./types";

export default class Join {
    // Convert to tuple Vector (i32, i32, isize, isize) for easier access in Rust
    private joins: number[][] = [];
    // Convert to tuple Vector (i32, i32, usize) for easier access in Rust
    private ghostJoins: number[][] = [];

    public getLength(isGhost: boolean): number {
        return isGhost ? this.ghostJoins.length : this.joins.length;
    }   

    public getX(index: isize, isGhost: boolean): i32 {
        return isGhost ? this.ghostJoins[index][0] : this.joins[index][0];
    }

    public getY(index: isize, isGhost: boolean): i32 {
        return isGhost ? this.ghostJoins[index][1] : this.joins[index][1];
    } 
    
    public getHash1(index: isize, isGhost: boolean): isize {
        return isGhost ? this.ghostJoins[index][2] : this.joins[index][2];
    }

    public getHash2(index: isize): isize {
        return this.joins[index][3];
    }

    public fromGhost(index: isize, hash: isize): void {
        this.joins.push([
            this.getX(index, true), 
            this.getY(index, true),
            this.getHash1(index, true), 
            hash
        ]);
    }

    public add(outHash1: isize, outHash2: isize, point: Point<Int32Array>): void {
        this.joins.push([point.x, point.y, outHash1, outHash2]);
    }

    public addGhost(hash: isize, x: i32, y: i32): void {
         this.ghostJoins.push([x, y, hash]);
    }

    public updateHash(index: isize, hash1: isize, hash2: isize): void {
        this.joins[index][2] = hash1;
        this.joins[index][3] = hash2;
    }

    public reset(): void {
        this.joins.length = 0;
        this.ghostJoins.length = 0;
    }

    public clearGhosts(): void {
        this.ghostJoins.length = 0;
    }
} 