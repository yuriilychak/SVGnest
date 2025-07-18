use crate::constants::VECTOR_MEM_OFFSET;
use crate::geometry::point::Point;
use crate::geometry::point_pool::PointPool;
use crate::geometry::polygon::Polygon;
use crate::nesting::pair_content::PairContent;
use crate::nesting::polygon_node::PolygonNode;
use crate::utils::almost_equal::AlmostEqual;
use crate::utils::bit_ops::{get_bits, set_bits};
use crate::utils::math::cycle_index;
use crate::utils::mid_value::MidValue;
use crate::utils::number::Number;
use num_traits::ToPrimitive;

struct SegmentCheck<T: Number> {
    pub point: *mut Point<T>,
    pub polygon: *mut Polygon<T>,
    pub segment_start: *mut Point<T>,
    pub segment_end: *mut Point<T>,
    pub check_start: *mut Point<T>,
    pub check_end: *mut Point<T>,
    pub target: *mut Point<T>,
    pub offset: *const Point<T>,
}

impl<T: Number> SegmentCheck<T> {
    pub unsafe fn new(
        point: *mut Point<T>,
        polygon: *mut Polygon<T>,
        segment_start: *mut Point<T>,
        segment_end: *mut Point<T>,
        check_start: *mut Point<T>,
        check_end: *mut Point<T>,
        target: *mut Point<T>,
        offset: *const Point<T>,
    ) -> Self {
        SegmentCheck {
            point,
            polygon,
            segment_start,
            segment_end,
            check_start,
            check_end,
            target,
            offset,
        }
    }
}

fn point_distance<T: Number>(
    pool: &mut PointPool<T>,
    p: *const Point<T>,
    s1: *const Point<T>,
    s2: *const Point<T>,
    input_normal: *const Point<T>,
    infinite: bool,
) -> f64 {
    let indices = pool.alloc(2);

    let normal_ptr = pool.get(indices, 0);
    let dir_ptr = pool.get(indices, 1);

    unsafe {
        (*normal_ptr).update(input_normal);
        (*normal_ptr).normalize();
        (*dir_ptr).update(normal_ptr);
        (*dir_ptr).normal();

        let dir = dir_ptr;
        let normal = normal_ptr;

        let pdot = (*dir).dot(p);
        let s1dot = (*dir).dot(s1);
        let s2dot = (*dir).dot(s2);

        let pdotnorm = (*normal).dot(p);
        let s1dotnorm = (*normal).dot(s1);
        let s2dotnorm = (*normal).dot(s2);

        if !infinite {
            if T::mid_value(pdot, s1dot, s2dot) > T::tol() {
                pool.malloc(indices);
                return f64::NAN;
            }

            if pdot.almost_equal(s1dot, None)
                && pdot.almost_equal(s2dot, None)
                && T::mid_value(pdotnorm, s1dotnorm, s2dotnorm) > T::zero()
            {
                pool.malloc(indices);
                return (pdotnorm - s1dotnorm.max_num(s2dotnorm)).to_f64().unwrap();
            }
        }

        pool.malloc(indices);

        let denom = s1dot - s2dot;
        if denom.almost_equal(T::zero(), None) {
            return f64::NAN;
        }

        let result = s1dotnorm - pdotnorm - ((s1dotnorm - s2dotnorm) * (s1dot - pdot)) / denom;

        result.to_f64().unwrap()
    }
}

fn coincedent_distance<T: Number>(
    pool: &mut PointPool<T>,
    point1: *const Point<T>,
    point2: *const Point<T>,
    point3: *const Point<T>,
    point4: *const Point<T>,
    direction: *const Point<T>,
    normal: *const Point<T>,
    overlap: f64,
    default_value: f64,
) -> f64 {
    unsafe {
        let dot1 = (*normal).dot(point1);
        let dot3 = (*normal).dot(point3);
        let dot4 = (*normal).dot(point4);

        if T::mid_value(dot1, dot3, dot4) >= T::zero() {
            return default_value;
        }

        let result = point_distance(pool, point1, point3, point4, direction, false);

        if result.is_nan() {
            return default_value;
        }

        if result.almost_equal(0.0, None) {
            let distance = point_distance(pool, point2, point3, point4, direction, true);

            if distance < 0.0 || (distance * overlap).almost_equal(0.0, None) {
                return default_value;
            }
        }

        if default_value.is_nan() {
            result
        } else {
            result.min(default_value)
        }
    }
}

fn segment_distance<T: Number>(
    pool: &mut PointPool<T>,
    a: *const Point<T>,
    b: *const Point<T>,
    e: *const Point<T>,
    f: *const Point<T>,
    direction: *const Point<T>,
) -> f64 {
    unsafe {
        let zero = T::zero();
        let mut shared_point_indices = pool.alloc(3);
        let normal = pool.get(shared_point_indices, 0);
        let reverse = pool.get(shared_point_indices, 1);
        let dir = pool.get(shared_point_indices, 2);

        (*normal).update(direction);
        (*normal).normal();
        (*reverse).update(direction);
        (*reverse).reverse();
        (*dir).update(direction);

        let dot_a = (*normal).dot(a);
        let dot_b = (*normal).dot(b);
        let dot_e = (*normal).dot(e);
        let dot_f = (*normal).dot(f);

        let cross_a = (*dir).dot(a);
        let cross_b = (*dir).dot(b);
        let cross_e = (*dir).dot(e);
        let cross_f = (*dir).dot(f);

        let min_ab = dot_a.min_num(dot_b);
        let max_ab = dot_a.max_num(dot_b);
        let max_ef = dot_e.max_num(dot_f);
        let min_ef = dot_e.min_num(dot_f);

        if (max_ab - min_ef < T::tol()) || (max_ef - min_ab < T::tol()) {
            pool.malloc(shared_point_indices);
            return f64::NAN;
        }

        let overlap =
            if (max_ab > max_ef && min_ab < min_ef) || (max_ef > max_ab && min_ef < min_ab) {
                1.0
            } else {
                let min_max = max_ab.min_num(max_ef);
                let max_min = min_ab.max_num(min_ef);
                (min_max - max_min).to_f64().unwrap()
                    / (max_ab.max_num(max_ef) - min_ab.min_num(min_ef))
                        .to_f64()
                        .unwrap()
            };

        let point_indices2 = pool.alloc(3);
        let diff_ab = pool.get(point_indices2, 0);
        let diff_ae = pool.get(point_indices2, 1);
        let diff_af = pool.get(point_indices2, 2);

        (*diff_ab).update(b);
        (*diff_ab).sub(a);
        (*diff_ae).update(e);
        (*diff_ae).sub(a);
        (*diff_af).update(f);
        (*diff_af).sub(a);

        let cross_abe = (*diff_ae).cross(diff_ab);
        let cross_abf = (*diff_af).cross(diff_ab);

        shared_point_indices |= point_indices2;

        if cross_abe.almost_equal(zero, None) && cross_abf.almost_equal(zero, None) {
            let point_indices3 = pool.alloc(2);
            let norm_ab = pool.get(point_indices3, 0);
            let norm_ef = pool.get(point_indices3, 1);

            (*norm_ab).update(b);
            (*norm_ab).sub(a);
            (*norm_ab).normal();
            (*norm_ab).normalize();
            (*norm_ef).update(f);
            (*norm_ef).sub(e);
            (*norm_ef).normal();
            (*norm_ef).normalize();

            shared_point_indices |= point_indices3;

            // segment normals must point in opposite directions
            if (*norm_ab).cross(norm_ef).almost_equal(T::zero(), None)
                && (*norm_ab).dot(norm_ef) < T::zero()
            {
                // normal of AB segment must point in same direction as given direction vector
                let normdot = (*norm_ab).dot(direction);
                if normdot.almost_equal(zero, None) {
                    pool.malloc(shared_point_indices);
                    return f64::NAN;
                }
                if normdot < zero {
                    pool.malloc(shared_point_indices);
                    return 0.0;
                }
            }

            pool.malloc(shared_point_indices);
            return f64::NAN;
        }

        let mut result = f64::NAN;

        if dot_a.almost_equal(dot_e, None) {
            result = (cross_a - cross_e).to_f64().unwrap();
        } else if dot_a.almost_equal(dot_f, None) {
            result = (cross_a - cross_f).to_f64().unwrap();
        } else {
            result = coincedent_distance(pool, a, b, e, f, reverse, normal, overlap, result);
        }

        if dot_b.almost_equal(dot_e, None) {
            result = if result.is_nan() {
                (cross_b - cross_e).to_f64().unwrap()
            } else {
                (cross_b - cross_e).to_f64().unwrap().min(result)
            };
        } else if dot_b.almost_equal(dot_f, None) {
            result = if result.is_nan() {
                (cross_b - cross_f).to_f64().unwrap()
            } else {
                (cross_b - cross_f).to_f64().unwrap().min(result)
            };
        } else {
            result = coincedent_distance(pool, b, a, e, f, reverse, normal, overlap, result);
        }

        result = coincedent_distance(pool, e, f, a, b, direction, normal, overlap, result);
        result = coincedent_distance(pool, f, e, a, b, direction, normal, overlap, result);

        pool.malloc(shared_point_indices);

        result
    }
}

fn polygon_projection_distance<T: Number>(
    pool: &mut PointPool<T>,
    polygon_a: *mut Polygon<T>,
    polygon_b: *mut Polygon<T>,
    direction: *const Point<T>,
    offset: *const Point<T>,
) -> f64 {
    let size_a = unsafe { (*polygon_a).length() };
    let size_b = unsafe { (*polygon_b).length() };

    let point_indices = pool.alloc(4);
    let p = pool.get(point_indices, 0);
    let s1 = pool.get(point_indices, 1);
    let s2 = pool.get(point_indices, 2);
    let s_offset = pool.get(point_indices, 3);

    let mut result = f64::NAN;

    for i in 0..size_b {
        let mut min_projection = f64::NAN;

        // p = polygonB.at(i) + offset
        unsafe {
            (*p).update(&*(*polygon_b).at(i));
            (*p).add(&*offset);
        }

        for j in 0..(size_a - 1) {
            unsafe {
                (*s1).update(&*(*polygon_a).at(j));
                (*s2).update(&*(*polygon_a).at(cycle_index(j, size_a, 1)));
                (*s_offset).update(s2);
                (*s_offset).sub(s1);

                if (*s_offset).cross(&*direction).almost_equal(T::zero(), None) {
                    continue;
                }

                let d = point_distance(pool, p, s1, s2, direction, false);

                if !d.is_nan() && (min_projection.is_nan() || d < min_projection) {
                    min_projection = d;
                }
            }
        }

        if !min_projection.is_nan() && (result.is_nan() || min_projection > result) {
            result = min_projection;
        }
    }

    pool.malloc(point_indices);

    result
}

fn polygon_slide_distance<T: Number>(
    pool: &mut PointPool<T>,
    polygon_a: *mut Polygon<T>,
    polygon_b: *mut Polygon<T>,
    direction: *const Point<T>,
    offset: *const Point<T>,
) -> f64 {
    let point_indices = pool.alloc(5);
    let a1 = pool.get(point_indices, 0);
    let a2 = pool.get(point_indices, 1);
    let b1 = pool.get(point_indices, 2);
    let b2 = pool.get(point_indices, 3);
    let dir = pool.get(point_indices, 4);

    let mut distance = f64::NAN;

    unsafe {
        (*dir).update(&*direction);
        (*dir).normalize();

        let size_a = (*polygon_a).length();
        let size_b = (*polygon_b).length();

        for i in 0..size_b {
            (*b1).update(&*(*polygon_b).at(i));
            (*b1).add(&*offset);
            (*b2).update(&*(*polygon_b).at(cycle_index(i, size_b, 1)));
            (*b2).add(&*offset);

            for j in 0..size_a {
                (*a1).update(&*(*polygon_a).at(j));
                (*a2).update(&*(*polygon_a).at(cycle_index(j, size_a, 1)));

                if (*a1).almost_equal(a2, None) || (*b1).almost_equal(b2, None) {
                    continue;
                }

                let d = segment_distance(
                    pool,
                    a1 as *const Point<T>,
                    a2 as *const Point<T>,
                    b1 as *const Point<T>,
                    b2 as *const Point<T>,
                    dir as *const Point<T>,
                );

                if !d.is_nan() && (distance.is_nan() || d < distance) {
                    if d > 0.0 || d.almost_equal(0.0, None) {
                        distance = d;
                    }
                }
            }
        }
    }

    pool.malloc(point_indices);

    if distance.is_nan() {
        distance
    } else {
        distance.max(0.0)
    }
}

unsafe fn no_fit_polygon_rectangle<T: Number>(
    pool: &mut PointPool<T>,
    polygon_a: *mut Polygon<T>,
    polygon_b: *mut Polygon<T>,
) -> Vec<Vec<f32>> {
    let indices = pool.alloc(2);

    let min_diff = pool.get(indices, 0);
    let max_diff = pool.get(indices, 1);

    (*min_diff).update((*polygon_a).position());
    (*min_diff).sub((*polygon_b).position());

    (*max_diff).update((*polygon_a).size());
    (*max_diff).sub((*polygon_b).size());

    if (*max_diff).x <= T::zero() || (*max_diff).y <= T::zero() {
        pool.malloc(indices);
        return Vec::new();
    }

    (*min_diff).add((*polygon_b).first());
    (*max_diff).add(min_diff);

    let x0 = (*min_diff).x.to_f32().unwrap();
    let y0 = (*min_diff).y.to_f32().unwrap();
    let x1 = (*max_diff).x.to_f32().unwrap();
    let y1 = (*max_diff).y.to_f32().unwrap();

    let rect: [f32; 8] = [x0, y0, x1, y0, x1, y1, x0, y1];

    pool.malloc(indices);

    let mut nfp_loops = Vec::with_capacity(1);

    nfp_loops.push(rect.to_vec());

    nfp_loops
}

unsafe fn update_intersect_point<T: Number>(
    point: *mut Point<T>,
    polygon: *mut Polygon<T>,
    index: usize,
    offset: isize,
) {
    let point_count = (*polygon).length();
    let mut current_index = cycle_index(index, point_count, offset);

    (*point).update((*polygon).at(index));

    if (*point).almost_equal((*polygon).at(current_index), None) {
        current_index = cycle_index(current_index, point_count, offset);
        (*point).update((*polygon).at(current_index));
    }
}

unsafe fn get_segment_stats<T: Number>(sc: &SegmentCheck<T>) -> Option<bool> {
    if (*sc.point).on_segment(sc.segment_start, sc.segment_end)
        || (*sc.point).almost_equal(sc.target, None)
    {
        let point_in1 = (*sc.polygon).point_in(sc.check_start, Some(sc.offset));
        let point_in2 = (*sc.polygon).point_in(sc.check_end, Some(sc.offset));

        return Some(point_in1.is_some() && point_in2.is_some() && point_in1 != point_in2);
    }

    None
}

unsafe fn line_equation<T: Number>(p1: *mut Point<T>, p2: *mut Point<T>) -> (T, T, T) {
    let x1 = (*p1).x;
    let y1 = (*p1).y;
    let x2 = (*p2).x;
    let y2 = (*p2).y;

    let a = y2 - y1;
    let b = x1 - x2;
    let c = x2 * y1 - x1 * y2;

    (a, b, c)
}

fn check_mid_value<T: Number>(x: f64, a: T, b: T) -> bool {
    x.mid_value(a.to_f64().unwrap(), b.to_f64().unwrap()) <= 0.0
}

unsafe fn line_intersect<T: Number>(
    a: *mut Point<T>,
    b: *mut Point<T>,
    e: *mut Point<T>,
    f: *mut Point<T>,
) -> bool {
    let (a1, b1, c1) = line_equation(a, b);
    let (a2, b2, c2) = line_equation(e, f);
    let denom = (a1 * b2 - a2 * b1).to_f64().unwrap();
    let x: f64 = (b1 * c2 - b2 * c1).to_f64().unwrap() / denom;
    let y: f64 = (a2 * c1 - a1 * c2).to_f64().unwrap() / denom;

    return (x.is_finite() && y.is_finite())
        && ((*a).almost_equal_x(b, None) || check_mid_value(x, (*a).x, (*b).x))
        && ((*a).almost_equal_y(b, None) || check_mid_value(y, (*a).y, (*b).y))
        && ((*e).almost_equal_x(f, None) || check_mid_value(x, (*e).x, (*f).x))
        && ((*e).almost_equal_y(f, None) || check_mid_value(y, (*e).y, (*f).y));
}

unsafe fn intersect<T: Number>(
    point_pool: &mut PointPool<T>,
    polygon_a: *mut Polygon<T>,
    polygon_b: *mut Polygon<T>,
    offset: *const Point<T>,
) -> bool {
    let indices = point_pool.alloc(9);
    let a0 = point_pool.get(indices, 0);
    let a1 = point_pool.get(indices, 1);
    let a2 = point_pool.get(indices, 2);
    let a3 = point_pool.get(indices, 3);
    let b0 = point_pool.get(indices, 4);
    let b1 = point_pool.get(indices, 5);
    let b2 = point_pool.get(indices, 6);
    let b3 = point_pool.get(indices, 7);
    let offset_a = point_pool.get(indices, 8);

    (*offset_a).set(T::zero(), T::zero());

    let point_count_a = (*polygon_a).length();
    let point_count_b = (*polygon_b).length();

    let segment_checks: [SegmentCheck<T>; 4] = [
        SegmentCheck::new(b1, polygon_a, a1, a2, b0, b2, a1, offset),
        SegmentCheck::new(b2, polygon_a, a1, a2, b1, b3, a2, offset),
        SegmentCheck::new(a1, polygon_b, b1, b2, a0, a2, b2, offset_a),
        SegmentCheck::new(a2, polygon_b, b1, b2, a1, a3, a1, offset_a),
    ];
    let segment_check_count = segment_checks.len();

    for i in 0..(point_count_a - 1) {
        (*a1).update((*polygon_a).at(i));
        (*a2).update((*polygon_a).at(i + 1));

        update_intersect_point(a0, polygon_a, i, -1);
        update_intersect_point(a3, polygon_a, i + 1, 1);

        for j in 0..(point_count_b - 1) {
            (*b1).update((*polygon_b).at(j));
            (*b2).update((*polygon_b).at(j + 1));

            update_intersect_point(b0, polygon_b, j, -1);
            update_intersect_point(b3, polygon_b, j + 1, 1);

            (*b0).add(offset);
            (*b1).add(offset);
            (*b2).add(offset);
            (*b3).add(offset);

            let mut segment_stats: Option<bool> = None;

            for k in 0..segment_check_count {
                segment_stats = get_segment_stats(&segment_checks[k]);
                if segment_stats.is_some() {
                    break;
                }
            }

            if segment_stats == Some(true)
                || (segment_stats.is_none() && line_intersect(b1, b2, a1, a2))
            {
                point_pool.malloc(indices);

                return true;
            }
        }
    }

    point_pool.malloc(indices);

    false
}

unsafe fn get_nfp_looped<T: Number>(
    nfp: &[T],
    reference: *const Point<T>,
    pool: &mut PointPool<T>,
) -> bool {
    let point_count = nfp.len() >> 1;

    if point_count == 0 {
        return false;
    }

    let indices = pool.alloc(1);
    let point = pool.get(indices, 0);

    for i in 0..(point_count - 1) {
        let base = i << 1;
        let x = *nfp.get_unchecked(base);
        let y = *nfp.get_unchecked(base + 1);

        (*point).set(x, y);

        if (*point).almost_equal(reference, None) {
            pool.malloc(indices);
            return true;
        }
    }

    pool.malloc(indices);

    false
}

unsafe fn find_translate<T: Number>(
    polygon_a: *mut Polygon<T>,
    polygon_b: *mut Polygon<T>,
    point_pool: &mut PointPool<T>,
    offset: *const Point<T>,
    mem_seg: &mut [T],
    prev_translate: *mut Point<T>,
) {
    let vector_count = mem_seg
        .get(0)
        .and_then(|v| v.to_f64())
        .map(|f| f as usize)
        .unwrap_or(0);

    if vector_count == 0 {
        return;
    }

    let indices = point_pool.alloc(3);
    let curr_unit_v = point_pool.get(indices, 0);
    let prev_unit_v = point_pool.get(indices, 1);
    let curr_vector = point_pool.get(indices, 2);

    let mut translate_index: f64 = -1.0;
    let mut max_distance: f64 = 0.0;
    let mut distance: f64;
    let mut vec_distance: f64;

    for i in 0..vector_count {
        let base_idx = VECTOR_MEM_OFFSET + (i << 2);
        let x = *mem_seg.get_unchecked(base_idx);
        let y = *mem_seg.get_unchecked(base_idx + 1);

        (*curr_vector).set(x, y);

        if !(*prev_translate).is_empty() && (*curr_vector).dot(prev_translate) < T::zero() {
            (*curr_unit_v).update(curr_vector);
            (*curr_unit_v).normalize();
            (*prev_unit_v).update(prev_translate);
            (*prev_unit_v).normalize();

            let cross = (*curr_unit_v).cross(prev_unit_v).to_f64().unwrap().abs();

            if cross < 0.0001 {
                continue;
            }
        }

        distance = polygon_slide_distance(point_pool, polygon_a, polygon_b, curr_vector, offset);
        vec_distance = (*curr_vector).length();
        if distance.is_nan() || distance.abs() > vec_distance {
            distance = vec_distance;
        }

        if !distance.is_nan() && distance > max_distance {
            max_distance = distance;

            translate_index = (i << 1) as f64;
        }
    }

    if let Some(slot) = mem_seg.get_mut(1) {
        *slot = T::from_f64(translate_index).unwrap();
    }
    if let Some(slot) = mem_seg.get_mut(2) {
        *slot = T::from_f64(max_distance).unwrap();
    }

    point_pool.malloc(indices);
}

unsafe fn get_inside<T: Number>(
    pool: &mut PointPool<T>,
    polygon_a: *mut Polygon<T>,
    polygon_b: *mut Polygon<T>,
    offset: *const Point<T>,
    default_value: Option<bool>,
) -> Option<bool> {
    let indices = pool.alloc(1);
    let temp_pt = pool.get(indices, 0);

    let size_b = (*polygon_b).length();

    for i in 0..size_b {
        (*temp_pt).update((*polygon_b).at(i));
        (*temp_pt).add(offset);

        if let Some(is_inside) = (*polygon_a).point_in(&*temp_pt, None) {
            pool.malloc(indices);

            return Some(is_inside);
        }
    }

    pool.malloc(indices);

    default_value
}

unsafe fn in_nfp<T: Number>(
    polygon: *mut Polygon<T>,
    point: *const Point<T>,
    nfp_loops: &mut Vec<Vec<T>>,
) -> bool {
    if nfp_loops.is_empty() {
        return false;
    }

    for seg in nfp_loops {
        let pt_count = seg.len() >> 1;
        let buf: Box<[T]> = seg.to_vec().into_boxed_slice();

        (*polygon).bind(buf, 0, pt_count);

        let len = (*polygon).length();

        for j in 0..len {
            if (*point).almost_equal((*polygon).at(j), None) {
                return true;
            }
        }
    }

    false
}

unsafe fn search_start_point<T: Number>(
    pool: &mut PointPool<T>,
    scan_polygon: *mut Polygon<f32>,
    polygon_a: *mut Polygon<T>,
    polygon_b: *mut Polygon<T>,
    inside: bool,
    marked_indices: &mut Vec<usize>,
    nfp: &mut Vec<Vec<f32>>,
) -> [Option<T>; 2] {
    (*polygon_a).close();
    (*polygon_b).close();
    let size_a = (*polygon_a).length();
    let size_b = (*polygon_b).length();

    let indices = pool.alloc(3);
    let start_pt = pool.get(indices, 0);
    let v = pool.get(indices, 1);
    let v_neg = pool.get(indices, 2);
    let mut start_pt_f32 = Point::<f32>::new(None, None);

    for i in 0..(size_a - 1) {
        if !marked_indices.contains(&i) {
            marked_indices.push(i);

            for j in 0..size_b {
                let a_i = (*polygon_a).at(i);
                let b_j = (*polygon_b).at(cycle_index(j, size_b, 0));
                (*start_pt).update(&*a_i);
                (*start_pt).sub(&*b_j);

                let mut is_inside = get_inside(pool, polygon_a, polygon_b, start_pt, None);

                if is_inside.is_none() {
                    pool.malloc(indices);

                    return [None, None];
                }

                if is_inside == Some(inside)
                    && !intersect(pool, polygon_a, polygon_b, start_pt)
                    && !in_nfp::<f32>(
                        scan_polygon,
                        start_pt_f32.set(
                            (*start_pt).x.to_f32().unwrap(),
                            (*start_pt).y.to_f32().unwrap(),
                        ),
                        nfp,
                    )
                {
                    pool.malloc(indices);
                    return [Some((*start_pt).x), Some((*start_pt).y)];
                }

                let next_i = cycle_index(i, size_a, 1);
                (*v).update((*polygon_a).at(next_i));
                (*v).sub(&*a_i);
                (*v_neg).update(v);
                (*v_neg).reverse();

                let d1 = polygon_projection_distance(pool, polygon_a, polygon_b, v, start_pt);
                let d2 = polygon_projection_distance(pool, polygon_b, polygon_a, v_neg, start_pt);

                let mut d = -1.0;
                if !d1.is_nan() && !d2.is_nan() {
                    d = d1.min(d2);
                } else if !d2.is_nan() {
                    d = d2;
                } else if !d1.is_nan() {
                    d = d1;
                }

                if d < f64::tol() {
                    continue;
                }

                let vd = (*v).length();
                if vd - d >= f64::tol() {
                    (*v).scale_up(T::from_f64(d / vd).unwrap());
                }
                (*start_pt).add(v);

                is_inside = get_inside(pool, polygon_a, polygon_b, start_pt, is_inside);

                if is_inside == Some(inside)
                    && !intersect(pool, polygon_a, polygon_b, start_pt)
                    && !in_nfp::<f32>(
                        scan_polygon,
                        start_pt_f32.set(
                            (*start_pt).x.to_f32().unwrap(),
                            (*start_pt).y.to_f32().unwrap(),
                        ),
                        nfp,
                    )
                {
                    pool.malloc(indices);
                    return [Some((*start_pt).x), Some((*start_pt).y)];
                }
            }
        }
    }

    pool.malloc(indices);

    return [None, None];
}

fn serialize_touch(type_: u16, first_index: u16, second_index: u16) -> u32 {
    let mut result = set_bits(0, type_, 0, 2);
    result = set_bits(result, first_index, 2, 15);

    set_bits(result, second_index, 17, 15)
}

unsafe fn get_touch<T: Number>(
    point_a: *const Point<T>,
    point_a_next: *const Point<T>,
    point_b: *const Point<T>,
    point_b_next: *const Point<T>,
    index_a: u16,
    index_a_next: u16,
    index_b: u16,
    index_b_next: u16,
) -> u32 {
    if (*point_b).almost_equal(point_a, None) {
        return serialize_touch(1, index_a, index_b);
    }

    if (*point_b).on_segment(point_a, point_a_next) {
        return serialize_touch(2, index_a_next, index_b);
    }

    if (*point_a).on_segment(point_b, point_b_next) {
        return serialize_touch(3, index_a, index_b_next);
    }

    return 0;
}

unsafe fn apply_vector<T: Number>(
    mem_seg: &mut [T],
    point: *mut Point<T>,
    start: T,
    end: T,
    base_value: *const Point<T>,
    sub_value: *const Point<T>,
) {
    (*point).update(base_value);
    (*point).sub(sub_value);

    if !(*point).is_empty() {
        let count = mem_seg[0].to_usize().unwrap(); // assuming T can convert to usize
        let idx = count << 1;

        (*point).fill(mem_seg, idx, Some(VECTOR_MEM_OFFSET));

        (*point).set(start, end);
        (*point).fill(mem_seg, idx + 1, Some(VECTOR_MEM_OFFSET));

        mem_seg[0] = T::from_usize(count + 1).unwrap();
    }
}

unsafe fn apply_vectors<T: Number>(
    polygon_a: *mut Polygon<T>,
    polygon_b: *mut Polygon<T>,
    pool: &mut PointPool<T>,
    offset: *const Point<T>,
    touch: u32,
    mem_seg: &mut [T],
) {
    let type_ = get_bits(touch, 0, 2);
    let curr_index_a = get_bits(touch, 2, 15) as usize;
    let curr_index_b = get_bits(touch, 17, 15) as usize;

    let size_a = (*polygon_a).length();
    let size_b = (*polygon_b).length();

    let prev_index_a = cycle_index(curr_index_a, size_a, -1);
    let next_index_a = cycle_index(curr_index_a, size_a, 1);
    let prev_index_b = cycle_index(curr_index_b, size_b, -1);
    let next_index_b = cycle_index(curr_index_b, size_b, 1);

    let indices = pool.alloc(7);
    let prev_a = pool.get(indices, 0);
    let curr_a = pool.get(indices, 1);
    let next_a = pool.get(indices, 2);
    let prev_b = pool.get(indices, 3);
    let curr_b = pool.get(indices, 4);
    let next_b = pool.get(indices, 5);
    let point = pool.get(indices, 6);

    (*prev_a).update((*polygon_a).at(prev_index_a));
    (*curr_a).update((*polygon_a).at(curr_index_a));
    (*next_a).update((*polygon_a).at(next_index_a));
    (*prev_b).update((*polygon_b).at(prev_index_b));
    (*curr_b).update((*polygon_b).at(curr_index_b));
    (*next_b).update((*polygon_b).at(next_index_b));

    let neg_one = T::from_f64(-1.0).unwrap();

    match type_ {
        1 => {
            apply_vector(
                mem_seg,
                point,
                T::from_usize(curr_index_a).unwrap(),
                T::from_usize(prev_index_a).unwrap(),
                prev_a,
                curr_a,
            );
            apply_vector(
                mem_seg,
                point,
                T::from_usize(curr_index_a).unwrap(),
                T::from_usize(next_index_a).unwrap(),
                next_a,
                curr_a,
            );
            apply_vector(mem_seg, point, neg_one, neg_one, curr_b, prev_b);
            apply_vector(mem_seg, point, neg_one, neg_one, curr_b, next_b);
        }
        2 => {
            (*curr_b).add(offset);
            apply_vector(
                mem_seg,
                point,
                T::from_usize(prev_index_a).unwrap(),
                T::from_usize(curr_index_a).unwrap(),
                curr_a,
                curr_b,
            );
            apply_vector(
                mem_seg,
                point,
                T::from_usize(curr_index_a).unwrap(),
                T::from_usize(prev_index_a).unwrap(),
                prev_a,
                curr_b,
            );
        }
        _ => {
            (*curr_b).add(offset);
            (*prev_b).add(offset);
            apply_vector(mem_seg, point, neg_one, neg_one, curr_a, curr_b);
            apply_vector(mem_seg, point, neg_one, neg_one, curr_a, prev_b);
        }
    }

    pool.malloc(indices);
}

unsafe fn fill_vectors<T: Number>(
    polygon_a: *mut Polygon<T>,
    polygon_b: *mut Polygon<T>,
    pool: &mut PointPool<T>,
    offset: *const Point<T>,
    mem_seg: &mut [T],
    marked_indices: &mut Vec<usize>,
) {
    let indices = pool.alloc(4);
    let point_a = pool.get(indices, 0);
    let point_a_next = pool.get(indices, 1);
    let point_b = pool.get(indices, 2);
    let point_b_next = pool.get(indices, 3);

    let size_a = (*polygon_a).length();
    let size_b = (*polygon_b).length();

    mem_seg[0] = T::zero();

    for i in 0..size_a {
        let i_next = cycle_index(i, size_a, 1);

        (*point_a).update((*polygon_a).at(i));
        (*point_a_next).update((*polygon_a).at(i_next));

        for j in 0..size_b {
            let j_next = cycle_index(j, size_b, 1);

            (*point_b).update((*polygon_b).at(j));
            (*point_b).add(offset);
            (*point_b_next).update((*polygon_b).at(j_next));
            (*point_b_next).add(offset);

            let touch = get_touch(
                point_a,
                point_a_next,
                point_b,
                point_b_next,
                i as u16,
                i_next as u16,
                j as u16,
                j_next as u16,
            );

            if touch != 0 {
                let idx_a = get_bits(touch, 2, 15);
                marked_indices.push(idx_a as usize);

                apply_vectors(polygon_a, polygon_b, pool, offset, touch, mem_seg);
            }
        }
    }

    pool.malloc(indices);
}

unsafe fn no_fit_polygon<T: Number>(
    pool: &mut PointPool<T>,
    scan_polygon: *mut Polygon<f32>,
    polygon_a: *mut Polygon<T>,
    polygon_b: *mut Polygon<T>,
    mem_seg: &mut [T],
    inside: bool,
) -> Vec<Vec<f32>> {
    if (*polygon_a).is_broken() || (*polygon_b).is_broken() {
        return Vec::new();
    }

    let mut min_index_a = 0;
    let mut min_y = (*(*polygon_a).at(0)).y;

    for i in 1..(*polygon_a).length() {
        let y = (*(*polygon_a).at(i)).y;
        if y < min_y {
            min_y = y;
            min_index_a = i;
        }
    }

    let mut max_index_b = 0;
    let mut max_y = (*(*polygon_b).at(0)).y;

    for j in 1..(*polygon_b).length() {
        let y = (*(*polygon_b).at(j)).y;
        if y > max_y {
            max_y = y;
            max_index_b = j;
        }
    }

    let pts = pool.alloc(7);
    let reference = pool.get(pts, 0);
    let start = pool.get(pts, 1);
    let offset = pool.get(pts, 2);
    let start_point = pool.get(pts, 3);
    let prev_translate = pool.get(pts, 4);
    let translate = pool.get(pts, 5);
    let idx_pt = pool.get(pts, 6);

    let mut marked_indices: Vec<usize> = Vec::new();
    let mut result: Vec<Vec<f32>> = Vec::new();
    let size_a = (*polygon_a).length();
    let size_b = (*polygon_b).length();
    let condition = 10 * (size_a + size_b);

    (*start_point).update((*polygon_a).at(min_index_a));
    (*start_point).sub((*polygon_b).at(max_index_b));

    if inside {
        let [s_x, s_y] = search_start_point(
            pool,
            scan_polygon,
            polygon_a,
            polygon_b,
            true,
            &mut marked_indices,
            &mut result,
        );

        if let (Some(x), Some(y)) = (s_x, s_y) {
            (*start_point).set(x, y);
        } else {
            pool.malloc(pts);

            return result;
        }
    }

    // Основний цикл побудови NFP
    loop {
        (*offset).update(start_point);
        (*prev_translate).set(T::zero(), T::zero());
        (*reference).update((*polygon_b).at(0));
        (*reference).add(start_point);
        (*start).update(reference);

        let mut counter = 0;
        let mut nfp: Vec<T> = Vec::new();

        nfp.push((*reference).x);
        nfp.push((*reference).y);

        while counter < condition {
            fill_vectors(
                polygon_a,
                polygon_b,
                pool,
                offset,
                mem_seg,
                &mut marked_indices,
            );

            find_translate(polygon_a, polygon_b, pool, offset, mem_seg, prev_translate);

            let ti = mem_seg[1].to_f64().unwrap();
            let max_dist = mem_seg[2].to_f64().unwrap().abs();

            if ti == -1.0 || max_dist.almost_equal(0.0, None) {
                nfp.clear();
                break;
            }

            (*translate).from_mem_seg(mem_seg, ti.to_usize().unwrap(), VECTOR_MEM_OFFSET);
            (*idx_pt).from_mem_seg(mem_seg, ti.to_usize().unwrap() + 1, VECTOR_MEM_OFFSET);
            (*prev_translate).update(translate);

            let v_len = (*translate).length();

            if max_dist < v_len && !max_dist.almost_equal(v_len, None) {
                (*translate).scale_up(T::from_f64(max_dist / v_len).unwrap());
            }

            (*reference).add(translate);

            // якщо повернулися до початку, або замкнули NFP — виходимо
            if (*reference).almost_equal(start, None) || get_nfp_looped(&nfp, reference, pool) {
                break;
            }

            nfp.push((*reference).x);
            nfp.push((*reference).y);

            (*offset).add(translate);
            counter += 1;
        }

        if !nfp.is_empty() {
            let vec_f32: Vec<f32> = nfp.into_iter().map(|x| x.to_f32().unwrap()).collect();
            result.push(vec_f32);
        }

        let [s_x, s_y] = search_start_point(
            pool,
            scan_polygon,
            polygon_a,
            polygon_b,
            inside,
            &mut marked_indices,
            &mut result,
        );

        if let (Some(x), Some(y)) = (s_x, s_y) {
            (*start_point).set(x, y);
        } else {
            break;
        }
    }

    pool.malloc(pts);

    result
}

unsafe fn pair_inside<T: Number>(
    pool: &mut PointPool<T>,
    scan_polygon: *mut Polygon<f32>,
    polygon_a: *mut Polygon<T>,
    polygon_b: *mut Polygon<T>,
    mem_seg: &mut [T],
) -> Vec<Vec<f32>> {
    let mut result = if (*polygon_a).is_rectangle() {
        no_fit_polygon_rectangle(pool, polygon_a, polygon_b)
    } else {
        no_fit_polygon(pool, scan_polygon, polygon_a, polygon_b, mem_seg, true)
    };

    if result.is_empty() {
        //Log warn
    }

    for pts in result.iter_mut() {
        let point_count = pts.len() >> 1;

        if f32::polygon_area(pts) > 0.0 {
            f32::reverse_polygon(pts, 0, point_count);
        }
    }

    result
}

unsafe fn pair_outside<T: Number>(
    pool: &mut PointPool<T>,
    scan_polygon: *mut Polygon<f32>,
    polygon_a: *mut Polygon<T>,
    polygon_b: *mut Polygon<T>,
    mem_seg: &mut [T],
) -> Vec<Vec<f32>> {
    let mut result = no_fit_polygon(pool, scan_polygon, polygon_a, polygon_b, mem_seg, false);
    // sanity check
    if result.is_empty() {
        //pairContent.logError('NFP Error');

        return result;
    }

    // if searchedges is active, only the first NFP is guaranteed to pass sanity check
    if f32::polygon_area(&mut result[0]).abs() < (*polygon_a).abs_area() {
        //pairContent.logError('NFP Area Error');
        //console.log('Area: ', tmpPolygon.absArea);
        result.clear();

        return result;
    }

    let cloned = result[0].clone();
    let boxed: Box<[f32]> = cloned.into_boxed_slice();

    (*scan_polygon).bind(boxed, 0, result[0].len() >> 1);

    let mut i: usize = 0;

    let mut point = Point::<f32>::new(None, None);

    for pts in result.iter_mut() {
        let point_count = pts.len() >> 1;

        if f32::polygon_area(pts) > 0.0 {
            f32::reverse_polygon(pts, 0, point_count);
        }

        point.set(pts[0], pts[1]);

        if i > 0
            && (*scan_polygon).point_in(&point as *const Point<f32>, None) == Some(true)
            && f32::polygon_area(pts) < 0.0
        {
            f32::reverse_polygon(pts, 0, point_count);
        }

        i += 1;
    }

    return result;
}

unsafe fn pair_child<T: Number>(
    pool: &mut PointPool<T>,
    scan_polygon: *mut Polygon<f32>,
    polygon_a: *mut Polygon<T>,
    polygon_b: *mut Polygon<T>,
    mem_seg: &mut [T],
) -> Vec<Vec<f32>> {
    let mut result = no_fit_polygon(pool, scan_polygon, polygon_a, polygon_b, mem_seg, true);

    if result.is_empty() {
        //Log warn
    }

    for pts in result.iter_mut() {
        let point_count = pts.len() >> 1;

        if f32::polygon_area(pts) < 0.0 {
            f32::reverse_polygon(pts, 0, point_count);
        }
    }

    result
}

unsafe fn bind_polygon(polygon: &mut Polygon<f64>, node: &PolygonNode) {
    let count = node.seg_size / 2;
    let buf = node
        .mem_seg
        .iter()
        .copied()
        .map(|x| x as f64)
        .collect::<Vec<f64>>()
        .into_boxed_slice();

    polygon.bind(buf, 0, count);
}

pub unsafe fn pair_data(buffer: &[f32]) -> Vec<f32> {
    if buffer.is_empty() {
        return Vec::new();
    }

    let mut pair_content = PairContent::new();

    pair_content.init(buffer);

    let node_a = &mut pair_content.first_node();
    let mut polygon_a = Polygon::<f64>::new();

    bind_polygon(&mut polygon_a, node_a);

    let node_b = &mut pair_content.second_node();
    let mut polygon_b = Polygon::<f64>::new();

    bind_polygon(&mut polygon_b, node_b);

    let mut pool = PointPool::<f64>::new();

    let mut scan_polygon = Polygon::<f32>::new();

    let mut mem_seg = vec![0.0_f64; 1024];
    let mut nfp: Vec<Vec<f32>>;

    if pair_content.is_inside() {
        nfp = pair_inside(
            &mut pool,
            &mut scan_polygon,
            &mut polygon_a,
            &mut polygon_b,
            &mut mem_seg,
        );

        if nfp.is_empty() {
            // warning on null inner NFP
            // this is not an error, as the part may simply be larger than the bin or otherwise unplaceable due to geometry
            //pairContent.logError('NFP Warning');
        }

        return pair_content.serialize_result(nfp);
    }

    nfp = pair_outside(
        &mut pool,
        &mut scan_polygon,
        &mut polygon_a,
        &mut polygon_b,
        &mut mem_seg,
    );

    // sanity check
    if nfp.is_empty() {
        //pairContent.logError('NFP Error');

        return Vec::new();
    }

    // generate nfps for children (holes of parts) if any exist
    if pair_content.use_holes() {
        let children = &pair_content.first_node().children;
        let mut child = Polygon::<f64>::new();

        for node in children.iter() {
            bind_polygon(&mut child, node);

            let size_child = child.size();
            let size_b = child.size();

            if (*size_child).x > (*size_b).x && (*size_child).y > (*size_b).y {
                let mut no_fit_polygons = pair_child(
                    &mut pool,
                    &mut scan_polygon,
                    &mut child,
                    &mut polygon_b,
                    &mut mem_seg,
                );

                nfp.append(&mut no_fit_polygons);
            }
        }
    }

    return pair_content.serialize_result(nfp);
}
