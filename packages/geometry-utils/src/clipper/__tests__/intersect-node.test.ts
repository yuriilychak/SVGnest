import IntersectNode from '../intersect-node';
import * as testData from '../__data__/intersect-node.json';

// Type definitions for test data
interface TestOperation {
    method: string;
    args: any[];
}

interface TestInput {
    operations: TestOperation[];
}

interface TestOutput {
    length?: number;
    isEmpty?: boolean;
    getEdge1Index_0?: number;
    getEdge2Index_0?: number;
    getX_0?: number;
    getY_0?: number;
    getEdge1Index_1?: number;
    getEdge2Index_1?: number;
    getX_1?: number;
    getY_1?: number;
    getEdge1Index_2?: number;
    getEdge2Index_2?: number;
    getX_2?: number;
    getY_2?: number;
    getEdge1Index_3?: number;
    getEdge2Index_3?: number;
    getX_3?: number;
    getY_3?: number;
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

describe('IntersectNode', () => {
    let intersectNode: IntersectNode;

    beforeEach(() => {
        intersectNode = new IntersectNode();
    });

    // Helper function to execute operations from test data
    const executeOperations = (operations: TestOperation[]) => {
        const results: any = {};

        for (const operation of operations) {
            switch (operation.method) {
                case 'add':
                    intersectNode.add(operation.args[0], operation.args[1], operation.args[2], operation.args[3]);
                    break;
                case 'swap':
                    intersectNode.swap(operation.args[0], operation.args[1]);
                    break;
                case 'sort':
                    intersectNode.sort();
                    break;
                case 'clean':
                    intersectNode.clean();
                    break;
            }
        }

        return results;
    };

    // Helper function to get current intersectNode state
    const getIntersectNodeState = () => {
        const state: any = {
            length: intersectNode.length,
            isEmpty: intersectNode.isEmpty
        };

        // Get individual values if there are items
        if (!intersectNode.isEmpty) {
            for (let i = 0; i < Math.min(intersectNode.length, 4); i++) {
                try {
                    state[`getEdge1Index_${i}`] = intersectNode.getEdge1Index(i);
                    state[`getEdge2Index_${i}`] = intersectNode.getEdge2Index(i);
                    state[`getX_${i}`] = intersectNode.getX(i);
                    state[`getY_${i}`] = intersectNode.getY(i);
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
                    const currentState = getIntersectNodeState();

                    // Check length
                    if ('length' in testCase.output) {
                        expect(currentState.length).toBe(testCase.output.length);
                    }

                    // Check isEmpty state
                    if ('isEmpty' in testCase.output) {
                        expect(currentState.isEmpty).toBe(testCase.output.isEmpty);
                    }

                    // Check getter methods for indices 0-3
                    for (let i = 0; i < 4; i++) {
                        if (`getEdge1Index_${i}` in testCase.output) {
                            expect(currentState[`getEdge1Index_${i}`]).toBe(testCase.output[`getEdge1Index_${i}` as keyof TestOutput]);
                        }
                        if (`getEdge2Index_${i}` in testCase.output) {
                            expect(currentState[`getEdge2Index_${i}`]).toBe(testCase.output[`getEdge2Index_${i}` as keyof TestOutput]);
                        }
                        if (`getX_${i}` in testCase.output) {
                            expect(currentState[`getX_${i}`]).toBe(testCase.output[`getX_${i}` as keyof TestOutput]);
                        }
                        if (`getY_${i}` in testCase.output) {
                            expect(currentState[`getY_${i}`]).toBe(testCase.output[`getY_${i}` as keyof TestOutput]);
                        }
                    }
                });
            });
        });
    });

    // Additional edge case tests to ensure comprehensive coverage
    describe('Edge Cases and Boundary Testing', () => {
        it('should handle very large numbers', () => {
            const largeNumber = Number.MAX_SAFE_INTEGER;
            intersectNode.add(largeNumber, largeNumber - 1, largeNumber - 100, largeNumber - 200);
            
            expect(intersectNode.length).toBe(1);
            expect(intersectNode.getEdge1Index(0)).toBe(largeNumber);
            expect(intersectNode.getEdge2Index(0)).toBe(largeNumber - 1);
            expect(intersectNode.getX(0)).toBe(largeNumber - 100);
            expect(intersectNode.getY(0)).toBe(largeNumber - 200);
        });

        it('should handle very small numbers', () => {
            const smallNumber = Number.MIN_SAFE_INTEGER;
            intersectNode.add(smallNumber, smallNumber + 1, smallNumber + 100, smallNumber + 200);
            
            expect(intersectNode.length).toBe(1);
            expect(intersectNode.getEdge1Index(0)).toBe(smallNumber);
            expect(intersectNode.getEdge2Index(0)).toBe(smallNumber + 1);
            expect(intersectNode.getX(0)).toBe(smallNumber + 100);
            expect(intersectNode.getY(0)).toBe(smallNumber + 200);
        });

        it('should handle floating point precision', () => {
            const x1 = 0.1 + 0.2; // 0.30000000000000004
            const x2 = 0.3;
            const y1 = 0.7 + 0.1; // 0.7999999999999999
            const y2 = 0.8;
            
            intersectNode.add(1, 2, x1, y1);
            intersectNode.add(3, 4, x2, y2);
            
            expect(intersectNode.length).toBe(2);
            expect(intersectNode.getX(0)).toBeCloseTo(x1, 10);
            expect(intersectNode.getY(0)).toBeCloseTo(y1, 10);
            expect(intersectNode.getX(1)).toBeCloseTo(x2, 10);
            expect(intersectNode.getY(1)).toBeCloseTo(y2, 10);
        });

        it('should handle Infinity values', () => {
            intersectNode.add(1, 2, Infinity, -Infinity);
            intersectNode.add(3, 4, -Infinity, Infinity);
            
            expect(intersectNode.length).toBe(2);
            expect(intersectNode.getX(0)).toBe(Infinity);
            expect(intersectNode.getY(0)).toBe(-Infinity);
            expect(intersectNode.getX(1)).toBe(-Infinity);
            expect(intersectNode.getY(1)).toBe(Infinity);
        });

        it('should handle index out of bounds gracefully', () => {
            intersectNode.add(1, 2, 10, 20);
            
            // These should throw errors for out of bounds access
            expect(() => intersectNode.getEdge1Index(1)).toThrow();
            expect(() => intersectNode.getEdge2Index(1)).toThrow();
            expect(() => intersectNode.getX(1)).toThrow();
            expect(() => intersectNode.getY(1)).toThrow();
            expect(() => intersectNode.getEdge1Index(-1)).toThrow();
        });


    });

    // Performance test to ensure the class works efficiently
    describe('Performance Tests', () => {
        it('should handle large number of additions efficiently', () => {
            const startTime = Date.now();
            
            // Add 1000 intersection nodes
            for (let i = 0; i < 1000; i++) {
                intersectNode.add(i, i + 1000, Math.random() * 1000, Math.random() * 1000);
            }
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            // Should complete within reasonable time (adjust threshold as needed)
            expect(duration).toBeLessThan(1000); // 1 second
            expect(intersectNode.length).toBe(1000);
            expect(intersectNode.isEmpty).toBe(false);
        });

        it('should handle sort operation efficiently on large dataset', () => {
            // Add many nodes with random Y values
            for (let i = 0; i < 500; i++) {
                intersectNode.add(i, i + 500, i, Math.random() * 1000);
            }
            
            const startTime = Date.now();
            intersectNode.sort();
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            expect(duration).toBeLessThan(1000); // 1 second
            expect(intersectNode.length).toBe(500);
            
            // Verify sort order (descending Y)
            for (let i = 0; i < intersectNode.length - 1; i++) {
                expect(intersectNode.getY(i)).toBeGreaterThanOrEqual(intersectNode.getY(i + 1));
            }
        });
    });

    // Test internal state consistency
    describe('State Consistency Tests', () => {
        it('should maintain consistent state across multiple operations', () => {
            // Perform a series of operations and verify state consistency
            intersectNode.add(1, 2, 10, 30);
            expect(intersectNode.length).toBe(1);
            expect(intersectNode.isEmpty).toBe(false);
            
            intersectNode.add(3, 4, 20, 20);
            intersectNode.add(5, 6, 30, 40);
            expect(intersectNode.length).toBe(3);
            
            // Sort by Y descending
            intersectNode.sort();
            expect(intersectNode.getY(0)).toBe(40); // highest Y first
            expect(intersectNode.getY(1)).toBe(30);
            expect(intersectNode.getY(2)).toBe(20); // lowest Y last
            
            // Swap first and last
            intersectNode.swap(0, 2);
            expect(intersectNode.getY(0)).toBe(20);
            expect(intersectNode.getY(2)).toBe(40);
            
            // Clean should reset everything
            intersectNode.clean();
            expect(intersectNode.length).toBe(0);
            expect(intersectNode.isEmpty).toBe(true);
        });

        it('should handle complex sort scenarios correctly', () => {
            // Add nodes with same Y values to test stable sorting
            intersectNode.add(1, 2, 10, 25);
            intersectNode.add(3, 4, 20, 25);
            intersectNode.add(5, 6, 30, 25);
            intersectNode.add(7, 8, 40, 35);
            intersectNode.add(9, 10, 50, 15);
            
            intersectNode.sort();
            
            // Verify descending Y order
            expect(intersectNode.getY(0)).toBe(35);
            expect(intersectNode.getY(1)).toBe(25);
            expect(intersectNode.getY(2)).toBe(25);
            expect(intersectNode.getY(3)).toBe(25);
            expect(intersectNode.getY(4)).toBe(15);
            
            // Verify the highest Y is first
            expect(intersectNode.getEdge1Index(0)).toBe(7);
            expect(intersectNode.getEdge1Index(4)).toBe(9); // lowest Y is last
        });

        it('should handle empty state operations correctly', () => {
            // Operations on empty state should not cause errors
            expect(intersectNode.isEmpty).toBe(true);
            expect(intersectNode.length).toBe(0);
            
            intersectNode.sort(); // Should not throw
            expect(intersectNode.isEmpty).toBe(true);
            
            intersectNode.clean(); // Should not throw
            expect(intersectNode.isEmpty).toBe(true);
            
            // Adding after operations on empty state should work
            intersectNode.add(1, 2, 10, 20);
            expect(intersectNode.isEmpty).toBe(false);
            expect(intersectNode.length).toBe(1);
        });
    });
});