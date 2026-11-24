use crate::binary::{frame, parse_frame, Reader, Writer};
use crate::point::{almost_equal, Point, TOLERANCE};
use crate::polygon::Polygon;
use crate::protocol::{parse_request, serialize_nfp, TYPE_NFP};

pub(crate) const COMPACT_NFP_RESULT_COMMAND: u8 = 0x81;
pub(crate) const COMPACT_NFP_REQUEST_COMMAND: u8 = 0x80;
const COMPACT_COORDINATE_SCALE: f64 = 100_000.0;

fn compact_coordinate(value: f64) -> Option<i32> {
    let scaled = (value * COMPACT_COORDINATE_SCALE).round();
    (scaled.is_finite() && (i32::MIN as f64..=i32::MAX as f64).contains(&scaled)).then_some(scaled as i32)
}

fn expand_coordinate(value: i32) -> f64 {
    value as f64 / COMPACT_COORDINATE_SCALE
}

pub(crate) fn compact_result(data: &[f64]) -> Option<Vec<u8>> {
    let key = *data.first()?;
    let contour_count = *data.get(1)?;
    if !key.is_finite() || key.fract() != 0.0 || !(0.0..=u32::MAX as f64).contains(&key)
        || !contour_count.is_finite() || contour_count.fract() != 0.0 || contour_count < 0.0 {
        return None;
    }
    let mut index = 2;
    let mut writer = Writer::new();
    writer.u32(key as u32);
    writer.u32(contour_count as u32);
    for _ in 0..contour_count as usize {
        let count = *data.get(index)?;
        index += 1;
        if !count.is_finite() || count.fract() != 0.0 || count < 0.0 { return None; }
        writer.u32(count as u32);
        for _ in 0..count as usize {
            writer.i32(compact_coordinate(*data.get(index)?)?);
            writer.i32(compact_coordinate(*data.get(index + 1)?)?);
            index += 2;
        }
    }
    (index == data.len()).then(|| frame(COMPACT_NFP_RESULT_COMMAND, 0, &writer.finish())).flatten()
}

pub(crate) fn expand_compact_result(data: &[u8]) -> Option<Vec<f64>> {
    let (command, flags, payload) = parse_frame(data)?;
    if command != COMPACT_NFP_RESULT_COMMAND || flags != 0 { return None; }
    let mut reader = Reader::new(payload);
    let key = reader.u32()?;
    let contour_count = reader.u32()?;
    let mut result = vec![key as f64, contour_count as f64];
    for _ in 0..contour_count {
        let count = reader.u32()?;
        result.push(count as f64);
        for _ in 0..count {
            result.extend([expand_coordinate(reader.i32()?), expand_coordinate(reader.i32()?)]);
        }
    }
    (reader.remaining() == 0).then_some(result)
}

fn write_polygon(writer: &mut Writer, polygon: &Polygon) -> Option<()> {
    writer.u32(u32::try_from(polygon.points.len()).ok()?);
    writer.u32(u32::try_from(polygon.children.len()).ok()?);
    for point in &polygon.points {
        writer.i32(compact_coordinate(point.x)?);
        writer.i32(compact_coordinate(point.y)?);
    }
    for child in &polygon.children {
        write_polygon(writer, child)?;
    }
    Some(())
}

fn read_polygon(reader: &mut Reader) -> Option<Polygon> {
    let point_count = reader.u32()?;
    let child_count = reader.u32()?;
    let mut points = Vec::new();
    for _ in 0..point_count {
        points.push(Point { x: expand_coordinate(reader.i32()?), y: expand_coordinate(reader.i32()?) });
    }
    let mut children = Vec::new();
    for _ in 0..child_count {
        children.push(read_polygon(reader)?);
    }
    Some(Polygon { points, children })
}

fn serialize_legacy_polygon(values: &mut Vec<f64>, polygon: &Polygon) {
    let start = values.len();
    values.extend([polygon.points.len() as f64, polygon.children.len() as f64]);
    let child_offsets = values.len();
    values.resize(child_offsets + polygon.children.len(), 0.0);
    for point in &polygon.points {
        values.extend([point.x, point.y]);
    }
    for (index, child) in polygon.children.iter().enumerate() {
        values[child_offsets + index] = values.len() as f64;
        serialize_legacy_polygon(values, child);
    }
    debug_assert_eq!(start + 2, child_offsets);
}

pub(crate) fn compact_request(data: &[f64]) -> Option<Vec<u8>> {
    let request = parse_request(data).ok()?;
    let mut writer = Writer::new();
    writer.u32(request.key);
    writer.u8(u8::from(request.use_holes) | (u8::from(request.inside) << 1));
    writer.u8(request.rotations);
    writer.u8(request.a_rotation_index);
    writer.u8(request.b_rotation_index);
    write_polygon(&mut writer, &request.a)?;
    write_polygon(&mut writer, &request.b)?;
    frame(COMPACT_NFP_REQUEST_COMMAND, 0, &writer.finish())
}

pub(crate) fn expand_compact_request(data: &[u8]) -> Option<Vec<f64>> {
    let (command, flags, payload) = parse_frame(data)?;
    if command != COMPACT_NFP_REQUEST_COMMAND || flags != 0 { return None; }
    let mut reader = Reader::new(payload);
    let key = reader.u32()?;
    let flags = reader.u8()?;
    let rotations = reader.u8()?;
    let a_rotation = reader.u8()?;
    let b_rotation = reader.u8()?;
    if flags & !0x03 != 0 || rotations == 0 || a_rotation >= rotations || b_rotation >= rotations { return None; }
    let a = read_polygon(&mut reader)?;
    let b = read_polygon(&mut reader)?;
    (reader.remaining() == 0).then_some(())?;
    let header = TYPE_NFP
        | (u64::from(flags & 1) << 2)
        | (u64::from((flags >> 1) & 1) << 3)
        | (u64::from(a_rotation) << 4)
        | (u64::from(b_rotation) << 9)
        | (u64::from(rotations) << 14)
        | (u64::from(key) << 19);
    let mut result = vec![header as f64];
    serialize_legacy_polygon(&mut result, &a);
    serialize_legacy_polygon(&mut result, &b);
    Some(result)
}

fn points_equal(a: Point, b: Point) -> bool {
    almost_equal(a.x, b.x, TOLERANCE) && almost_equal(a.y, b.y, TOLERANCE)
}

fn contains(polygon: &[Point], point: Point, offset: Point) -> Option<bool> {
    if polygon.len() < 3 {
        return None;
    }
    let mut inside = false;
    for index in 0..polygon.len() {
        let a = polygon[index].add(offset);
        let b = polygon[(index + polygon.len() - 1) % polygon.len()].add(offset);
        if points_equal(a, point) {
            return None;
        }
        let cross = point.sub(a).cross(b.sub(a));
        if almost_equal(cross, 0.0, TOLERANCE)
            && point.x >= a.x.min(b.x)
            && point.x <= a.x.max(b.x)
            && point.y >= a.y.min(b.y)
            && point.y <= a.y.max(b.y)
        {
            return None;
        }
        if (a.y > point.y) != (b.y > point.y)
            && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x
        {
            inside = !inside;
        }
    }
    Some(inside)
}

fn on_segment(a: Point, b: Point, point: Point) -> bool {
    if almost_equal(a.x, b.x, TOLERANCE) && almost_equal(point.x, a.x, TOLERANCE) {
        return !almost_equal(point.y, b.y, TOLERANCE)
            && !almost_equal(point.y, a.y, TOLERANCE)
            && point.y < b.y.max(a.y)
            && point.y > b.y.min(a.y);
    }
    if almost_equal(a.y, b.y, TOLERANCE) && almost_equal(point.y, a.y, TOLERANCE) {
        return !almost_equal(point.x, b.x, TOLERANCE)
            && !almost_equal(point.x, a.x, TOLERANCE)
            && point.x < b.x.max(a.x)
            && point.x > b.x.min(a.x);
    }
    if (point.x < a.x && point.x < b.x)
        || (point.x > a.x && point.x > b.x)
        || (point.y < a.y && point.y < b.y)
        || (point.y > a.y && point.y > b.y)
        || points_equal(point, a)
        || points_equal(point, b)
    {
        return false;
    }
    let edge = b.sub(a);
    if point.sub(a).cross(edge).abs() > TOLERANCE {
        return false;
    }
    let dot = point.sub(a).dot(edge);
    !(dot < 0.0
        || almost_equal(dot, 0.0, TOLERANCE)
        || dot > edge.length2()
        || almost_equal(dot, edge.length2(), TOLERANCE))
}

fn outside_range(value: f64, start: f64, end: f64) -> bool {
    !almost_equal(start, end, TOLERANCE)
        && if start < end {
            value < start || value > end
        } else {
            value > start || value < end
        }
}

fn line_intersect(a: Point, b: Point, e: Point, f: Point, infinite: bool) -> Option<Point> {
    let a1 = b.y - a.y;
    let b1 = a.x - b.x;
    let c1 = b.x * a.y - a.x * b.y;
    let a2 = f.y - e.y;
    let b2 = e.x - f.x;
    let c2 = f.x * e.y - e.x * f.y;
    let denominator = a1 * b2 - a2 * b1;
    let point = Point {
        x: (b1 * c2 - b2 * c1) / denominator,
        y: (a2 * c1 - a1 * c2) / denominator,
    };
    if !point.x.is_finite()
        || !point.y.is_finite()
        || (!infinite
            && (outside_range(point.x, a.x, b.x)
                || outside_range(point.y, a.y, b.y)
                || outside_range(point.x, e.x, f.x)
                || outside_range(point.y, e.y, f.y)))
    {
        None
    } else {
        Some(point)
    }
}

fn point_distance(
    point: Point,
    s1: Point,
    s2: Point,
    normal: Point,
    infinite: bool,
) -> Option<f64> {
    let normal = normal.normalize();
    let direction = normal.normal();
    let point_dot = point.dot(direction);
    let s1_dot = s1.dot(direction);
    let s2_dot = s2.dot(direction);
    let point_normal = point.dot(normal);
    let s1_normal = s1.dot(normal);
    let s2_normal = s2.dot(normal);
    if !infinite {
        if ((point_dot < s1_dot || almost_equal(point_dot, s1_dot, TOLERANCE))
            && (point_dot < s2_dot || almost_equal(point_dot, s2_dot, TOLERANCE)))
            || ((point_dot > s1_dot || almost_equal(point_dot, s1_dot, TOLERANCE))
                && (point_dot > s2_dot || almost_equal(point_dot, s2_dot, TOLERANCE)))
        {
            return None;
        }
        if almost_equal(point_dot, s1_dot, TOLERANCE)
            && almost_equal(point_dot, s2_dot, TOLERANCE)
            && point_normal > s1_normal
            && point_normal > s2_normal
        {
            return Some((point_normal - s1_normal).min(point_normal - s2_normal));
        }
        if almost_equal(point_dot, s1_dot, TOLERANCE)
            && almost_equal(point_dot, s2_dot, TOLERANCE)
            && point_normal < s1_normal
            && point_normal < s2_normal
        {
            return Some(-(s1_normal - point_normal).min(s2_normal - point_normal));
        }
    }
    Some(
        -(point_normal - s1_normal
            + (s1_normal - s2_normal) * (s1_dot - point_dot) / (s1_dot - s2_dot)),
    )
}

fn push_distance(distances: &mut Vec<f64>, distance: Option<f64>) {
    if let Some(distance) = distance {
        distances.push(distance);
    }
}

fn segment_distance(a: Point, b: Point, e: Point, f: Point, direction: Point) -> Option<f64> {
    let normal = direction.normal();
    let reverse = direction.scale(-1.0);
    let dot_a = a.dot(normal);
    let dot_b = b.dot(normal);
    let dot_e = e.dot(normal);
    let dot_f = f.dot(normal);
    let cross_a = a.dot(direction);
    let cross_b = b.dot(direction);
    let cross_e = e.dot(direction);
    let cross_f = f.dot(direction);
    let ab_min = dot_a.min(dot_b);
    let ab_max = dot_a.max(dot_b);
    let ef_min = dot_e.min(dot_f);
    let ef_max = dot_e.max(dot_f);
    if almost_equal(ab_max, ef_min, TOLERANCE)
        || almost_equal(ab_min, ef_max, TOLERANCE)
        || ab_max < ef_min
        || ab_min > ef_max
    {
        return None;
    }
    let overlap = if (ab_max > ef_max && ab_min < ef_min) || (ef_max > ab_max && ef_min < ab_min) {
        1.0
    } else {
        (ab_max.min(ef_max) - ab_min.max(ef_min)) / (ab_max.max(ef_max) - ab_min.min(ef_min))
    };
    let ab = b.sub(a);
    let cross_abe = -e.sub(a).cross(ab);
    let cross_abf = -f.sub(a).cross(ab);
    if almost_equal(cross_abe, 0.0, TOLERANCE) && almost_equal(cross_abf, 0.0, TOLERANCE) {
        let ab_normal = ab.normal().normalize();
        let ef_normal = f.sub(e).normal().normalize();
        if ab_normal.cross(ef_normal).abs() < TOLERANCE && ab_normal.dot(ef_normal) < 0.0 {
            let normal_dot = ab_normal.dot(direction);
            if almost_equal(normal_dot, 0.0, TOLERANCE) {
                return None;
            }
            if normal_dot < 0.0 {
                return Some(0.0);
            }
        }
        return None;
    }
    let mut distances = Vec::new();
    if almost_equal(dot_a, dot_e, TOLERANCE) {
        distances.push(cross_a - cross_e);
    } else if almost_equal(dot_a, dot_f, TOLERANCE) {
        distances.push(cross_a - cross_f);
    } else if dot_a > ef_min && dot_a < ef_max {
        let mut d = point_distance(a, e, f, reverse, false);
        if d.is_some_and(|value| almost_equal(value, 0.0, TOLERANCE)) {
            let db = point_distance(b, e, f, reverse, true).unwrap_or(f64::INFINITY);
            if db < 0.0 || almost_equal(db * overlap, 0.0, TOLERANCE) {
                d = None;
            }
        }
        push_distance(&mut distances, d);
    }
    if almost_equal(dot_b, dot_e, TOLERANCE) {
        distances.push(cross_b - cross_e);
    } else if almost_equal(dot_b, dot_f, TOLERANCE) {
        distances.push(cross_b - cross_f);
    } else if dot_b > ef_min && dot_b < ef_max {
        let mut d = point_distance(b, e, f, reverse, false);
        if d.is_some_and(|value| almost_equal(value, 0.0, TOLERANCE)) {
            let da = point_distance(a, e, f, reverse, true).unwrap_or(f64::INFINITY);
            if da < 0.0 || almost_equal(da * overlap, 0.0, TOLERANCE) {
                d = None;
            }
        }
        push_distance(&mut distances, d);
    }
    if dot_e > ab_min && dot_e < ab_max {
        let mut d = point_distance(e, a, b, direction, false);
        if d.is_some_and(|value| almost_equal(value, 0.0, TOLERANCE)) {
            let df = point_distance(f, a, b, direction, true).unwrap_or(f64::INFINITY);
            if df < 0.0 || almost_equal(df * overlap, 0.0, TOLERANCE) {
                d = None;
            }
        }
        push_distance(&mut distances, d);
    }
    if dot_f > ab_min && dot_f < ab_max {
        let mut d = point_distance(f, a, b, direction, false);
        if d.is_some_and(|value| almost_equal(value, 0.0, TOLERANCE)) {
            let de = point_distance(e, a, b, direction, true).unwrap_or(f64::INFINITY);
            if de < 0.0 || almost_equal(de * overlap, 0.0, TOLERANCE) {
                d = None;
            }
        }
        push_distance(&mut distances, d);
    }
    distances.into_iter().reduce(f64::min)
}

fn polygon_slide_distance(
    a: &[Point],
    b: &[Point],
    direction: Point,
    ignore_negative: bool,
    a_offset: Point,
    b_offset: Point,
) -> Option<f64> {
    let direction = direction.normalize();
    let mut distance: Option<f64> = None;
    for i in 0..b.len() {
        for j in 0..a.len() {
            let a1 = a[j].add(a_offset);
            let a2 = a[(j + 1) % a.len()].add(a_offset);
            let b1 = b[i].add(b_offset);
            let b2 = b[(i + 1) % b.len()].add(b_offset);
            if points_equal(a1, a2) || points_equal(b1, b2) {
                continue;
            }
            if let Some(value) = segment_distance(a1, a2, b1, b2, direction) {
                if (!ignore_negative || value > 0.0 || almost_equal(value, 0.0, TOLERANCE))
                    && distance.is_none_or(|current| value < current)
                {
                    distance = Some(value);
                }
            }
        }
    }
    distance
}

fn edge_count(points: &[Point]) -> usize {
    if points.len() > 1 && points_equal(points[0], points[points.len() - 1]) {
        points.len() - 1
    } else {
        points.len()
    }
}

fn point_at(points: &[Point], index: usize, edges: usize) -> Point {
    points[if index == edges { 0 } else { index }]
}

fn intersects(a: &[Point], b: &[Point], a_offset: Point, b_offset: Point) -> bool {
    let a_edges = edge_count(a);
    let b_edges = edge_count(b);
    if a_edges == 0 || b_edges == 0 {
        return false;
    }

    for i in 0..a_edges {
        for j in 0..b_edges {
            let a1 = point_at(a, i, a_edges).add(a_offset);
            let a2 = point_at(a, i + 1, a_edges).add(a_offset);
            let b1 = point_at(b, j, b_edges).add(b_offset);
            let b2 = point_at(b, j + 1, b_edges).add(b_offset);

            let mut previous_b = if j == 0 { b_edges } else { j - 1 };
            let mut previous_a = if i == 0 { a_edges } else { i - 1 };
            let mut next_b = if j + 1 == b_edges { 0 } else { j + 2 };
            let mut next_a = if i + 1 == a_edges { 0 } else { i + 2 };

            if points_equal(point_at(b, previous_b, b_edges), point_at(b, j, b_edges)) {
                previous_b = if previous_b == 0 {
                    b_edges
                } else {
                    previous_b - 1
                };
            }
            if points_equal(point_at(a, previous_a, a_edges), point_at(a, i, a_edges)) {
                previous_a = if previous_a == 0 {
                    a_edges
                } else {
                    previous_a - 1
                };
            }
            if points_equal(point_at(b, next_b, b_edges), point_at(b, j + 1, b_edges)) {
                next_b = if next_b == b_edges { 0 } else { next_b + 1 };
            }
            if points_equal(point_at(a, next_a, a_edges), point_at(a, i + 1, a_edges)) {
                next_a = if next_a == a_edges { 0 } else { next_a + 1 };
            }

            let a0 = point_at(a, previous_a, a_edges).add(a_offset);
            let a3 = point_at(a, next_a, a_edges).add(a_offset);
            let b0 = point_at(b, previous_b, b_edges).add(b_offset);
            let b3 = point_at(b, next_b, b_edges).add(b_offset);

            if on_segment(a1, a2, b1) || points_equal(a1, b1) {
                let b0_inside = contains(a, b0, a_offset);
                let b2_inside = contains(a, b2, a_offset);
                if b0_inside.is_some() && b2_inside.is_some() && b0_inside != b2_inside {
                    return true;
                }
                continue;
            }
            if on_segment(a1, a2, b2) || points_equal(a2, b2) {
                let b1_inside = contains(a, b1, a_offset);
                let b3_inside = contains(a, b3, a_offset);
                if b1_inside.is_some() && b3_inside.is_some() && b1_inside != b3_inside {
                    return true;
                }
                continue;
            }
            if on_segment(b1, b2, a1) || points_equal(a1, b2) {
                let a0_inside = contains(b, a0, b_offset);
                let a2_inside = contains(b, a2, b_offset);
                if a0_inside.is_some() && a2_inside.is_some() && a0_inside != a2_inside {
                    return true;
                }
                continue;
            }
            if on_segment(b1, b2, a2) || points_equal(a2, b1) {
                let a1_inside = contains(b, a1, b_offset);
                let a3_inside = contains(b, a3, b_offset);
                if a1_inside.is_some() && a3_inside.is_some() && a1_inside != a3_inside {
                    return true;
                }
                continue;
            }
            if line_intersect(b1, b2, a1, a2, false).is_some() {
                return true;
            }
        }
    }
    false
}

fn polygon_projection_distance(
    a: &[Point],
    b: &[Point],
    direction: Point,
    a_offset: Point,
    b_offset: Point,
) -> Option<f64> {
    let a_edges = edge_count(a);
    let b_points = if b.len() > 1 && points_equal(b[0], b[b.len() - 1]) {
        b.len()
    } else {
        b.len() + 1
    };
    let mut distance: Option<f64> = None;
    for i in 0..b_points {
        let point = b[if i == b.len() { 0 } else { i }].add(b_offset);
        let mut minimum: Option<f64> = None;
        for j in 0..a_edges {
            let start = a[j].add(a_offset);
            let end = a[(j + 1) % a_edges].add(a_offset);
            if end.sub(start).cross(direction).abs() < TOLERANCE {
                continue;
            }
            if let Some(value) = point_distance(point, start, end, direction, false) {
                if minimum.is_none_or(|current| value < current) {
                    minimum = Some(value);
                }
            }
        }
        if let Some(minimum) = minimum {
            if distance.is_none_or(|current| minimum > current) {
                distance = Some(minimum);
            }
        }
    }
    distance
}

fn point_in_nfp(point: Point, nfp: &[Vec<Point>]) -> bool {
    nfp.iter()
        .flatten()
        .any(|candidate| points_equal(point, *candidate))
}

fn search_start_point(
    a: &[Point],
    b: &[Point],
    inside: bool,
    nfp: &[Vec<Point>],
    marked: &mut std::collections::HashSet<usize>,
) -> Option<Point> {
    let a_edges = edge_count(a);
    let b_points = if b.len() > 1 && points_equal(b[0], b[b.len() - 1]) {
        b.len()
    } else {
        b.len() + 1
    };
    for i in 0..a_edges {
        if !marked.insert(i) {
            continue;
        }
        for j in 0..b_points {
            let mut offset = a[i].sub(b[if j == b.len() { 0 } else { j }]);
            let mut b_inside = None;
            for k in 0..b_points {
                if let Some(value) = contains(
                    a,
                    b[if k == b.len() { 0 } else { k }].add(offset),
                    Point { x: 0.0, y: 0.0 },
                ) {
                    b_inside = Some(value);
                    break;
                }
            }
            let Some(b_inside) = b_inside else {
                return None;
            };
            if (b_inside == inside)
                && !intersects(a, b, Point { x: 0.0, y: 0.0 }, offset)
                && !point_in_nfp(offset, nfp)
            {
                return Some(offset);
            }

            let mut vector = a[(i + 1) % a_edges].sub(a[i]);
            let d1 = polygon_projection_distance(a, b, vector, Point { x: 0.0, y: 0.0 }, offset);
            let d2 = polygon_projection_distance(
                b,
                a,
                vector.scale(-1.0),
                offset,
                Point { x: 0.0, y: 0.0 },
            );
            let distance = match (d1, d2) {
                (Some(left), Some(right)) => Some(left.min(right)),
                (Some(value), None) | (None, Some(value)) => Some(value),
                (None, None) => None,
            };
            let Some(distance) = distance else { continue };
            if almost_equal(distance, 0.0, TOLERANCE) || distance <= 0.0 {
                continue;
            }
            if distance * distance < vector.length2()
                && !almost_equal(distance * distance, vector.length2(), TOLERANCE)
            {
                vector = vector.scale(distance / vector.length());
            }
            offset = offset.add(vector);
            let mut b_inside = None;
            for k in 0..b_points {
                if let Some(value) = contains(
                    a,
                    b[if k == b.len() { 0 } else { k }].add(offset),
                    Point { x: 0.0, y: 0.0 },
                ) {
                    b_inside = Some(value);
                    break;
                }
            }
            if b_inside == Some(inside)
                && !intersects(a, b, Point { x: 0.0, y: 0.0 }, offset)
                && !point_in_nfp(offset, nfp)
            {
                return Some(offset);
            }
        }
    }
    None
}

#[derive(Clone, Copy)]
struct Candidate {
    vector: Point,
    mark_start: Option<usize>,
    mark_end: Option<usize>,
}

fn no_fit_polygon(a: &[Point], b: &[Point], inside: bool) -> Option<Vec<Vec<Point>>> {
    if edge_count(a) < 3 || edge_count(b) < 3 {
        return None;
    }
    let a_edges = edge_count(a);
    let b_edges = edge_count(b);
    let mut marked = std::collections::HashSet::new();
    let mut min_a = 0;
    let mut max_b = 0;
    for i in 1..a_edges {
        if a[i].y < a[min_a].y {
            min_a = i;
        }
    }
    for i in 1..b_edges {
        if b[i].y > b[max_b].y {
            max_b = i;
        }
    }
    let mut start_point = if inside {
        search_start_point(a, b, true, &[], &mut marked)
    } else {
        Some(a[min_a].sub(b[max_b]))
    };
    let mut nfp_list = Vec::new();

    while let Some(mut offset) = start_point {
        let mut previous_vector: Option<Point> = None;
        let mut reference = b[0].add(offset);
        let start = reference;
        let mut nfp = vec![reference];
        let mut counter = 0;
        let mut failed = false;

        while counter < 10 * (a_edges + b_edges) {
            let mut contacts = Vec::new();
            for i in 0..a_edges {
                let next_i = (i + 1) % a_edges;
                for j in 0..b_edges {
                    let next_j = (j + 1) % b_edges;
                    let moved_b = b[j].add(offset);
                    if points_equal(a[i], moved_b) {
                        contacts.push((0, i, j));
                    } else if on_segment(a[i], a[next_i], moved_b) {
                        contacts.push((1, next_i, j));
                    } else if on_segment(moved_b, b[next_j].add(offset), a[i]) {
                        contacts.push((2, i, next_j));
                    }
                }
            }

            let mut candidates = Vec::new();
            for (kind, a_index, b_index) in contacts {
                marked.insert(a_index);
                let previous_a = (a_index + a_edges - 1) % a_edges;
                let next_a = (a_index + 1) % a_edges;
                let previous_b = (b_index + b_edges - 1) % b_edges;
                let next_b = (b_index + 1) % b_edges;
                match kind {
                    0 => {
                        candidates.push(Candidate {
                            vector: a[previous_a].sub(a[a_index]),
                            mark_start: Some(a_index),
                            mark_end: Some(previous_a),
                        });
                        candidates.push(Candidate {
                            vector: a[next_a].sub(a[a_index]),
                            mark_start: Some(a_index),
                            mark_end: Some(next_a),
                        });
                        candidates.push(Candidate {
                            vector: b[b_index].sub(b[previous_b]),
                            mark_start: None,
                            mark_end: None,
                        });
                        candidates.push(Candidate {
                            vector: b[b_index].sub(b[next_b]),
                            mark_start: None,
                            mark_end: None,
                        });
                    }
                    1 => {
                        candidates.push(Candidate {
                            vector: a[a_index].sub(b[b_index].add(offset)),
                            mark_start: Some(previous_a),
                            mark_end: Some(a_index),
                        });
                        candidates.push(Candidate {
                            vector: a[previous_a].sub(b[b_index].add(offset)),
                            mark_start: Some(a_index),
                            mark_end: Some(previous_a),
                        });
                    }
                    _ => {
                        candidates.push(Candidate {
                            vector: a[a_index].sub(b[b_index].add(offset)),
                            mark_start: None,
                            mark_end: None,
                        });
                        candidates.push(Candidate {
                            vector: a[a_index].sub(b[previous_b].add(offset)),
                            mark_start: None,
                            mark_end: None,
                        });
                    }
                }
            }

            let mut selected = None;
            let mut maximum = 0.0;
            for candidate in candidates {
                if almost_equal(candidate.vector.x, 0.0, TOLERANCE)
                    && almost_equal(candidate.vector.y, 0.0, TOLERANCE)
                {
                    continue;
                }
                if let Some(previous) = previous_vector {
                    if candidate.vector.dot(previous) < 0.0 {
                        let unit = candidate.vector.scale(1.0 / candidate.vector.length());
                        let previous_unit = previous.scale(1.0 / previous.length());
                        if unit.cross(previous_unit).abs() < 0.0001 {
                            continue;
                        }
                    }
                }
                let distance = polygon_slide_distance(
                    a,
                    b,
                    candidate.vector,
                    true,
                    Point { x: 0.0, y: 0.0 },
                    offset,
                )
                .filter(|distance| distance * distance <= candidate.vector.length2())
                .unwrap_or_else(|| candidate.vector.length());
                if distance > maximum {
                    maximum = distance;
                    selected = Some(candidate);
                }
            }
            let Some(mut selected) = selected else {
                failed = true;
                break;
            };
            if almost_equal(maximum, 0.0, TOLERANCE) {
                failed = true;
                break;
            }
            if let Some(index) = selected.mark_start {
                marked.insert(index);
            }
            if let Some(index) = selected.mark_end {
                marked.insert(index);
            }
            previous_vector = Some(selected.vector);
            if maximum * maximum < selected.vector.length2()
                && !almost_equal(maximum * maximum, selected.vector.length2(), TOLERANCE)
            {
                selected.vector = selected.vector.scale(maximum / selected.vector.length());
            }
            reference = reference.add(selected.vector);
            if points_equal(reference, start)
                || nfp[..nfp.len() - 1]
                    .iter()
                    .any(|point| points_equal(reference, *point))
            {
                break;
            }
            nfp.push(reference);
            offset = offset.add(selected.vector);
            counter += 1;
        }
        if !failed && !nfp.is_empty() {
            nfp_list.push(nfp);
        }
        start_point = search_start_point(a, b, inside, &nfp_list, &mut marked);
    }
    Some(nfp_list)
}

fn signed_area(points: &[Point]) -> f64 {
    if points.len() < 3 {
        return 0.0;
    }
    let mut area = 0.0;
    for i in 0..points.len() {
        let previous = points[(i + points.len() - 1) % points.len()];
        let current = points[i];
        area += (previous.x + current.x) * (previous.y - current.y);
    }
    area / 2.0
}

fn rectangle_nfp(a: &Polygon, b: &Polygon) -> Option<Vec<Vec<Point>>> {
    let (min_a, max_a) = a.bounds()?;
    let (min_b, max_b) = b.bounds()?;
    if max_b.x - min_b.x > max_a.x - min_a.x || max_b.y - min_b.y > max_a.y - min_a.y {
        return None;
    }
    let min = min_a.sub(min_b).add(b.points[0]);
    let max = max_a.sub(max_b).add(b.points[0]);
    Some(vec![vec![
        min,
        Point { x: max.x, y: min.y },
        max,
        Point { x: min.x, y: max.y },
    ]])
}

pub(crate) fn generate(request: Vec<f64>) -> Vec<f64> {
    let Ok(request) = parse_request(&request) else {
        return vec![0.0, 0.0];
    };
    let a = request.a.rotate(request.a_rotation);
    let b = request.b.rotate(request.b_rotation);
    let mut contours = if request.inside {
        if a.is_rectangle(0.001) {
            rectangle_nfp(&a, &b).unwrap_or_default()
        } else {
            no_fit_polygon(&a.points, &b.points, true).unwrap_or_default()
        }
    } else {
        let Some(mut contours) = no_fit_polygon(&a.points, &b.points, false) else {
            return serialize_nfp(request.key, &[]);
        };
        if contours.is_empty() || signed_area(&contours[0]).abs() < signed_area(&a.points).abs() {
            return serialize_nfp(request.key, &[]);
        }
        for index in 0..contours.len() {
            if signed_area(&contours[index]) > 0.0 {
                contours[index].reverse();
            }
            if index > 0
                && !contours[index].is_empty()
                && contains(&contours[0], contours[index][0], Point { x: 0.0, y: 0.0 })
                    == Some(true)
                && signed_area(&contours[index]) < 0.0
            {
                contours[index].reverse();
            }
        }
        if request.use_holes {
            let Some((b_min, b_max)) = b.bounds() else {
                return serialize_nfp(request.key, &[]);
            };
            let b_width = b_max.x - b_min.x;
            let b_height = b_max.y - b_min.y;
            for child in &a.children {
                let Some((child_min, child_max)) = child.bounds() else {
                    continue;
                };
                if child_max.x - child_min.x > b_width && child_max.y - child_min.y > b_height {
                    if let Some(mut child_contours) = no_fit_polygon(&child.points, &b.points, true)
                    {
                        for contour in &mut child_contours {
                            if signed_area(contour) < 0.0 {
                                contour.reverse();
                            }
                        }
                        contours.append(&mut child_contours);
                    }
                }
            }
        }
        contours
    };

    // Interior contours retain the reference implementation's negative signed area,
    // including the rectangle fast path.
    if request.inside {
        for contour in &mut contours {
            if signed_area(contour) > 0.0 {
                contour.reverse();
            }
        }
    }
    serialize_nfp(request.key, &contours)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rectangle_nfp_matches_expected_bounds() {
        let a = Polygon {
            points: vec![
                Point { x: 0.0, y: 0.0 },
                Point { x: 10.0, y: 0.0 },
                Point { x: 10.0, y: 10.0 },
                Point { x: 0.0, y: 10.0 },
            ],
            children: vec![],
        };
        let b = Polygon {
            points: vec![
                Point { x: 0.0, y: 0.0 },
                Point { x: 2.0, y: 0.0 },
                Point { x: 0.0, y: 2.0 },
            ],
            children: vec![],
        };
        let nfp = rectangle_nfp(&a, &b).unwrap();
        assert_eq!(nfp[0].len(), 4);
        assert_eq!(nfp[0][2], Point { x: 8.0, y: 8.0 });
    }

    #[test]
    fn generate_preserves_the_rectangle_inner_nfp_winding() {
        let header = (42_u64 << 19) | (1_u64 << 14) | 0x08 | 0x01;
        let request = vec![
            header as f64,
            4.0,
            0.0,
            0.0,
            0.0,
            10.0,
            0.0,
            10.0,
            10.0,
            0.0,
            10.0,
            3.0,
            0.0,
            0.0,
            0.0,
            2.0,
            0.0,
            0.0,
            2.0,
        ];

        assert_eq!(
            generate(request),
            vec![42.0, 1.0, 4.0, 0.0, 0.0, 8.0, 0.0, 8.0, 8.0, 0.0, 8.0]
        );
    }

    #[test]
    fn compact_result_round_trips_fixed_point_contours() {
        let source = vec![42.0, 1.0, 3.0, -1.234_567, 0.000_009, 12.5, 3.25, 0.0, -4.0];
        let compact = compact_result(&source).expect("compact NFP result");
        assert_eq!(compact[1], COMPACT_NFP_RESULT_COMMAND);
        assert_eq!(expand_compact_result(&compact), Some(vec![42.0, 1.0, 3.0, -1.234_57, 0.000_01, 12.5, 3.25, 0.0, -4.0]));
    }

    #[test]
    fn compact_request_round_trips_nested_polygon_jobs() {
        let header = (7_u64 << 19) | (4_u64 << 14) | (2_u64 << 4) | (1_u64 << 9) | 0x0d;
        let request = vec![
            header as f64,
            4.0, 1.0, 12.0, 0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0,
            3.0, 0.0, 0.0, 2.0, 0.0, 0.0, 2.0,
            3.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0,
        ];
        let compact = compact_request(&request).expect("compact NFP request");
        assert_eq!(compact[1], COMPACT_NFP_REQUEST_COMMAND);
        let expanded = expand_compact_request(&compact).expect("expand NFP request");
        let decoded = parse_request(&expanded).expect("valid expanded request");
        assert_eq!(decoded.key, 7);
        assert!(decoded.use_holes && decoded.inside);
        assert_eq!(decoded.rotations, 4);
        assert_eq!(decoded.a_rotation_index, 2);
        assert_eq!(decoded.b_rotation_index, 1);
        assert_eq!(decoded.a.children.len(), 1);
    }

    #[test]
    fn generic_outer_nfp_orbits_a_non_rectangular_part() {
        let a = vec![
            Point { x: 0.0, y: 0.0 },
            Point { x: 10.0, y: 0.0 },
            Point { x: 10.0, y: 10.0 },
            Point { x: 0.0, y: 10.0 },
        ];
        let b = vec![
            Point { x: 0.0, y: 0.0 },
            Point { x: 2.0, y: 0.0 },
            Point { x: 0.0, y: 2.0 },
        ];

        let nfp = no_fit_polygon(&a, &b, false).expect("valid polygons");

        assert_eq!(
            nfp,
            vec![vec![
                Point { x: 0.0, y: -2.0 },
                Point { x: 10.0, y: -2.0 },
                Point { x: 10.0, y: 8.0 },
                Point { x: 10.0, y: 10.0 },
                Point { x: 0.0, y: 10.0 },
                Point { x: -2.0, y: 10.0 },
                Point { x: -2.0, y: 0.0 },
            ]]
        );
    }

    #[test]
    fn generic_inner_nfp_matches_reference_empty_start_point_result() {
        let a = vec![
            Point { x: 0.0, y: 0.0 },
            Point { x: 12.0, y: 0.0 },
            Point { x: 6.0, y: 12.0 },
        ];
        let b = vec![
            Point { x: 0.0, y: 0.0 },
            Point { x: 2.0, y: 0.0 },
            Point { x: 1.0, y: 2.0 },
        ];

        let nfp = no_fit_polygon(&a, &b, true).expect("valid polygons");

        // This fixture exercises the same empty inner-NFP result as the
        // JavaScript reference implementation's start-point heuristic.
        assert!(nfp.is_empty());
    }
}
