import { Point } from "../types";

export default class Join {
    private joins: number[][] = [];
    private ghostJoins: number[][] = [];

    public getLength(isGhost: boolean): number {
        return isGhost ? this.ghostJoins.length : this.joins.length;
    }   

    public getX(index: number, isGhost: boolean): number {
        return isGhost ? this.ghostJoins[index][0] : this.joins[index][0];
    }

    public getY(index: number, isGhost: boolean): number {
        return isGhost ? this.ghostJoins[index][1] : this.joins[index][1];
    } 
    
    public getHash1(index: number, isGhost: boolean): number {
        return isGhost ? this.ghostJoins[index][2] : this.joins[index][2];
    }

    public getHash2(index: number): number {
        return this.joins[index][3];
    }

    public fromGhost(index: number, hash: number): void {
        this.joins.push([
            this.getX(index, true), 
            this.getY(index, true),
            this.getHash1(index, true), 
            hash
        ]);
    }

    public add(outHash1: number, outHash2: number, point: Point<Int32Array>): void {
        this.joins.push([point.x, point.y, outHash1, outHash2]);
    }

    public addGhost(hash: number, x: number, y: number): void {
         this.ghostJoins.push([x, y, hash]);
    }

    public updateHash(index: number, hash1: number, hash2: number): void {
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