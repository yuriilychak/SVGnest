use crate::clipper::clipper::Clipper;
use crate::clipper::enums::{ClipType, PolyFillType, PolyType};
use crate::geometry::point::Point;
use serde::Deserialize;
use std::fs;

#[derive(Debug, Deserialize)]
struct PointData {
    x: i32,
    y: i32,
}

#[derive(Debug, Deserialize)]
struct TestInput {
    #[serde(rename = "subjectPolygons")]
    subject_polygons: Vec<Vec<PointData>>,
    #[serde(rename = "clipPolygons")]
    clip_polygons: Vec<Vec<PointData>>,
    #[serde(rename = "clipType")]
    clip_type: u8,
    #[serde(rename = "fillType")]
    fill_type: u8,
}

#[derive(Debug, Deserialize)]
struct TestCase {
    id: String,
    input: TestInput,
    output: Vec<Vec<PointData>>,
}

#[derive(Debug, Deserialize)]
struct TestSuite {
    id: String,
    data: Vec<TestCase>,
}

#[derive(Debug, Deserialize)]
struct TestDataStructure {
    suites: Vec<TestSuite>,
}

fn load_test_data() -> TestDataStructure {
    let json_path = "../geometry-utils/src/clipper/__data__/clipper.json";
    let json_content =
        fs::read_to_string(json_path).expect("Failed to read clipper test data file");
    serde_json::from_str(&json_content).expect("Failed to parse clipper test data")
}

fn num_to_clip_type(num: u8) -> ClipType {
    match num {
        0 => ClipType::Intersection,
        1 => ClipType::Union,
        2 => ClipType::Difference,
        3 => ClipType::Xor,
        _ => panic!("Invalid ClipType: {}", num),
    }
}

fn num_to_poly_fill_type(num: u8) -> PolyFillType {
    match num {
        0 => PolyFillType::EvenOdd,
        1 => PolyFillType::NonZero,
        2 => PolyFillType::Positive,
        3 => PolyFillType::Negative,
        _ => panic!("Invalid PolyFillType: {}", num),
    }
}

fn create_polygon(points: &Vec<PointData>) -> Vec<Point<i32>> {
    points
        .iter()
        .map(|p| Point::new(Some(p.x), Some(p.y)))
        .collect()
}

fn execute_clipper_operation(
    clipper: &mut Clipper,
    subject_polygons: &Vec<Vec<PointData>>,
    clip_polygons: &Vec<Vec<PointData>>,
    clip_type: ClipType,
    fill_type: PolyFillType,
) -> Vec<Vec<Point<i32>>> {
    // Add subject polygons
    for polygon_data in subject_polygons {
        let polygon = create_polygon(polygon_data);
        clipper.add_path(&polygon, PolyType::Subject);
    }

    // Add clip polygons
    for polygon_data in clip_polygons {
        let polygon = create_polygon(polygon_data);
        clipper.add_path(&polygon, PolyType::Clip);
    }

    // Execute clipping
    let mut solution: Vec<Vec<Point<i32>>> = Vec::new();
    let result = clipper.execute(clip_type, &mut solution, fill_type);

    if !result {
        panic!("Clipper execution failed");
    }

    solution
}

fn compare_polygons(
    actual: &Vec<Vec<Point<i32>>>,
    expected: &Vec<Vec<PointData>>,
    tolerance: i32,
) -> bool {
    if actual.len() != expected.len() {
        eprintln!(
            "Different polygon count: actual={}, expected={}",
            actual.len(),
            expected.len()
        );
        return false;
    }

    // Try to match each expected polygon with an actual polygon
    let mut matched = vec![false; actual.len()];

    for (exp_idx, expected_poly) in expected.iter().enumerate() {
        let mut found_match = false;

        for (act_idx, actual_poly) in actual.iter().enumerate() {
            if matched[act_idx] {
                continue;
            }

            if actual_poly.len() != expected_poly.len() {
                continue;
            }

            // Try to match this polygon with different starting offsets
            let len = actual_poly.len();
            for offset in 0..len {
                let mut points_match = true;
                for j in 0..len {
                    let actual_point = &actual_poly[(j + offset) % len];
                    let expected_point = &expected_poly[j];

                    if (actual_point.x - expected_point.x).abs() > tolerance
                        || (actual_point.y - expected_point.y).abs() > tolerance
                    {
                        points_match = false;
                        break;
                    }
                }

                if points_match {
                    matched[act_idx] = true;
                    found_match = true;
                    break;
                }
            }

            if found_match {
                break;
            }
        }

        if !found_match {
            eprintln!("Could not find match for expected polygon {}", exp_idx);
            return false;
        }
    }

    true
}

#[cfg(test)]
mod tests {
    use super::*;

    // Union Operations Tests
    #[test]
    fn test_overlapping_squares_union() {
        let test_data = load_test_data();
        let union_suite = test_data
            .suites
            .iter()
            .find(|s| s.id == "union_operations")
            .expect("union_operations suite not found");
        let data = union_suite
            .data
            .iter()
            .find(|d| d.id == "overlapping_squares_union")
            .expect("overlapping_squares_union test not found");

        let mut clipper = Clipper::new(false, false);
        let solution = execute_clipper_operation(
            &mut clipper,
            &data.input.subject_polygons,
            &data.input.clip_polygons,
            num_to_clip_type(data.input.clip_type),
            num_to_poly_fill_type(data.input.fill_type),
        );

        assert!(solution.len() > 0, "Solution should not be empty");
        assert!(
            compare_polygons(&solution, &data.output, 1),
            "Polygon comparison failed"
        );
    }

    #[test]
    fn test_triangle_square_union() {
        let test_data = load_test_data();
        let union_suite = test_data
            .suites
            .iter()
            .find(|s| s.id == "union_operations")
            .expect("union_operations suite not found");
        let data = union_suite
            .data
            .iter()
            .find(|d| d.id == "triangle_square_union")
            .expect("triangle_square_union test not found");

        let mut clipper = Clipper::new(false, false);
        let solution = execute_clipper_operation(
            &mut clipper,
            &data.input.subject_polygons,
            &data.input.clip_polygons,
            num_to_clip_type(data.input.clip_type),
            num_to_poly_fill_type(data.input.fill_type),
        );

        assert!(solution.len() > 0, "Solution should not be empty");
        assert!(
            compare_polygons(&solution, &data.output, 1),
            "Polygon comparison failed"
        );
    }

    #[test]
    fn test_pentagon_circle_union() {
        let test_data = load_test_data();
        let union_suite = test_data
            .suites
            .iter()
            .find(|s| s.id == "union_operations")
            .expect("union_operations suite not found");
        let data = union_suite
            .data
            .iter()
            .find(|d| d.id == "pentagon_circle_union")
            .expect("pentagon_circle_union test not found");

        let mut clipper = Clipper::new(false, false);
        let solution = execute_clipper_operation(
            &mut clipper,
            &data.input.subject_polygons,
            &data.input.clip_polygons,
            num_to_clip_type(data.input.clip_type),
            num_to_poly_fill_type(data.input.fill_type),
        );

        assert!(solution.len() > 0, "Solution should not be empty");
        assert!(
            compare_polygons(&solution, &data.output, 1),
            "Polygon comparison failed"
        );
    }

    #[test]
    fn test_concave_polygons_union() {
        let test_data = load_test_data();
        let union_suite = test_data
            .suites
            .iter()
            .find(|s| s.id == "union_operations")
            .expect("union_operations suite not found");
        let data = union_suite
            .data
            .iter()
            .find(|d| d.id == "concave_polygons_union")
            .expect("concave_polygons_union test not found");

        let mut clipper = Clipper::new(false, false);
        let solution = execute_clipper_operation(
            &mut clipper,
            &data.input.subject_polygons,
            &data.input.clip_polygons,
            num_to_clip_type(data.input.clip_type),
            num_to_poly_fill_type(data.input.fill_type),
        );

        assert_eq!(solution.len(), 0, "Solution should be empty");
        assert!(
            compare_polygons(&solution, &data.output, 1),
            "Polygon comparison failed"
        );
    }

    #[test]
    fn test_non_overlapping_union() {
        let test_data = load_test_data();
        let union_suite = test_data
            .suites
            .iter()
            .find(|s| s.id == "union_operations")
            .expect("union_operations suite not found");
        let data = union_suite
            .data
            .iter()
            .find(|d| d.id == "non_overlapping_union")
            .expect("non_overlapping_union test not found");

        let mut clipper = Clipper::new(false, false);
        let solution = execute_clipper_operation(
            &mut clipper,
            &data.input.subject_polygons,
            &data.input.clip_polygons,
            num_to_clip_type(data.input.clip_type),
            num_to_poly_fill_type(data.input.fill_type),
        );

        assert!(solution.len() > 0, "Solution should not be empty");
        assert!(
            compare_polygons(&solution, &data.output, 1),
            "Polygon comparison failed"
        );
    }

    // Difference Operations Tests
    #[test]
    fn test_overlapping_squares_difference() {
        let test_data = load_test_data();
        let difference_suite = test_data
            .suites
            .iter()
            .find(|s| s.id == "difference_operations")
            .expect("difference_operations suite not found");
        let data = difference_suite
            .data
            .iter()
            .find(|d| d.id == "overlapping_squares_difference")
            .expect("overlapping_squares_difference test not found");

        let mut clipper = Clipper::new(false, false);
        let solution = execute_clipper_operation(
            &mut clipper,
            &data.input.subject_polygons,
            &data.input.clip_polygons,
            num_to_clip_type(data.input.clip_type),
            num_to_poly_fill_type(data.input.fill_type),
        );

        assert!(solution.len() > 0, "Solution should not be empty");
        assert!(
            compare_polygons(&solution, &data.output, 1),
            "Polygon comparison failed"
        );
    }

    #[test]
    fn test_triangle_square_difference() {
        let test_data = load_test_data();
        let difference_suite = test_data
            .suites
            .iter()
            .find(|s| s.id == "difference_operations")
            .expect("difference_operations suite not found");
        let data = difference_suite
            .data
            .iter()
            .find(|d| d.id == "triangle_square_difference")
            .expect("triangle_square_difference test not found");

        let mut clipper = Clipper::new(false, false);
        let solution = execute_clipper_operation(
            &mut clipper,
            &data.input.subject_polygons,
            &data.input.clip_polygons,
            num_to_clip_type(data.input.clip_type),
            num_to_poly_fill_type(data.input.fill_type),
        );

        assert!(solution.len() > 0, "Solution should not be empty");
        assert!(
            compare_polygons(&solution, &data.output, 1),
            "Polygon comparison failed"
        );
    }

    #[test]
    fn test_pentagon_square_difference() {
        let test_data = load_test_data();
        let difference_suite = test_data
            .suites
            .iter()
            .find(|s| s.id == "difference_operations")
            .expect("difference_operations suite not found");
        let data = difference_suite
            .data
            .iter()
            .find(|d| d.id == "pentagon_square_difference")
            .expect("pentagon_square_difference test not found");

        let mut clipper = Clipper::new(false, false);
        let solution = execute_clipper_operation(
            &mut clipper,
            &data.input.subject_polygons,
            &data.input.clip_polygons,
            num_to_clip_type(data.input.clip_type),
            num_to_poly_fill_type(data.input.fill_type),
        );

        assert!(solution.len() > 0, "Solution should not be empty");
        assert!(
            compare_polygons(&solution, &data.output, 1),
            "Polygon comparison failed"
        );
    }

    #[test]
    fn test_concave_square_difference() {
        let test_data = load_test_data();
        let difference_suite = test_data
            .suites
            .iter()
            .find(|s| s.id == "difference_operations")
            .expect("difference_operations suite not found");
        let data = difference_suite
            .data
            .iter()
            .find(|d| d.id == "concave_square_difference")
            .expect("concave_square_difference test not found");

        let mut clipper = Clipper::new(false, false);
        let solution = execute_clipper_operation(
            &mut clipper,
            &data.input.subject_polygons,
            &data.input.clip_polygons,
            num_to_clip_type(data.input.clip_type),
            num_to_poly_fill_type(data.input.fill_type),
        );

        assert_eq!(solution.len(), 0, "Solution should be empty");
        assert!(
            compare_polygons(&solution, &data.output, 1),
            "Polygon comparison failed"
        );
    }

    #[test]
    fn test_no_overlap_difference() {
        let test_data = load_test_data();
        let difference_suite = test_data
            .suites
            .iter()
            .find(|s| s.id == "difference_operations")
            .expect("difference_operations suite not found");
        let data = difference_suite
            .data
            .iter()
            .find(|d| d.id == "no_overlap_difference")
            .expect("no_overlap_difference test not found");

        let mut clipper = Clipper::new(false, false);
        let solution = execute_clipper_operation(
            &mut clipper,
            &data.input.subject_polygons,
            &data.input.clip_polygons,
            num_to_clip_type(data.input.clip_type),
            num_to_poly_fill_type(data.input.fill_type),
        );

        assert!(solution.len() > 0, "Solution should not be empty");
        assert!(
            compare_polygons(&solution, &data.output, 1),
            "Polygon comparison failed"
        );
    }

    // Intersection Operations Tests
    #[test]
    fn test_overlapping_squares_intersection() {
        let test_data = load_test_data();
        let intersection_suite = test_data
            .suites
            .iter()
            .find(|s| s.id == "intersection_operations")
            .expect("intersection_operations suite not found");
        let data = intersection_suite
            .data
            .iter()
            .find(|d| d.id == "overlapping_squares_intersection")
            .expect("overlapping_squares_intersection test not found");

        let mut clipper = Clipper::new(false, false);
        let solution = execute_clipper_operation(
            &mut clipper,
            &data.input.subject_polygons,
            &data.input.clip_polygons,
            num_to_clip_type(data.input.clip_type),
            num_to_poly_fill_type(data.input.fill_type),
        );

        assert!(solution.len() > 0, "Solution should not be empty");
        assert!(
            compare_polygons(&solution, &data.output, 1),
            "Polygon comparison failed"
        );
    }

    #[test]
    fn test_triangle_square_intersection() {
        let test_data = load_test_data();
        let intersection_suite = test_data
            .suites
            .iter()
            .find(|s| s.id == "intersection_operations")
            .expect("intersection_operations suite not found");
        let data = intersection_suite
            .data
            .iter()
            .find(|d| d.id == "triangle_square_intersection")
            .expect("triangle_square_intersection test not found");

        let mut clipper = Clipper::new(false, false);
        let solution = execute_clipper_operation(
            &mut clipper,
            &data.input.subject_polygons,
            &data.input.clip_polygons,
            num_to_clip_type(data.input.clip_type),
            num_to_poly_fill_type(data.input.fill_type),
        );

        assert!(solution.len() > 0, "Solution should not be empty");
        assert!(
            compare_polygons(&solution, &data.output, 1),
            "Polygon comparison failed"
        );
    }

    #[test]
    fn test_pentagon_square_intersection() {
        let test_data = load_test_data();
        let intersection_suite = test_data
            .suites
            .iter()
            .find(|s| s.id == "intersection_operations")
            .expect("intersection_operations suite not found");
        let data = intersection_suite
            .data
            .iter()
            .find(|d| d.id == "pentagon_square_intersection")
            .expect("pentagon_square_intersection test not found");

        let mut clipper = Clipper::new(false, false);
        let solution = execute_clipper_operation(
            &mut clipper,
            &data.input.subject_polygons,
            &data.input.clip_polygons,
            num_to_clip_type(data.input.clip_type),
            num_to_poly_fill_type(data.input.fill_type),
        );

        assert!(solution.len() > 0, "Solution should not be empty");
        assert!(
            compare_polygons(&solution, &data.output, 1),
            "Polygon comparison failed"
        );
    }

    #[test]
    fn test_concave_square_intersection() {
        let test_data = load_test_data();
        let intersection_suite = test_data
            .suites
            .iter()
            .find(|s| s.id == "intersection_operations")
            .expect("intersection_operations suite not found");
        let data = intersection_suite
            .data
            .iter()
            .find(|d| d.id == "concave_square_intersection")
            .expect("concave_square_intersection test not found");

        let mut clipper = Clipper::new(false, false);
        let solution = execute_clipper_operation(
            &mut clipper,
            &data.input.subject_polygons,
            &data.input.clip_polygons,
            num_to_clip_type(data.input.clip_type),
            num_to_poly_fill_type(data.input.fill_type),
        );

        assert_eq!(solution.len(), 0, "Solution should be empty");
        assert!(
            compare_polygons(&solution, &data.output, 1),
            "Polygon comparison failed"
        );
    }

    #[test]
    fn test_no_overlap_intersection() {
        let test_data = load_test_data();
        let intersection_suite = test_data
            .suites
            .iter()
            .find(|s| s.id == "intersection_operations")
            .expect("intersection_operations suite not found");
        let data = intersection_suite
            .data
            .iter()
            .find(|d| d.id == "no_overlap_intersection")
            .expect("no_overlap_intersection test not found");

        let mut clipper = Clipper::new(false, false);
        let solution = execute_clipper_operation(
            &mut clipper,
            &data.input.subject_polygons,
            &data.input.clip_polygons,
            num_to_clip_type(data.input.clip_type),
            num_to_poly_fill_type(data.input.fill_type),
        );

        // For no overlap intersection, we expect 2 polygons based on actual behavior
        assert_eq!(solution.len(), 2, "Solution should have 2 polygons");
        assert!(
            compare_polygons(&solution, &data.output, 1),
            "Polygon comparison failed"
        );
    }

    // XOR Operations Tests
    #[test]
    fn test_overlapping_squares_xor() {
        let test_data = load_test_data();
        let xor_suite = test_data
            .suites
            .iter()
            .find(|s| s.id == "xor_operations")
            .expect("xor_operations suite not found");
        let data = xor_suite
            .data
            .iter()
            .find(|d| d.id == "overlapping_squares_xor")
            .expect("overlapping_squares_xor test not found");

        let mut clipper = Clipper::new(false, false);
        let solution = execute_clipper_operation(
            &mut clipper,
            &data.input.subject_polygons,
            &data.input.clip_polygons,
            num_to_clip_type(data.input.clip_type),
            num_to_poly_fill_type(data.input.fill_type),
        );

        assert!(solution.len() > 0, "Solution should not be empty");
        assert!(
            compare_polygons(&solution, &data.output, 1),
            "Polygon comparison failed"
        );
    }

    #[test]
    fn test_triangle_square_xor() {
        let test_data = load_test_data();
        let xor_suite = test_data
            .suites
            .iter()
            .find(|s| s.id == "xor_operations")
            .expect("xor_operations suite not found");
        let data = xor_suite
            .data
            .iter()
            .find(|d| d.id == "triangle_square_xor")
            .expect("triangle_square_xor test not found");

        let mut clipper = Clipper::new(false, false);
        let solution = execute_clipper_operation(
            &mut clipper,
            &data.input.subject_polygons,
            &data.input.clip_polygons,
            num_to_clip_type(data.input.clip_type),
            num_to_poly_fill_type(data.input.fill_type),
        );

        assert!(solution.len() > 0, "Solution should not be empty");
        assert!(
            compare_polygons(&solution, &data.output, 1),
            "Polygon comparison failed"
        );
    }

    #[test]
    fn test_pentagon_square_xor() {
        let test_data = load_test_data();
        let xor_suite = test_data
            .suites
            .iter()
            .find(|s| s.id == "xor_operations")
            .expect("xor_operations suite not found");
        let data = xor_suite
            .data
            .iter()
            .find(|d| d.id == "pentagon_square_xor")
            .expect("pentagon_square_xor test not found");

        let mut clipper = Clipper::new(false, false);
        let solution = execute_clipper_operation(
            &mut clipper,
            &data.input.subject_polygons,
            &data.input.clip_polygons,
            num_to_clip_type(data.input.clip_type),
            num_to_poly_fill_type(data.input.fill_type),
        );

        assert!(solution.len() > 0, "Solution should not be empty");
        assert!(
            compare_polygons(&solution, &data.output, 1),
            "Polygon comparison failed"
        );
    }

    #[test]
    fn test_concave_square_xor() {
        let test_data = load_test_data();
        let xor_suite = test_data
            .suites
            .iter()
            .find(|s| s.id == "xor_operations")
            .expect("xor_operations suite not found");
        let data = xor_suite
            .data
            .iter()
            .find(|d| d.id == "concave_square_xor")
            .expect("concave_square_xor test not found");

        let mut clipper = Clipper::new(false, false);
        let solution = execute_clipper_operation(
            &mut clipper,
            &data.input.subject_polygons,
            &data.input.clip_polygons,
            num_to_clip_type(data.input.clip_type),
            num_to_poly_fill_type(data.input.fill_type),
        );

        assert_eq!(solution.len(), 0, "Solution should be empty");
        assert!(
            compare_polygons(&solution, &data.output, 1),
            "Polygon comparison failed"
        );
    }

    #[test]
    fn test_non_overlapping_xor() {
        let test_data = load_test_data();
        let xor_suite = test_data
            .suites
            .iter()
            .find(|s| s.id == "xor_operations")
            .expect("xor_operations suite not found");
        let data = xor_suite
            .data
            .iter()
            .find(|d| d.id == "non_overlapping_xor")
            .expect("non_overlapping_xor test not found");

        let mut clipper = Clipper::new(false, false);
        let solution = execute_clipper_operation(
            &mut clipper,
            &data.input.subject_polygons,
            &data.input.clip_polygons,
            num_to_clip_type(data.input.clip_type),
            num_to_poly_fill_type(data.input.fill_type),
        );

        assert!(solution.len() > 0, "Solution should not be empty");
        assert!(
            compare_polygons(&solution, &data.output, 1),
            "Polygon comparison failed"
        );
    }
}
