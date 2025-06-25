use crate::clipper::clipper::Clipper;
use crate::clipper::enums::{ClipType, PolyFillType, PolyType};
use crate::clipper::utils::get_area;
use crate::geometry::point::Point;
use crate::utils::math::cycle_index;

pub struct ClipperOffset {
    src_polygon: Vec<Point<i32>>,
}

impl ClipperOffset {
    pub fn new() -> Self {
        Self {
            src_polygon: Vec::new(),
        }
    }

    pub unsafe fn execute(
        &mut self,
        polygon: &mut Vec<Point<i32>>,
        delta: i32,
    ) -> Vec<Vec<Point<i32>>> {
        self.src_polygon = self.format_path(polygon);

        let mut result: Vec<Vec<Point<i32>>> = Vec::new();
        let mut dest_polygon = self.do_offset(delta);
        let mut clipper = Clipper::new();

        clipper.base.add_path(&mut dest_polygon, PolyType::Subject);

        if delta > 0 {
            clipper.execute(ClipType::Union, &mut result, PolyFillType::Positive);
        } else {
            let outer: Vec<Point<i32>> = ClipperOffset::get_outer_bounds(&mut dest_polygon);

            clipper.base.add_path(&outer, PolyType::Subject);
            clipper.reverse_solution = true;
            clipper.execute(ClipType::Union, &mut result, PolyFillType::Negative);

            if !result.is_empty() {
                result.remove(0);
            }
        }

        return result;
    }

    unsafe fn format_path(&self, polygon: &Vec<Point<i32>>) -> Vec<Point<i32>> {
        let mut high_index = polygon.len().saturating_sub(1);
        while high_index > 0 && polygon[0].almost_equal(&polygon[high_index], None) {
            high_index -= 1;
        }

        let mut result = vec![polygon[0].clone_i32()];
        let mut j = 0;

        for i in 1..=high_index {
            if !result[j].almost_equal(&polygon[i], None) {
                j += 1;
                result.push(polygon[i].clone_i32());
            }
        }

        if j >= 2 && get_area(&result) < 0.0 {
            result.reverse();
        }

        result
    }

    unsafe fn do_offset(&self, delta: i32) -> Vec<Point<i32>> {
        let point_count = self.src_polygon.len();
        let mut result = Vec::new();

        if point_count == 1 {
            let mut point = Point::<i32>::new(Some(-1), Some(-1));
            for _ in 0..4 {
                let mut p = Point::<i32>::from(&point);

                p.scale_up(delta);
                p.add(&self.src_polygon[0]);

                result.push(p);

                if point.x < 0 {
                    point.x = 1;
                } else if point.y < 0 {
                    point.y = 1;
                } else {
                    point.x = -1;
                }
            }
        } else {
            let mut normals = Vec::with_capacity(point_count);
            let mut temp = Point::<f32>::new(None, None);

            for i in 0..point_count {
                let next = &self.src_polygon[cycle_index(i, point_count, 1)];
                let mut normal = next.clone_f32();
                temp.set(self.src_polygon[i].x as f32, self.src_polygon[i].y as f32);
                normal.sub(&temp);
                normal.normal();
                normal.normalize();
                normals.push(normal);
            }

            let mut k = point_count - 1;
            for i in 0..point_count {
                k = self.offset_point(&mut result, &mut normals, delta, i, k);
            }
        }

        result
    }

    unsafe fn offset_point(
        &self,
        polygon: &mut Vec<Point<i32>>,
        normals: &mut Vec<Point<f32>>,
        delta: i32,
        i: usize,
        k: usize,
    ) -> usize {
        let mut sin_a = normals[i].cross(&normals[k]);

        if sin_a.abs() < 0.00005 {
            return k;
        }

        sin_a = sin_a.clamp(-1.0, 1.0);

        let current_point = self.src_polygon[i].clone_f32();
        let normal1 = &normals[i];
        let normal2 = &normals[k];
        let mut tmp_point = Point::<f32>::new(None, None);

        if sin_a * (delta as f32) < 0.0 {
            tmp_point.update(normal2);
            tmp_point.scale_up(delta as f32);
            tmp_point.add(&current_point);
            tmp_point.clipper_round();
            polygon.push(tmp_point.clone_i32());

            polygon.push(current_point.clone_i32());

            tmp_point.update(normal1);
            tmp_point.scale_up(delta as f32);
            tmp_point.add(&current_point);
            tmp_point.clipper_round();
            polygon.push(tmp_point.clone_i32());
        } else {
            let r = 1.0 + normal1.dot(normal2);

            if r >= 1.8 {
                // mitter
                let q = (delta as f32) / r;
                tmp_point.update(normal2);
                tmp_point.add(normal1);
                tmp_point.scale_up(q);
                tmp_point.add(&current_point);
                tmp_point.clipper_round();
                polygon.push(tmp_point.clone_i32());
            } else {
                // square
                let dx = (sin_a.atan2(normal2.dot(normal1)) * 0.25).tan();

                tmp_point.update(normal2);
                tmp_point.normal();
                tmp_point.scale_up(dx);
                tmp_point.reverse();
                tmp_point.add(normal2);
                tmp_point.scale_up(delta as f32);
                tmp_point.add(&current_point);

                polygon.push(tmp_point.clone_i32());

                tmp_point.update(normal1);
                tmp_point.normal();
                tmp_point.scale_up(dx);
                tmp_point.add(normal1);
                tmp_point.scale_up(delta as f32);
                tmp_point.add(&current_point);

                polygon.push(tmp_point.clone_i32());
            }
        }

        i
    }

    fn get_outer_bounds(path: &Vec<Point<i32>>) -> Vec<Point<i32>> {
        let mut left = path[0].x;
        let mut right = path[0].x;
        let mut top = path[0].y;
        let mut bottom = path[0].y;

        for point in path.iter() {
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
}
