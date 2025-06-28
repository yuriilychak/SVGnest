export default class Scanbeam {
    private scanbeams: number[];

    constructor() {
        this.scanbeams = [];
    }

    public insert(y: number): void {
        if (this.isEmpty) {
            this.scanbeams.push(y);
            return;
        }

        let index = 0;
        
        while (index < this.scanbeams.length && y <= this.scanbeams[index]) {
            if (y === this.scanbeams[index]) {
                return; // Ігноруємо дублікати
            }
            index++;
        }

        this.scanbeams.splice(index, 0, y);
    }

    public pop(): number {
        if (this.isEmpty) {
            throw new Error('ScanbeamManager is empty');
        }
        return this.scanbeams.shift();
    }

    public clean(): void {
        this.scanbeams.length = 0;
    }

    public get isEmpty(): boolean {
        return this.scanbeams.length === 0;
    }
}