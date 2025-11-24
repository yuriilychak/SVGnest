import Join from '../join';
import { PointI32 } from '../../geometry/point';
import * as testData from '../__data__/join.json';

// Type definitions for test data
interface TestOperation {
    method: string;
    args: any[];
}

interface TestInput {
    operations: TestOperation[];
}

interface TestOutput {
    length_regular?: number;
    length_ghost?: number;
    getX_0_regular?: number;
    getY_0_regular?: number;
    getX_1_regular?: number;
    getY_1_regular?: number;
    getX_2_regular?: number;
    getY_2_regular?: number;
    getX_0_ghost?: number;
    getY_0_ghost?: number;
    getX_1_ghost?: number;
    getY_1_ghost?: number;
    getX_2_ghost?: number;
    getY_2_ghost?: number;
    getHash1_0_regular?: number;
    getHash1_1_regular?: number;
    getHash1_2_regular?: number;
    getHash1_0_ghost?: number;
    getHash1_1_ghost?: number;
    getHash1_2_ghost?: number;
    getHash2_0?: number;
    getHash2_1?: number;
    getHash2_2?: number;
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
    const join = new Join();
    const results: any = {};

    for (const operation of operations) {
        switch (operation.method) {
            case 'add':
                const point = PointI32.create(operation.args[2].x, operation.args[2].y);
                join.add(operation.args[0], operation.args[1], point);
                break;
            case 'addGhost':
                join.addGhost(operation.args[0], operation.args[1], operation.args[2]);
                break;
            case 'fromGhost':
                join.fromGhost(operation.args[0], operation.args[1]);
                break;
            case 'updateHash':
                join.updateHash(operation.args[0], operation.args[1], operation.args[2]);
                break;
            case 'reset':
                join.reset();
                break;
            case 'clearGhosts':
                join.clearGhosts();
                break;
        }
    }

    // Collect all possible results
    results.length_regular = join.getLength(false);
    results.length_ghost = join.getLength(true);

    // Get values for regular joins (up to 3 indices)
    for (let i = 0; i < Math.min(3, results.length_regular); i++) {
        results[`getX_${i}_regular`] = join.getX(i, false);
        results[`getY_${i}_regular`] = join.getY(i, false);
        results[`getHash1_${i}_regular`] = join.getHash1(i, false);
        results[`getHash2_${i}`] = join.getHash2(i);
    }

    // Get values for ghost joins (up to 3 indices)
    for (let i = 0; i < Math.min(3, results.length_ghost); i++) {
        results[`getX_${i}_ghost`] = join.getX(i, true);
        results[`getY_${i}_ghost`] = join.getY(i, true);
        results[`getHash1_${i}_ghost`] = join.getHash1(i, true);
    }

    return results;
}

describe('Join', () => {
    let join: Join;

    beforeEach(() => {
        join = new Join();
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
        it('should handle index out of bounds gracefully', () => {
            const point = PointI32.create(10, 20);
            join.add(100, 200, point);

            // These operations may cause undefined behavior but shouldn't crash
            expect(() => join.getX(1, false)).toThrow();
            expect(() => join.getY(1, false)).toThrow();
            expect(() => join.getHash1(1, false)).toThrow();
            expect(() => join.getHash2(1)).toThrow();
            expect(() => join.getX(-1, false)).toThrow();
        });

        it('should handle ghost join index out of bounds gracefully', () => {
            join.addGhost(100, 10, 20);

            expect(() => join.getX(1, true)).toThrow();
            expect(() => join.getY(1, true)).toThrow();
            expect(() => join.getHash1(1, true)).toThrow();
            expect(() => join.getX(-1, true)).toThrow();
        });

        it('should handle empty state operations correctly', () => {
            expect(join.getLength(false)).toBe(0);
            expect(join.getLength(true)).toBe(0);

            // These operations should work without issues
            join.reset();
            join.clearGhosts();

            expect(join.getLength(false)).toBe(0);
            expect(join.getLength(true)).toBe(0);
        });

        it('should handle very large numbers', () => {
            // Use values within Int32 range instead of MAX_SAFE_INTEGER
            const largeHash1 = 2147483647; // Max Int32
            const largeHash2 = 2147483646;
            const largeX = 2147483645;
            const largeY = 2147483644;

            const point = PointI32.create(largeX, largeY);
            join.add(largeHash1, largeHash2, point);

            expect(join.getLength(false)).toBe(1);
            expect(join.getX(0, false)).toBe(largeX);
            expect(join.getY(0, false)).toBe(largeY);
            expect(join.getHash1(0, false)).toBe(largeHash1);
            expect(join.getHash2(0)).toBe(largeHash2);
        });

        it('should handle integer precision', () => {
            // PointI32 truncates to integers, so test with integer values
            const point = PointI32.create(10, 20);
            join.add(100, 200, point);

            expect(join.getX(0, false)).toBe(10);
            expect(join.getY(0, false)).toBe(20);
        });
    });

    // Performance tests
    describe('Performance Tests', () => {
        it('should handle large number of additions efficiently', () => {
            const startTime = Date.now();

            // Add 1000 regular joins
            for (let i = 0; i < 1000; i++) {
                const point = PointI32.create(i * 2, i * 3);
                join.add(i, i + 1000, point);
            }

            const endTime = Date.now();
            const duration = endTime - startTime;

            expect(join.getLength(false)).toBe(1000);
            expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
        });

        it('should handle large number of ghost additions efficiently', () => {
            const startTime = Date.now();

            // Add 1000 ghost joins
            for (let i = 0; i < 1000; i++) {
                join.addGhost(i, i * 2, i * 3);
            }

            const endTime = Date.now();
            const duration = endTime - startTime;

            expect(join.getLength(true)).toBe(1000);
            expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
        });
    });

    // State consistency tests
    describe('State Consistency Tests', () => {
        it('should maintain consistent state across multiple operations', () => {
            // Add regular joins
            const point1 = PointI32.create(10, 20);
            const point2 = PointI32.create(30, 40);
            join.add(100, 200, point1);
            join.add(300, 400, point2);

            // Add ghost joins
            join.addGhost(500, 50, 60);
            join.addGhost(600, 70, 80);

            expect(join.getLength(false)).toBe(2);
            expect(join.getLength(true)).toBe(2);

            // Convert ghost to regular
            join.fromGhost(0, 700);

            expect(join.getLength(false)).toBe(3);
            expect(join.getLength(true)).toBe(2);

            // Update hash
            join.updateHash(0, 150, 250);

            expect(join.getHash1(0, false)).toBe(150);
            expect(join.getHash2(0)).toBe(250);

            // Clear ghosts
            join.clearGhosts();

            expect(join.getLength(false)).toBe(3);
            expect(join.getLength(true)).toBe(0);

            // Reset all
            join.reset();

            expect(join.getLength(false)).toBe(0);
            expect(join.getLength(true)).toBe(0);
        });

        it('should handle complex mixed operations correctly', () => {
            // Complex workflow
            const complexPoint = PointI32.create(10, 20);
            join.add(100, 200, complexPoint);
            join.addGhost(300, 30, 40);
            join.fromGhost(0, 400);
            join.updateHash(1, 350, 450);
            join.addGhost(500, 50, 60);
            join.clearGhosts();

            expect(join.getLength(false)).toBe(2);
            expect(join.getLength(true)).toBe(0);
            expect(join.getX(0, false)).toBe(10);
            expect(join.getX(1, false)).toBe(30);
            expect(join.getHash1(1, false)).toBe(350);
            expect(join.getHash2(1)).toBe(450);
        });

        it('should handle repeated reset operations correctly', () => {
            const resetPoint = PointI32.create(10, 20);
            join.add(100, 200, resetPoint);
            join.addGhost(300, 30, 40);

            expect(join.getLength(false)).toBe(1);
            expect(join.getLength(true)).toBe(1);

            join.reset();
            expect(join.getLength(false)).toBe(0);
            expect(join.getLength(true)).toBe(0);

            join.reset();
            expect(join.getLength(false)).toBe(0);
            expect(join.getLength(true)).toBe(0);
        });
    });
});