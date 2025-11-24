use super::constants::{CLEAN_TRASHOLD, CLIPPER_SCALE};
use crate::{geometry::point::Point, utils::math::cycle_index};

/// Shows an error message as a warning in the terminal
/// Equivalent to TypeScript's showError function
pub fn show_error(message: &str) {
    eprintln!("Warning: {}", message);
}

/// Converts a memory segment (Float32Array equivalent) to a vector of i32 Points
///
/// # Arguments
/// * `mem_seg` - Flat array of f32 values representing points (x0, y0, x1, y1, ...)
/// * `offset` - Optional offset point to add to each point (in f32 coordinates)
/// * `is_round` - Whether to round the scaled values
///
/// # Returns
/// Vector of Point<i32> scaled by CLIPPER_SCALE and optionally cleaned
pub fn from_mem_seg(
    mem_seg: &[f32],
    offset: Option<&Point<f32>>,
    is_round: bool,
) -> Vec<Point<i32>> {
    let clean_threshold: f64 = if offset.is_none() {
        -1.0
    } else {
        CLEAN_TRASHOLD as f64
    };
    let point_count = mem_seg.len() >> 1;
    let mut result: Vec<Point<i32>> = Vec::with_capacity(point_count);

    for i in 0..point_count {
        let idx = i << 1;
        let mut x = mem_seg[idx];
        let mut y = mem_seg[idx + 1];

        // Add offset if provided
        if let Some(off) = offset {
            x += off.x;
            y += off.y;
        }

        // Scale up by CLIPPER_SCALE
        x *= CLIPPER_SCALE as f32;
        y *= CLIPPER_SCALE as f32;

        // Round if requested
        let final_x = if is_round { x.round() as i32 } else { x as i32 };
        let final_y = if is_round { y.round() as i32 } else { y as i32 };

        result.push(Point::new(Some(final_x), Some(final_y)));
    }

    // Clean polygon if threshold is set
    if clean_threshold > 0.0 {
        clean_polygon(&result, clean_threshold)
    } else {
        result
    }
}

/// Converts a vector of i32 Points to a memory segment (Vec<f32> equivalent to Float32Array)
///
/// # Arguments
/// * `polygon` - Vector of Point<i32> to convert
///
/// # Returns
/// Vector of f32 values representing flattened points (x0, y0, x1, y1, ...) scaled down by CLIPPER_SCALE
pub fn to_mem_seg(polygon: &[Point<i32>]) -> Vec<f32> {
    let point_count = polygon.len();
    let mut result = Vec::with_capacity(point_count << 1);
    let scale = CLIPPER_SCALE as f64;

    for point in polygon.iter() {
        let x = (point.x as f64 / scale) as f32;
        let y = (point.y as f64 / scale) as f32;
        result.push(x);
        result.push(y);
    }

    result
}

pub fn clean_polygon(path: &Vec<Point<i32>>, distance: f64) -> Vec<Point<i32>> {
    let mut point_count = path.len();
    if point_count < 3 {
        return Vec::new();
    }

    let mut result: Vec<Point<i32>> = Vec::with_capacity(point_count);
    let mut marked: Vec<bool> = vec![false; point_count];

    for p in path.iter() {
        result.push(Point::<i32>::from(p));
    }

    let dist_sqrd = distance * distance;
    let mut curr_index = 0;

    unsafe {
        while curr_index < point_count && !marked[curr_index] && point_count > 2 {
            let prev_index = cycle_index(curr_index, point_count, -1);
            let next_index = cycle_index(curr_index, point_count, 1);

            let curr_point = &result[curr_index];
            let prev_point = &result[prev_index];
            let next_point = &result[next_index];

            if curr_point.close_to(&*prev_point, dist_sqrd) {
                marked[prev_index] = false;
                result.remove(curr_index);
                marked.remove(curr_index);
                point_count -= 1;
                if prev_index < curr_index {
                    curr_index = prev_index;
                } else {
                    curr_index = prev_index - 1;
                }
                marked[curr_index] = false;
            } else if prev_point.close_to(&*next_point, dist_sqrd) {
                result.remove(next_index);
                marked.remove(next_index);
                if next_index < curr_index {
                    result.remove(curr_index - 1);
                    marked.remove(curr_index - 1);
                } else {
                    result.remove(curr_index);
                    marked.remove(curr_index);
                }
                point_count -= 2;

                if prev_index < curr_index {
                    curr_index = prev_index;
                } else {
                    curr_index = prev_index - 2;
                }
                marked[curr_index] = false;
            } else if Point::slopes_near_collinear(
                &*prev_point,
                &*curr_point,
                &*next_point,
                dist_sqrd,
            ) {
                result.remove(curr_index);
                marked.remove(curr_index);
                point_count -= 1;
                if prev_index < curr_index {
                    curr_index = prev_index;
                } else {
                    curr_index = prev_index - 1;
                }
                marked[curr_index] = false;
            } else {
                marked[curr_index] = true;
                curr_index = cycle_index(curr_index, point_count, 1);
            }
        }
    }

    if point_count < 3 {
        Vec::new()
    } else {
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_from_mem_seg_basic() {
        // Test basic conversion without offset or rounding
        let mem_seg = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
        let result = from_mem_seg(&mem_seg, None, false);

        assert_eq!(result.len(), 3);
        assert_eq!(result[0].x, 100); // 1.0 * CLIPPER_SCALE (100)
        assert_eq!(result[0].y, 200); // 2.0 * CLIPPER_SCALE (100)
        assert_eq!(result[1].x, 300);
        assert_eq!(result[1].y, 400);
        assert_eq!(result[2].x, 500);
        assert_eq!(result[2].y, 600);
    }

    #[test]
    fn test_from_mem_seg_with_offset() {
        // Test conversion with offset - use a square to avoid clean_polygon removing points
        let mem_seg = vec![0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0];
        let offset = Point::new(Some(0.5_f32), Some(1.0_f32));
        let result = from_mem_seg(&mem_seg, Some(&offset), false);

        // Should form a valid polygon after cleaning
        assert!(
            result.len() >= 3,
            "Should have at least 3 points after cleaning"
        );
        // Verify first point is offset correctly
        assert_eq!(result[0].x, 50); // (0.0 + 0.5) * 100
        assert_eq!(result[0].y, 100); // (0.0 + 1.0) * 100
    }

    #[test]
    fn test_from_mem_seg_with_rounding() {
        // Test conversion with rounding
        let mem_seg = vec![1.234, 2.567, 3.891, 4.123];
        let result = from_mem_seg(&mem_seg, None, true);

        assert_eq!(result.len(), 2);
        assert_eq!(result[0].x, 123); // round(1.234 * 100) = 123
        assert_eq!(result[0].y, 257); // round(2.567 * 100) = 257
        assert_eq!(result[1].x, 389); // round(3.891 * 100) = 389
        assert_eq!(result[1].y, 412); // round(4.123 * 100) = 412
    }

    #[test]
    fn test_from_mem_seg_with_offset_and_rounding() {
        // Test conversion with both offset and rounding - use a triangle
        let mem_seg = vec![0.0, 0.0, 10.234, 0.0, 5.0, 10.567];
        let offset = Point::new(Some(0.1_f32), Some(0.2_f32));
        let result = from_mem_seg(&mem_seg, Some(&offset), true);

        assert!(
            result.len() >= 3,
            "Should have at least 3 points after cleaning"
        );
        assert_eq!(result[0].x, 10); // round((0.0 + 0.1) * 100) = 10
        assert_eq!(result[0].y, 20); // round((0.0 + 0.2) * 100) = 20
    }

    #[test]
    fn test_from_mem_seg_empty() {
        // Test with empty array
        let mem_seg: Vec<f32> = vec![];
        let result = from_mem_seg(&mem_seg, None, false);

        assert_eq!(result.len(), 0);
    }

    #[test]
    fn test_to_mem_seg_basic() {
        // Test basic conversion from i32 points to f32 memory segment
        let polygon = vec![
            Point::new(Some(100), Some(200)),
            Point::new(Some(300), Some(400)),
            Point::new(Some(500), Some(600)),
        ];
        let result = to_mem_seg(&polygon);

        assert_eq!(result.len(), 6);
        assert_eq!(result[0], 1.0); // 100 / CLIPPER_SCALE (100)
        assert_eq!(result[1], 2.0); // 200 / CLIPPER_SCALE (100)
        assert_eq!(result[2], 3.0); // 300 / 100
        assert_eq!(result[3], 4.0); // 400 / 100
        assert_eq!(result[4], 5.0); // 500 / 100
        assert_eq!(result[5], 6.0); // 600 / 100
    }

    #[test]
    fn test_to_mem_seg_with_decimals() {
        // Test conversion that results in decimal values
        let polygon = vec![
            Point::new(Some(123), Some(257)),
            Point::new(Some(389), Some(412)),
        ];
        let result = to_mem_seg(&polygon);

        assert_eq!(result.len(), 4);
        assert!((result[0] - 1.23).abs() < 0.01); // 123 / 100 = 1.23
        assert!((result[1] - 2.57).abs() < 0.01); // 257 / 100 = 2.57
        assert!((result[2] - 3.89).abs() < 0.01); // 389 / 100 = 3.89
        assert!((result[3] - 4.12).abs() < 0.01); // 412 / 100 = 4.12
    }

    #[test]
    fn test_to_mem_seg_empty() {
        // Test with empty polygon
        let polygon: Vec<Point<i32>> = vec![];
        let result = to_mem_seg(&polygon);

        assert_eq!(result.len(), 0);
    }

    #[test]
    fn test_roundtrip_conversion() {
        // Test that converting from mem_seg to polygon and back preserves data
        let original_mem_seg = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
        let polygon = from_mem_seg(&original_mem_seg, None, false);
        let result_mem_seg = to_mem_seg(&polygon);

        assert_eq!(original_mem_seg.len(), result_mem_seg.len());
        for i in 0..original_mem_seg.len() {
            assert!((original_mem_seg[i] - result_mem_seg[i]).abs() < 0.01);
        }
    }
}
