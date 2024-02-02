export interface Point {
  x: number;
  y: number;
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
  rotation: number;
  source: number;
}
