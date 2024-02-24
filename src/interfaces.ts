export interface Point {
  x: number;
  y: number;
  id?: number;
  marked?: boolean;
  rotation?: number;
  start?: Point;
  end?: Point;
  nfp?: any;
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
  children?: ArrayPolygon[];
  rotation: number;
  source: number;
  hole?: boolean;
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

export interface PairWorkerData {
  rotations: number;
  binPolygon: ArrayPolygon;
  searchEdges: boolean;
  useHoles: boolean;
}

export interface NfpPair {
  A: ArrayPolygon;
  B: ArrayPolygon;
  numKey: number;
}

export interface PlacePairConfiguration {
  binPolygon: ArrayPolygon;
  paths: ArrayPolygon[];
  ids: number[];
  rotations: number[];
  config: SvgNestConfiguration;
  nfpCache: Map<number, ArrayPolygon[]>;
}

export interface ClipperPoint {
  X: number;
  Y: number;
}

export interface PairDataResult {
  value: ArrayPolygon[];
  numKey: number;
}

export interface PlaceDataResult {
  placements: Point[][];
  fitness: number;
  paths: ArrayPolygon[];
  area: number;
}
