import { ArrayPolygon } from "../interfaces";

export default class Phenotype {
  private _placemant: Array<ArrayPolygon>;
  private _rotation: Array<number>;
  private _fitness: number = 0;

  constructor(placement: Array<ArrayPolygon>, rotation: Array<number>) {
    this._placemant = placement;
    this._rotation = rotation;
  }

  public cut(cutPoint: number): Phenotype {
    return new Phenotype(
      this._placemant.slice(0, cutPoint),
      this._rotation.slice(0, cutPoint)
    );
  }

  public clone(): Phenotype {
    return new Phenotype(this._placemant.slice(), this._rotation.slice());
  }

  public mate(phenotype: Phenotype): void {
    let i = 0;
    let placement = phenotype.placement[0];
    let rotation = phenotype.rotation[0];

    for (i = 0; i < phenotype.size; ++i) {
      placement = phenotype.placement[i];
      rotation = phenotype.rotation[i];

      if (!this._contains(placement.id)) {
        this._placemant.push(placement);
        this._rotation.push(rotation);
      }
    }
  }

  private _contains(id: number): boolean {
    let i = 0;
    const size = this.size;

    for (i = 0; i < size; ++i) {
      if (this._placemant[i].id === id) {
        return true;
      }
    }

    return false;
  }

  public get placement(): Array<ArrayPolygon> {
    return this._placemant;
  }

  public get rotation(): Array<number> {
    return this._rotation;
  }

  public get size(): number {
    return this._placemant.length;
  }

  public get fitness(): number {
    return this._fitness;
  }

  public set fitness(value: number) {
    this._fitness = value;
  }
}
