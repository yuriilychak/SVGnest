export default class LocalMinima {
    private items: number[][];

    constructor() {
        this.items = [];
    }

    public getLeftBound(index: number): number {
        return this.items[index][1];
    }

    public getRightBound(index: number): number {
        return this.items[index][2];
    }

    public getY(index: number): number {
        return this.items[index][0];
    }

    public insert(y: number, left: number, right: number): number {
        const localMinima = [y, left, right];

        for (let i = 0; i < this.items.length; ++i) {
            if (y >= this.getY(i)) {
                this.items.splice(i, 0, localMinima);
                return i;
            }
        }
            
        this.items.push(localMinima);

        return this.items.length -1;
    }

    public pop(): number[] {
        if (this.isEmpty) {
            throw new Error("No minima to pop");
        }

        const result = [this.getLeftBound(0), this.getRightBound(0)];
        
        this.items.shift();

        return result;
    }

    public get minY(): number {
        return this.items.length === 0 ? NaN : this.getY(0);
    }

    public get isEmpty(): boolean {
        return this.items.length === 0;
    }

    public get length(): number {
        return this.items.length;
    }
}