import { abs_polygon_area, rotate_polygon_wasm, calculate_bounds_wasm } from 'wasm-nesting';
import { BoundRectF32 } from '../geometry';
import { f32, isize, NestConfig, PolygonNode, u16, usize, u8 } from '../types';
import Phenotype from './phenotype';
export default class GeneticAlgorithm {
    #binWidth: f32 = 0;

    #binHeight: f32 = 0;

    #population: Phenotype[] = [];

    #rotations: u8 = 0;

    #trashold: f32 = 0;

    #currentSource: u16 = 0;

    public init(nodes: PolygonNode[], bounds: BoundRectF32, config: NestConfig): void {
        this.#rotations = config.rotations;
        this.#trashold = 0.01 * config.mutationRate;
        this.#binWidth = bounds.width
        this.#binHeight = bounds.height;

        // initiate new GA
        const adam: PolygonNode[] = nodes.slice();

        adam.sort((a, b) => abs_polygon_area(b.memSeg) - abs_polygon_area(a.memSeg));
        // population is an array of individuals. Each individual is a object representing the
        // order of insertion and the angle each part is rotated
        const angles: u16[] = [];
        let mutant: Phenotype;

        for (let i = 0; i < adam.length; ++i) {
            angles.push(this.randomAngle(adam[i]));
        }

        this.#population.push(new Phenotype(this.#currentSource, adam.map(node => node.source), angles));

        this.#currentSource += 1;

        while (this.#population.length < config.populationSize) {
            mutant = this.mutate(nodes, this.#population[0]);
            this.#population.push(mutant);
        }
    }

    public clean(): void {
        this.#rotations = 0;
        this.#trashold = 0;
        this.#binWidth = 0;
        this.#binHeight = 0;
        this.#population.length = 0;
        this.#currentSource = 0;
    }

    // returns a mutated individual with the given mutation rate
    private mutate(nodes: PolygonNode[], individual: Phenotype): Phenotype {
        const clone: Phenotype = individual.clone(this.#currentSource);

        this.#currentSource += 1;
        const size: usize = clone.size;

        for (let i = 0; i < size; ++i) {
            if (this.getMutate()) {
                clone.swap(i);
            }

            if (this.getMutate()) {
                clone.rotation[i] = this.randomAngle(nodes[clone.placement[i]]);
            }
        }

        return clone;
    }

    // single point crossover
    private mate(male: Phenotype, female: Phenotype): Phenotype[] {
        const cutPoint: usize = male.cutPoint;
        const result: Phenotype[] = [male.cut(this.#currentSource, cutPoint), female.cut(this.#currentSource + 1, cutPoint)];

        this.#currentSource += 2;
        result[0].mate(female);
        result[1].mate(male);

        return result;
    }

    // returns a random individual from the population, weighted to the front of the list (lower
    // fitness value is more likely to be selected)
    private randomWeightedIndividual(exclude?: Phenotype): Phenotype {
        const excludeIndex: isize = exclude ? this.#population.indexOf(exclude) : -1;
        const localPopulation: Phenotype[] = this.#population.slice();

        if (excludeIndex !== -1) {
            localPopulation.splice(excludeIndex, 1);
        }

        const size: usize = localPopulation.length;
        const rand: f32 = Math.random();
        const weight: f32 = 2 / size;
        let lower: f32 = 0;
        let upper: f32 = weight / 2;

        for (let i = 0; i < size; ++i) {
            // if the random number falls between lower and upper bounds, select this individual
            if (rand > lower && rand < upper) {
                return localPopulation[i];
            }

            lower = upper;
            upper = upper + weight * ((size - i) / size);
        }

        return localPopulation[0];
    }

    // returns a random angle of insertion
    private randomAngle(node: PolygonNode): u16 {
        const lastIndex: usize = this.#rotations - 1;
        const angles: u16[] = [];
        const step: f32 = 360 / this.#rotations;

        for (let i = 0; i < this.#rotations; ++i) {
            angles.push(Math.round(i * step));
        }

        for (let i = lastIndex; i > 0; --i) {
            const j = Math.floor(Math.random() * (i + 1));
            const angle = angles[i];
            angles[i] = angles[j];
            angles[j] = angle;
        }

        for (let i = 0; i < this.#rotations; ++i) {
            const rotated = rotate_polygon_wasm(node.memSeg, angles[i]);
            const bounds = calculate_bounds_wasm(rotated);

            // don't use obviously bad angles where the part doesn't fit in the bin
            if (bounds[2] < this.#binWidth && bounds[3] < this.#binHeight) {
                return angles[i];
            }
        }

        return 0;
    }

    public getIndividual(nodes: PolygonNode[]): Phenotype {
        // evaluate all members of the population
        for (let i = 0; i < this.#population.length; ++i) {
            if (!this.#population[i].fitness) {
                return this.#population[i];
            }
        }

        // all individuals have been evaluated, start next generation
        // Individuals with higher fitness are more likely to be selected for mating
        this.#population.sort((a, b) => a.fitness - b.fitness);

        // fittest individual is preserved in the new generation (elitism)
        const result: Phenotype[] = [this.#population[0]];

        while (result.length < this.#population.length) {
            const male = this.randomWeightedIndividual();
            const female = this.randomWeightedIndividual(male);

            // each mating produces two children
            const children = this.mate(male, female);

            // slightly mutate children
            result.push(this.mutate(nodes, children[0]));

            if (result.length < this.#population.length) {
                result.push(this.mutate(nodes, children[1]));
            }
        }

        this.#population = result;

        return this.#population[1];
    }

    public updateFitness(source: u16, fitness: f32): void {
        const size: usize = this.#population.length;

        for (let i = 0; i < size; ++i) {
            if (this.#population[i].source === source) {
                this.#population[i].fitness = fitness;  
                break;
            }
        }
    }

    private getMutate(): boolean {
        return Math.random() < this.#trashold;
    }
}
