import TEdge from '../t-edge';
import { ClipType, Direction, EdgeSide, PolyFillType, PolyType, BoolCondition } from '../enums';
import { PointI32 } from '../../geometry';
import * as testData from '../__data__/t-edge.json';

// Type definitions for test data
interface PointData {
    x: number;
    y: number;
}

interface TestCase {
    id: string;
    input: {
        [key: string]: any;
        polygon?: PointData[];
        polyType?: number;
        clipType?: number;
        fillType?: number;
        edgeIndex?: number;
        side?: number;
        index1?: number;
        index2?: number;
        side1?: number;
        side2?: number;
        condition?: number;
        isX?: boolean;
        y?: number;
        firstLeftIndex?: number;
        point?: PointData;
        isProtect?: boolean;
        inputIndex?: number;
        updateIndex?: number;
        inputSide?: number;
        updateSide?: number;
        setValue?: number;
    };
    output: {
        [key: string]: any;
    };
}

interface TestSuite {
    id: string;
    data: TestCase[];
}

interface TestDataStructure {
    suites: TestSuite[];
}

describe('TEdge', () => {
    let tEdge: TEdge;

    beforeEach(() => {
        tEdge = new TEdge();
    });

    afterEach(() => {
        tEdge.dispose();
    });

    describe('initialization', () => {
        const initSuite = (testData as TestDataStructure).suites.find(s => s.id === 'initialization')!;

        test('should initialize with union and nonzero fill type', () => {
            const data = initSuite.data.find(d => d.id === 'union_nonzero')!;

            tEdge.init(data.input.clipType as ClipType, data.input.fillType as PolyFillType);

            expect((tEdge as any)._clipType).toBe(data.output.clipType);
            expect((tEdge as any)._fillType).toBe(data.output.fillType);
        });

        test('should initialize with difference and positive fill type', () => {
            const data = initSuite.data.find(d => d.id === 'difference_positive')!;

            tEdge.init(data.input.clipType as ClipType, data.input.fillType as PolyFillType);

            expect((tEdge as any)._clipType).toBe(data.output.clipType);
            expect((tEdge as any)._fillType).toBe(data.output.fillType);
        });

        test('should initialize with difference and negative fill type', () => {
            const data = initSuite.data.find(d => d.id === 'difference_negative')!;

            tEdge.init(data.input.clipType as ClipType, data.input.fillType as PolyFillType);

            expect((tEdge as any)._clipType).toBe(data.output.clipType);
            expect((tEdge as any)._fillType).toBe(data.output.fillType);
        });

        test('should reset edge data', () => {
            const data = initSuite.data.find(d => d.id === 'reset_edge')!;

            const polygon = data.input.polygon!.map(p => PointI32.create(p.x, p.y));
            tEdge.createPath(polygon, data.input.polyType as PolyType);

            tEdge.reset();

            expect(tEdge.active).toBe(data.output.active);
            expect(tEdge.sorted).toBe(data.output.sorted);
        });

        test('should dispose properly', () => {
            const data = initSuite.data.find(d => d.id === 'dispose_test')!;

            const polygon = data.input.polygon!.map(p => PointI32.create(p.x, p.y));
            tEdge.createPath(polygon, data.input.polyType as PolyType);

            tEdge.dispose();

            expect((tEdge as any)._edgeData.length).toBe(data.output.edgeDataLength);
            expect((tEdge as any)._wind.length).toBe(data.output.windLength);
            expect((tEdge as any)._dx.length).toBe(data.output.dxLength);
            expect((tEdge as any)._polyType.length).toBe(data.output.polyTypeLength);
            expect((tEdge as any)._side.length).toBe(data.output.sideLength);
            expect((tEdge as any)._points.length).toBe(data.output.pointsLength);
        });
    });

    describe('path creation', () => {
        const pathSuite = (testData as TestDataStructure).suites.find(s => s.id === 'path_creation')!;

        test('should create path from square polygon', () => {
            const data = pathSuite.data.find(d => d.id === 'square_path')!;

            const polygon = data.input.polygon!.map(p => PointI32.create(p.x, p.y));
            const result = tEdge.createPath(polygon, data.input.polyType as PolyType);

            expect(result).toBe(data.output.result);
            if (data.output.hasEdges) {
                expect((tEdge as any)._dx.length).toBeGreaterThan(0);
            }
        });

        test('should create path from triangle polygon', () => {
            const data = pathSuite.data.find(d => d.id === 'triangle_path')!;

            const polygon = data.input.polygon!.map(p => PointI32.create(p.x, p.y));
            const result = tEdge.createPath(polygon, data.input.polyType as PolyType);

            expect(result).toBe(data.output.result);
            if (data.output.hasEdges) {
                expect((tEdge as any)._dx.length).toBeGreaterThan(0);
            }
        });

        test('should create path from pentagon polygon', () => {
            const data = pathSuite.data.find(d => d.id === 'pentagon_path')!;

            const polygon = data.input.polygon!.map(p => PointI32.create(p.x, p.y));
            const result = tEdge.createPath(polygon, data.input.polyType as PolyType);

            expect(result).toBe(data.output.result);
            if (data.output.hasEdges) {
                expect((tEdge as any)._dx.length).toBeGreaterThan(0);
            }
        });

        test('should reject degenerate path with too few points', () => {
            const data = pathSuite.data.find(d => d.id === 'degenerate_path')!;

            const polygon = data.input.polygon!.map(p => PointI32.create(p.x, p.y));
            const result = tEdge.createPath(polygon, data.input.polyType as PolyType);

            expect(result).toBe(data.output.result);
        });

        test('should reject collinear path', () => {
            const data = pathSuite.data.find(d => d.id === 'collinear_path')!;

            const polygon = data.input.polygon!.map(p => PointI32.create(p.x, p.y));
            const result = tEdge.createPath(polygon, data.input.polyType as PolyType);

            expect(result).toBe(data.output.result);
        });
    });

    describe('geometry access', () => {
        const geometrySuite = (testData as TestDataStructure).suites.find(s => s.id === 'geometry_access')!;

        beforeEach(() => {
            const data = geometrySuite.data[0]; // Use first test data for setup
            const polygon = data.input.polygon!.map(p => PointI32.create(p.x, p.y));
            tEdge.createPath(polygon, data.input.polyType as PolyType);
        });

        test('should get X coordinate from current edge', () => {
            const data = geometrySuite.data.find(d => d.id === 'get_coordinates_current')!;

            const x = tEdge.getX(data.input.edgeIndex!, data.input.side as EdgeSide);
            expect(typeof x).toBe('number');
            expect(data.output.hasValue).toBe(true);
        });

        test('should get Y coordinate from bottom edge', () => {
            const data = geometrySuite.data.find(d => d.id === 'get_coordinates_bottom')!;

            const y = tEdge.getY(data.input.edgeIndex!, data.input.side as EdgeSide);
            expect(typeof y).toBe('number');
            expect(data.output.hasValue).toBe(true);
        });

        test('should get X coordinate from top edge', () => {
            const data = geometrySuite.data.find(d => d.id === 'get_coordinates_top')!;

            const x = tEdge.getX(data.input.edgeIndex!, data.input.side as EdgeSide);
            expect(typeof x).toBe('number');
            expect(data.output.hasValue).toBe(true);
        });

        test('should get Y coordinate from delta edge', () => {
            const data = geometrySuite.data.find(d => d.id === 'get_coordinates_delta')!;

            const y = tEdge.getY(data.input.edgeIndex!, data.input.side as EdgeSide);
            expect(typeof y).toBe('number');
            expect(data.output.hasValue).toBe(true);
        });

        test('should get point reference', () => {
            const data = geometrySuite.data.find(d => d.id === 'get_point_reference')!;

            const point = tEdge.point(data.input.edgeIndex!, data.input.side as EdgeSide);
            expect(point).toBeDefined();
            expect(typeof point.x).toBe('number');
            expect(typeof point.y).toBe('number');
            expect(data.output.hasPoint).toBe(true);
        });
    });

    describe('comparison methods', () => {
        const comparisonSuite = (testData as TestDataStructure).suites.find(s => s.id === 'comparison_methods')!;

        beforeEach(() => {
            const data = comparisonSuite.data[0]; // Use first test data for setup
            const polygon = data.input.polygon!.map(p => PointI32.create(p.x, p.y));
            tEdge.createPath(polygon, data.input.polyType as PolyType);
        });

        test('should check greater condition for X coordinates', () => {
            const data = comparisonSuite.data.find(d => d.id === 'check_condition_greater')!;

            const result = tEdge.checkCondition(
                data.input.index1!,
                data.input.index2!,
                data.input.side1 as EdgeSide,
                data.input.side2 as EdgeSide,
                data.input.condition as BoolCondition,
                data.input.isX!
            );
            expect(typeof result).toBe('boolean');
            expect(data.output.hasResult).toBe(true);
        });

        test('should check equal condition for Y coordinates', () => {
            const result = tEdge.checkCondition(
                1, 1,
                EdgeSide.Current, EdgeSide.Top,
                BoolCondition.Equal,
                false
            );
            expect(typeof result).toBe('boolean');
        });

        test('should check less condition for X coordinates', () => {
            const result = tEdge.checkCondition(
                1, 2,
                EdgeSide.Bottom, EdgeSide.Top,
                BoolCondition.Less,
                true
            );
            expect(typeof result).toBe('boolean');
        });

        test('should check almost equal points', () => {
            const result = tEdge.almostEqual(
                1, 1,
                EdgeSide.Current, EdgeSide.Current
            );
            expect(result).toBe(true);
        });

        test('should check not almost equal points', () => {
            const result = tEdge.almostEqual(
                1, 2,
                EdgeSide.Current, EdgeSide.Bottom
            );
            expect(typeof result).toBe('boolean');
        });
    });

    describe('edge management', () => {
        beforeEach(() => {
            const polygon = [
                PointI32.create(0, 0),
                PointI32.create(100, 0),
                PointI32.create(100, 100),
                PointI32.create(0, 100)
            ];
            tEdge.createPath(polygon, PolyType.Subject);
        });

        test('should get DX value', () => {
            const dxValue = tEdge.dx(1);
            expect(typeof dxValue).toBe('number');
        });

        test('should get side direction', () => {
            const sideDirection = tEdge.side(1);
            expect(typeof sideDirection).toBe('number');
        });

        test('should find next local minima', () => {
            const nextLocMin = tEdge.findNextLocMin(1);
            expect(typeof nextLocMin).toBe('number');
        });

        test('should get maxima pair', () => {
            const maximaPairResult = tEdge.maximaPair(1);
            expect(typeof maximaPairResult).toBe('number');
        });

        test('should check if has next local minima', () => {
            const hasNext = tEdge.hasNextLocalMinima(1);
            expect(typeof hasNext).toBe('boolean');
        });
    });

    describe('intersection and utility operations', () => {
        beforeEach(() => {
            const polygon = [
                PointI32.create(0, 0),
                PointI32.create(100, 0),
                PointI32.create(100, 100),
                PointI32.create(0, 100)
            ];
            tEdge.createPath(polygon, PolyType.Subject);
        });

        test('should get horizontal direction', () => {
            const horzDir = tEdge.horzDirection(1);
            expect(horzDir).toBeInstanceOf(Int32Array);
            expect(horzDir.length).toBe(3);
        });

        test('should get intermediate state', () => {
            const intermediate = tEdge.getIntermediate(1, 50);
            expect(typeof intermediate).toBe('boolean');
        });

        test('should get maxima state', () => {
            const maxima = tEdge.getMaxima(1, 50);
            expect(typeof maxima).toBe('boolean');
        });

        test('should get hole state', () => {
            const holeState = tEdge.getHoleState(1, 1);
            expect(typeof holeState).toBe('object');
            expect(typeof holeState.isHole).toBe('boolean');
            expect(typeof holeState.index).toBe('number');
        });

        test('should check stop condition', () => {
            const point = PointI32.create(50, 50);
            const stopResult = tEdge.getStop(1, point, true);
            expect(typeof stopResult).toBe('boolean');
        });
    });

    describe('utility methods', () => {
        beforeEach(() => {
            const polygon = [
                PointI32.create(0, 0),
                PointI32.create(100, 0),
                PointI32.create(100, 100),
                PointI32.create(0, 100)
            ];
            tEdge.createPath(polygon, PolyType.Subject);
        });

        test('should calculate DX value', () => {
            const dx = tEdge.dx(1);
            expect(typeof dx).toBe('number');
        });

        test('should get side direction', () => {
            const sideDirection = tEdge.side(1);
            expect(typeof sideDirection).toBe('number');
        });

        test('should update coordinates', () => {
            const originalX = tEdge.getX(1, EdgeSide.Current);
            const originalY = tEdge.getY(1, EdgeSide.Current);

            tEdge.update(1, 2, EdgeSide.Current, EdgeSide.Bottom);

            const newX = tEdge.getX(1, EdgeSide.Current);
            const newY = tEdge.getY(1, EdgeSide.Current);

            // Should be able to update without error
            expect(typeof newX).toBe('number');
            expect(typeof newY).toBe('number');
        });

        test('should check use full range', () => {
            const polygon = [
                PointI32.create(0, 0),
                PointI32.create(1000000, 0),
                PointI32.create(1000000, 1000000),
                PointI32.create(0, 1000000)
            ];
            tEdge.dispose();
            tEdge.createPath(polygon, PolyType.Subject);

            const useFullRange = tEdge.isUseFullRange;
            expect(typeof useFullRange).toBe('boolean');
        });

        test('should get record index', () => {
            const recIndex = tEdge.getRecIndex(1);
            expect(typeof recIndex).toBe('number');
        });

        test('should set record index', () => {
            tEdge.setRecIndex(1, 5);
            const recIndex = tEdge.getRecIndex(1);
            expect(recIndex).toBe(5);
        });
    });

    describe('utility methods', () => {
        beforeEach(() => {
            const polygon = [
                PointI32.create(0, 0),
                PointI32.create(100, 0),
                PointI32.create(100, 100),
                PointI32.create(0, 100)
            ];
            tEdge.createPath(polygon, PolyType.Subject);
        });

        test('should calculate DX value', () => {
            const dx = tEdge.dx(1);
            expect(typeof dx).toBe('number');
        });

        test('should get side direction', () => {
            const sideDirection = tEdge.side(1);
            expect(typeof sideDirection).toBe('number');
        });

        test('should update coordinates', () => {
            const originalX = tEdge.getX(1, EdgeSide.Current);
            const originalY = tEdge.getY(1, EdgeSide.Current);

            tEdge.update(1, 2, EdgeSide.Current, EdgeSide.Bottom);

            const newX = tEdge.getX(1, EdgeSide.Current);
            const newY = tEdge.getY(1, EdgeSide.Current);

            // Should be able to update without error
            expect(typeof newX).toBe('number');
            expect(typeof newY).toBe('number');
        });

        test('should check use full range', () => {
            const polygon = [
                PointI32.create(0, 0),
                PointI32.create(1000000, 0),
                PointI32.create(1000000, 1000000),
                PointI32.create(0, 1000000)
            ];
            tEdge.dispose();
            tEdge.createPath(polygon, PolyType.Subject);

            const useFullRange = tEdge.isUseFullRange;
            expect(typeof useFullRange).toBe('boolean');
        });

        test('should get record index', () => {
            const recIndex = tEdge.getRecIndex(1);
            expect(typeof recIndex).toBe('number');
        });

        test('should set record index', () => {
            tEdge.setRecIndex(1, 5);
            const recIndex = tEdge.getRecIndex(1);
            expect(recIndex).toBe(5);
        });
    });
});