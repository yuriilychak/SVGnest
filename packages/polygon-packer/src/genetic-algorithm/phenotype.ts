export default class Phenotype {
    #source: number;

    #rotations: number[];

    #placement: number[];

    #fitness: number;

    constructor(source: number, placement: number[], rotation: number[]) {
        this.#source = source;
        this.#placement = placement;
        this.#rotations = rotation;
        this.#fitness = 0;
    }

    public cut(source: number, cutPoint: number): Phenotype {
        return new Phenotype(source, this.#placement.slice(0, cutPoint), this.#rotations.slice(0, cutPoint));
    }

    public clone(source: number): Phenotype {
        return new Phenotype(source, this.#placement.slice(), this.#rotations.slice());
    }

    public contains(source: number): boolean {
        const size: number = this.size;

        for (let i = 0; i < size; ++i) {
            if (this.#placement[i] === source) {
                return true;
            }
        }

        return false;
    }

    public mate(phenotype: Phenotype): void {
        let i: number = 0;
        let placement = phenotype.placement[0];
        let rotation = phenotype.rotation[0];

        for (i = 0; i < phenotype.size; ++i) {
            placement = phenotype.placement[i];
            rotation = phenotype.rotation[i];

            if (!this.contains(placement)) {
                this.#placement.push(placement);
                this.#rotations.push(rotation);
            }
        }
    }
    public swap(index: number): boolean {
        const nextIndex = index + 1;

        if (nextIndex === this.size) {
            return false;
        }
        // swap current part with next part

        const placement: number = this.#placement[index];

        this.#placement[index] = this.#placement[nextIndex];
        this.#placement[nextIndex] = placement;

        return true;
    }

    public get placement(): number[] {
        return this.#placement;
    }

    public get rotation(): number[] {
        return this.#rotations;
    }

    public get cutPoint(): number {
        return Math.round(Math.min(Math.max(Math.random(), 0.1), 0.9) * (this.#placement.length - 1));
    }

    public get size(): number {
        return this.#placement.length;
    }

    public get fitness(): number {
        return this.#fitness;
    }

    public set fitness(value: number) {
        this.#fitness = value;
    }

    public get source(): number {
        return this.#source;
    }
}
