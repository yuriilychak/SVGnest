use crate::constants::TOL_F64;
use crate::geometry::point::Point;
use crate::geometry::point_pool::PointPool;
use crate::utils::almost_equal::AlmostEqual;
use crate::utils::number::Number;

pub fn point_distance<T: Number>(
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
            if T::mid_value(pdot, s1dot, s2dot) > T::from_f64(TOL_F64).unwrap() {
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

pub fn coincedent_distance<T: Number>(
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

pub fn segment_distance<T: Number>(
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

        if ((max_ab - min_ef).to_f64().unwrap() < TOL_F64)
            || ((max_ef - min_ab).to_f64().unwrap() < TOL_F64)
        {
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

        // coincident points
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
