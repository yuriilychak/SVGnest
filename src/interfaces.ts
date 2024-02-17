export interface Point {
  x: number;
  y: number;
  marked?: boolean;
  start?: Point;
  end?: Point;
}

export interface GeneticAlgorithmConfig {
  populationSize: number;
  mutationRate: number;
  rotations: number;
}

export interface BoundRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ArrayPolygon extends Array<Point>, BoundRect {
  id: number;
  parent?: ArrayPolygon;
  children?: Array<ArrayPolygon>;
  rotation: number;
  source: number;
  marked?: boolean;
  offsetx?: number;
  offsety?: number;
}

export interface SvgNestConfiguration {
  clipperScale: number;
  curveTolerance: number;
  spacing: number;
  rotations: number;
  populationSize: number;
  mutationRate: number;
  useHoles: boolean;
  exploreConcave: boolean;
}