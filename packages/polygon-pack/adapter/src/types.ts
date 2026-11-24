export interface NestingConfig {
	curveTolerance: number;
	spacing: number;
	rotations: number;
	populationSize: number;
	mutationRate: number;
	useHoles: boolean;
}

export interface SourcePolygon extends Array<number> {
	source: number;
}

export interface PolygonNode {
	source?: number;
	children: PolygonNode[];
}

export interface Placement {
	id: number;
	x: number;
	y: number;
	rotation: number;
}

export interface PlacementResult {
	fitness: number;
	placements: Placement[][];
	placedArea: number;
	totalArea: number;
	placedCount: number;
	partCount: number;
}
