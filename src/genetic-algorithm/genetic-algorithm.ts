import { getPolygonBounds, rotatePolygon } from "../geometry-util";
import { ArrayPolygon, BoundRect, GeneticAlgorithmConfig } from "../interfaces";
import Phenotype from "./phenotype";

const DEFAULT_CONFIG: GeneticAlgorithmConfig = {
  populationSize: 10,
  mutationRate: 10,
  rotations: 4
};

export default class GeneticAlgorithm {
  private _population: Array<Phenotype>;
  private _config: GeneticAlgorithmConfig;
  private _binBounds: BoundRect;

  constructor(
    adam: Array<ArrayPolygon>,
    bin: ArrayPolygon,
    config: GeneticAlgorithmConfig = DEFAULT_CONFIG
  ) {
    this._config = config;
    this._binBounds = getPolygonBounds(bin);

    // population is an array of individuals. Each individual is a object representing the order of insertion and the angle each part is rotated
    const angles = [];
    let i = 0;
    let mutant;
    for (i = 0; i < adam.length; ++i) {
      angles.push(this._randomAngle(adam[i]));
    }

    this._population = [new Phenotype(adam, angles)];

    while (this._population.length < config.populationSize) {
      mutant = this._mutate(this._population[0]);
      this._population.push(mutant);
    }
  }

  public generation(): void {
    // Individuals with higher fitness are more likely to be selected for mating
    this._population.sort((a, b) => a.fitness - b.fitness);

    // fittest individual is preserved in the new generation (elitism)
    const result: Array<Phenotype> = [this._population[0]];
    const currentSize: number = this._population.length;
    let male: Phenotype;
    let female: Phenotype;
    let children: Array<Phenotype>;

    while (result.length < currentSize) {
      male = this._randomWeightedIndividual();
      female = this._randomWeightedIndividual(male);

      // each mating produces two children
      children = this._mate(male, female);

      // slightly mutate children
      result.push(this._mutate(children[0]));

      if (result.length < currentSize) {
        result.push(this._mutate(children[1]));
      }
    }

    this._population = result;
  }

  public get individual(): Phenotype | null {
    let i: number = 0;
    // evaluate all members of the population
    for (i = 0; i < this._population.length; ++i) {
      if (!this._population[i].fitness) {
        return this._population[i];
      }
    }

    // all individuals have been evaluated, start next generation
    this.generation();
    return this._population[1] || null;
  }

  // returns a random angle of insertion
  private _randomAngle(part: ArrayPolygon): number {
    const angleCount: number = Math.max(this._config.rotations, 1);
    let angleList: Array<number> = [];
    let i: number = 0;
    let rotatedPart: BoundRect;

    for (i = 0; i < angleCount; ++i) {
      angleList.push(i * (360 / angleCount));
    }

    angleList = GeneticAlgorithm.shuffle(angleList);

    for (i = 0; i < angleCount; ++i) {
      rotatedPart = rotatePolygon(part, angleList[i]) as ArrayPolygon;

      // don't use obviously bad angles where the part doesn't fit in the bin
      if (
        rotatedPart.width < this._binBounds.width &&
        rotatedPart.height < this._binBounds.height
      ) {
        return angleList[i];
      }
    }

    return 0;
  }

  // returns a mutated individual with the given mutation rate
  private _mutate(individual: Phenotype): Phenotype {
    const trashold = 0.01 * this._config.mutationRate;
    const clone = individual.clone();
    const size = clone.size;
    let i = 0;
    let j = 0;
    let rand = 0;
    let placement;

    for (i = 0; i < size; ++i) {
      rand = Math.random();

      if (rand < trashold) {
        // swap current part with next part
        j = i + 1;

        if (j < size) {
          placement = clone.placement[i];
          clone.placement[i] = clone.placement[j];
          clone.placement[j] = placement;
        }
      }

      rand = Math.random();
      if (rand < trashold) {
        clone.rotation[i] = this._randomAngle(clone.placement[i]);
      }
    }

    return clone;
  }

  // single point crossover
  private _mate(male: Phenotype, female: Phenotype): Array<Phenotype> {
    const cutPoint: number = Math.round(
      Math.min(Math.max(Math.random(), 0.1), 0.9) * (male.placement.length - 1)
    );
    const result: Array<Phenotype> = [male.cut(cutPoint), female.cut(cutPoint)];

    result[0].mate(female);
    result[1].mate(male);

    return result;
  }

  // returns a random individual from the population, weighted to the front of the list (lower fitness value is more likely to be selected)
  private _randomWeightedIndividual(exclude?: Phenotype): Phenotype {
    const localPopulation: Array<Phenotype> = this._population.slice();
    const excludeIndex: number = exclude
      ? localPopulation.indexOf(exclude)
      : -1;

    if (excludeIndex >= 0) {
      localPopulation.splice(excludeIndex, 1);
    }

    const size: number = localPopulation.length;
    const rand: number = Math.random();
    const weight: number = 2 / size;
    let lower: number = 0;
    let upper: number = weight / 2;
    let i: number = 0;

    for (i = 0; i < size; ++i) {
      // if the random number falls between lower and upper bounds, select this individual
      if (rand > lower && rand < upper) {
        return localPopulation[i];
      }

      lower = upper;
      upper += weight * ((size - i) / size);
    }

    return localPopulation[0];
  }

  static shuffle(angleList: Array<number>): Array<number> {
    const lastIndex: number = angleList.length - 1;
    let i: number = 0;
    let j: number = 0;
    let temp: number;

    for (i = lastIndex; i > 0; --i) {
      j = Math.floor(Math.random() * (i + 1));
      temp = angleList[i];
      angleList[i] = angleList[j];
      angleList[j] = temp;
    }

    return angleList;
  }

  public get population(): Array<Phenotype> {
    return this._population;
  }
}
