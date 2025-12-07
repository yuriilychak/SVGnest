use super::constants::{AREA_TRASHOLD, CLEAN_TRASHOLD, CLIPPER_SCALE};
use super::{clipper::Clipper, ClipType, PolyFillType, PolyType};
use crate::nesting::nfp_wrapper::NFPWrapper;
use crate::utils::number::Number;
use crate::{geometry::point::Point, utils::math::cycle_index};

/// Shows an error message as a warning in the terminal
/// Equivalent to TypeScript's showError function
pub fn show_error(message: &str) {
    eprintln!("Warning: {}", message);
}

/// Pack a polygon of Point<i32> into a flat Vec<i32>
/// Used for area calculations and other operations that need flat arrays
fn pack_polygon_to_i32(polygon: &[Point<i32>]) -> Vec<i32> {
    let mut out = Vec::with_capacity(polygon.len() * 2);
    for p in polygon {
        out.push(p.x);
        out.push(p.y);
    }
    out
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

/// Clean multiple polygons by removing points that are too close together
///
/// # Arguments
/// * `paths` - Vector of polygons to clean
/// * `distance` - Threshold distance for cleaning
///
/// # Returns
/// Vector of cleaned polygons (empty polygons are removed)
pub fn clean_polygons(paths: &Vec<Vec<Point<i32>>>, distance: f64) -> Vec<Vec<Point<i32>>> {
    let mut result = Vec::with_capacity(paths.len());

    for path in paths.iter() {
        let cleaned = clean_polygon(path, distance);
        if !cleaned.is_empty() {
            result.push(cleaned);
        }
    }

    result
}

/// Perform a Clipper Difference operation and return the cleaned and filtered result
///
/// This function:
/// 1. Performs a Difference operation (clipper_bin_nfp minus combined_nfp)
/// 2. Cleans the resulting polygons using CLEAN_TRASHOLD
/// 3. Filters out polygons with area smaller than AREA_TRASHOLD
///
/// # Arguments
/// * `combined_nfp` - Polygons to subtract (Clip type)
/// * `clipper_bin_nfp` - Base polygons (Subject type)
///
/// # Returns
/// Vector of cleaned and filtered polygons, or empty vector if operation fails
pub fn get_final_nfp(
    combined_nfp: &Vec<Vec<Point<i32>>>,
    clipper_bin_nfp: &Vec<Vec<Point<i32>>>,
) -> Vec<Vec<Point<i32>>> {
    let mut clipper = Clipper::new(false, false);

    // Add paths - combined_nfp is what we're subtracting FROM clipper_bin_nfp
    clipper.add_paths(combined_nfp, PolyType::Clip);
    clipper.add_paths(clipper_bin_nfp, PolyType::Subject);

    // Execute the Difference operation
    let mut result = Vec::new();
    if !clipper.execute(ClipType::Difference, &mut result, PolyFillType::NonZero) {
        return Vec::new();
    }

    // Clean the polygons
    let mut final_nfp = clean_polygons(&result, CLEAN_TRASHOLD as f64);

    // Filter out small polygons based on area threshold
    final_nfp.retain(|polygon| {
        let packed = pack_polygon_to_i32(polygon);
        let area = i32::abs_polygon_area(&packed);
        area >= AREA_TRASHOLD as f64
    });

    final_nfp
}

/// Combine multiple polygons using a Union operation
///
/// This function performs a Clipper Union operation to combine all input polygons
///
/// # Arguments
/// * `total_nfps` - Vector of polygons to combine
///
/// # Returns
/// Vector of combined polygons, or empty vector if operation fails or input is empty
pub fn get_combined_nfps(total_nfps: &Vec<Vec<Point<i32>>>) -> Vec<Vec<Point<i32>>> {
    if total_nfps.is_empty() {
        return Vec::new();
    }

    let mut clipper = Clipper::new(false, false);

    // Add all paths as Subject type
    for polygon in total_nfps.iter() {
        clipper.add_path(polygon, PolyType::Subject);
    }

    // Execute the Union operation
    let mut result = Vec::new();
    if !clipper.execute(ClipType::Union, &mut result, PolyFillType::NonZero) {
        return Vec::new();
    }

    result
}

/// Apply NFPs with offset and filter by area threshold
///
/// This function:
/// 1. Creates an NFPWrapper from the provided buffer
/// 2. Extracts NFP polygons from the NFPWrapper
/// 3. Converts each NFP to clipper coordinates with the given offset
/// 4. Filters out polygons with area smaller than AREA_TRASHOLD
///
/// # Arguments
/// * `nfp_buffer` - Buffer containing serialized NFP data (Vec<f32>)
/// * `offset` - Offset point to apply to all NFP polygons (in f32 coordinates)
///
/// # Returns
/// Vector of polygons (each polygon is a Vec<Point<i32>>) that meet the area threshold
pub fn apply_nfps(nfp_buffer: Vec<f32>, offset: &Point<f32>) -> Vec<Vec<Point<i32>>> {
    // Convert f32 buffer to byte buffer for NFPWrapper
    let byte_buffer: Vec<u8> = nfp_buffer
        .iter()
        .flat_map(|&f| f.to_le_bytes())
        .collect();
    
    let nfp_wrapper = NFPWrapper::new(&byte_buffer);
    let nfp_count = nfp_wrapper.count();
    let mut result = Vec::with_capacity(nfp_count);

    for i in 0..nfp_count {
        let mem_seg = nfp_wrapper.get_nfp_mem_seg(i);
        let clone = from_mem_seg(&mem_seg, Some(offset), false);

        // Calculate area and check threshold
        let packed = pack_polygon_to_i32(&clone);
        let area = i32::abs_polygon_area(&packed);

        if area > AREA_TRASHOLD as f64 {
            result.push(clone);
        }
    }

    result
}
