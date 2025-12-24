import { f32, u16, i32, usize } from "../types";

export default class Phenotype {
    #source: u16;

    #rotations: u16[];

    #placement: i32[];

    #fitness: f32;

    constructor(source: u16, placement: i32[], rotation: u16[]) {
        this.#source = source;
        this.#placement = placement;
        this.#rotations = rotation;
        this.#fitness = 0;
    }

    public cut(source: u16, cutPoint: usize): Phenotype {
        return new Phenotype(source, this.#placement.slice(0, cutPoint), this.#rotations.slice(0, cutPoint));
    }

    public clone(source: u16): Phenotype {
        return new Phenotype(source, this.#placement.slice(), this.#rotations.slice());
    }

    public contains(source: u16): boolean {
        const size: usize = this.size;

        for (let i = 0; i < size; ++i) {
            if (this.#placement[i] === source) {
                return true;
            }
        }

        return false;
    }

    public mate(phenotype: Phenotype): void {
        let placement = phenotype.placement[0];
        let rotation = phenotype.rotation[0];

        for (let i = 0; i < phenotype.size; ++i) {
            placement = phenotype.placement[i];
            rotation = phenotype.rotation[i];

            if (!this.contains(placement)) {
                this.#placement.push(placement);
                this.#rotations.push(rotation);
            }
        }
    }

    public swap(index: usize): boolean {
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

    public get placement(): i32[] {
        return this.#placement;
    }

    public get rotation(): u16[] {
        return this.#rotations;
    }

    public get cutPoint(): usize {
        return Math.round(Math.min(Math.max(Math.random(), 0.1), 0.9) * (this.#placement.length - 1));
    }

    public get size(): usize {
        return this.#placement.length;
    }

    public get fitness(): f32 {
        return this.#fitness;
    }

    public set fitness(value: f32) {
        this.#fitness = value;
    }

    public get source(): u16 {
        return this.#source;
    }
}
