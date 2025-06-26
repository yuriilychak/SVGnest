use crate::clipper::clipper::Clipper;
use crate::clipper::enums::{ClipType, PolyFillType, PolyType};
use crate::clipper::out_pt::OutPt;
use crate::constants::{CLEAN_TRASHOLD, CLIPPER_SCALE};
use crate::geometry::point::Point;
use crate::nest_config::NestConfig;

pub struct ClipperWrapper {
    configuration: NestConfig,
}

impl ClipperWrapper {
    pub fn new(packed_config: u32) -> Self {
        let mut configuration = NestConfig::new();

        configuration.deserialize(packed_config);

        Self { configuration }
    }

    pub unsafe fn clean_node(&mut self, mem_seg: &mut Vec<f32>) -> Vec<f32> {
        let clipper_polygon = ClipperWrapper::from_mem_seg(mem_seg, None, None);
        let mut simple: Vec<Vec<Point<i32>>> = Vec::new();
        let mut clipper = Clipper::new();

        clipper.strictly_simple = true;
        clipper.base.add_path(&clipper_polygon, PolyType::Subject);
        clipper.execute(ClipType::Union, &mut simple, PolyFillType::NonZero);

        if simple.is_empty() {
            return Vec::new();
        }

        let mut biggest = simple.remove(0);
        let mut biggest_area = Point::get_area_abs(&biggest);

        while !simple.is_empty() {
            let current = simple.remove(0);
            let area = Point::get_area_abs(&current);

            if area > biggest_area {
                biggest = current;
                biggest_area = area;
            }
        }

        // clean up singularities, coincident points and edges
        let clean_trashold = self.configuration.curve_tolerance * (CLIPPER_SCALE as f32);
        let cleared_polygon = OutPt::clean_polygon(&mut biggest, clean_trashold as f64);

        if cleared_polygon.is_empty() {
            return Vec::new();
        }

        let mut result: Vec<f32> = vec![0.0; cleared_polygon.len() >> 1];

        ClipperWrapper::to_mem_seg(cleared_polygon, &mut result);

        result
    }

    pub unsafe fn from_mem_seg(
        mem_seg: &mut Vec<f32>,
        offset: Option<*mut Point<f32>>,
        is_round: Option<bool>,
    ) -> Vec<Point<i32>> {
        let inner_is_round = is_round.unwrap_or(false);
        let clean_trashold = if offset.is_none() {
            -1.0
        } else {
            CLEAN_TRASHOLD
        };

        let seg_count = mem_seg.len() >> 1;
        let mut result: Vec<Point<i32>> = Vec::new();
        let mut point = Point::<f32>::new(None, None);

        for i in 0..seg_count {
            point.from_mem_seg(mem_seg, i, 0);

            if let Some(orig) = offset {
                point.add(orig);
            }

            point.scale_up(CLIPPER_SCALE as f32);

            if inner_is_round {
                point.round();
            }

            result.push(point.clone_i32());
        }

        return if clean_trashold != -1.0 {
            OutPt::clean_polygon(&result, clean_trashold as f64)
        } else {
            result
        };
    }

    pub unsafe fn to_mem_seg(polygon: Vec<Point<i32>>, mem_seg: &mut Vec<f32>) {
        let point_count = polygon.len();
        let mut temp_point: Point<f32> = Point::<f32>::new(None, None);

        for i in 0..point_count {
            temp_point.set(polygon[i].x as f32, polygon[i].y as f32);
            temp_point.scale_down(CLIPPER_SCALE as f32);
            temp_point.fill(mem_seg, i, None);
        }
    }
}
