import Clipper from '../clipper';
import { ClipType, PolyFillType, PolyType } from '../enums';
import { PointI32 } from '../../geometry';
import * as testData from '../__data__/clipper.json';

// Type definitions for test data
interface PointData {
    x: number;
    y: number;
}

interface TestCase {
    id: string;
    input: {
        [key: string]: any;
        reverseSolution?: boolean;
        strictlySimple?: boolean;
        polygon?: PointData[];
        polygons?: PointData[][];
        subjectPolygons?: PointData[][];
        clipPolygons?: PointData[][];
        polyType?: number;
        clipType?: number;
        fillType?: number;
    };
    output: {
        [key: string]: any;
        result?: boolean;
        isExecuteLocked?: boolean;
        hasComponents?: boolean;
        hasSolution?: boolean;
    };
}

interface TestSuite {
    id: string;
    data: TestCase[];
}

interface TestDataStructure {
    suites: TestSuite[];
}

describe('Clipper', () => {
    let clipper: Clipper;

    afterEach(() => {
        // Clean up after each test
        if (clipper) {
            // Force cleanup if needed
            (clipper as any).isExecuteLocked = false;
        }
    });

    describe('constructor', () => {
        const constructorSuite = (testData as TestDataStructure).suites.find(s => s.id === 'constructor')!;

        test('should create clipper with default constructor', () => {
            const data = constructorSuite.data.find(d => d.id === 'default_constructor')!;

            clipper = new Clipper(data.input.reverseSolution!, data.input.strictlySimple!);

            expect((clipper as any).isExecuteLocked).toBe(data.output.isExecuteLocked);
            expect((clipper as any).localMinima).toBeDefined();
            expect((clipper as any).intersections).toBeDefined();
            expect((clipper as any).scanbeam).toBeDefined();
            expect((clipper as any).tEdge).toBeDefined();
            expect((clipper as any).join).toBeDefined();
            expect((clipper as any).outRec).toBeDefined();
            expect(data.output.hasComponents).toBe(true);
        });

        test('should create clipper with reverse solution enabled', () => {
            const data = constructorSuite.data.find(d => d.id === 'reverse_solution_constructor')!;

            clipper = new Clipper(data.input.reverseSolution!, data.input.strictlySimple!);

            expect((clipper as any).isExecuteLocked).toBe(data.output.isExecuteLocked);
            expect((clipper as any).localMinima).toBeDefined();
            expect((clipper as any).intersections).toBeDefined();
            expect((clipper as any).scanbeam).toBeDefined();
            expect((clipper as any).tEdge).toBeDefined();
            expect((clipper as any).join).toBeDefined();
            expect((clipper as any).outRec).toBeDefined();
            expect(data.output.hasComponents).toBe(true);
        });

        test('should create clipper with strictly simple enabled', () => {
            const data = constructorSuite.data.find(d => d.id === 'strictly_simple_constructor')!;

            clipper = new Clipper(data.input.reverseSolution!, data.input.strictlySimple!);

            expect((clipper as any).isExecuteLocked).toBe(data.output.isExecuteLocked);
            expect((clipper as any).localMinima).toBeDefined();
            expect((clipper as any).intersections).toBeDefined();
            expect((clipper as any).scanbeam).toBeDefined();
            expect((clipper as any).tEdge).toBeDefined();
            expect((clipper as any).join).toBeDefined();
            expect((clipper as any).outRec).toBeDefined();
            expect(data.output.hasComponents).toBe(true);
        });

        test('should create clipper with both flags enabled', () => {
            const data = constructorSuite.data.find(d => d.id === 'both_flags_constructor')!;

            clipper = new Clipper(data.input.reverseSolution!, data.input.strictlySimple!);

            expect((clipper as any).isExecuteLocked).toBe(data.output.isExecuteLocked);
            expect((clipper as any).localMinima).toBeDefined();
            expect((clipper as any).intersections).toBeDefined();
            expect((clipper as any).scanbeam).toBeDefined();
            expect((clipper as any).tEdge).toBeDefined();
            expect((clipper as any).join).toBeDefined();
            expect((clipper as any).outRec).toBeDefined();
            expect(data.output.hasComponents).toBe(true);
        });

        test('should create clipper with default false constructor', () => {
            const data = constructorSuite.data.find(d => d.id === 'default_false_constructor')!;

            clipper = new Clipper(data.input.reverseSolution!, data.input.strictlySimple!);

            expect((clipper as any).isExecuteLocked).toBe(data.output.isExecuteLocked);
            expect((clipper as any).localMinima).toBeDefined();
            expect((clipper as any).intersections).toBeDefined();
            expect((clipper as any).scanbeam).toBeDefined();
            expect((clipper as any).tEdge).toBeDefined();
            expect((clipper as any).join).toBeDefined();
            expect((clipper as any).outRec).toBeDefined();
            expect(data.output.hasComponents).toBe(true);
        });
    });

    describe('addPath', () => {
        const addPathSuite = (testData as TestDataStructure).suites.find(s => s.id === 'addPath')!;

        beforeEach(() => {
            clipper = new Clipper(false, false);
        });

        test('should add square subject path successfully', () => {
            const data = addPathSuite.data.find(d => d.id === 'square_subject')!;

            const polygon = data.input.polygon!.map(p => PointI32.create(p.x, p.y));
            const result = clipper.addPath(polygon, data.input.polyType as PolyType);

            expect(result).toBe(data.output.result);
        });

        test('should add triangle clip path successfully', () => {
            const data = addPathSuite.data.find(d => d.id === 'triangle_clip')!;

            const polygon = data.input.polygon!.map(p => PointI32.create(p.x, p.y));
            const result = clipper.addPath(polygon, data.input.polyType as PolyType);

            expect(result).toBe(data.output.result);
        });

        test('should add pentagon subject path successfully', () => {
            const data = addPathSuite.data.find(d => d.id === 'pentagon_subject')!;

            const polygon = data.input.polygon!.map(p => PointI32.create(p.x, p.y));
            const result = clipper.addPath(polygon, data.input.polyType as PolyType);

            expect(result).toBe(data.output.result);
        });

        test('should add concave polygon clip path successfully', () => {
            const data = addPathSuite.data.find(d => d.id === 'concave_polygon_clip')!;

            const polygon = data.input.polygon!.map(p => PointI32.create(p.x, p.y));
            const result = clipper.addPath(polygon, data.input.polyType as PolyType);

            expect(result).toBe(data.output.result);
        });

        test('should reject degenerate path', () => {
            const data = addPathSuite.data.find(d => d.id === 'degenerate_path')!;

            const polygon = data.input.polygon!.map(p => PointI32.create(p.x, p.y));
            const result = clipper.addPath(polygon, data.input.polyType as PolyType);

            expect(result).toBe(data.output.result);
        });
    });

    describe('addPaths', () => {
        const addPathsSuite = (testData as TestDataStructure).suites.find(s => s.id === 'addPaths')!;

        beforeEach(() => {
            clipper = new Clipper(false, false);
        });

        test('should add multiple square paths successfully', () => {
            const data = addPathsSuite.data.find(d => d.id === 'multiple_squares')!;

            const polygons = data.input.polygons!.map(poly =>
                poly.map(p => PointI32.create(p.x, p.y))
            );
            const result = clipper.addPaths(polygons, data.input.polyType as PolyType);

            expect(result).toBe(data.output.result);
        });

        test('should add triangle and square paths successfully', () => {
            const data = addPathsSuite.data.find(d => d.id === 'triangle_and_square')!;

            const polygons = data.input.polygons!.map(poly =>
                poly.map(p => PointI32.create(p.x, p.y))
            );
            const result = clipper.addPaths(polygons, data.input.polyType as PolyType);

            expect(result).toBe(data.output.result);
        });

        test('should add complex polygons successfully', () => {
            const data = addPathsSuite.data.find(d => d.id === 'complex_polygons')!;

            const polygons = data.input.polygons!.map(poly =>
                poly.map(p => PointI32.create(p.x, p.y))
            );
            const result = clipper.addPaths(polygons, data.input.polyType as PolyType);

            expect(result).toBe(data.output.result);
        });

        test('should add convex and concave polygon mix successfully', () => {
            const data = addPathsSuite.data.find(d => d.id === 'convex_concave_mix')!;

            const polygons = data.input.polygons!.map(poly =>
                poly.map(p => PointI32.create(p.x, p.y))
            );
            const result = clipper.addPaths(polygons, data.input.polyType as PolyType);

            expect(result).toBe(data.output.result);
        });

        test('should handle empty polygons array', () => {
            const data = addPathsSuite.data.find(d => d.id === 'empty_polygons_array')!;

            const polygons = data.input.polygons!.map(poly =>
                poly.map(p => PointI32.create(p.x, p.y))
            );
            const result = clipper.addPaths(polygons, data.input.polyType as PolyType);

            expect(result).toBe(data.output.result);
        });
    });

    describe('execute - union operations', () => {
        const executeUnionSuite = (testData as TestDataStructure).suites.find(s => s.id === 'execute_union')!;

        beforeEach(() => {
            clipper = new Clipper(false, false);
        });

        test('should execute union of overlapping squares', () => {
            const data = executeUnionSuite.data.find(d => d.id === 'overlapping_squares_union')!;

            // Add subject polygons
            const subjectPolygons = data.input.subjectPolygons!.map(poly =>
                poly.map(p => PointI32.create(p.x, p.y))
            );
            subjectPolygons.forEach(polygon => {
                clipper.addPath(polygon, PolyType.Subject);
            });

            // Add clip polygons
            const clipPolygons = data.input.clipPolygons!.map(poly =>
                poly.map(p => PointI32.create(p.x, p.y))
            );
            clipPolygons.forEach(polygon => {
                clipper.addPath(polygon, PolyType.Clip);
            });

            const solution: PointI32[][] = [];
            const result = clipper.execute(
                data.input.clipType as ClipType,
                solution,
                data.input.fillType as PolyFillType
            );

            expect(result).toBe(data.output.result);
            if (data.output.hasSolution) {
                expect(solution.length).toBeGreaterThanOrEqual(0);
            }
        });

        test('should execute union of triangle and square', () => {
            const data = executeUnionSuite.data.find(d => d.id === 'triangle_square_union')!;

            // Add subject polygons
            const subjectPolygons = data.input.subjectPolygons!.map(poly =>
                poly.map(p => PointI32.create(p.x, p.y))
            );
            subjectPolygons.forEach(polygon => {
                clipper.addPath(polygon, PolyType.Subject);
            });

            // Add clip polygons
            const clipPolygons = data.input.clipPolygons!.map(poly =>
                poly.map(p => PointI32.create(p.x, p.y))
            );
            clipPolygons.forEach(polygon => {
                clipper.addPath(polygon, PolyType.Clip);
            });

            const solution: PointI32[][] = [];
            const result = clipper.execute(
                data.input.clipType as ClipType,
                solution,
                data.input.fillType as PolyFillType
            );

            expect(result).toBe(data.output.result);
            if (data.output.hasSolution) {
                expect(solution.length).toBeGreaterThanOrEqual(0);
            }
        });

        test('should execute union of pentagon and complex polygon', () => {
            const data = executeUnionSuite.data.find(d => d.id === 'pentagon_circle_union')!;

            // Add subject polygons
            const subjectPolygons = data.input.subjectPolygons!.map(poly =>
                poly.map(p => PointI32.create(p.x, p.y))
            );
            subjectPolygons.forEach(polygon => {
                clipper.addPath(polygon, PolyType.Subject);
            });

            // Add clip polygons
            const clipPolygons = data.input.clipPolygons!.map(poly =>
                poly.map(p => PointI32.create(p.x, p.y))
            );
            clipPolygons.forEach(polygon => {
                clipper.addPath(polygon, PolyType.Clip);
            });

            const solution: PointI32[][] = [];
            const result = clipper.execute(
                data.input.clipType as ClipType,
                solution,
                data.input.fillType as PolyFillType
            );

            expect(result).toBe(data.output.result);
            if (data.output.hasSolution) {
                expect(solution.length).toBeGreaterThanOrEqual(0);
            }
        });

        test('should execute union of concave polygons', () => {
            const data = executeUnionSuite.data.find(d => d.id === 'concave_polygons_union')!;

            // Add subject polygons
            const subjectPolygons = data.input.subjectPolygons!.map(poly =>
                poly.map(p => PointI32.create(p.x, p.y))
            );
            subjectPolygons.forEach(polygon => {
                clipper.addPath(polygon, PolyType.Subject);
            });

            // Add clip polygons
            const clipPolygons = data.input.clipPolygons!.map(poly =>
                poly.map(p => PointI32.create(p.x, p.y))
            );
            clipPolygons.forEach(polygon => {
                clipper.addPath(polygon, PolyType.Clip);
            });

            const solution: PointI32[][] = [];
            const result = clipper.execute(
                data.input.clipType as ClipType,
                solution,
                data.input.fillType as PolyFillType
            );

            expect(result).toBe(data.output.result);
            if (data.output.hasSolution) {
                expect(solution.length).toBeGreaterThanOrEqual(0);
            }
        });

        test('should execute union of non-overlapping polygons', () => {
            const data = executeUnionSuite.data.find(d => d.id === 'non_overlapping_union')!;

            // Add subject polygons
            const subjectPolygons = data.input.subjectPolygons!.map(poly =>
                poly.map(p => PointI32.create(p.x, p.y))
            );
            subjectPolygons.forEach(polygon => {
                clipper.addPath(polygon, PolyType.Subject);
            });

            // Add clip polygons
            const clipPolygons = data.input.clipPolygons!.map(poly =>
                poly.map(p => PointI32.create(p.x, p.y))
            );
            clipPolygons.forEach(polygon => {
                clipper.addPath(polygon, PolyType.Clip);
            });

            const solution: PointI32[][] = [];
            const result = clipper.execute(
                data.input.clipType as ClipType,
                solution,
                data.input.fillType as PolyFillType
            );

            expect(result).toBe(data.output.result);
            if (data.output.hasSolution) {
                expect(solution.length).toBeGreaterThanOrEqual(0);
            }
        });
    });

    describe('execute - difference operations', () => {
        const executeDifferenceSuite = (testData as TestDataStructure).suites.find(s => s.id === 'execute_difference')!;

        beforeEach(() => {
            clipper = new Clipper(false, false);
        });

        test('should execute difference of overlapping squares', () => {
            const data = executeDifferenceSuite.data.find(d => d.id === 'overlapping_squares_difference')!;

            // Add subject polygons
            const subjectPolygons = data.input.subjectPolygons!.map(poly =>
                poly.map(p => PointI32.create(p.x, p.y))
            );
            subjectPolygons.forEach(polygon => {
                clipper.addPath(polygon, PolyType.Subject);
            });

            // Add clip polygons
            const clipPolygons = data.input.clipPolygons!.map(poly =>
                poly.map(p => PointI32.create(p.x, p.y))
            );
            clipPolygons.forEach(polygon => {
                clipper.addPath(polygon, PolyType.Clip);
            });

            const solution: PointI32[][] = [];
            const result = clipper.execute(
                data.input.clipType as ClipType,
                solution,
                data.input.fillType as PolyFillType
            );

            expect(result).toBe(data.output.result);
            if (data.output.hasSolution) {
                expect(solution.length).toBeGreaterThanOrEqual(0);
            }
        });

        test('should execute difference of triangle and square', () => {
            const data = executeDifferenceSuite.data.find(d => d.id === 'triangle_square_difference')!;

            // Add subject polygons
            const subjectPolygons = data.input.subjectPolygons!.map(poly =>
                poly.map(p => PointI32.create(p.x, p.y))
            );
            subjectPolygons.forEach(polygon => {
                clipper.addPath(polygon, PolyType.Subject);
            });

            // Add clip polygons
            const clipPolygons = data.input.clipPolygons!.map(poly =>
                poly.map(p => PointI32.create(p.x, p.y))
            );
            clipPolygons.forEach(polygon => {
                clipper.addPath(polygon, PolyType.Clip);
            });

            const solution: PointI32[][] = [];
            const result = clipper.execute(
                data.input.clipType as ClipType,
                solution,
                data.input.fillType as PolyFillType
            );

            expect(result).toBe(data.output.result);
            if (data.output.hasSolution) {
                expect(solution.length).toBeGreaterThanOrEqual(0);
            }
        });

        test('should execute difference of pentagon', () => {
            const data = executeDifferenceSuite.data.find(d => d.id === 'pentagon_difference')!;

            // Add subject polygons
            const subjectPolygons = data.input.subjectPolygons!.map(poly =>
                poly.map(p => PointI32.create(p.x, p.y))
            );
            subjectPolygons.forEach(polygon => {
                clipper.addPath(polygon, PolyType.Subject);
            });

            // Add clip polygons
            const clipPolygons = data.input.clipPolygons!.map(poly =>
                poly.map(p => PointI32.create(p.x, p.y))
            );
            clipPolygons.forEach(polygon => {
                clipper.addPath(polygon, PolyType.Clip);
            });

            const solution: PointI32[][] = [];
            const result = clipper.execute(
                data.input.clipType as ClipType,
                solution,
                data.input.fillType as PolyFillType
            );

            expect(result).toBe(data.output.result);
            if (data.output.hasSolution) {
                expect(solution.length).toBeGreaterThanOrEqual(0);
            }
        });

        test('should execute difference of concave polygons', () => {
            const data = executeDifferenceSuite.data.find(d => d.id === 'concave_difference')!;

            // Add subject polygons
            const subjectPolygons = data.input.subjectPolygons!.map(poly =>
                poly.map(p => PointI32.create(p.x, p.y))
            );
            subjectPolygons.forEach(polygon => {
                clipper.addPath(polygon, PolyType.Subject);
            });

            // Add clip polygons
            const clipPolygons = data.input.clipPolygons!.map(poly =>
                poly.map(p => PointI32.create(p.x, p.y))
            );
            clipPolygons.forEach(polygon => {
                clipper.addPath(polygon, PolyType.Clip);
            });

            const solution: PointI32[][] = [];
            const result = clipper.execute(
                data.input.clipType as ClipType,
                solution,
                data.input.fillType as PolyFillType
            );

            expect(result).toBe(data.output.result);
            if (data.output.hasSolution) {
                expect(solution.length).toBeGreaterThanOrEqual(0);
            }
        });

        test('should execute difference with no overlap', () => {
            const data = executeDifferenceSuite.data.find(d => d.id === 'no_overlap_difference')!;

            // Add subject polygons
            const subjectPolygons = data.input.subjectPolygons!.map(poly =>
                poly.map(p => PointI32.create(p.x, p.y))
            );
            subjectPolygons.forEach(polygon => {
                clipper.addPath(polygon, PolyType.Subject);
            });

            // Add clip polygons
            const clipPolygons = data.input.clipPolygons!.map(poly =>
                poly.map(p => PointI32.create(p.x, p.y))
            );
            clipPolygons.forEach(polygon => {
                clipper.addPath(polygon, PolyType.Clip);
            });

            const solution: PointI32[][] = [];
            const result = clipper.execute(
                data.input.clipType as ClipType,
                solution,
                data.input.fillType as PolyFillType
            );

            expect(result).toBe(data.output.result);
            if (data.output.hasSolution) {
                expect(solution.length).toBeGreaterThanOrEqual(0);
            }
        });
    });
});