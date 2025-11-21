use crate::clipper::intersect_node::IntersectNode;
use serde_json::Value;
use std::collections::HashMap;

/// Test data structure to match the JSON format
#[derive(Debug)]
struct TestOperation {
    method: String,
    args: Vec<serde_json::Value>,
}

#[derive(Debug)]
struct TestInput {
    operations: Vec<TestOperation>,
}

#[derive(Debug)]
struct TestOutput {
    length: Option<usize>,
    is_empty: Option<bool>,
    get_edge1_index_0: Option<isize>,
    get_edge2_index_0: Option<isize>,
    get_x_0: Option<i32>,
    get_y_0: Option<i32>,
    get_edge1_index_1: Option<isize>,
    get_edge2_index_1: Option<isize>,
    get_x_1: Option<i32>,
    get_y_1: Option<i32>,
    get_edge1_index_2: Option<isize>,
    get_edge2_index_2: Option<isize>,
    get_x_2: Option<i32>,
    get_y_2: Option<i32>,
    get_edge1_index_3: Option<isize>,
    get_edge2_index_3: Option<isize>,
    get_x_3: Option<i32>,
    get_y_3: Option<i32>,
}

#[derive(Debug)]
struct TestCase {
    id: String,
    input: TestInput,
    output: TestOutput,
}

#[derive(Debug)]
struct TestSuite {
    id: String,
    data: Vec<TestCase>,
}

/// Convert floating point value to integer by scaling by 1000 and rounding
fn float_to_scaled_int(value: f64) -> i32 {
    (value * 1000.0).round() as i32
}

/// Convert floating point value to isize by converting to i64 first
fn float_to_isize(value: f64) -> isize {
    value.round() as isize
}

/// Execute operations and collect results
fn execute_operations_and_get_results(
    operations: &[TestOperation],
) -> HashMap<String, serde_json::Value> {
    let mut intersect_node = IntersectNode::new();
    let mut results = HashMap::new();

    for operation in operations {
        match operation.method.as_str() {
            "add" => {
                if operation.args.len() >= 4 {
                    let edge1_index = operation.args[0]
                        .as_f64()
                        .map(float_to_isize)
                        .or_else(|| operation.args[0].as_i64().map(|v| v as isize))
                        .unwrap_or(0);
                    let edge2_index = operation.args[1]
                        .as_f64()
                        .map(float_to_isize)
                        .or_else(|| operation.args[1].as_i64().map(|v| v as isize))
                        .unwrap_or(0);
                    let x = operation.args[2]
                        .as_f64()
                        .map(float_to_scaled_int)
                        .or_else(|| operation.args[2].as_i64().map(|v| v as i32))
                        .unwrap_or(0);
                    let y = operation.args[3]
                        .as_f64()
                        .map(float_to_scaled_int)
                        .or_else(|| operation.args[3].as_i64().map(|v| v as i32))
                        .unwrap_or(0);

                    intersect_node.add(edge1_index, edge2_index, x, y);
                }
            }
            "swap" => {
                if operation.args.len() >= 2 {
                    let index1 = operation.args[0].as_i64().unwrap_or(0) as isize;
                    let index2 = operation.args[1].as_i64().unwrap_or(0) as isize;
                    intersect_node.swap(index1, index2);
                }
            }
            "sort" => {
                intersect_node.sort();
            }
            "clean" => {
                intersect_node.clean();
            }
            _ => {}
        }
    }

    // Collect all possible results
    results.insert(
        "length".to_string(),
        serde_json::Value::Number(serde_json::Number::from(intersect_node.length() as u64)),
    );
    results.insert(
        "isEmpty".to_string(),
        serde_json::Value::Bool(intersect_node.is_empty()),
    );

    // Get values for intersection nodes (up to 4 indices)
    for i in 0..std::cmp::min(4, intersect_node.length()) {
        let i_isize = i as isize;
        results.insert(
            format!("getEdge1Index_{}", i),
            serde_json::Value::Number(serde_json::Number::from(
                intersect_node.get_edge1_index(i_isize) as i64,
            )),
        );
        results.insert(
            format!("getEdge2Index_{}", i),
            serde_json::Value::Number(serde_json::Number::from(
                intersect_node.get_edge2_index(i_isize) as i64,
            )),
        );
        results.insert(
            format!("getX_{}", i),
            serde_json::Value::Number(serde_json::Number::from(
                intersect_node.get_x(i_isize) as i64
            )),
        );
        results.insert(
            format!("getY_{}", i),
            serde_json::Value::Number(serde_json::Number::from(
                intersect_node.get_y(i_isize) as i64
            )),
        );
    }

    results
}

/// Parse test data from JSON content
fn parse_test_data(json_content: &str) -> Vec<TestSuite> {
    let data: Value = serde_json::from_str(json_content).expect("Failed to parse JSON");
    let mut test_suites = Vec::new();

    if let Some(suites) = data.get("suites").and_then(|s| s.as_array()) {
        for suite in suites {
            let suite_id = suite
                .get("id")
                .and_then(|s| s.as_str())
                .unwrap_or("unknown")
                .to_string();
            let mut test_cases = Vec::new();

            if let Some(cases) = suite.get("data").and_then(|d| d.as_array()) {
                for case in cases {
                    let case_id = case
                        .get("id")
                        .and_then(|s| s.as_str())
                        .unwrap_or("unknown")
                        .to_string();

                    // Parse input operations
                    let mut operations = Vec::new();
                    if let Some(input) = case.get("input") {
                        if let Some(ops) = input.get("operations").and_then(|o| o.as_array()) {
                            for op in ops {
                                let method = op
                                    .get("method")
                                    .and_then(|m| m.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                let args = op
                                    .get("args")
                                    .and_then(|a| a.as_array())
                                    .unwrap_or(&Vec::new())
                                    .clone();
                                operations.push(TestOperation { method, args });
                            }
                        }
                    }

                    // Parse expected output
                    let output_data = case.get("output");
                    let output = TestOutput {
                        length: output_data
                            .and_then(|o| o.get("length"))
                            .and_then(|v| v.as_u64().map(|u| u as usize)),
                        is_empty: output_data
                            .and_then(|o| o.get("isEmpty"))
                            .and_then(|v| v.as_bool()),
                        get_edge1_index_0: output_data
                            .and_then(|o| o.get("getEdge1Index_0"))
                            .and_then(|v| v.as_i64().map(|i| i as isize)),
                        get_edge2_index_0: output_data
                            .and_then(|o| o.get("getEdge2Index_0"))
                            .and_then(|v| v.as_i64().map(|i| i as isize)),
                        get_x_0: output_data.and_then(|o| o.get("getX_0")).and_then(|v| {
                            v.as_f64()
                                .map(float_to_scaled_int)
                                .or_else(|| v.as_i64().map(|i| i as i32))
                        }),
                        get_y_0: output_data.and_then(|o| o.get("getY_0")).and_then(|v| {
                            v.as_f64()
                                .map(float_to_scaled_int)
                                .or_else(|| v.as_i64().map(|i| i as i32))
                        }),
                        get_edge1_index_1: output_data
                            .and_then(|o| o.get("getEdge1Index_1"))
                            .and_then(|v| v.as_i64().map(|i| i as isize)),
                        get_edge2_index_1: output_data
                            .and_then(|o| o.get("getEdge2Index_1"))
                            .and_then(|v| v.as_i64().map(|i| i as isize)),
                        get_x_1: output_data.and_then(|o| o.get("getX_1")).and_then(|v| {
                            v.as_f64()
                                .map(float_to_scaled_int)
                                .or_else(|| v.as_i64().map(|i| i as i32))
                        }),
                        get_y_1: output_data.and_then(|o| o.get("getY_1")).and_then(|v| {
                            v.as_f64()
                                .map(float_to_scaled_int)
                                .or_else(|| v.as_i64().map(|i| i as i32))
                        }),
                        get_edge1_index_2: output_data
                            .and_then(|o| o.get("getEdge1Index_2"))
                            .and_then(|v| v.as_i64().map(|i| i as isize)),
                        get_edge2_index_2: output_data
                            .and_then(|o| o.get("getEdge2Index_2"))
                            .and_then(|v| v.as_i64().map(|i| i as isize)),
                        get_x_2: output_data.and_then(|o| o.get("getX_2")).and_then(|v| {
                            v.as_f64()
                                .map(float_to_scaled_int)
                                .or_else(|| v.as_i64().map(|i| i as i32))
                        }),
                        get_y_2: output_data.and_then(|o| o.get("getY_2")).and_then(|v| {
                            v.as_f64()
                                .map(float_to_scaled_int)
                                .or_else(|| v.as_i64().map(|i| i as i32))
                        }),
                        get_edge1_index_3: output_data
                            .and_then(|o| o.get("getEdge1Index_3"))
                            .and_then(|v| v.as_i64().map(|i| i as isize)),
                        get_edge2_index_3: output_data
                            .and_then(|o| o.get("getEdge2Index_3"))
                            .and_then(|v| v.as_i64().map(|i| i as isize)),
                        get_x_3: output_data.and_then(|o| o.get("getX_3")).and_then(|v| {
                            v.as_f64()
                                .map(float_to_scaled_int)
                                .or_else(|| v.as_i64().map(|i| i as i32))
                        }),
                        get_y_3: output_data.and_then(|o| o.get("getY_3")).and_then(|v| {
                            v.as_f64()
                                .map(float_to_scaled_int)
                                .or_else(|| v.as_i64().map(|i| i as i32))
                        }),
                    };

                    test_cases.push(TestCase {
                        id: case_id,
                        input: TestInput { operations },
                        output,
                    });
                }
            }

            test_suites.push(TestSuite {
                id: suite_id,
                data: test_cases,
            });
        }
    }

    test_suites
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_DATA: &str =
        include_str!("../../../../geometry-utils/src/clipper/__data__/intersect-node.json");

    #[test]
    fn test_intersect_node_from_json_data() {
        let test_suites = parse_test_data(TEST_DATA);

        for suite in test_suites {
            println!("Running test suite: {}", suite.id);

            for test_case in suite.data {
                println!("  Running test: {}", test_case.id);

                let actual_results =
                    execute_operations_and_get_results(&test_case.input.operations);

                // Check length
                if let Some(expected_length) = test_case.output.length {
                    let actual_length = actual_results
                        .get("length")
                        .and_then(|v| v.as_u64())
                        .map(|u| u as usize)
                        .unwrap_or(0);
                    assert_eq!(
                        actual_length, expected_length,
                        "Length mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check isEmpty
                if let Some(expected_is_empty) = test_case.output.is_empty {
                    let actual_is_empty = actual_results
                        .get("isEmpty")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    assert_eq!(
                        actual_is_empty, expected_is_empty,
                        "isEmpty mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check edge index getters
                let edge_getters = [
                    (
                        "get_edge1_index_0",
                        test_case.output.get_edge1_index_0,
                        "getEdge1Index_0",
                    ),
                    (
                        "get_edge2_index_0",
                        test_case.output.get_edge2_index_0,
                        "getEdge2Index_0",
                    ),
                    (
                        "get_edge1_index_1",
                        test_case.output.get_edge1_index_1,
                        "getEdge1Index_1",
                    ),
                    (
                        "get_edge2_index_1",
                        test_case.output.get_edge2_index_1,
                        "getEdge2Index_1",
                    ),
                    (
                        "get_edge1_index_2",
                        test_case.output.get_edge1_index_2,
                        "getEdge1Index_2",
                    ),
                    (
                        "get_edge2_index_2",
                        test_case.output.get_edge2_index_2,
                        "getEdge2Index_2",
                    ),
                    (
                        "get_edge1_index_3",
                        test_case.output.get_edge1_index_3,
                        "getEdge1Index_3",
                    ),
                    (
                        "get_edge2_index_3",
                        test_case.output.get_edge2_index_3,
                        "getEdge2Index_3",
                    ),
                ];

                for (desc, expected, key) in edge_getters {
                    if let Some(expected_val) = expected {
                        let actual_val = actual_results.get(key).and_then(|v| v.as_i64());
                        assert_eq!(
                            actual_val,
                            Some(expected_val as i64),
                            "{} mismatch in test: {}",
                            desc,
                            test_case.id
                        );
                    }
                }

                // Check coordinate getters
                let coord_getters = [
                    ("get_x_0", test_case.output.get_x_0, "getX_0"),
                    ("get_y_0", test_case.output.get_y_0, "getY_0"),
                    ("get_x_1", test_case.output.get_x_1, "getX_1"),
                    ("get_y_1", test_case.output.get_y_1, "getY_1"),
                    ("get_x_2", test_case.output.get_x_2, "getX_2"),
                    ("get_y_2", test_case.output.get_y_2, "getY_2"),
                    ("get_x_3", test_case.output.get_x_3, "getX_3"),
                    ("get_y_3", test_case.output.get_y_3, "getY_3"),
                ];

                for (desc, expected, key) in coord_getters {
                    if let Some(expected_val) = expected {
                        let actual_val = actual_results.get(key).and_then(|v| v.as_i64());
                        assert_eq!(
                            actual_val,
                            Some(expected_val as i64),
                            "{} mismatch in test: {}",
                            desc,
                            test_case.id
                        );
                    }
                }
            }
        }
    }

    // Additional edge case tests
    #[test]
    fn test_new_intersect_node() {
        let intersect_node = IntersectNode::new();
        assert_eq!(intersect_node.length(), 0);
        assert!(intersect_node.is_empty());
    }

    #[test]
    fn test_add_intersection_node() {
        let mut intersect_node = IntersectNode::new();

        intersect_node.add(10, 20, 100, 200);

        assert_eq!(intersect_node.length(), 1);
        assert!(!intersect_node.is_empty());
        assert_eq!(intersect_node.get_edge1_index(0), 10);
        assert_eq!(intersect_node.get_edge2_index(0), 20);
        assert_eq!(intersect_node.get_x(0), 100);
        assert_eq!(intersect_node.get_y(0), 200);
    }

    #[test]
    #[should_panic]
    fn test_index_out_of_bounds_edge1_index() {
        let intersect_node = IntersectNode::new();
        intersect_node.get_edge1_index(0); // Should panic on empty list
    }

    #[test]
    #[should_panic]
    fn test_index_out_of_bounds_edge2_index() {
        let intersect_node = IntersectNode::new();
        intersect_node.get_edge2_index(0); // Should panic on empty list
    }

    #[test]
    #[should_panic]
    fn test_index_out_of_bounds_x() {
        let intersect_node = IntersectNode::new();
        intersect_node.get_x(0); // Should panic on empty list
    }

    #[test]
    #[should_panic]
    fn test_index_out_of_bounds_y() {
        let intersect_node = IntersectNode::new();
        intersect_node.get_y(0); // Should panic on empty list
    }

    #[test]
    #[should_panic]
    fn test_swap_out_of_bounds() {
        let mut intersect_node = IntersectNode::new();
        intersect_node.add(1, 2, 10, 20);
        intersect_node.swap(0, 1); // Should panic - index 1 doesn't exist
    }

    #[test]
    fn test_large_numbers() {
        let mut intersect_node = IntersectNode::new();

        // Use values within i32/isize range
        let large_edge1 = 2147483647isize; // Max i32 as isize
        let large_edge2 = 2147483646isize;
        let large_x = 2147483645i32;
        let large_y = 2147483644i32;

        intersect_node.add(large_edge1, large_edge2, large_x, large_y);

        assert_eq!(intersect_node.get_edge1_index(0), large_edge1);
        assert_eq!(intersect_node.get_edge2_index(0), large_edge2);
        assert_eq!(intersect_node.get_x(0), large_x);
        assert_eq!(intersect_node.get_y(0), large_y);
    }

    #[test]
    fn test_negative_coordinates() {
        let mut intersect_node = IntersectNode::new();

        intersect_node.add(-10, -20, -100, -200);

        assert_eq!(intersect_node.get_edge1_index(0), -10);
        assert_eq!(intersect_node.get_edge2_index(0), -20);
        assert_eq!(intersect_node.get_x(0), -100);
        assert_eq!(intersect_node.get_y(0), -200);
    }

    #[test]
    fn test_zero_values() {
        let mut intersect_node = IntersectNode::new();

        intersect_node.add(0, 0, 0, 0);

        assert_eq!(intersect_node.get_edge1_index(0), 0);
        assert_eq!(intersect_node.get_edge2_index(0), 0);
        assert_eq!(intersect_node.get_x(0), 0);
        assert_eq!(intersect_node.get_y(0), 0);
    }

    #[test]
    fn test_sort_by_y_descending() {
        let mut intersect_node = IntersectNode::new();

        // Add nodes with different Y values (not in descending order)
        intersect_node.add(1, 2, 10, 100); // Y = 100
        intersect_node.add(3, 4, 20, 300); // Y = 300 (highest)
        intersect_node.add(5, 6, 30, 200); // Y = 200
        intersect_node.add(7, 8, 40, 50); // Y = 50 (lowest)

        // Sort by Y coordinate in descending order
        intersect_node.sort();

        // Verify sorting: should be 300, 200, 100, 50
        assert_eq!(intersect_node.get_y(0), 300); // Highest Y first
        assert_eq!(intersect_node.get_y(1), 200);
        assert_eq!(intersect_node.get_y(2), 100);
        assert_eq!(intersect_node.get_y(3), 50); // Lowest Y last

        // Verify the corresponding edge indices and X values moved correctly
        assert_eq!(intersect_node.get_edge1_index(0), 3); // From node with Y=300
        assert_eq!(intersect_node.get_x(0), 20);

        assert_eq!(intersect_node.get_edge1_index(1), 5); // From node with Y=200
        assert_eq!(intersect_node.get_x(1), 30);
    }

    #[test]
    fn test_swap_nodes() {
        let mut intersect_node = IntersectNode::new();

        intersect_node.add(1, 2, 10, 20);
        intersect_node.add(3, 4, 30, 40);

        // Swap the two nodes
        intersect_node.swap(0, 1);

        // Verify they were swapped
        assert_eq!(intersect_node.get_edge1_index(0), 3);
        assert_eq!(intersect_node.get_edge2_index(0), 4);
        assert_eq!(intersect_node.get_x(0), 30);
        assert_eq!(intersect_node.get_y(0), 40);

        assert_eq!(intersect_node.get_edge1_index(1), 1);
        assert_eq!(intersect_node.get_edge2_index(1), 2);
        assert_eq!(intersect_node.get_x(1), 10);
        assert_eq!(intersect_node.get_y(1), 20);
    }

    #[test]
    fn test_clean() {
        let mut intersect_node = IntersectNode::new();

        // Add some nodes
        intersect_node.add(1, 2, 10, 20);
        intersect_node.add(3, 4, 30, 40);

        assert_eq!(intersect_node.length(), 2);
        assert!(!intersect_node.is_empty());

        // Clean all nodes
        intersect_node.clean();

        assert_eq!(intersect_node.length(), 0);
        assert!(intersect_node.is_empty());
    }

    #[test]
    fn test_performance() {
        let mut intersect_node = IntersectNode::new();
        let start = std::time::Instant::now();

        // Add 1000 intersection nodes
        for i in 0..1000 {
            intersect_node.add(i as isize, (i + 1000) as isize, i * 2, i * 3);
        }

        // Sort them
        intersect_node.sort();

        let duration = start.elapsed();
        assert_eq!(intersect_node.length(), 1000);
        assert!(duration.as_millis() < 1000); // Should complete in less than 1 second
    }

    #[test]
    fn test_state_consistency() {
        let mut intersect_node = IntersectNode::new();

        // Add intersection nodes
        intersect_node.add(1, 2, 10, 50);
        intersect_node.add(3, 4, 20, 30);
        intersect_node.add(5, 6, 30, 40);

        assert_eq!(intersect_node.length(), 3);
        assert!(!intersect_node.is_empty());

        // Sort by Y descending
        intersect_node.sort();
        assert_eq!(intersect_node.get_y(0), 50); // highest Y first
        assert_eq!(intersect_node.get_y(1), 40);
        assert_eq!(intersect_node.get_y(2), 30); // lowest Y last

        // Swap first and last
        intersect_node.swap(0, 2);
        assert_eq!(intersect_node.get_y(0), 30);
        assert_eq!(intersect_node.get_y(2), 50);

        // Clean should reset everything
        intersect_node.clean();
        assert_eq!(intersect_node.length(), 0);
        assert!(intersect_node.is_empty());
    }
}
