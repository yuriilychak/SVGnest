use crate::clipper::local_minima::LocalMinima;
use serde_json::Value;
use std::collections::HashMap;

/// Test data structure to match the JSON format
#[derive(Debug)]
struct TestOperation {
    method: String,
    args: Vec<f64>,
}

#[derive(Debug)]
struct TestInput {
    operations: Vec<TestOperation>,
}

#[derive(Debug)]
struct TestOutput {
    insert_result: Option<usize>,
    insert_results: Option<Vec<usize>>,
    get_y_0: Option<i32>,
    get_left_bound_0: Option<usize>,
    get_right_bound_0: Option<usize>,
    get_y_1: Option<i32>,
    get_left_bound_1: Option<usize>,
    get_right_bound_1: Option<usize>,
    get_y_2: Option<i32>,
    get_left_bound_2: Option<usize>,
    get_right_bound_2: Option<usize>,
    pop_result: Option<(usize, usize)>,
    pop_results: Option<Vec<(usize, usize)>>,
    first_pop_result: Option<(usize, usize)>,
    error: Option<String>,
    errors: Option<Vec<String>>,
    length: Option<usize>,
    is_empty: Option<bool>,
    min_y: Option<Option<i32>>, // Option<Option<i32>> to handle null values
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

/// Convert float to integer by intelligent scaling
fn float_to_int(val: f64) -> i32 {
    // If the value is already close to an integer, don't scale
    if (val - val.round()).abs() < 1e-6 {
        val.round() as i32
    } else {
        // For decimal values, scale by 10 to preserve one decimal place
        (val * 10.0).round() as i32
    }
}

/// Convert float to usize by intelligent scaling
fn float_to_usize(val: f64) -> usize {
    // If the value is already close to an integer, don't scale
    if (val - val.round()).abs() < 1e-6 {
        val.round() as usize
    } else {
        // For decimal values, scale by 10 to preserve one decimal place
        (val * 10.0).round() as usize
    }
}

/// Execute operations and collect results
fn execute_operations(operations: &[TestOperation]) -> HashMap<String, serde_json::Value> {
    let mut local_minima = LocalMinima::new();
    let mut results = HashMap::new();
    let mut insert_results = Vec::new();
    let mut pop_results = Vec::new();
    let mut errors = Vec::new();

    for operation in operations {
        match operation.method.as_str() {
            "insert" => {
                if operation.args.len() >= 3 {
                    let y = float_to_int(operation.args[0]);
                    let left = float_to_usize(operation.args[1]);
                    let right = float_to_usize(operation.args[2]);

                    let insert_result = local_minima.insert(y, left, right);
                    if insert_results.is_empty() {
                        results.insert(
                            "insertResult".to_string(),
                            serde_json::Value::Number(serde_json::Number::from(
                                insert_result as i64,
                            )),
                        );
                    }
                    insert_results.push(insert_result);
                }
            }
            "pop" => {
                match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| local_minima.pop()))
                {
                    Ok(pop_result) => {
                        if pop_results.is_empty() {
                            results.insert(
                                "popResult".to_string(),
                                serde_json::Value::Array(vec![
                                    serde_json::Value::Number(serde_json::Number::from(
                                        pop_result.0 as i64,
                                    )),
                                    serde_json::Value::Number(serde_json::Number::from(
                                        pop_result.1 as i64,
                                    )),
                                ]),
                            );
                        }
                        pop_results.push(pop_result);
                    }
                    Err(_) => {
                        let error_msg = "No minima to pop".to_string();
                        if errors.is_empty() {
                            results.insert(
                                "error".to_string(),
                                serde_json::Value::String(error_msg.clone()),
                            );
                        }
                        errors.push(error_msg);
                    }
                }
            }
            _ => {}
        }
    }

    if insert_results.len() > 1 {
        results.insert(
            "insertResults".to_string(),
            serde_json::Value::Array(
                insert_results
                    .iter()
                    .map(|&x| serde_json::Value::Number(serde_json::Number::from(x as i64)))
                    .collect(),
            ),
        );
    }
    if pop_results.len() > 1 {
        results.insert(
            "popResults".to_string(),
            serde_json::Value::Array(
                pop_results
                    .iter()
                    .map(|&(left, right)| {
                        serde_json::Value::Array(vec![
                            serde_json::Value::Number(serde_json::Number::from(left as i64)),
                            serde_json::Value::Number(serde_json::Number::from(right as i64)),
                        ])
                    })
                    .collect(),
            ),
        );
    }
    if errors.len() > 1 {
        results.insert(
            "errors".to_string(),
            serde_json::Value::Array(
                errors
                    .iter()
                    .map(|x| serde_json::Value::String(x.clone()))
                    .collect(),
            ),
        );
    }
    if pop_results.len() == 1 && errors.len() == 1 {
        let first_pop = pop_results[0];
        results.insert(
            "firstPopResult".to_string(),
            serde_json::Value::Array(vec![
                serde_json::Value::Number(serde_json::Number::from(first_pop.0 as i64)),
                serde_json::Value::Number(serde_json::Number::from(first_pop.1 as i64)),
            ]),
        );
    }

    // Add current state
    let state = get_local_minima_state(&local_minima);
    for (key, value) in state {
        results.insert(key, value);
    }

    results
}

/// Get local minima state including individual getter results
fn get_local_minima_state(local_minima: &LocalMinima) -> HashMap<String, serde_json::Value> {
    let mut state = HashMap::new();

    state.insert(
        "length".to_string(),
        serde_json::Value::Number(serde_json::Number::from(local_minima.length() as i64)),
    );
    state.insert(
        "isEmpty".to_string(),
        serde_json::Value::Bool(local_minima.is_empty()),
    );

    // Handle minY
    match local_minima.min_y() {
        Some(y) => {
            state.insert(
                "minY".to_string(),
                serde_json::Value::Number(serde_json::Number::from(y)),
            );
        }
        None => {
            state.insert("minY".to_string(), serde_json::Value::Null);
        }
    }

    // Get individual values if there are items
    if !local_minima.is_empty() {
        for i in 0..std::cmp::min(local_minima.length(), 3) {
            let y = local_minima.get_y(i);
            let left = local_minima.get_left_bound(i);
            let right = local_minima.get_right_bound(i);

            state.insert(
                format!("getY_{}", i),
                serde_json::Value::Number(serde_json::Number::from(y)),
            );
            state.insert(
                format!("getLeftBound_{}", i),
                serde_json::Value::Number(serde_json::Number::from(left as i64)),
            );
            state.insert(
                format!("getRightBound_{}", i),
                serde_json::Value::Number(serde_json::Number::from(right as i64)),
            );
        }
    }

    state
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
                                    .iter()
                                    .filter_map(|v| v.as_f64())
                                    .collect();
                                operations.push(TestOperation { method, args });
                            }
                        }
                    }

                    // Parse expected output
                    let output_data = case.get("output");
                    let output = TestOutput {
                        insert_result: output_data
                            .and_then(|o| o.get("insertResult"))
                            .and_then(|v| v.as_i64().map(|i| i as usize)),
                        insert_results: output_data
                            .and_then(|o| o.get("insertResults"))
                            .and_then(|v| v.as_array())
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(|x| x.as_i64().map(|i| i as usize))
                                    .collect()
                            }),
                        get_y_0: output_data
                            .and_then(|o| o.get("getY_0"))
                            .and_then(|v| v.as_f64().map(float_to_int)),
                        get_left_bound_0: output_data
                            .and_then(|o| o.get("getLeftBound_0"))
                            .and_then(|v| v.as_f64().map(float_to_usize)),
                        get_right_bound_0: output_data
                            .and_then(|o| o.get("getRightBound_0"))
                            .and_then(|v| v.as_f64().map(float_to_usize)),
                        get_y_1: output_data
                            .and_then(|o| o.get("getY_1"))
                            .and_then(|v| v.as_f64().map(float_to_int)),
                        get_left_bound_1: output_data
                            .and_then(|o| o.get("getLeftBound_1"))
                            .and_then(|v| v.as_f64().map(float_to_usize)),
                        get_right_bound_1: output_data
                            .and_then(|o| o.get("getRightBound_1"))
                            .and_then(|v| v.as_f64().map(float_to_usize)),
                        get_y_2: output_data
                            .and_then(|o| o.get("getY_2"))
                            .and_then(|v| v.as_f64().map(float_to_int)),
                        get_left_bound_2: output_data
                            .and_then(|o| o.get("getLeftBound_2"))
                            .and_then(|v| v.as_f64().map(float_to_usize)),
                        get_right_bound_2: output_data
                            .and_then(|o| o.get("getRightBound_2"))
                            .and_then(|v| v.as_f64().map(float_to_usize)),
                        pop_result: output_data
                            .and_then(|o| o.get("popResult"))
                            .and_then(|v| v.as_array())
                            .and_then(|arr| {
                                if arr.len() >= 2 {
                                    let left = arr[0].as_f64().map(float_to_usize)?;
                                    let right = arr[1].as_f64().map(float_to_usize)?;
                                    Some((left, right))
                                } else {
                                    None
                                }
                            }),
                        pop_results: output_data
                            .and_then(|o| o.get("popResults"))
                            .and_then(|v| v.as_array())
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(|x| x.as_array())
                                    .filter_map(|pair| {
                                        if pair.len() >= 2 {
                                            let left = pair[0].as_f64().map(float_to_usize)?;
                                            let right = pair[1].as_f64().map(float_to_usize)?;
                                            Some((left, right))
                                        } else {
                                            None
                                        }
                                    })
                                    .collect()
                            }),
                        first_pop_result: output_data
                            .and_then(|o| o.get("firstPopResult"))
                            .and_then(|v| v.as_array())
                            .and_then(|arr| {
                                if arr.len() >= 2 {
                                    let left = arr[0].as_f64().map(float_to_usize)?;
                                    let right = arr[1].as_f64().map(float_to_usize)?;
                                    Some((left, right))
                                } else {
                                    None
                                }
                            }),
                        error: output_data
                            .and_then(|o| o.get("error"))
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        errors: output_data
                            .and_then(|o| o.get("errors"))
                            .and_then(|v| v.as_array())
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(|x| x.as_str().map(|s| s.to_string()))
                                    .collect()
                            }),
                        length: output_data
                            .and_then(|o| o.get("length"))
                            .and_then(|v| v.as_i64().map(|i| i as usize)),
                        is_empty: output_data
                            .and_then(|o| o.get("isEmpty"))
                            .and_then(|v| v.as_bool()),
                        min_y: output_data.and_then(|o| o.get("minY")).map(|v| {
                            if v.is_null() {
                                None
                            } else {
                                v.as_f64().map(float_to_int)
                            }
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

    const TEST_DATA: &str = include_str!("../.././__data__/local-minima.json");

    #[test]
    fn test_local_minima_from_json_data() {
        let test_suites = parse_test_data(TEST_DATA);

        for suite in test_suites {
            println!("Running test suite: {}", suite.id);

            for test_case in suite.data {
                println!("  Running test: {}", test_case.id);

                let execution_results = execute_operations(&test_case.input.operations);

                // Check insert result
                if let Some(expected_insert) = test_case.output.insert_result {
                    let actual_insert = execution_results
                        .get("insertResult")
                        .and_then(|v| v.as_i64())
                        .map(|i| i as usize);
                    assert_eq!(
                        actual_insert,
                        Some(expected_insert),
                        "Insert result mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check multiple insert results
                if let Some(expected_inserts) = &test_case.output.insert_results {
                    let actual_inserts: Vec<usize> = execution_results
                        .get("insertResults")
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|x| x.as_i64().map(|i| i as usize))
                                .collect()
                        })
                        .unwrap_or_default();
                    assert_eq!(
                        actual_inserts, *expected_inserts,
                        "Insert results mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check getter methods
                for i in 0..=2 {
                    let y_key = format!("getY_{}", i);
                    let left_key = format!("getLeftBound_{}", i);
                    let right_key = format!("getRightBound_{}", i);

                    if let Some(expected_y) = match i {
                        0 => test_case.output.get_y_0,
                        1 => test_case.output.get_y_1,
                        2 => test_case.output.get_y_2,
                        _ => None,
                    } {
                        let actual_y = execution_results
                            .get(&y_key)
                            .and_then(|v| v.as_i64())
                            .map(|i| i as i32);
                        assert_eq!(
                            actual_y,
                            Some(expected_y),
                            "getY_{} mismatch in test: {}",
                            i,
                            test_case.id
                        );
                    }

                    if let Some(expected_left) = match i {
                        0 => test_case.output.get_left_bound_0,
                        1 => test_case.output.get_left_bound_1,
                        2 => test_case.output.get_left_bound_2,
                        _ => None,
                    } {
                        let actual_left = execution_results
                            .get(&left_key)
                            .and_then(|v| v.as_i64())
                            .map(|i| i as usize);
                        assert_eq!(
                            actual_left,
                            Some(expected_left),
                            "getLeftBound_{} mismatch in test: {}",
                            i,
                            test_case.id
                        );
                    }

                    if let Some(expected_right) = match i {
                        0 => test_case.output.get_right_bound_0,
                        1 => test_case.output.get_right_bound_1,
                        2 => test_case.output.get_right_bound_2,
                        _ => None,
                    } {
                        let actual_right = execution_results
                            .get(&right_key)
                            .and_then(|v| v.as_i64())
                            .map(|i| i as usize);
                        assert_eq!(
                            actual_right,
                            Some(expected_right),
                            "getRightBound_{} mismatch in test: {}",
                            i,
                            test_case.id
                        );
                    }
                }

                // Check single pop result
                if let Some(expected_pop) = test_case.output.pop_result {
                    let actual_pop = execution_results
                        .get("popResult")
                        .and_then(|v| v.as_array())
                        .and_then(|arr| {
                            if arr.len() >= 2 {
                                let left = arr[0].as_i64()? as usize;
                                let right = arr[1].as_i64()? as usize;
                                Some((left, right))
                            } else {
                                None
                            }
                        });
                    assert_eq!(
                        actual_pop,
                        Some(expected_pop),
                        "Pop result mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check multiple pop results
                if let Some(expected_pops) = &test_case.output.pop_results {
                    let actual_pops: Vec<(usize, usize)> = execution_results
                        .get("popResults")
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|x| x.as_array())
                                .filter_map(|pair| {
                                    if pair.len() >= 2 {
                                        let left = pair[0].as_i64()? as usize;
                                        let right = pair[1].as_i64()? as usize;
                                        Some((left, right))
                                    } else {
                                        None
                                    }
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    assert_eq!(
                        actual_pops, *expected_pops,
                        "Pop results mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check first pop result
                if let Some(expected_first_pop) = test_case.output.first_pop_result {
                    let actual_first_pop = execution_results
                        .get("firstPopResult")
                        .and_then(|v| v.as_array())
                        .and_then(|arr| {
                            if arr.len() >= 2 {
                                let left = arr[0].as_i64()? as usize;
                                let right = arr[1].as_i64()? as usize;
                                Some((left, right))
                            } else {
                                None
                            }
                        });
                    assert_eq!(
                        actual_first_pop,
                        Some(expected_first_pop),
                        "First pop result mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check length
                if let Some(expected_length) = test_case.output.length {
                    let actual_length = execution_results
                        .get("length")
                        .and_then(|v| v.as_i64())
                        .map(|i| i as usize);
                    assert_eq!(
                        actual_length,
                        Some(expected_length),
                        "Length mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check isEmpty state
                if let Some(expected_empty) = test_case.output.is_empty {
                    let actual_empty = execution_results
                        .get("isEmpty")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true);
                    assert_eq!(
                        actual_empty, expected_empty,
                        "isEmpty mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check minY value
                if let Some(expected_min_y) = &test_case.output.min_y {
                    let actual_min_y = execution_results.get("minY");
                    match expected_min_y {
                        Some(expected_val) => {
                            let actual_val =
                                actual_min_y.and_then(|v| v.as_i64()).map(|i| i as i32);
                            assert_eq!(
                                actual_val,
                                Some(*expected_val),
                                "minY mismatch in test: {}",
                                test_case.id
                            );
                        }
                        None => {
                            assert!(
                                actual_min_y.map(|v| v.is_null()).unwrap_or(true),
                                "Expected minY to be null in test: {}",
                                test_case.id
                            );
                        }
                    }
                }

                // Check single error
                if let Some(expected_error) = &test_case.output.error {
                    let actual_error = execution_results.get("error").and_then(|v| v.as_str());
                    assert_eq!(
                        actual_error,
                        Some(expected_error.as_str()),
                        "Error mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check multiple errors
                if let Some(expected_errors) = &test_case.output.errors {
                    let actual_errors: Vec<String> = execution_results
                        .get("errors")
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                                .collect()
                        })
                        .unwrap_or_default();
                    assert_eq!(
                        actual_errors, *expected_errors,
                        "Errors mismatch in test: {}",
                        test_case.id
                    );
                }
            }
        }
    }

    // Additional edge case tests to ensure comprehensive coverage
    #[test]
    fn test_edge_cases() {
        let mut local_minima = LocalMinima::new();

        // Test moderate numbers that are realistic for coordinate systems
        let moderate_positive = 50000i32;
        let left_bound = (moderate_positive - 100) as usize;
        let right_bound = (moderate_positive + 100) as usize;
        let index = local_minima.insert(moderate_positive, left_bound, right_bound);
        assert_eq!(index, 0);
        assert_eq!(local_minima.get_y(0), moderate_positive);
        assert_eq!(local_minima.get_left_bound(0), left_bound);
        assert_eq!(local_minima.get_right_bound(0), right_bound);

        // Clear for next test
        local_minima.pop();

        // Test moderate negative numbers
        let moderate_negative = -50000i32;
        let left_bound_neg = (moderate_negative - 100) as usize;
        let right_bound_neg = (moderate_negative + 100) as usize;
        let index = local_minima.insert(moderate_negative, left_bound_neg, right_bound_neg);
        assert_eq!(index, 0);
        assert_eq!(local_minima.get_y(0), moderate_negative);
        assert_eq!(local_minima.get_left_bound(0), left_bound_neg);
        assert_eq!(local_minima.get_right_bound(0), right_bound_neg);
    }

    #[test]
    fn test_performance() {
        let mut local_minima = LocalMinima::new();
        let start = std::time::Instant::now();

        // Insert 1000 minima with varied Y values
        for i in 0..1000 {
            let y = (i % 100) as i32;
            local_minima.insert(y, (y - 10) as usize, (y + 10) as usize);
        }

        let duration = start.elapsed();
        assert!(duration.as_millis() < 1000); // Should complete within 1 second
        assert_eq!(local_minima.length(), 1000);
        assert!(!local_minima.is_empty());

        // Test bulk pop performance
        let start = std::time::Instant::now();
        while !local_minima.is_empty() {
            local_minima.pop();
        }
        let duration = start.elapsed();
        assert!(duration.as_millis() < 1000); // Should complete within 1 second
        assert!(local_minima.is_empty());
        assert_eq!(local_minima.length(), 0);
    }

    #[test]
    fn test_state_consistency() {
        let mut local_minima = LocalMinima::new();

        // Perform a series of operations and verify state consistency
        let index1 = local_minima.insert(20, 10, 30);
        assert_eq!(index1, 0);
        assert_eq!(local_minima.length(), 1);
        assert_eq!(local_minima.min_y(), Some(20));

        let index2 = local_minima.insert(10, 5, 15);
        assert_eq!(index2, 1);
        assert_eq!(local_minima.length(), 2);
        assert_eq!(local_minima.min_y(), Some(20)); // minY should be the first (highest Y)

        let index3 = local_minima.insert(30, 25, 35);
        assert_eq!(index3, 0);
        assert_eq!(local_minima.length(), 3);

        let popped = local_minima.pop();
        assert_eq!(popped, (25, 35));
        assert_eq!(local_minima.length(), 2);
        assert_eq!(local_minima.min_y(), Some(20));
    }

    #[test]
    #[should_panic(expected = "No minima to pop")]
    fn test_pop_empty_local_minima() {
        let mut local_minima = LocalMinima::new();
        local_minima.pop(); // Should panic
    }

    #[test]
    fn test_state_after_error() {
        let mut local_minima = LocalMinima::new();

        // Try to pop from empty local minima (should panic, but we'll catch it)
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| local_minima.pop()));
        assert!(result.is_err());
        assert!(local_minima.is_empty());
        assert_eq!(local_minima.length(), 0);

        // Should still be able to insert after error
        local_minima.insert(42, 21, 63);
        assert!(!local_minima.is_empty());
        assert_eq!(local_minima.length(), 1);
        assert_eq!(local_minima.min_y(), Some(42));
    }

    #[test]
    fn test_duplicate_y_values() {
        let mut local_minima = LocalMinima::new();

        // Insert multiple items with same Y value
        let index1 = local_minima.insert(10, 0, 5);
        let index2 = local_minima.insert(10, 5, 10);
        let index3 = local_minima.insert(10, 10, 15);

        assert_eq!(index1, 0);
        assert_eq!(index2, 0);
        assert_eq!(index3, 0);

        // They should be inserted at the beginning due to >= comparison
        assert_eq!(local_minima.get_left_bound(0), 10); // last inserted
        assert_eq!(local_minima.get_left_bound(1), 5);
        assert_eq!(local_minima.get_left_bound(2), 0); // first inserted
    }
}
