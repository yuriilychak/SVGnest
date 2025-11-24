import LocalMinima from '../local-minima';
import * as testData from '../__data__/local-minima.json';

// Type definitions for test data
interface TestOperation {
    method: string;
    args: any[];
}

interface TestInput {
    operations: TestOperation[];
}

interface TestOutput {
    insertResult?: number;
    insertResults?: number[];
    getY_0?: number;
    getLeftBound_0?: number;
    getRightBound_0?: number;
    getY_1?: number;
    getLeftBound_1?: number;
    getRightBound_1?: number;
    getY_2?: number;
    getLeftBound_2?: number;
    getRightBound_2?: number;
    popResult?: number[];
    popResults?: number[][];
    firstPopResult?: number[];
    error?: string;
    errors?: string[];
    length?: number;
    isEmpty?: boolean;
    minY?: number | null;
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

describe('LocalMinima', () => {
    let localMinima: LocalMinima;

    beforeEach(() => {
        localMinima = new LocalMinima();
    });

    // Helper function to execute operations from test data
    const executeOperations = (operations: TestOperation[]) => {
        const results: any = {};
        const insertResults: number[] = [];
        const popResults: number[][] = [];
        const errors: string[] = [];

        for (const operation of operations) {
            try {
                switch (operation.method) {
                    case 'insert':
                        const insertResult = localMinima.insert(operation.args[0], operation.args[1], operation.args[2]);
                        if (insertResults.length === 0) {
                            results.insertResult = insertResult;
                        }
                        insertResults.push(insertResult);
                        break;
                    case 'pop':
                        const popResult = localMinima.pop();
                        if (popResults.length === 0) {
                            results.popResult = popResult;
                        }
                        popResults.push(popResult);
                        break;
                }
            } catch (error) {
                if (errors.length === 0) {
                    results.error = (error as Error).message;
                }
                errors.push((error as Error).message);
            }
        }

        if (insertResults.length > 1) {
            results.insertResults = insertResults;
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

    // Helper function to get current localMinima state
    const getLocalMinimaState = () => {
        const state: any = {
            length: localMinima.length,
            isEmpty: localMinima.isEmpty,
            minY: isNaN(localMinima.minY) ? null : localMinima.minY
        };

        // Get individual values if there are items
        if (!localMinima.isEmpty) {
            for (let i = 0; i < Math.min(localMinima.length, 3); i++) {
                try {
                    state[`getY_${i}`] = localMinima.getY(i);
                    state[`getLeftBound_${i}`] = localMinima.getLeftBound(i);
                    state[`getRightBound_${i}`] = localMinima.getRightBound(i);
                } catch (e) {
                    // Index out of bounds, skip
                }
            }
        }

        return state;
    };

    (testData as { suites: TestSuite[] }).suites.forEach((suite) => {
        describe(suite.id, () => {
            suite.data.forEach((testCase) => {
                it(testCase.id, () => {
                    const executionResults = executeOperations(testCase.input.operations);
                    const currentState = getLocalMinimaState();

                    // Check insert result
                    if ('insertResult' in testCase.output) {
                        expect(executionResults.insertResult).toBe(testCase.output.insertResult);
                    }

                    // Check multiple insert results
                    if ('insertResults' in testCase.output) {
                        expect(executionResults.insertResults).toEqual(testCase.output.insertResults);
                    }

                    // Check getter methods for index 0
                    if ('getY_0' in testCase.output) {
                        expect(currentState.getY_0).toBe(testCase.output.getY_0);
                    }
                    if ('getLeftBound_0' in testCase.output) {
                        expect(currentState.getLeftBound_0).toBe(testCase.output.getLeftBound_0);
                    }
                    if ('getRightBound_0' in testCase.output) {
                        expect(currentState.getRightBound_0).toBe(testCase.output.getRightBound_0);
                    }

                    // Check getter methods for index 1
                    if ('getY_1' in testCase.output) {
                        expect(currentState.getY_1).toBe(testCase.output.getY_1);
                    }
                    if ('getLeftBound_1' in testCase.output) {
                        expect(currentState.getLeftBound_1).toBe(testCase.output.getLeftBound_1);
                    }
                    if ('getRightBound_1' in testCase.output) {
                        expect(currentState.getRightBound_1).toBe(testCase.output.getRightBound_1);
                    }

                    // Check getter methods for index 2
                    if ('getY_2' in testCase.output) {
                        expect(currentState.getY_2).toBe(testCase.output.getY_2);
                    }
                    if ('getLeftBound_2' in testCase.output) {
                        expect(currentState.getLeftBound_2).toBe(testCase.output.getLeftBound_2);
                    }
                    if ('getRightBound_2' in testCase.output) {
                        expect(currentState.getRightBound_2).toBe(testCase.output.getRightBound_2);
                    }

                    // Check single pop result
                    if ('popResult' in testCase.output) {
                        expect(executionResults.popResult).toEqual(testCase.output.popResult);
                    }

                    // Check multiple pop results
                    if ('popResults' in testCase.output) {
                        expect(executionResults.popResults).toEqual(testCase.output.popResults);
                    }

                    // Check first pop result (for cases where pop succeeds then fails)
                    if ('firstPopResult' in testCase.output) {
                        expect(executionResults.firstPopResult).toEqual(testCase.output.firstPopResult);
                    }

                    // Check length
                    if ('length' in testCase.output) {
                        expect(currentState.length).toBe(testCase.output.length);
                    }

                    // Check isEmpty state
                    if ('isEmpty' in testCase.output) {
                        expect(currentState.isEmpty).toBe(testCase.output.isEmpty);
                    }

                    // Check minY value
                    if ('minY' in testCase.output) {
                        if (testCase.output.minY === null) {
                            expect(currentState.minY).toBeNull();
                        } else {
                            expect(currentState.minY).toBe(testCase.output.minY);
                        }
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
            const index = localMinima.insert(largeNumber, largeNumber - 100, largeNumber + 100);
            expect(index).toBe(0);
            expect(localMinima.getY(0)).toBe(largeNumber);
            expect(localMinima.getLeftBound(0)).toBe(largeNumber - 100);
            expect(localMinima.getRightBound(0)).toBe(largeNumber + 100);
        });

        it('should handle very small numbers', () => {
            const smallNumber = Number.MIN_SAFE_INTEGER;
            const index = localMinima.insert(smallNumber, smallNumber - 100, smallNumber + 100);
            expect(index).toBe(0);
            expect(localMinima.getY(0)).toBe(smallNumber);
            expect(localMinima.getLeftBound(0)).toBe(smallNumber - 100);
            expect(localMinima.getRightBound(0)).toBe(smallNumber + 100);
        });

        it('should handle floating point precision', () => {
            const y1 = 0.1 + 0.2; // 0.30000000000000004
            const y2 = 0.3;
            localMinima.insert(y1, 0, 1);
            localMinima.insert(y2, 1, 2);

            expect(localMinima.length).toBe(2);
            expect(localMinima.getY(0)).toBeCloseTo(y1, 10);
            expect(localMinima.getY(1)).toBeCloseTo(y2, 10);
        });

        it('should handle insertion of Infinity', () => {
            localMinima.insert(Infinity, 100, 200);
            localMinima.insert(50, 25, 75);
            localMinima.insert(-Infinity, -200, -100);

            expect(localMinima.getY(0)).toBe(Infinity);
            expect(localMinima.getY(1)).toBe(50);
            expect(localMinima.getY(2)).toBe(-Infinity);
        });

        it('should handle index out of bounds gracefully', () => {
            localMinima.insert(10, 5, 15);

            // These should throw errors for out of bounds access
            expect(() => localMinima.getY(1)).toThrow();
            expect(() => localMinima.getLeftBound(1)).toThrow();
            expect(() => localMinima.getRightBound(1)).toThrow();
            expect(() => localMinima.getY(-1)).toThrow();
        });
    });

    // Performance test to ensure the class works efficiently
    describe('Performance Tests', () => {
        it('should handle large number of insertions efficiently', () => {
            const startTime = Date.now();

            // Insert 1000 minima with random Y values
            for (let i = 0; i < 1000; i++) {
                const y = Math.random() * 1000;
                localMinima.insert(y, y - 10, y + 10);
            }

            const endTime = Date.now();
            const duration = endTime - startTime;

            // Should complete within reasonable time (adjust threshold as needed)
            expect(duration).toBeLessThan(1000); // 1 second
            expect(localMinima.length).toBe(1000);
            expect(localMinima.isEmpty).toBe(false);
        });

        it('should handle bulk pop operations efficiently', () => {
            // Insert many items first
            for (let i = 100; i >= 1; i--) {
                localMinima.insert(i, i - 1, i + 1);
            }

            const startTime = Date.now();

            // Pop all items
            while (!localMinima.isEmpty) {
                localMinima.pop();
            }

            const endTime = Date.now();
            const duration = endTime - startTime;

            expect(duration).toBeLessThan(1000); // 1 second
            expect(localMinima.isEmpty).toBe(true);
            expect(localMinima.length).toBe(0);
        });
    });

    // Test internal state consistency
    describe('State Consistency Tests', () => {
        it('should maintain consistent state across multiple operations', () => {
            // Perform a series of operations and verify state consistency
            const index1 = localMinima.insert(20, 10, 30);
            expect(index1).toBe(0);
            expect(localMinima.length).toBe(1);
            expect(localMinima.minY).toBe(20);

            const index2 = localMinima.insert(10, 5, 15);
            expect(index2).toBe(1);
            expect(localMinima.length).toBe(2);
            expect(localMinima.minY).toBe(20); // minY should be the first (highest Y)

            const index3 = localMinima.insert(30, 25, 35);
            expect(index3).toBe(0);
            expect(localMinima.length).toBe(3);

            const popped = localMinima.pop();
            expect(popped).toEqual([25, 35]);
            expect(localMinima.length).toBe(2);
            expect(localMinima.minY).toBe(20);
        });

        it('should properly handle state after error conditions', () => {
            // Verify state remains consistent even after errors
            expect(() => localMinima.pop()).toThrow('No minima to pop');
            expect(localMinima.isEmpty).toBe(true);
            expect(localMinima.length).toBe(0);

            // Should still be able to insert after error
            localMinima.insert(42, 21, 63);
            expect(localMinima.isEmpty).toBe(false);
            expect(localMinima.length).toBe(1);
            expect(localMinima.minY).toBe(42);
        });

        it('should maintain correct ordering with duplicate Y values', () => {
            // Insert multiple items with same Y value
            const index1 = localMinima.insert(10, 0, 5);
            const index2 = localMinima.insert(10, 5, 10);
            const index3 = localMinima.insert(10, 10, 15);

            expect(index1).toBe(0);
            expect(index2).toBe(0);
            expect(index3).toBe(0);

            // They should be inserted at the beginning due to >= comparison
            expect(localMinima.getLeftBound(0)).toBe(10); // last inserted
            expect(localMinima.getLeftBound(1)).toBe(5);
            expect(localMinima.getLeftBound(2)).toBe(0); // first inserted
        });
    });
});