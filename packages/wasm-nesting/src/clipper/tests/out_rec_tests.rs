use crate::clipper::out_rec::OutRec;
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
    strictly_simple: Option<bool>,
    create_result: Option<usize>,
    create_result_0: Option<usize>,
    create_result_1: Option<usize>,
    from_point_result: Option<usize>,
    from_point_result_0: Option<usize>,
    from_point_result_1: Option<usize>,
    point_x_1: Option<i32>,
    point_y_1: Option<i32>,
    point_x_2: Option<i32>,
    point_y_2: Option<i32>,
    get_hash_result: Option<u32>,
    is_unassigned_result: Option<bool>,
    is_unassigned_result_0: Option<bool>,
    is_unassigned_result_1: Option<bool>,
    current_index_result: Option<u16>,
    current_index_result_0: Option<u16>,
    current_index_result_1: Option<u16>,
    first_left_index_result: Option<usize>,
    first_left_index_result_0: Option<usize>,
    first_left_index_result_1: Option<usize>,
    get_out_rec_result: Option<usize>,
    get_out_rec_result_0: Option<usize>,
    get_out_rec_result_1: Option<usize>,
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
fn execute_operations(operations: &[TestOperation]) -> HashMap<String, serde_json::Value> {
    let mut out_rec: Option<OutRec> = None;
    let mut results = HashMap::new();
    let mut create_results = Vec::new();
    let mut from_point_results = Vec::new();
    let mut is_unassigned_results = Vec::new();
    let mut current_index_results = Vec::new();
    let mut first_left_index_results = Vec::new();
    let mut get_out_rec_results = Vec::new();

    for operation in operations {
        match operation.method.as_str() {
            "constructor" => {
                let is_reverse_solution = operation.args[0].as_bool().unwrap_or(false);
                let is_strictly_simple = operation.args[1].as_bool().unwrap_or(false);
                let new_out_rec = OutRec::new(is_reverse_solution, is_strictly_simple);

                results.insert(
                    "strictlySimple".to_string(),
                    serde_json::Value::Bool(new_out_rec.strictly_simple()),
                );

                out_rec = Some(new_out_rec);
            }
            "create" => {
                if let Some(ref mut out_rec_instance) = out_rec {
                    let point_index = operation.args[0].as_u64().unwrap_or(0) as usize;
                    let create_result = out_rec_instance.create(point_index);
                    create_results.push(create_result);

                    // Store results with appropriate keys
                    if create_results.len() == 1 {
                        results.insert(
                            "create_result".to_string(),
                            serde_json::Value::Number(serde_json::Number::from(create_result)),
                        );
                    } else if create_results.len() == 2 {
                        // Move first result to create_result_0
                        results.insert(
                            "create_result_0".to_string(),
                            serde_json::Value::Number(serde_json::Number::from(create_results[0])),
                        );
                        results.insert(
                            "create_result_1".to_string(),
                            serde_json::Value::Number(serde_json::Number::from(create_result)),
                        );
                    }
                }
            }
            "fromPoint" => {
                if let Some(ref mut out_rec_instance) = out_rec {
                    let point_obj = &operation.args[0];
                    let x = point_obj["x"].as_i64().unwrap_or(0) as i32;
                    let y = point_obj["y"].as_i64().unwrap_or(0) as i32;
                    let point = Point::new(Some(x), Some(y));
                    let from_point_result = out_rec_instance.from_point(&point);
                    from_point_results.push(from_point_result);

                    // Store results with appropriate keys
                    if from_point_results.len() == 1 {
                        results.insert(
                            "fromPoint_result".to_string(),
                            serde_json::Value::Number(serde_json::Number::from(from_point_result)),
                        );
                        results.insert(
                            "pointX_1".to_string(),
                            serde_json::Value::Number(serde_json::Number::from(
                                out_rec_instance.point_x(from_point_result),
                            )),
                        );
                        results.insert(
                            "pointY_1".to_string(),
                            serde_json::Value::Number(serde_json::Number::from(
                                out_rec_instance.point_y(from_point_result),
                            )),
                        );
                    } else if from_point_results.len() == 2 {
                        // Move first result to from_point_result_0
                        results.insert(
                            "fromPoint_result_0".to_string(),
                            serde_json::Value::Number(serde_json::Number::from(
                                from_point_results[0],
                            )),
                        );
                        results.insert(
                            "fromPoint_result_1".to_string(),
                            serde_json::Value::Number(serde_json::Number::from(from_point_result)),
                        );
                        results.insert(
                            "pointX_2".to_string(),
                            serde_json::Value::Number(serde_json::Number::from(
                                out_rec_instance.point_x(from_point_result),
                            )),
                        );
                        results.insert(
                            "pointY_2".to_string(),
                            serde_json::Value::Number(serde_json::Number::from(
                                out_rec_instance.point_y(from_point_result),
                            )),
                        );
                    }
                }
            }
            "getHash" => {
                if let Some(ref out_rec_instance) = out_rec {
                    let rec_index = operation.args[0].as_u64().unwrap_or(0) as usize;
                    let point_index = operation.args[1].as_u64().unwrap_or(0) as usize;
                    let hash_result = out_rec_instance.get_hash(rec_index, point_index);

                    results.insert(
                        "getHash_result".to_string(),
                        serde_json::Value::Number(serde_json::Number::from(hash_result as i64)),
                    );
                }
            }
            "isUnassigned" => {
                if let Some(ref out_rec_instance) = out_rec {
                    let index = operation.args[0].as_u64().unwrap_or(0) as usize;
                    let is_unassigned_result = out_rec_instance.is_unassigned(index);
                    is_unassigned_results.push(is_unassigned_result);

                    // Store results with appropriate keys
                    if is_unassigned_results.len() == 1 {
                        results.insert(
                            "isUnassigned_result".to_string(),
                            serde_json::Value::Bool(is_unassigned_result),
                        );
                    } else if is_unassigned_results.len() == 2 {
                        // Move first result to is_unassigned_result_0
                        results.insert(
                            "isUnassigned_result_0".to_string(),
                            serde_json::Value::Bool(is_unassigned_results[0]),
                        );
                        results.insert(
                            "isUnassigned_result_1".to_string(),
                            serde_json::Value::Bool(is_unassigned_result),
                        );
                    }
                }
            }
            "currentIndex" => {
                if let Some(ref out_rec_instance) = out_rec {
                    let index = operation.args[0].as_u64().unwrap_or(0) as usize;
                    let current_index_result = out_rec_instance.current_index(index);
                    current_index_results.push(current_index_result);

                    // Store results with appropriate keys
                    if current_index_results.len() == 1 {
                        results.insert(
                            "currentIndex_result".to_string(),
                            serde_json::Value::Number(serde_json::Number::from(
                                current_index_result,
                            )),
                        );
                    } else if current_index_results.len() == 2 {
                        // Move first result to current_index_result_0
                        results.insert(
                            "currentIndex_result_0".to_string(),
                            serde_json::Value::Number(serde_json::Number::from(
                                current_index_results[0],
                            )),
                        );
                        results.insert(
                            "currentIndex_result_1".to_string(),
                            serde_json::Value::Number(serde_json::Number::from(
                                current_index_result,
                            )),
                        );
                    }
                }
            }
            "firstLeftIndex" => {
                if let Some(ref out_rec_instance) = out_rec {
                    let index = operation.args[0].as_u64().unwrap_or(0) as usize;
                    let first_left_index_result = out_rec_instance.first_left_index(index);
                    first_left_index_results.push(first_left_index_result);

                    // Store results with appropriate keys
                    if first_left_index_results.len() == 1 {
                        results.insert(
                            "firstLeftIndex_result".to_string(),
                            serde_json::Value::Number(serde_json::Number::from(
                                first_left_index_result,
                            )),
                        );
                    } else if first_left_index_results.len() == 2 {
                        // Move first result to first_left_index_result_0
                        results.insert(
                            "firstLeftIndex_result_0".to_string(),
                            serde_json::Value::Number(serde_json::Number::from(
                                first_left_index_results[0],
                            )),
                        );
                        results.insert(
                            "firstLeftIndex_result_1".to_string(),
                            serde_json::Value::Number(serde_json::Number::from(
                                first_left_index_result,
                            )),
                        );
                    }
                }
            }
            "setHoleState" => {
                if let Some(ref mut out_rec_instance) = out_rec {
                    let rec_index = operation.args[0].as_u64().unwrap_or(0) as usize;
                    let is_hole = operation.args[1].as_bool().unwrap_or(false);
                    let index = operation.args[2].as_u64().unwrap_or(0) as usize;
                    out_rec_instance.set_hole_state(rec_index, is_hole, index);
                }
            }
            "getOutRec" => {
                if let Some(ref out_rec_instance) = out_rec {
                    let index = operation.args[0].as_u64().unwrap_or(0) as usize;
                    let get_out_rec_result = out_rec_instance.get_out_rec(index);
                    get_out_rec_results.push(get_out_rec_result);

                    // Store results with appropriate keys
                    if get_out_rec_results.len() == 1 {
                        results.insert(
                            "getOutRec_result".to_string(),
                            serde_json::Value::Number(serde_json::Number::from(get_out_rec_result)),
                        );
                    } else if get_out_rec_results.len() == 2 {
                        // Move first result to get_out_rec_result_0
                        results.insert(
                            "getOutRec_result_0".to_string(),
                            serde_json::Value::Number(serde_json::Number::from(
                                get_out_rec_results[0],
                            )),
                        );
                        results.insert(
                            "getOutRec_result_1".to_string(),
                            serde_json::Value::Number(serde_json::Number::from(get_out_rec_result)),
                        );
                    }
                }
            }
            "dispose" => {
                if let Some(ref mut out_rec_instance) = out_rec {
                    out_rec_instance.dispose();
                }
            }
            _ => {
                // Unknown method, skip
            }
        }
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
                        strictly_simple: output_data
                            .and_then(|o| o.get("strictlySimple"))
                            .and_then(|v| v.as_bool()),
                        create_result: output_data
                            .and_then(|o| o.get("create_result"))
                            .and_then(|v| v.as_u64())
                            .map(|v| v as usize),
                        create_result_0: output_data
                            .and_then(|o| o.get("create_result_0"))
                            .and_then(|v| v.as_u64())
                            .map(|v| v as usize),
                        create_result_1: output_data
                            .and_then(|o| o.get("create_result_1"))
                            .and_then(|v| v.as_u64())
                            .map(|v| v as usize),
                        from_point_result: output_data
                            .and_then(|o| o.get("fromPoint_result"))
                            .and_then(|v| v.as_u64())
                            .map(|v| v as usize),
                        from_point_result_0: output_data
                            .and_then(|o| o.get("fromPoint_result_0"))
                            .and_then(|v| v.as_u64())
                            .map(|v| v as usize),
                        from_point_result_1: output_data
                            .and_then(|o| o.get("fromPoint_result_1"))
                            .and_then(|v| v.as_u64())
                            .map(|v| v as usize),
                        point_x_1: output_data
                            .and_then(|o| o.get("pointX_1"))
                            .and_then(|v| v.as_i64())
                            .map(|v| v as i32),
                        point_y_1: output_data
                            .and_then(|o| o.get("pointY_1"))
                            .and_then(|v| v.as_i64())
                            .map(|v| v as i32),
                        point_x_2: output_data
                            .and_then(|o| o.get("pointX_2"))
                            .and_then(|v| v.as_i64())
                            .map(|v| v as i32),
                        point_y_2: output_data
                            .and_then(|o| o.get("pointY_2"))
                            .and_then(|v| v.as_i64())
                            .map(|v| v as i32),
                        get_hash_result: output_data
                            .and_then(|o| o.get("getHash_result"))
                            .and_then(|v| v.as_i64())
                            .map(|v| v as u32),
                        is_unassigned_result: output_data
                            .and_then(|o| o.get("isUnassigned_result"))
                            .and_then(|v| v.as_bool()),
                        is_unassigned_result_0: output_data
                            .and_then(|o| o.get("isUnassigned_result_0"))
                            .and_then(|v| v.as_bool()),
                        is_unassigned_result_1: output_data
                            .and_then(|o| o.get("isUnassigned_result_1"))
                            .and_then(|v| v.as_bool()),
                        current_index_result: output_data
                            .and_then(|o| o.get("currentIndex_result"))
                            .and_then(|v| v.as_u64())
                            .map(|v| v as u16),
                        current_index_result_0: output_data
                            .and_then(|o| o.get("currentIndex_result_0"))
                            .and_then(|v| v.as_u64())
                            .map(|v| v as u16),
                        current_index_result_1: output_data
                            .and_then(|o| o.get("currentIndex_result_1"))
                            .and_then(|v| v.as_u64())
                            .map(|v| v as u16),
                        first_left_index_result: output_data
                            .and_then(|o| o.get("firstLeftIndex_result"))
                            .and_then(|v| v.as_u64())
                            .map(|v| v as usize),
                        first_left_index_result_0: output_data
                            .and_then(|o| o.get("firstLeftIndex_result_0"))
                            .and_then(|v| v.as_u64())
                            .map(|v| v as usize),
                        first_left_index_result_1: output_data
                            .and_then(|o| o.get("firstLeftIndex_result_1"))
                            .and_then(|v| v.as_u64())
                            .map(|v| v as usize),
                        get_out_rec_result: output_data
                            .and_then(|o| o.get("getOutRec_result"))
                            .and_then(|v| v.as_u64())
                            .map(|v| v as usize),
                        get_out_rec_result_0: output_data
                            .and_then(|o| o.get("getOutRec_result_0"))
                            .and_then(|v| v.as_u64())
                            .map(|v| v as usize),
                        get_out_rec_result_1: output_data
                            .and_then(|o| o.get("getOutRec_result_1"))
                            .and_then(|v| v.as_u64())
                            .map(|v| v as usize),
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
        include_str!("../.././__data__/out-rec.json");

    #[test]
    fn test_out_rec_from_json_data() {
        let test_suites = parse_test_data(TEST_DATA);

        for suite in test_suites {
            println!("Running test suite: {}", suite.id);

            for test_case in suite.data {
                println!("  Running test: {}", test_case.id);

                let execution_results = execute_operations(&test_case.input.operations);

                // Check strictly simple
                if let Some(expected_strictly_simple) = test_case.output.strictly_simple {
                    let actual_strictly_simple = execution_results
                        .get("strictlySimple")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    assert_eq!(
                        actual_strictly_simple, expected_strictly_simple,
                        "StrictlySimple mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check create result
                if let Some(expected_create_result) = test_case.output.create_result {
                    let actual_create_result = execution_results
                        .get("create_result")
                        .and_then(|v| v.as_u64())
                        .map(|v| v as usize);
                    assert_eq!(
                        actual_create_result,
                        Some(expected_create_result),
                        "Create result mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check create result 0
                if let Some(expected_create_result_0) = test_case.output.create_result_0 {
                    let actual_create_result_0 = execution_results
                        .get("create_result_0")
                        .and_then(|v| v.as_u64())
                        .map(|v| v as usize);
                    assert_eq!(
                        actual_create_result_0,
                        Some(expected_create_result_0),
                        "Create result 0 mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check create result 1
                if let Some(expected_create_result_1) = test_case.output.create_result_1 {
                    let actual_create_result_1 = execution_results
                        .get("create_result_1")
                        .and_then(|v| v.as_u64())
                        .map(|v| v as usize);
                    assert_eq!(
                        actual_create_result_1,
                        Some(expected_create_result_1),
                        "Create result 1 mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check from point result
                if let Some(expected_from_point_result) = test_case.output.from_point_result {
                    let actual_from_point_result = execution_results
                        .get("fromPoint_result")
                        .and_then(|v| v.as_u64())
                        .map(|v| v as usize);
                    assert_eq!(
                        actual_from_point_result,
                        Some(expected_from_point_result),
                        "FromPoint result mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check from point result 0
                if let Some(expected_from_point_result_0) = test_case.output.from_point_result_0 {
                    let actual_from_point_result_0 = execution_results
                        .get("fromPoint_result_0")
                        .and_then(|v| v.as_u64())
                        .map(|v| v as usize);
                    assert_eq!(
                        actual_from_point_result_0,
                        Some(expected_from_point_result_0),
                        "FromPoint result 0 mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check from point result 1
                if let Some(expected_from_point_result_1) = test_case.output.from_point_result_1 {
                    let actual_from_point_result_1 = execution_results
                        .get("fromPoint_result_1")
                        .and_then(|v| v.as_u64())
                        .map(|v| v as usize);
                    assert_eq!(
                        actual_from_point_result_1,
                        Some(expected_from_point_result_1),
                        "FromPoint result 1 mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check pointX_1
                if let Some(expected_point_x_1) = test_case.output.point_x_1 {
                    let actual_point_x_1 = execution_results
                        .get("pointX_1")
                        .and_then(|v| v.as_i64())
                        .map(|v| v as i32);
                    assert_eq!(
                        actual_point_x_1,
                        Some(expected_point_x_1),
                        "PointX_1 mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check pointY_1
                if let Some(expected_point_y_1) = test_case.output.point_y_1 {
                    let actual_point_y_1 = execution_results
                        .get("pointY_1")
                        .and_then(|v| v.as_i64())
                        .map(|v| v as i32);
                    assert_eq!(
                        actual_point_y_1,
                        Some(expected_point_y_1),
                        "PointY_1 mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check pointX_2
                if let Some(expected_point_x_2) = test_case.output.point_x_2 {
                    let actual_point_x_2 = execution_results
                        .get("pointX_2")
                        .and_then(|v| v.as_i64())
                        .map(|v| v as i32);
                    assert_eq!(
                        actual_point_x_2,
                        Some(expected_point_x_2),
                        "PointX_2 mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check pointY_2
                if let Some(expected_point_y_2) = test_case.output.point_y_2 {
                    let actual_point_y_2 = execution_results
                        .get("pointY_2")
                        .and_then(|v| v.as_i64())
                        .map(|v| v as i32);
                    assert_eq!(
                        actual_point_y_2,
                        Some(expected_point_y_2),
                        "PointY_2 mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check get hash result
                if let Some(expected_get_hash_result) = test_case.output.get_hash_result {
                    let actual_get_hash_result = execution_results
                        .get("getHash_result")
                        .and_then(|v| v.as_i64())
                        .map(|v| v as u32);
                    assert_eq!(
                        actual_get_hash_result,
                        Some(expected_get_hash_result),
                        "GetHash result mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check is unassigned result
                if let Some(expected_is_unassigned_result) = test_case.output.is_unassigned_result {
                    let actual_is_unassigned_result = execution_results
                        .get("isUnassigned_result")
                        .and_then(|v| v.as_bool());
                    assert_eq!(
                        actual_is_unassigned_result,
                        Some(expected_is_unassigned_result),
                        "IsUnassigned result mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check is unassigned result 0
                if let Some(expected_is_unassigned_result_0) =
                    test_case.output.is_unassigned_result_0
                {
                    let actual_is_unassigned_result_0 = execution_results
                        .get("isUnassigned_result_0")
                        .and_then(|v| v.as_bool());
                    assert_eq!(
                        actual_is_unassigned_result_0,
                        Some(expected_is_unassigned_result_0),
                        "IsUnassigned result 0 mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check is unassigned result 1
                if let Some(expected_is_unassigned_result_1) =
                    test_case.output.is_unassigned_result_1
                {
                    let actual_is_unassigned_result_1 = execution_results
                        .get("isUnassigned_result_1")
                        .and_then(|v| v.as_bool());
                    assert_eq!(
                        actual_is_unassigned_result_1,
                        Some(expected_is_unassigned_result_1),
                        "IsUnassigned result 1 mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check current index result
                if let Some(expected_current_index_result) = test_case.output.current_index_result {
                    let actual_current_index_result = execution_results
                        .get("currentIndex_result")
                        .and_then(|v| v.as_u64())
                        .map(|v| v as u16);
                    assert_eq!(
                        actual_current_index_result,
                        Some(expected_current_index_result),
                        "CurrentIndex result mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check current index result 0
                if let Some(expected_current_index_result_0) =
                    test_case.output.current_index_result_0
                {
                    let actual_current_index_result_0 = execution_results
                        .get("currentIndex_result_0")
                        .and_then(|v| v.as_u64())
                        .map(|v| v as u16);
                    assert_eq!(
                        actual_current_index_result_0,
                        Some(expected_current_index_result_0),
                        "CurrentIndex result 0 mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check current index result 1
                if let Some(expected_current_index_result_1) =
                    test_case.output.current_index_result_1
                {
                    let actual_current_index_result_1 = execution_results
                        .get("currentIndex_result_1")
                        .and_then(|v| v.as_u64())
                        .map(|v| v as u16);
                    assert_eq!(
                        actual_current_index_result_1,
                        Some(expected_current_index_result_1),
                        "CurrentIndex result 1 mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check first left index result
                if let Some(expected_first_left_index_result) =
                    test_case.output.first_left_index_result
                {
                    let actual_first_left_index_result = execution_results
                        .get("firstLeftIndex_result")
                        .and_then(|v| v.as_u64())
                        .map(|v| v as usize);
                    assert_eq!(
                        actual_first_left_index_result,
                        Some(expected_first_left_index_result),
                        "FirstLeftIndex result mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check first left index result 0
                if let Some(expected_first_left_index_result_0) =
                    test_case.output.first_left_index_result_0
                {
                    let actual_first_left_index_result_0 = execution_results
                        .get("firstLeftIndex_result_0")
                        .and_then(|v| v.as_u64())
                        .map(|v| v as usize);
                    assert_eq!(
                        actual_first_left_index_result_0,
                        Some(expected_first_left_index_result_0),
                        "FirstLeftIndex result 0 mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check first left index result 1
                if let Some(expected_first_left_index_result_1) =
                    test_case.output.first_left_index_result_1
                {
                    let actual_first_left_index_result_1 = execution_results
                        .get("firstLeftIndex_result_1")
                        .and_then(|v| v.as_u64())
                        .map(|v| v as usize);
                    assert_eq!(
                        actual_first_left_index_result_1,
                        Some(expected_first_left_index_result_1),
                        "FirstLeftIndex result 1 mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check get out rec result
                if let Some(expected_get_out_rec_result) = test_case.output.get_out_rec_result {
                    let actual_get_out_rec_result = execution_results
                        .get("getOutRec_result")
                        .and_then(|v| v.as_u64())
                        .map(|v| v as usize);
                    assert_eq!(
                        actual_get_out_rec_result,
                        Some(expected_get_out_rec_result),
                        "GetOutRec result mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check get out rec result 0
                if let Some(expected_get_out_rec_result_0) = test_case.output.get_out_rec_result_0 {
                    let actual_get_out_rec_result_0 = execution_results
                        .get("getOutRec_result_0")
                        .and_then(|v| v.as_u64())
                        .map(|v| v as usize);
                    assert_eq!(
                        actual_get_out_rec_result_0,
                        Some(expected_get_out_rec_result_0),
                        "GetOutRec result 0 mismatch in test: {}",
                        test_case.id
                    );
                }

                // Check get out rec result 1
                if let Some(expected_get_out_rec_result_1) = test_case.output.get_out_rec_result_1 {
                    let actual_get_out_rec_result_1 = execution_results
                        .get("getOutRec_result_1")
                        .and_then(|v| v.as_u64())
                        .map(|v| v as usize);
                    assert_eq!(
                        actual_get_out_rec_result_1,
                        Some(expected_get_out_rec_result_1),
                        "GetOutRec result 1 mismatch in test: {}",
                        test_case.id
                    );
                }
            }
        }
    }

    // Additional edge case tests
    #[test]
    fn test_edge_cases() {
        // Test large coordinates
        let mut out_rec = OutRec::new(false, false);
        let large_point = Point::new(Some(2147483647), Some(2147483646));
        let index = out_rec.from_point(&large_point);

        assert_eq!(out_rec.point_x(index), 2147483647);
        assert_eq!(out_rec.point_y(index), 2147483646);

        // Test negative coordinates
        let negative_point = Point::new(Some(-1000), Some(-2000));
        let neg_index = out_rec.from_point(&negative_point);

        assert_eq!(out_rec.point_x(neg_index), -1000);
        assert_eq!(out_rec.point_y(neg_index), -2000);

        // Test zero coordinates
        let zero_point = Point::new(Some(0), Some(0));
        let zero_index = out_rec.from_point(&zero_point);

        assert_eq!(out_rec.point_x(zero_index), 0);
        assert_eq!(out_rec.point_y(zero_index), 0);
    }

    #[test]
    fn test_multiple_dispose() {
        let mut out_rec = OutRec::new(false, false);
        out_rec.create(1);
        out_rec.create(2);

        // Should not panic on multiple dispose calls
        out_rec.dispose();
        out_rec.dispose();
        out_rec.dispose();
    }

    #[test]
    fn test_point_equality() {
        let mut out_rec = OutRec::new(false, false);
        let point1 = Point::new(Some(100), Some(200));
        let point2 = Point::new(Some(100), Some(200));
        let point3 = Point::new(Some(101), Some(200));

        let index = out_rec.from_point(&point1);

        assert!(out_rec.point_equal(index, &point2));
        assert!(!out_rec.point_equal(index, &point3));
    }

    #[test]
    fn test_performance() {
        let mut out_rec = OutRec::new(false, false);
        let start = std::time::Instant::now();

        // Create 1000 records
        for i in 0..1000 {
            out_rec.create(i);
        }

        let duration = start.elapsed();
        assert!(duration.as_millis() < 1000); // Should complete in less than 1 second
    }

    #[test]
    fn test_point_creation_performance() {
        let mut out_rec = OutRec::new(false, false);
        let start = std::time::Instant::now();

        // Create 1000 points
        for i in 0..1000 {
            let point = Point::new(Some(i * 2), Some(i * 3));
            out_rec.from_point(&point);
        }

        let duration = start.elapsed();
        assert!(duration.as_millis() < 1000); // Should complete in less than 1 second
    }

    #[test]
    fn test_state_consistency() {
        let mut out_rec = OutRec::new(false, false);

        // Create records
        let rec1 = out_rec.create(1);
        let rec2 = out_rec.create(2);

        assert_eq!(out_rec.current_index(rec1), rec1 as u16);
        assert_eq!(out_rec.current_index(rec2), rec2 as u16);
        assert!(!out_rec.is_unassigned(rec1));
        assert!(!out_rec.is_unassigned(rec2));

        // Set hole states
        out_rec.set_hole_state(rec1, true, rec2);
        assert_eq!(out_rec.first_left_index(rec1), rec2);

        // Check getOutRec
        assert_eq!(out_rec.get_out_rec(rec1), rec1);
        assert_eq!(out_rec.get_out_rec(rec2), rec2);
    }

    #[test]
    fn test_complex_workflow() {
        let mut out_rec = OutRec::new(false, false);

        // Create points and records
        let point1 = Point::new(Some(10), Some(20));
        let point2 = Point::new(Some(30), Some(40));

        let index1 = out_rec.from_point(&point1);
        let index2 = out_rec.from_point(&point2);

        let rec1 = out_rec.create(index1);
        let rec2 = out_rec.create(index2);

        assert_eq!(out_rec.point_x(index1), 10);
        assert_eq!(out_rec.point_y(index1), 20);
        assert_eq!(out_rec.point_x(index2), 30);
        assert_eq!(out_rec.point_y(index2), 40);

        // Test hash generation
        let hash1 = out_rec.get_hash(rec1, index1);
        let hash2 = out_rec.get_hash(rec2, index2);

        assert_ne!(hash1, hash2);
    }

    #[test]
    fn test_strictly_simple_flag() {
        let simple_out_rec = OutRec::new(false, true);
        let normal_out_rec = OutRec::new(false, false);

        assert!(simple_out_rec.strictly_simple());
        assert!(!normal_out_rec.strictly_simple());
    }
}
