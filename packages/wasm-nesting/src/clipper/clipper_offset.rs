use crate::clipper::clipper::Clipper;
use crate::clipper::enums::{ClipType, PolyFillType, PolyType};
use crate::geometry::point::Point;
use crate::utils::math::cycle_index;
use crate::utils::number::Number;

/// ClipperOffset - Performs polygon offsetting (expansion/contraction)
/// Ported from TypeScript version in clipper-offset.ts
pub struct ClipperOffset {
    // Vec<Point<i32>>
    pub(crate) src_polygon: Vec<Point<i32>>,
}

impl ClipperOffset {
    /// Creates a new ClipperOffset instance
    pub fn new() -> Self {
        Self {
            src_polygon: Vec::new(),
        }
    }

    /// Execute the offset operation on a polygon
    ///
    /// # Arguments
    /// * `polygon` - Vec<Point<i32>> - Input polygon
    /// * `delta` - i32 - Offset distance (positive = expansion, negative = contraction)
    ///
    /// # Returns
    /// Vec<Vec<Point<i32>>> - Result polygons
    pub fn execute(&mut self, polygon: &Vec<Point<i32>>, delta: i32) -> Vec<Vec<Point<i32>>> {
        self.src_polygon = self.format_path(polygon);

        let mut result: Vec<Vec<Point<i32>>> = Vec::new();
        let dest_polygon = self.do_offset(delta);
        let mut clipper = Clipper::new(delta <= 0, false);

        clipper.add_path(&dest_polygon, PolyType::Subject);

        if delta > 0 {
            clipper.execute(ClipType::Union, &mut result, PolyFillType::Positive);
        } else {
            let outer = Self::get_outer_bounds(&dest_polygon);

            clipper.add_path(&outer, PolyType::Subject);
            clipper.execute(ClipType::Union, &mut result, PolyFillType::Negative);

            if result.len() > 0 {
                result.remove(0);
            }
        }

        result
    }

    /// Format the input path by removing duplicate points and ensuring correct orientation
    ///
    /// # Arguments
    /// * `polygon` - Vec<Point<i32>> - Input polygon
    ///
    /// # Returns
    /// Vec<Point<i32>> - Formatted polygon
    fn format_path(&self, polygon: &Vec<Point<i32>>) -> Vec<Point<i32>> {
        let mut high_index: isize = polygon.len() as isize - 1;

        // Strip duplicate points from path
        unsafe {
            while high_index > 0 && polygon[0].almost_equal(&polygon[high_index as usize], None) {
                high_index -= 1;
            }
        }

        let mut result: Vec<Point<i32>> = Vec::new();
        result.push(polygon[0]);

        let mut j: usize = 0;
        for i in 1..=high_index as usize {
            unsafe {
                if !result[j].almost_equal(&polygon[i], None) {
                    j += 1;
                    result.push(polygon[i]);
                }
            }
        }

        if j >= 2 {
            let area = Self::get_area(&result);
            if area < 0.0 {
                result.reverse();
            }
        }

        result
    }

    /// Perform the actual offset operation
    ///
    /// # Arguments
    /// * `delta` - i32 - Offset distance
    ///
    /// # Returns
    /// Vec<Point<i32>> - Offset polygon
    fn do_offset(&self, delta: i32) -> Vec<Point<i32>> {
        let point_count = self.src_polygon.len();
        let mut result: Vec<Point<i32>> = Vec::new();

        if point_count == 1 {
            // Single point - create a square around it
            let mut point = Point::<i32>::new(Some(-1), Some(-1));

            for _ in 0..4 {
                unsafe {
                    let mut offset_point = Point::<i32>::new(Some(point.x), Some(point.y));
                    offset_point.scale_up(delta);
                    offset_point.add(&self.src_polygon[0]);
                    result.push(offset_point);

                    if point.x < 0 {
                        point.x = 1;
                    } else if point.y < 0 {
                        point.y = 1;
                    } else {
                        point.x = -1;
                    }
                }
            }
        } else {
            // Multiple points - calculate normals and offset each point
            let mut normals: Vec<Point<f32>> = vec![Point::new(None, None); point_count];

            for i in 0..point_count {
                let next_index = cycle_index(i, point_count, 1);
                let mut normal = self.src_polygon[next_index].clone_f32();
                let current = self.src_polygon[i].clone_f32();

                unsafe {
                    normal.sub(&current);
                    normal.normal();
                    normal.normalize();
                }

                normals[i] = normal;
            }

            let mut k: usize = point_count - 1;

            for i in 0..point_count {
                k = self.offset_point(&mut result, &normals, delta as f32, i, k);
            }
        }

        result
    }

    /// Offset a single point using normals
    ///
    /// # Arguments
    /// * `polygon` - &mut Vec<Point<i32>> - Output polygon
    /// * `normals` - &Vec<Point<f32>> - Normal vectors
    /// * `delta` - f32 - Offset distance
    /// * `i` - usize - Current point index
    /// * `k` - usize - Previous point index
    ///
    /// # Returns
    /// usize - Current point index (becomes next k)
    fn offset_point(
        &self,
        polygon: &mut Vec<Point<i32>>,
        normals: &Vec<Point<f32>>,
        delta: f32,
        i: usize,
        k: usize,
    ) -> usize {
        unsafe {
            let mut sin_a: f64 = normals[i].cross(&normals[k]) as f64;

            if sin_a.abs() < 0.00005 {
                return k;
            }

            if sin_a > 1.0 {
                sin_a = 1.0;
            } else if sin_a < -1.0 {
                sin_a = -1.0;
            }

            let current_point = &self.src_polygon[i];
            let normal1 = &normals[i];
            let normal2 = &normals[k];
            let mut tmp_point = Point::<f32>::new(None, None);

            if sin_a * (delta as f64) < 0.0 {
                // Concave corner - add multiple points
                tmp_point.update(normal2);
                tmp_point.scale_up(delta);
                tmp_point.add(&current_point.clone_f32());
                tmp_point.clipper_round();
                polygon.push(tmp_point.clone_i32());

                polygon.push(*current_point);

                tmp_point.update(normal1);
                tmp_point.scale_up(delta);
                tmp_point.add(&current_point.clone_f32());
                tmp_point.clipper_round();
                polygon.push(tmp_point.clone_i32());
            } else {
                // Convex corner
                let r: f64 = 1.0 + normal1.dot(normal2) as f64;

                // Miter
                if r >= 1.8 {
                    let q: f64 = delta as f64 / r;
                    tmp_point.update(normal2);
                    tmp_point.add(normal1);
                    tmp_point.scale_up(q as f32);
                    tmp_point.add(&current_point.clone_f32());
                    tmp_point.clipper_round();
                    polygon.push(tmp_point.clone_i32());
                } else {
                    // Square
                    let dot_product = normal2.dot(normal1);
                    let dx: f64 = (sin_a.atan2(dot_product as f64) * 0.25).tan();

                    tmp_point.update(normal2);
                    tmp_point.normal();
                    tmp_point.scale_up(dx as f32);
                    tmp_point.reverse();
                    tmp_point.add(normal2);
                    tmp_point.scale_up(delta);
                    tmp_point.add(&current_point.clone_f32());
                    polygon.push(tmp_point.clone_i32());

                    tmp_point.update(normal1);
                    tmp_point.normal();
                    tmp_point.scale_up(dx as f32);
                    tmp_point.add(normal1);
                    tmp_point.scale_up(delta);
                    tmp_point.add(&current_point.clone_f32());
                    polygon.push(tmp_point.clone_i32());
                }
            }
        }

        i
    }

    /// Get the outer bounding box of a polygon with padding
    ///
    /// # Arguments
    /// * `path` - &Vec<Point<i32>> - Input polygon
    ///
    /// # Returns
    /// Vec<Point<i32>> - Bounding box polygon (4 points)
    fn get_outer_bounds(path: &Vec<Point<i32>>) -> Vec<Point<i32>> {
        let point_count = path.len();
        let mut left: i32 = path[0].x;
        let mut right: i32 = path[0].x;
        let mut top: i32 = path[0].y;
        let mut bottom: i32 = path[0].y;

        for i in 0..point_count {
            let point = &path[i];
            left = left.min(point.x);
            right = right.max(point.x);
            top = top.min(point.y);
            bottom = bottom.max(point.y);
        }

        vec![
            Point::new(Some(left - 10), Some(bottom + 10)),
            Point::new(Some(right + 10), Some(bottom + 10)),
            Point::new(Some(right + 10), Some(top - 10)),
            Point::new(Some(left - 10), Some(top - 10)),
        ]
    }

    /// Helper function to get the area of a polygon
    /// Uses the polygon_area function from Number trait
    ///
    /// # Arguments
    /// * `polygon` - &Vec<Point<i32>> - Input polygon
    ///
    /// # Returns
    /// f64 - Negative area (to match TypeScript getArea behavior)
    fn get_area(polygon: &Vec<Point<i32>>) -> f64 {
        // Convert Vec<Point<i32>> to flat i32 array
        let mut poly_data: Vec<i32> = Vec::with_capacity(polygon.len() * 2);
        for point in polygon.iter() {
            poly_data.push(point.x);
            poly_data.push(point.y);
        }

        -i32::polygon_area(&poly_data)
    }

    /// Create a new ClipperOffset instance (factory method)
    pub fn create() -> Self {
        Self::new()
    }
}

impl Default for ClipperOffset {
    fn default() -> Self {
        Self::new()
    }
}
