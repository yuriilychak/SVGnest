use crate::clipper::join::Join;
use crate::geometry::point::Point;
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
    length_regular: Option<usize>,
    length_ghost: Option<usize>,
    get_x_0_regular: Option<i32>,
    get_y_0_regular: Option<i32>,
    get_x_1_regular: Option<i32>,
    get_y_1_regular: Option<i32>,
    get_x_2_regular: Option<i32>,
    get_y_2_regular: Option<i32>,
    get_x_0_ghost: Option<i32>,
    get_y_0_ghost: Option<i32>,
    get_x_1_ghost: Option<i32>,
    get_y_1_ghost: Option<i32>,
    get_x_2_ghost: Option<i32>,
    get_y_2_ghost: Option<i32>,
    get_hash1_0_regular: Option<isize>,
    get_hash1_1_regular: Option<isize>,
    get_hash1_2_regular: Option<isize>,
    get_hash1_0_ghost: Option<isize>,
    get_hash1_1_ghost: Option<isize>,
    get_hash1_2_ghost: Option<isize>,
    get_hash2_0: Option<isize>,
    get_hash2_1: Option<isize>,
    get_hash2_2: Option<isize>,
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

/// Execute operations and collect results
fn execute_operations_and_get_results(operations: &[TestOperation]) -> HashMap<String, serde_json::Value> {
    let mut join = Join::new();
    let mut results = HashMap::new();

    for operation in operations {
        match operation.method.as_str() {
            "add" => {
                if operation.args.len() >= 3 {
                    let out_hash1 = operation.args[0].as_i64().unwrap_or(0) as isize;
                    let out_hash2 = operation.args[1].as_i64().unwrap_or(0) as isize;
                    
                    if let Some(point_obj) = operation.args[2].as_object() {
                        let x = point_obj.get("x").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                        let y = point_obj.get("y").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                        let point = Point::new(Some(x), Some(y));
                        join.add(out_hash1, out_hash2, &point);
                    }
                }
            }
            "addGhost" => {
                if operation.args.len() >= 3 {
                    let hash = operation.args[0].as_i64().unwrap_or(0) as isize;
                    let x = operation.args[1].as_i64().unwrap_or(0) as i32;
                    let y = operation.args[2].as_i64().unwrap_or(0) as i32;
                    join.add_ghost(hash, x, y);
                }
            }
            "fromGhost" => {
                if operation.args.len() >= 2 {
                    let index = operation.args[0].as_i64().unwrap_or(0) as isize;
                    let hash = operation.args[1].as_i64().unwrap_or(0) as isize;
                    join.from_ghost(index, hash);
                }
            }
            "updateHash" => {
                if operation.args.len() >= 3 {
                    let index = operation.args[0].as_i64().unwrap_or(0) as isize;
                    let hash1 = operation.args[1].as_i64().unwrap_or(0) as isize;
                    let hash2 = operation.args[2].as_i64().unwrap_or(0) as isize;
                    join.update_hash(index, hash1, hash2);
                }
            }
            "reset" => {
                join.reset();
            }
            "clearGhosts" => {
                join.clear_ghosts();
            }
            _ => {}
        }
    }

    // Collect all possible results
    results.insert(
        "length_regular".to_string(),
        serde_json::Value::Number(serde_json::Number::from(join.get_length(false))),
    );
    results.insert(
        "length_ghost".to_string(),
        serde_json::Value::Number(serde_json::Number::from(join.get_length(true))),
    );

    // Get values for regular joins (up to 3 indices)
    for i in 0..std::cmp::min(3, join.get_length(false)) {
        let i_isize = i as isize;
        results.insert(
            format!("getX_{}_regular", i),
            serde_json::Value::Number(serde_json::Number::from(join.get_x(i_isize, false))),
        );
        results.insert(
            format!("getY_{}_regular", i),
            serde_json::Value::Number(serde_json::Number::from(join.get_y(i_isize, false))),
        );
        results.insert(
            format!("getHash1_{}_regular", i),
            serde_json::Value::Number(serde_json::Number::from(join.get_hash1(i_isize, false) as i64)),
        );
        results.insert(
            format!("getHash2_{}", i),
            serde_json::Value::Number(serde_json::Number::from(join.get_hash2(i_isize) as i64)),
        );
    }

    // Get values for ghost joins (up to 3 indices)
    for i in 0..std::cmp::min(3, join.get_length(true)) {
        let i_isize = i as isize;
        results.insert(
            format!("getX_{}_ghost", i),
            serde_json::Value::Number(serde_json::Number::from(join.get_x(i_isize, true))),
        );
        results.insert(
            format!("getY_{}_ghost", i),
            serde_json::Value::Number(serde_json::Number::from(join.get_y(i_isize, true))),
        );
        results.insert(
            format!("getHash1_{}_ghost", i),
            serde_json::Value::Number(serde_json::Number::from(join.get_hash1(i_isize, true) as i64)),
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
                        length_regular: output_data
                            .and_then(|o| o.get("length_regular"))
                            .and_then(|v| v.as_u64().map(|u| u as usize)),
                        length_ghost: output_data
                            .and_then(|o| o.get("length_ghost"))
                            .and_then(|v| v.as_u64().map(|u| u as usize)),
                        get_x_0_regular: output_data
                            .and_then(|o| o.get("getX_0_regular"))
                            .and_then(|v| v.as_i64().map(|i| i as i32)),
                        get_y_0_regular: output_data
                            .and_then(|o| o.get("getY_0_regular"))
                            .and_then(|v| v.as_i64().map(|i| i as i32)),
                        get_x_1_regular: output_data
                            .and_then(|o| o.get("getX_1_regular"))
                            .and_then(|v| v.as_i64().map(|i| i as i32)),
                        get_y_1_regular: output_data
                            .and_then(|o| o.get("getY_1_regular"))
                            .and_then(|v| v.as_i64().map(|i| i as i32)),
                        get_x_2_regular: output_data
                            .and_then(|o| o.get("getX_2_regular"))
                            .and_then(|v| v.as_i64().map(|i| i as i32)),
                        get_y_2_regular: output_data
                            .and_then(|o| o.get("getY_2_regular"))
                            .and_then(|v| v.as_i64().map(|i| i as i32)),
                        get_x_0_ghost: output_data
                            .and_then(|o| o.get("getX_0_ghost"))
                            .and_then(|v| v.as_i64().map(|i| i as i32)),
                        get_y_0_ghost: output_data
                            .and_then(|o| o.get("getY_0_ghost"))
                            .and_then(|v| v.as_i64().map(|i| i as i32)),
                        get_x_1_ghost: output_data
                            .and_then(|o| o.get("getX_1_ghost"))
                            .and_then(|v| v.as_i64().map(|i| i as i32)),
                        get_y_1_ghost: output_data
                            .and_then(|o| o.get("getY_1_ghost"))
                            .and_then(|v| v.as_i64().map(|i| i as i32)),
                        get_x_2_ghost: output_data
                            .and_then(|o| o.get("getX_2_ghost"))
                            .and_then(|v| v.as_i64().map(|i| i as i32)),
                        get_y_2_ghost: output_data
                            .and_then(|o| o.get("getY_2_ghost"))
                            .and_then(|v| v.as_i64().map(|i| i as i32)),
                        get_hash1_0_regular: output_data
                            .and_then(|o| o.get("getHash1_0_regular"))
                            .and_then(|v| v.as_i64().map(|i| i as isize)),
                        get_hash1_1_regular: output_data
                            .and_then(|o| o.get("getHash1_1_regular"))
                            .and_then(|v| v.as_i64().map(|i| i as isize)),
                        get_hash1_2_regular: output_data
                            .and_then(|o| o.get("getHash1_2_regular"))
                            .and_then(|v| v.as_i64().map(|i| i as isize)),
                        get_hash1_0_ghost: output_data
                            .and_then(|o| o.get("getHash1_0_ghost"))
                            .and_then(|v| v.as_i64().map(|i| i as isize)),
                        get_hash1_1_ghost: output_data
                            .and_then(|o| o.get("getHash1_1_ghost"))
                            .and_then(|v| v.as_i64().map(|i| i as isize)),
                        get_hash1_2_ghost: output_data
                            .and_then(|o| o.get("getHash1_2_ghost"))
                            .and_then(|v| v.as_i64().map(|i| i as isize)),
                        get_hash2_0: output_data
                            .and_then(|o| o.get("getHash2_0"))
                            .and_then(|v| v.as_i64().map(|i| i as isize)),
                        get_hash2_1: output_data
                            .and_then(|o| o.get("getHash2_1"))
                            .and_then(|v| v.as_i64().map(|i| i as isize)),
                        get_hash2_2: output_data
                            .and_then(|o| o.get("getHash2_2"))
                            .and_then(|v| v.as_i64().map(|i| i as isize)),
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
        include_str!("../../../../geometry-utils/src/clipper/__data__/join.json");

    #[test]
    fn test_join_from_json_data() {
        let test_suites = parse_test_data(TEST_DATA);

        for suite in test_suites {
            println!("Running test suite: {}", suite.id);

            for test_case in suite.data {
                println!("  Running test: {}", test_case.id);

                let actual_results = execute_operations_and_get_results(&test_case.input.operations);

                // Check length_regular
                if let Some(expected_length) = test_case.output.length_regular {
                    let actual_length = actual_results
                        .get("length_regular")
                        .and_then(|v| v.as_u64())
                        .map(|u| u as usize)
                        .unwrap_or(0);
                    assert_eq!(
                        actual_length, expected_length,
                        "Regular length mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check length_ghost
                if let Some(expected_length) = test_case.output.length_ghost {
                    let actual_length = actual_results
                        .get("length_ghost")
                        .and_then(|v| v.as_u64())
                        .map(|u| u as usize)
                        .unwrap_or(0);
                    assert_eq!(
                        actual_length, expected_length,
                        "Ghost length mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check regular join getters
                let regular_getters = [
                    ("get_x_0_regular", test_case.output.get_x_0_regular, "getX_0_regular"),
                    ("get_y_0_regular", test_case.output.get_y_0_regular, "getY_0_regular"),
                    ("get_x_1_regular", test_case.output.get_x_1_regular, "getX_1_regular"),
                    ("get_y_1_regular", test_case.output.get_y_1_regular, "getY_1_regular"),
                    ("get_x_2_regular", test_case.output.get_x_2_regular, "getX_2_regular"),
                    ("get_y_2_regular", test_case.output.get_y_2_regular, "getY_2_regular"),
                ];

                for (desc, expected, key) in regular_getters {
                    if let Some(expected_val) = expected {
                        let actual_val = actual_results
                            .get(key)
                            .and_then(|v| v.as_i64())
                            .map(|i| i as i32);
                        assert_eq!(
                            actual_val,
                            Some(expected_val),
                            "{} mismatch in test: {}",
                            desc,
                            test_case.id
                        );
                    }
                }

                // Check ghost join getters
                let ghost_getters = [
                    ("get_x_0_ghost", test_case.output.get_x_0_ghost, "getX_0_ghost"),
                    ("get_y_0_ghost", test_case.output.get_y_0_ghost, "getY_0_ghost"),
                    ("get_x_1_ghost", test_case.output.get_x_1_ghost, "getX_1_ghost"),
                    ("get_y_1_ghost", test_case.output.get_y_1_ghost, "getY_1_ghost"),
                    ("get_x_2_ghost", test_case.output.get_x_2_ghost, "getX_2_ghost"),
                    ("get_y_2_ghost", test_case.output.get_y_2_ghost, "getY_2_ghost"),
                ];

                for (desc, expected, key) in ghost_getters {
                    if let Some(expected_val) = expected {
                        let actual_val = actual_results
                            .get(key)
                            .and_then(|v| v.as_i64())
                            .map(|i| i as i32);
                        assert_eq!(
                            actual_val,
                            Some(expected_val),
                            "{} mismatch in test: {}",
                            desc,
                            test_case.id
                        );
                    }
                }

                // Check hash getters
                let hash_getters = [
                    ("get_hash1_0_regular", test_case.output.get_hash1_0_regular, "getHash1_0_regular"),
                    ("get_hash1_1_regular", test_case.output.get_hash1_1_regular, "getHash1_1_regular"),
                    ("get_hash1_2_regular", test_case.output.get_hash1_2_regular, "getHash1_2_regular"),
                    ("get_hash1_0_ghost", test_case.output.get_hash1_0_ghost, "getHash1_0_ghost"),
                    ("get_hash1_1_ghost", test_case.output.get_hash1_1_ghost, "getHash1_1_ghost"),
                    ("get_hash1_2_ghost", test_case.output.get_hash1_2_ghost, "getHash1_2_ghost"),
                    ("get_hash2_0", test_case.output.get_hash2_0, "getHash2_0"),
                    ("get_hash2_1", test_case.output.get_hash2_1, "getHash2_1"),
                    ("get_hash2_2", test_case.output.get_hash2_2, "getHash2_2"),
                ];

                for (desc, expected, key) in hash_getters {
                    if let Some(expected_val) = expected {
                        let actual_val = actual_results
                            .get(key)
                            .and_then(|v| v.as_i64())
                            .map(|i| i as isize);
                        assert_eq!(
                            actual_val,
                            Some(expected_val),
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
    #[should_panic]
    fn test_index_out_of_bounds_regular() {
        let mut join = Join::new();
        let point = Point::new(Some(10), Some(20));
        join.add(100, 200, &point);

        // This should panic
        join.get_x(1, false);
    }

    #[test]
    #[should_panic]
    fn test_index_out_of_bounds_ghost() {
        let mut join = Join::new();
        join.add_ghost(100, 10, 20);

        // This should panic
        join.get_x(1, true);
    }

    #[test]
    fn test_empty_state_operations() {
        let mut join = Join::new();
        
        assert_eq!(join.get_length(false), 0);
        assert_eq!(join.get_length(true), 0);

        // These operations should work without issues
        join.reset();
        join.clear_ghosts();

        assert_eq!(join.get_length(false), 0);
        assert_eq!(join.get_length(true), 0);
    }

    #[test]
    fn test_large_numbers() {
        let mut join = Join::new();
        
        // Use values within i32/isize range
        let large_hash1 = 2147483647isize; // Max i32 as isize
        let large_hash2 = 2147483646isize;
        let large_x = 2147483645i32;
        let large_y = 2147483644i32;

        let point = Point::new(Some(large_x), Some(large_y));
        join.add(large_hash1, large_hash2, &point);

        assert_eq!(join.get_length(false), 1);
        assert_eq!(join.get_x(0, false), large_x);
        assert_eq!(join.get_y(0, false), large_y);
        assert_eq!(join.get_hash1(0, false), large_hash1);
        assert_eq!(join.get_hash2(0), large_hash2);
    }

    #[test]
    fn test_performance_regular_joins() {
        let mut join = Join::new();
        let start = std::time::Instant::now();

        // Add 1000 regular joins
        for i in 0..1000 {
            let point = Point::new(Some(i * 2), Some(i * 3));
            join.add(i as isize, (i + 1000) as isize, &point);
        }

        let duration = start.elapsed();
        assert_eq!(join.get_length(false), 1000);
        assert!(duration.as_millis() < 1000); // Should complete in less than 1 second
    }

    #[test]
    fn test_performance_ghost_joins() {
        let mut join = Join::new();
        let start = std::time::Instant::now();

        // Add 1000 ghost joins
        for i in 0..1000 {
            join.add_ghost(i as isize, i * 2, i * 3);
        }

        let duration = start.elapsed();
        assert_eq!(join.get_length(true), 1000);
        assert!(duration.as_millis() < 1000); // Should complete in less than 1 second
    }

    #[test]
    fn test_state_consistency() {
        let mut join = Join::new();

        // Add regular joins
        let point1 = Point::new(Some(10), Some(20));
        let point2 = Point::new(Some(30), Some(40));
        join.add(100, 200, &point1);
        join.add(300, 400, &point2);

        // Add ghost joins
        join.add_ghost(500, 50, 60);
        join.add_ghost(600, 70, 80);

        assert_eq!(join.get_length(false), 2);
        assert_eq!(join.get_length(true), 2);

        // Convert ghost to regular
        join.from_ghost(0, 700);

        assert_eq!(join.get_length(false), 3);
        assert_eq!(join.get_length(true), 2);

        // Update hash
        join.update_hash(0, 150, 250);

        assert_eq!(join.get_hash1(0, false), 150);
        assert_eq!(join.get_hash2(0), 250);

        // Clear ghosts
        join.clear_ghosts();

        assert_eq!(join.get_length(false), 3);
        assert_eq!(join.get_length(true), 0);

        // Reset all
        join.reset();

        assert_eq!(join.get_length(false), 0);
        assert_eq!(join.get_length(true), 0);
    }
}
