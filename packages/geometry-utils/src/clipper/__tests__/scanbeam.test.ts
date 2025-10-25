import Scanbeam from '../scanbeam';
import * as testData from '../__data__/scanbeam.json';

// Type definitions for test data
interface TestOperation {
    method: string;
    args: any[];
}

interface TestInput {
    operations: TestOperation[];
}

interface TestOutput {
    values?: number[];
    isEmpty?: boolean;
    popResult?: number;
    popResults?: number[];
    firstPopResult?: number;
    error?: string;
    errors?: string[];
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

describe('Scanbeam', () => {
    let scanbeam: Scanbeam;

    beforeEach(() => {
        scanbeam = new Scanbeam();
    });

    // Helper function to execute operations from test data
    const executeOperations = (operations: Array<{ method: string; args: any[] }>) => {
        const results: any = {};
        const popResults: number[] = [];
        const errors: string[] = [];

        for (const operation of operations) {
            try {
                switch (operation.method) {
                    case 'insert':
                        scanbeam.insert(operation.args[0]);
                        break;
                    case 'pop':
                        const popResult = scanbeam.pop();
                        if (popResults.length === 0) {
                            results.popResult = popResult;
                        }
                        popResults.push(popResult);
                        break;
                    case 'clean':
                        scanbeam.clean();
                        break;
                }
            } catch (error) {
                if (errors.length === 0) {
                    results.error = (error as Error).message;
                }
                errors.push((error as Error).message);
            }
        }

        if (popResults.length > 1) {
            results.popResults = popResults;
        }
        if (errors.length > 1) {
            results.errors = errors;
        }
        if (popResults.length === 1 && errors.length === 1) {
            results.firstPopResult = popResults[0];
        }

        return results;
    };

    // Helper function to get current scanbeam state
    const getScanbeamState = () => {
        return {
            values: (scanbeam as any).values, // Access private property for testing
            isEmpty: scanbeam.isEmpty
        };
    };

    (testData as { suites: TestSuite[] }).suites.forEach((suite) => {
        describe(suite.id, () => {
            suite.data.forEach((testCase) => {
                it(testCase.id, () => {
                    const executionResults = executeOperations(testCase.input.operations);
                    const currentState = getScanbeamState();

                    // Check values array
                    if ('values' in testCase.output) {
                        expect(currentState.values).toEqual(testCase.output.values);
                    }

                    // Check isEmpty state
                    if ('isEmpty' in testCase.output) {
                        expect(currentState.isEmpty).toBe(testCase.output.isEmpty);
                    }

                    // Check single pop result
                    if ('popResult' in testCase.output) {
                        expect(executionResults.popResult).toBe(testCase.output.popResult);
                    }

                    // Check multiple pop results
                    if ('popResults' in testCase.output) {
                        expect(executionResults.popResults).toEqual(testCase.output.popResults);
                    }

                    // Check first pop result (for cases where pop succeeds then fails)
                    if ('firstPopResult' in testCase.output) {
                        expect(executionResults.firstPopResult).toBe(testCase.output.firstPopResult);
                    }

                    // Check single error
                    if ('error' in testCase.output) {
                        expect(executionResults.error).toBe(testCase.output.error);
                    }

                    // Check multiple errors
                    if ('errors' in testCase.output) {
                        expect(executionResults.errors).toEqual(testCase.output.errors);
                    }
                });
            });
        });
    });

    // Additional edge case tests to ensure comprehensive coverage
    describe('Edge Cases and Boundary Testing', () => {
        it('should handle very large numbers', () => {
            const largeNumber = Number.MAX_SAFE_INTEGER;
            scanbeam.insert(largeNumber);
            expect(scanbeam.isEmpty).toBe(false);
            expect(scanbeam.pop()).toBe(largeNumber);
            expect(scanbeam.isEmpty).toBe(true);
        });

        it('should handle very small numbers', () => {
            const smallNumber = Number.MIN_SAFE_INTEGER;
            scanbeam.insert(smallNumber);
            expect(scanbeam.isEmpty).toBe(false);
            expect(scanbeam.pop()).toBe(smallNumber);
            expect(scanbeam.isEmpty).toBe(true);
        });

        it('should maintain sorted order with floating point precision', () => {
            const values = [0.1 + 0.2, 0.3, 0.30000000000000004];
            values.forEach(val => scanbeam.insert(val));

            // Due to floating point precision, 0.1 + 0.2 equals 0.30000000000000004
            // So we should have two distinct values: 0.30000000000000004 and 0.3
            expect(scanbeam.isEmpty).toBe(false);
            expect(scanbeam.pop()).toBeCloseTo(0.3, 10);
            expect(scanbeam.pop()).toBeCloseTo(0.3, 10);
            expect(scanbeam.isEmpty).toBe(true);
        });

        it('should handle insertion of NaN (edge case)', () => {
            scanbeam.insert(NaN);
            scanbeam.insert(5);
            scanbeam.insert(NaN);

            // NaN comparisons are always false, so behavior might be unexpected
            // This test documents the current behavior
            expect(scanbeam.isEmpty).toBe(false);
        });

        it('should handle insertion of Infinity', () => {
            scanbeam.insert(Infinity);
            scanbeam.insert(100);
            scanbeam.insert(-Infinity);

            expect(scanbeam.pop()).toBe(Infinity);
            expect(scanbeam.pop()).toBe(100);
            expect(scanbeam.pop()).toBe(-Infinity);
            expect(scanbeam.isEmpty).toBe(true);
        });
    });

    // Performance test to ensure the class works efficiently
    describe('Performance Tests', () => {
        it('should handle large number of insertions efficiently', () => {
            const startTime = Date.now();

            // Insert 1000 random values
            for (let i = 0; i < 1000; i++) {
                scanbeam.insert(Math.random() * 1000);
            }

            const endTime = Date.now();
            const duration = endTime - startTime;

            // Should complete within reasonable time (adjust threshold as needed)
            expect(duration).toBeLessThan(1000); // 1 second
            expect(scanbeam.isEmpty).toBe(false);

            // Clean up for memory
            scanbeam.clean();
            expect(scanbeam.isEmpty).toBe(true);
        });
    });

    // Test internal state consistency
    describe('State Consistency Tests', () => {
        it('should maintain consistent state across multiple operations', () => {
            // Perform a series of operations and verify state consistency
            scanbeam.insert(10);
            expect(scanbeam.isEmpty).toBe(false);

            scanbeam.insert(5);
            scanbeam.insert(15);
            expect((scanbeam as any).values).toEqual([15, 10, 5]);

            const popped = scanbeam.pop();
            expect(popped).toBe(15);
            expect((scanbeam as any).values).toEqual([10, 5]);
            expect(scanbeam.isEmpty).toBe(false);

            scanbeam.clean();
            expect((scanbeam as any).values).toEqual([]);
            expect(scanbeam.isEmpty).toBe(true);
        });

        it('should properly handle state after error conditions', () => {
            // Verify state remains consistent even after errors
            expect(() => scanbeam.pop()).toThrow('ScanbeamManager is empty');
            expect(scanbeam.isEmpty).toBe(true);

            // Should still be able to insert after error
            scanbeam.insert(42);
            expect(scanbeam.isEmpty).toBe(false);
            expect(scanbeam.pop()).toBe(42);
        });
    });
});