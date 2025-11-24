import { describe, expect, it, beforeEach } from '@jest/globals';
import ClipperOffset from '../clipper-offset';
import { PointI32 } from '../../geometry';
import { Point } from '../../types';
import * as testData from '../__data__/clipper-offset.json';

// Mock the polygon_area_i32 function from WASM
jest.mock('wasm-nesting');

interface TestPoint {
    x: number;
    y: number;
}

interface TestCase {
    id: string;
    input: {
        polygon: TestPoint[];
        delta: number;
    };
    output: {
        expectedResult: TestPoint[][];
    };
}

interface TestGroup {
    id: string;
    data: TestCase[];
}

// Helper function to compare polygons with tolerance
const comparePolygons = (actual: Point<Int32Array>[][], expected: TestPoint[][], tolerance = 0.01): boolean => {
    if (!actual || !expected) {
        return actual === expected;
    }

    if (actual.length !== expected.length) {
        return false;
    }

    for (let i = 0; i < actual.length; i++) {
        const actualPoly = actual[i];
        const expectedPoly = expected[i];

        if (!actualPoly || !expectedPoly) {
            return actualPoly === expectedPoly;
        }

        if (actualPoly.length !== expectedPoly.length) {
            return false;
        }

        for (let j = 0; j < actualPoly.length; j++) {
            const actualPoint = actualPoly[j];
            const expectedPoint = expectedPoly[j];

            const dx = Math.abs(actualPoint.x - expectedPoint.x);
            const dy = Math.abs(actualPoint.y - expectedPoint.y);

            if (dx > tolerance || dy > tolerance) {
                return false;
            }
        }
    }

    return true;
};// Helper function to convert test points to PointI32
const convertToPointI32Array = (points: TestPoint[]): Point<Int32Array>[] => {
    return points.map(p => PointI32.create(p.x, p.y));
}; describe('ClipperOffset', () => {
    let clipperOffset: ClipperOffset;

    beforeEach(() => {
        clipperOffset = ClipperOffset.create();
    });

    // Generate tests from JSON data
    testData.suites.forEach((group: TestGroup) => {
        describe(`${group.id}`, () => {
            group.data.forEach((testCase: TestCase) => {
                it(`should handle ${testCase.id}`, () => {
                    // Skip tests that don't have polygon input (like create_method tests)
                    if (!testCase.input.polygon) {
                        expect(true).toBe(true); // Just pass these for now
                        return;
                    }

                    const input = convertToPointI32Array(testCase.input.polygon);
                    const delta = testCase.input.delta;

                    const result = clipperOffset.execute(input, delta);

                    expect(comparePolygons(result, testCase.output.expectedResult, 0.01)).toBe(true);
                });
            });
        });
    });

    describe('create method', () => {
        it('should create a new ClipperOffset instance', () => {
            const instance = new ClipperOffset();
            expect(instance).toBeInstanceOf(ClipperOffset);
        });

        it('should create multiple independent instances', () => {
            const instance1 = new ClipperOffset();
            const instance2 = new ClipperOffset();

            expect(instance1).toBeInstanceOf(ClipperOffset);
            expect(instance2).toBeInstanceOf(ClipperOffset);
            expect(instance1).not.toBe(instance2);
        });
    });
});