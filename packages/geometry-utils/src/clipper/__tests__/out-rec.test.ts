import OutRec from '../out-rec';
import { PointI32 } from '../../geometry/point';
import { Direction } from '../enums';
import * as testData from '../__data__/out-rec.json';

// Type definitions for test data
interface TestOperation {
    method: string;
    args: any[];
}

interface TestInput {
    operations: TestOperation[];
}

interface TestOutput {
    strictlySimple?: boolean;
    create_result?: number;
    create_result_0?: number;
    create_result_1?: number;
    fromPoint_result?: number;
    fromPoint_result_0?: number;
    fromPoint_result_1?: number;
    pointX_1?: number;
    pointY_1?: number;
    pointX_2?: number;
    pointY_2?: number;
    getHash_result?: number;
    isUnassigned_result?: boolean;
    isUnassigned_result_0?: boolean;
    isUnassigned_result_1?: boolean;
    currentIndex_result?: number;
    currentIndex_result_0?: number;
    currentIndex_result_1?: number;
    firstLeftIndex_result?: number;
    firstLeftIndex_result_0?: number;
    firstLeftIndex_result_1?: number;
    getOutRec_result?: number;
    getOutRec_result_0?: number;
    getOutRec_result_1?: number;
}

interface TestCase {
    id: string;
    input: TestInput;
    output: TestOutput;
}

interface TestSuite {
    id: string;
    data: TestCase[];
}

interface TestDataStructure {
    suites: TestSuite[];
}

const typedTestData = testData as TestDataStructure;

// Helper function to execute operations and collect results
function executeOperationsAndGetResults(operations: TestOperation[]): any {
    let outRec: OutRec;
    const results: any = {};

    for (let i = 0; i < operations.length; i++) {
        const operation = operations[i];

        switch (operation.method) {
            case 'constructor':
                outRec = new OutRec(operation.args[0], operation.args[1]);
                results.strictlySimple = outRec.strictlySimple;
                break;
            case 'create':
                const createResult = outRec.create(operation.args[0]);
                if (results.create_result === undefined) {
                    results.create_result = createResult;
                } else if (results.create_result_0 === undefined) {
                    results.create_result_0 = results.create_result;
                    results.create_result_1 = createResult;
                } else {
                    results[`create_result_${i}`] = createResult;
                }
                break;
            case 'fromPoint':
                const point = PointI32.create(operation.args[0].x, operation.args[0].y);
                const fromPointResult = outRec.fromPoint(point);
                if (results.fromPoint_result === undefined) {
                    results.fromPoint_result = fromPointResult;
                    results.pointX_1 = outRec.pointX(fromPointResult);
                    results.pointY_1 = outRec.pointY(fromPointResult);
                } else if (results.fromPoint_result_0 === undefined) {
                    results.fromPoint_result_0 = results.fromPoint_result;
                    results.fromPoint_result_1 = fromPointResult;
                    results.pointX_2 = outRec.pointX(fromPointResult);
                    results.pointY_2 = outRec.pointY(fromPointResult);
                } else {
                    results[`fromPoint_result_${i}`] = fromPointResult;
                }
                break;
            case 'getHash':
                results.getHash_result = outRec.getHash(operation.args[0], operation.args[1]);
                break;
            case 'isUnassigned':
                const isUnassignedResult = outRec.isUnassigned(operation.args[0]);
                if (results.isUnassigned_result === undefined) {
                    results.isUnassigned_result = isUnassignedResult;
                } else if (results.isUnassigned_result_0 === undefined) {
                    results.isUnassigned_result_0 = results.isUnassigned_result;
                    results.isUnassigned_result_1 = isUnassignedResult;
                } else {
                    results[`isUnassigned_result_${i}`] = isUnassignedResult;
                }
                break;
            case 'currentIndex':
                const currentIndexResult = outRec.currentIndex(operation.args[0]);
                if (results.currentIndex_result === undefined) {
                    results.currentIndex_result = currentIndexResult;
                } else if (results.currentIndex_result_0 === undefined) {
                    results.currentIndex_result_0 = results.currentIndex_result;
                    results.currentIndex_result_1 = currentIndexResult;
                } else {
                    results[`currentIndex_result_${i}`] = currentIndexResult;
                }
                break;
            case 'firstLeftIndex':
                const firstLeftIndexResult = outRec.firstLeftIndex(operation.args[0]);
                if (results.firstLeftIndex_result === undefined) {
                    results.firstLeftIndex_result = firstLeftIndexResult;
                } else if (results.firstLeftIndex_result_0 === undefined) {
                    results.firstLeftIndex_result_0 = results.firstLeftIndex_result;
                    results.firstLeftIndex_result_1 = firstLeftIndexResult;
                } else {
                    results[`firstLeftIndex_result_${i}`] = firstLeftIndexResult;
                }
                break;
            case 'setHoleState':
                outRec.setHoleState(operation.args[0], operation.args[1], operation.args[2]);
                break;
            case 'getOutRec':
                const getOutRecResult = outRec.getOutRec(operation.args[0]);
                if (results.getOutRec_result === undefined) {
                    results.getOutRec_result = getOutRecResult;
                } else if (results.getOutRec_result_0 === undefined) {
                    results.getOutRec_result_0 = results.getOutRec_result;
                    results.getOutRec_result_1 = getOutRecResult;
                } else {
                    results[`getOutRec_result_${i}`] = getOutRecResult;
                }
                break;
            case 'dispose':
                outRec.dispose();
                break;
        }
    }

    return results;
}

describe('OutRec', () => {
    let outRec: OutRec;

    beforeEach(() => {
        outRec = new OutRec(false, false);
    });

    // Generate tests for each suite
    typedTestData.suites.forEach((suite: TestSuite) => {
        describe(suite.id, () => {
            suite.data.forEach((testCase: TestCase) => {
                it(testCase.id, () => {
                    const actualResults = executeOperationsAndGetResults(testCase.input.operations);

                    // Verify each expected output property
                    Object.keys(testCase.output).forEach(key => {
                        expect(actualResults[key]).toBe(testCase.output[key as keyof TestOutput]);
                    });
                });
            });
        });
    });

    // Additional edge case tests
    describe('Edge Cases and Boundary Testing', () => {
        it('should handle large point coordinates', () => {
            const point = PointI32.create(2147483647, 2147483646);
            const index = outRec.fromPoint(point);

            expect(outRec.pointX(index)).toBe(2147483647);
            expect(outRec.pointY(index)).toBe(2147483646);
        });

        it('should handle negative point coordinates', () => {
            const point = PointI32.create(-1000, -2000);
            const index = outRec.fromPoint(point);

            expect(outRec.pointX(index)).toBe(-1000);
            expect(outRec.pointY(index)).toBe(-2000);
        });

        it('should handle zero coordinates', () => {
            const point = PointI32.create(0, 0);
            const index = outRec.fromPoint(point);

            expect(outRec.pointX(index)).toBe(0);
            expect(outRec.pointY(index)).toBe(0);
        });

        it('should handle multiple dispose operations', () => {
            outRec.create(1);
            outRec.create(2);

            expect(() => {
                outRec.dispose();
                outRec.dispose();
                outRec.dispose();
            }).not.toThrow();
        });

        it('should handle point equality check', () => {
            const point1 = PointI32.create(100, 200);
            const point2 = PointI32.create(100, 200);
            const point3 = PointI32.create(101, 200);

            const index = outRec.fromPoint(point1);

            expect(outRec.pointEqual(index, point2)).toBe(true);
            expect(outRec.pointEqual(index, point3)).toBe(false);
        });
    });

    // Performance tests
    describe('Performance Tests', () => {
        it('should handle large number of record creations efficiently', () => {
            const startTime = Date.now();

            // Create 1000 records
            for (let i = 0; i < 1000; i++) {
                outRec.create(i);
            }

            const endTime = Date.now();
            const duration = endTime - startTime;

            expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
        });

        it('should handle large number of point creations efficiently', () => {
            const startTime = Date.now();

            // Create 1000 points
            for (let i = 0; i < 1000; i++) {
                const point = PointI32.create(i * 2, i * 3);
                outRec.fromPoint(point);
            }

            const endTime = Date.now();
            const duration = endTime - startTime;

            expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
        });
    });

    // State consistency tests
    describe('State Consistency Tests', () => {
        it('should maintain consistent state across multiple operations', () => {
            // Create records
            const rec1 = outRec.create(1);
            const rec2 = outRec.create(2);

            expect(outRec.currentIndex(rec1)).toBe(rec1);
            expect(outRec.currentIndex(rec2)).toBe(rec2);
            expect(outRec.isUnassigned(rec1)).toBe(false);
            expect(outRec.isUnassigned(rec2)).toBe(false);

            // Set hole states
            outRec.setHoleState(rec1, true, rec2);
            expect(outRec.firstLeftIndex(rec1)).toBe(rec2);

            // Check getOutRec
            expect(outRec.getOutRec(rec1)).toBe(rec1);
            expect(outRec.getOutRec(rec2)).toBe(rec2);
        });

        it('should handle complex workflows correctly', () => {
            // Create points and records
            const point1 = PointI32.create(10, 20);
            const point2 = PointI32.create(30, 40);

            const index1 = outRec.fromPoint(point1);
            const index2 = outRec.fromPoint(point2);

            const rec1 = outRec.create(index1);
            const rec2 = outRec.create(index2);

            expect(outRec.pointX(index1)).toBe(10);
            expect(outRec.pointY(index1)).toBe(20);
            expect(outRec.pointX(index2)).toBe(30);
            expect(outRec.pointY(index2)).toBe(40);

            // Test hash generation
            const hash1 = outRec.getHash(rec1, index1);
            const hash2 = outRec.getHash(rec2, index2);

            expect(hash1).not.toBe(hash2);
            expect(typeof hash1).toBe('number');
            expect(typeof hash2).toBe('number');
        });

        it('should handle strictlySimple flag correctly', () => {
            const simpleOutRec = new OutRec(false, true);
            const normalOutRec = new OutRec(false, false);

            expect(simpleOutRec.strictlySimple).toBe(true);
            expect(normalOutRec.strictlySimple).toBe(false);
        });
    });
});