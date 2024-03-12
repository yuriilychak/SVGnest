export interface IPoint {
  x: number;
  y: number;
  id?: number;
  rotation?: number;
  start?: IPoint;
  end?: IPoint;
  nfp?: any;
}

export interface GeneticAlgorithmConfig {
  populationSize: number;
  mutationRate: number;
  rotations: number;
}

export interface IRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IPolygon extends Array<IPoint>, IRect {
  id: number;
  parent?: IPolygon;
  children?: IPolygon[];
  rotation: number;
  offsetx?: number;
  offsety?: number;
  source: number;
  hole?: boolean;
  offset?: IPoint;
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
  asm: ArrayBuffer;
  rotations: number;
  binPolygon: IPolygon;
  searchEdges: boolean;
  useHoles: boolean;
  debug?: boolean;
}

export interface NfpPair {
  A: IPolygon;
  B: IPolygon;
  numKey: number;
}

export interface PlacePairConfiguration {
  binPolygon: IPolygon;
  paths: IPolygon[];
  ids: number[];
  rotations: number[];
  config: SvgNestConfiguration;
  nfpCache: Map<number, IPolygon[]>;
}

export interface PairDataResult {
  value: IPolygon[];
  numKey: number;
}

export interface PlaceDataResult {
  placements: IPoint[][];
  fitness: number;
  paths: IPolygon[];
  area: number;
}
