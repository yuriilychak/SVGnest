use clipper2_rs::{
    area, inflate_paths, simplify_path, strip_near_equal, trim_collinear, union_self, EndType,
    FillRule, JoinType, Path64, Paths64, Point64,
};

use crate::{
	 binary::{frame, parse_frame, Reader, Writer},
    point::Point,
    protocol::{parse_config, request_type, CLIPPER_SCALE, TYPE_PREPARE},
};

pub(crate) const COMPACT_PREPARED_COMMAND: u8 = 0x83;

#[derive(Clone)]
struct Node {
    source: usize,
    points: Vec<Point>,
    children: Vec<Node>,
}

fn number(data: &[f64], index: &mut usize) -> Result<f64, String> {
    let value = *data.get(*index).ok_or("Missing preparation value")?;
    *index += 1;
    value
        .is_finite()
        .then_some(value)
        .ok_or("Invalid preparation value".into())
}
fn count(data: &[f64], index: &mut usize) -> Result<usize, String> {
    let value = number(data, index)?;
    (value >= 0.0 && value.fract() == 0.0)
        .then_some(value as usize)
        .ok_or("Invalid preparation count".into())
}
fn polygon(data: &[f64], index: &mut usize) -> Result<Vec<Point>, String> {
    let length = count(data, index)?;
    (0..length)
        .map(|_| {
            Ok(Point {
                x: number(data, index)?,
                y: number(data, index)?,
            })
        })
        .collect()
}
fn signed_area(points: &[Point]) -> f64 {
    points
        .iter()
        .enumerate()
        .map(|(i, p)| {
            let q = points[(i + points.len() - 1) % points.len()];
            (q.x + p.x) * (q.y - p.y)
        })
        .sum::<f64>()
        / 2.0
}
fn contains(points: &[Point], p: Point) -> bool {
    let mut inside = false;
    for i in 0..points.len() {
        let a = points[i];
        let b = points[(i + points.len() - 1) % points.len()];
        // A contour that merely touches another contour is not its child. In
        // particular, this keeps independently nestable parts with a shared
        // vertex out of each other's containment tree.
        let cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
        let within_x = p.x >= a.x.min(b.x) && p.x <= a.x.max(b.x);
        let within_y = p.y >= a.y.min(b.y) && p.y <= a.y.max(b.y);
        if cross.abs() <= f64::EPSILON && within_x && within_y {
            return false;
        }
        if (a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x {
            inside = !inside;
        }
    }
    inside
}
fn paths(points: &[Point], scale: f64) -> Paths64 {
    vec![points
        .iter()
        .map(|p| Point64::new((p.x * scale).round() as i64, (p.y * scale).round() as i64))
        .collect()]
}
fn points(path: Path64, scale: f64) -> Vec<Point> {
    path.into_iter()
        .map(|p| Point {
            x: p.x as f64 / scale,
            y: p.y as f64 / scale,
        })
        .collect()
}
fn clean(input: &[Point], scale: f64, tolerance: f64) -> Option<Vec<Point>> {
    let output = union_self(&paths(input, scale), FillRule::NonZero).ok()?;
    output
        .into_iter()
        .max_by(|a, b| area(a).abs().total_cmp(&area(b).abs()))
        .map(|path| {
            // `SimplifyPolygon` in the former JS path resolves intersections.
            // Match its subsequent `CleanPolygon` pass by dropping vertices
            // closer than the configured curve tolerance and then removing
            // near-collinear vertices before exact final normalization.
            let tolerance = tolerance * scale;
            let path = strip_near_equal(&path, tolerance * tolerance, true);
            let path = simplify_path(&path, tolerance, true);
            points(trim_collinear(&path, false), scale)
        })
        .filter(|p| p.len() >= 3)
}
fn offset(input: &[Point], amount: f64, scale: f64, tolerance: f64) -> Option<Vec<Point>> {
    let output = inflate_paths(
        &paths(input, scale),
        amount * scale,
        JoinType::Miter,
        EndType::Polygon,
        2.0,
        tolerance * scale,
    )
    .ok()?;
    (output.len() == 1).then(|| points(output.into_iter().next().unwrap(), scale))
}
fn tree(nodes: Vec<Node>) -> Vec<Node> {
    // Attach each contour to its *nearest* containing contour. Selecting the
    // first containing contour loses intermediate levels for input ordered as
    // outer → hole → island, and also makes the tree depend on input order.
    let areas = nodes
        .iter()
        .map(|node| signed_area(&node.points).abs())
        .collect::<Vec<_>>();
    let parents = nodes
        .iter()
        .enumerate()
        .map(|(index, node)| {
            nodes
                .iter()
                .enumerate()
                .filter(|(candidate_index, candidate)| {
                    *candidate_index != index
                        // Inputs are non-intersecting contours. Requiring
                        // every vertex to be strictly inside prevents a
                        // shared vertex or overlapping parts from becoming a
                        // false parent based on one arbitrary start point.
                        && node
                            .points
                            .iter()
                            .all(|&point| contains(&candidate.points, point))
                })
                .min_by(|(left, _), (right, _)| areas[*left].total_cmp(&areas[*right]))
                .map(|(parent, _)| parent)
        })
        .collect::<Vec<_>>();
    let mut children = vec![Vec::new(); nodes.len()];
    for (child, parent) in parents.iter().enumerate() {
        if let Some(parent) = parent {
            children[*parent].push(child);
        }
    }
    fn build(index: usize, nodes: &[Node], children: &[Vec<usize>]) -> Node {
        let mut node = nodes[index].clone();
        node.children = children[index]
            .iter()
            .map(|&child| build(child, nodes, children))
            .collect();
        node
    }
    parents
        .iter()
        .enumerate()
        .filter_map(|(index, parent)| parent.is_none().then(|| build(index, &nodes, &children)))
        .collect()
}
fn offset_tree(nodes: &mut [Node], amount: f64, scale: f64, tolerance: f64) {
    for node in nodes {
        // Match the prior JavaScript behavior: retain the original contour if
        // Clipper cannot produce exactly one replacement path.
        if let Some(offset_points) = offset(&node.points, amount, scale, tolerance) {
            node.points = offset_points;
        }
        offset_tree(&mut node.children, -amount, scale, tolerance);
    }
}
fn serialize_node(result: &mut Vec<f64>, node: &Node) {
    result.extend([
        node.source as f64,
        node.points.len() as f64,
        node.children.len() as f64,
    ]);
    for p in &node.points {
        result.extend([p.x, p.y]);
    }
    for child in &node.children {
        serialize_node(result, child);
    }
}

fn compact_node(data: &[f64], index: &mut usize, writer: &mut Writer) -> Option<()> {
    let source = count(data, index).ok()?;
    let point_count = count(data, index).ok()?;
    let child_count = count(data, index).ok()?;
    writer.u32(u32::try_from(source).ok()?);
    writer.u32(u32::try_from(point_count).ok()?);
    writer.u32(u32::try_from(child_count).ok()?);
    for _ in 0..point_count {
        writer.i32(compact_coordinate(number(data, index).ok()?)?);
        writer.i32(compact_coordinate(number(data, index).ok()?)?);
    }
    for _ in 0..child_count {
        compact_node(data, index, writer)?;
    }
    Some(())
}

const COMPACT_COORDINATE_SCALE: f64 = 100_000.0;

fn compact_coordinate(value: f64) -> Option<i32> {
    let scaled = (value * COMPACT_COORDINATE_SCALE).round();
    (scaled.is_finite() && (i32::MIN as f64..=i32::MAX as f64).contains(&scaled)).then_some(scaled as i32)
}

fn expand_coordinate(value: i32) -> f64 {
    value as f64 / COMPACT_COORDINATE_SCALE
}

/// Compresses the legacy preparation response into one lossless geometry tree.
/// The legacy response duplicates its UI tree and Rust-only context; this
/// frame retains the source-bearing tree once and rebuilds the context on use.
pub(crate) fn compact_result(data: &[f64]) -> Option<Vec<u8>> {
    if data.first().copied()? != 1.0 {
        return None;
    }
    let mut index = 1;
    let mut writer = Writer::new();
    for _ in 0..4 {
        writer.i32(compact_coordinate(number(data, &mut index).ok()?)?);
    }
    let bin_count = count(data, &mut index).ok()?;
    writer.u32(u32::try_from(bin_count).ok()?);
    for _ in 0..bin_count {
        writer.i32(compact_coordinate(number(data, &mut index).ok()?)?);
        writer.i32(compact_coordinate(number(data, &mut index).ok()?)?);
    }
    let root_count = count(data, &mut index).ok()?;
    writer.u32(u32::try_from(root_count).ok()?);
    for _ in 0..root_count {
        compact_node(data, &mut index, &mut writer)?;
    }
    (index == data.len()).then(|| frame(COMPACT_PREPARED_COMMAND, 0, &writer.finish())).flatten()
}

fn expand_node(reader: &mut Reader<'_>, ui: &mut Vec<f64>, context: &mut Vec<f64>) -> Option<()> {
    let source = reader.u32()?;
    let point_count = reader.u32()?;
    let child_count = reader.u32()?;
    ui.extend([source as f64, point_count as f64, child_count as f64]);
    context.extend([point_count as f64, child_count as f64]);
    for _ in 0..point_count {
        let x = expand_coordinate(reader.i32()?);
        let y = expand_coordinate(reader.i32()?);
        ui.extend([x, y]);
        context.extend([x, y]);
    }
    for _ in 0..child_count {
        expand_node(reader, ui, context)?;
    }
    Some(())
}

/// Rebuilds the legacy response shape for un-migrated generation code.
pub(crate) fn expand_compact(data: &[u8]) -> Option<Vec<f64>> {
    let (command, flags, payload) = parse_frame(data)?;
    if command != COMPACT_PREPARED_COMMAND || flags != 0 {
        return None;
    }
    let mut reader = Reader::new(payload);
    let mut result = vec![1.0];
    for _ in 0..4 {
        result.push(expand_coordinate(reader.i32()?));
    }
    let bin_count = reader.u32()?;
    result.push(bin_count as f64);
    let mut context = vec![1.0, bin_count as f64, 0.0];
    for _ in 0..bin_count {
        let x = expand_coordinate(reader.i32()?);
        let y = expand_coordinate(reader.i32()?);
        result.extend([x, y]);
        context.extend([x, y]);
    }
    let root_count = reader.u32()?;
    result.push(root_count as f64);
    context.push(root_count as f64);
    for _ in 0..root_count {
        expand_node(&mut reader, &mut result, &mut context)?;
    }
    (reader.remaining() == 0).then_some(())?;
    let _ = context;
    Some(result)
}

pub(crate) fn generate(data: Vec<f64>) -> Vec<f64> {
    if request_type(&data) != Some(TYPE_PREPARE) {
        return vec![0.0];
    }
    let mut index = 1;
    let Ok(config) = parse_config(&data, &mut index) else {
        return vec![0.0];
    };
    let Ok(part_count) = count(&data, &mut index) else {
        return vec![0.0];
    };
    let Ok(raw_bin) = polygon(&data, &mut index) else {
        return vec![0.0];
    };
    let Some(mut bin) = clean(&raw_bin, CLIPPER_SCALE, config.curve_tolerance) else {
        return vec![0.0];
    };
    let (min_x, max_x, min_y, max_y) = bin.iter().fold(
        (bin[0].x, bin[0].x, bin[0].y, bin[0].y),
        |(minx, maxx, miny, maxy), p| (minx.min(p.x), maxx.max(p.x), miny.min(p.y), maxy.max(p.y)),
    );
    if config.spacing > 0.0 {
        if let Some(offset_bin) = offset(
            &bin,
            -config.spacing / 2.0,
            CLIPPER_SCALE,
            config.curve_tolerance,
        ) {
            bin = offset_bin;
        }
    }
    let bx = bin.iter().map(|p| p.x).fold(f64::INFINITY, f64::min);
    let by = bin.iter().map(|p| p.y).fold(f64::INFINITY, f64::min);
    for p in &mut bin {
        p.x -= bx;
        p.y -= by;
    }
    if signed_area(&bin) > 0.0 {
        bin.reverse();
    }
    let mut nodes = Vec::new();
    for _ in 0..part_count {
        let Ok(source) = count(&data, &mut index) else {
            return vec![0.0];
        };
        let Ok(raw) = polygon(&data, &mut index) else {
            return vec![0.0];
        };
        if let Some(mut points) = clean(&raw, CLIPPER_SCALE, config.curve_tolerance)
            .filter(|points| signed_area(points).abs() > config.curve_tolerance.powi(2))
        {
            if signed_area(&points) > 0.0 {
                points.reverse();
            }
            nodes.push(Node {
                source,
                points,
                children: Vec::new(),
            });
        }
    }
    let mut roots = tree(nodes);
    if config.spacing > 0.0 {
        offset_tree(
            &mut roots,
            config.spacing / 2.0,
            CLIPPER_SCALE,
            config.curve_tolerance,
        );
    }
    // Seed the GA with the largest prepared parts first. This used to happen
    // in the JavaScript controller after cleanup and offsetting; keeping it
    // here makes the prepared tree's order authoritative for Rust GA setup.
    roots.sort_by(|a, b| {
        signed_area(&b.points)
            .abs()
            .total_cmp(&signed_area(&a.points).abs())
    });
    let mut result = vec![
        1.0,
        min_x,
        min_y,
        max_x - min_x,
        max_y - min_y,
        bin.len() as f64,
    ];
    for p in &bin {
        result.extend([p.x, p.y]);
    }
    result.push(roots.len() as f64);
    for root in &roots {
        serialize_node(&mut result, root);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::{clean, compact_result, expand_compact, generate, signed_area};
    use crate::point::Point;

    fn packed_config(spacing: u32) -> f64 {
        // tolerance 0.30, four rotations, population 10, mutation rate 10.
        (30 | (spacing << 7) | (4 << 12) | (10 << 17) | (10 << 24)) as f64
    }

    #[test]
    fn cleans_near_duplicate_and_near_collinear_vertices() {
        let cleaned = clean(
            &[
                Point { x: 0.0, y: 0.0 },
                Point { x: 5.0, y: 0.05 },
                Point { x: 10.0, y: 0.0 },
                Point { x: 10.05, y: 0.02 },
                Point { x: 10.0, y: 10.0 },
                Point { x: 0.0, y: 10.0 },
                Point { x: 0.0, y: 0.0 },
            ],
            1_000.0,
            0.3,
        )
        .expect("valid polygon");

        assert_eq!(cleaned.len(), 4);
    }

    #[test]
    fn keeps_the_largest_contour_from_a_self_intersection() {
        let cleaned = clean(
            &[
                Point { x: 0.0, y: 0.0 },
                Point { x: 8.0, y: 8.0 },
                Point { x: 0.0, y: 8.0 },
                Point { x: 8.0, y: 0.0 },
            ],
            1_000.0,
            0.3,
        )
        .expect("self-intersection should simplify");

        assert_eq!(cleaned.len(), 3);
        assert!((signed_area(&cleaned).abs() - 16.0).abs() < 0.001);
    }

    #[test]
    fn prepares_a_normalized_bin_and_preserves_part_source_indexes() {
        let result = generate(vec![
            3.0,
            169_099_294.0,
            1.0,
            4.0,
            10.0,
            20.0,
            20.0,
            20.0,
            20.0,
            30.0,
            10.0,
            30.0,
            7.0,
            3.0,
            12.0,
            22.0,
            14.0,
            22.0,
            12.0,
            24.0,
        ]);
        assert_eq!(result[0], 1.0);
        assert_eq!(&result[1..5], &[10.0, 20.0, 10.0, 10.0]);
        assert_eq!(result[5], 4.0);
        assert_eq!(result[14], 1.0);
        assert_eq!(result[15], 7.0);
    }

    #[test]
    fn applies_half_spacing_to_bin_and_part_tree() {
        let result = generate(vec![
            3.0,
            169_099_550.0,
            1.0,
            4.0,
            10.0,
            20.0,
            20.0,
            20.0,
            20.0,
            30.0,
            10.0,
            30.0,
            7.0,
            4.0,
            12.0,
            22.0,
            14.0,
            22.0,
            14.0,
            24.0,
            12.0,
            24.0,
        ]);
        assert_eq!(result[0], 1.0);
        // The bin contracts from 10×10 to 8×8 and is normalized to its origin.
        let bin = &result[6..14];
        let (bin_min_x, bin_max_x) = bin
            .chunks_exact(2)
            .map(|point| point[0])
            .fold((f64::INFINITY, f64::NEG_INFINITY), |(min, max), value| {
                (min.min(value), max.max(value))
            });
        assert_eq!((bin_min_x, bin_max_x), (0.0, 8.0));

        // The outer part expands by the same half-spacing: 2×2 becomes 4×4.
        assert_eq!(result[15], 7.0);
        let part_points = result[16] as usize;
        let part = &result[18..18 + part_points * 2];
        let (part_min_x, part_max_x) = part
            .chunks_exact(2)
            .map(|point| point[0])
            .fold((f64::INFINITY, f64::NEG_INFINITY), |(min, max), value| {
                (min.min(value), max.max(value))
            });
        assert_eq!((part_min_x, part_max_x), (11.0, 15.0));
    }

    #[test]
    fn orders_prepared_root_parts_by_descending_area() {
        let result = generate(vec![
            3.0,
            169_099_294.0,
            2.0,
            4.0,
            0.0,
            0.0,
            20.0,
            0.0,
            20.0,
            20.0,
            0.0,
            20.0, // Bin.
            0.0,
            4.0,
            0.0,
            0.0,
            2.0,
            0.0,
            2.0,
            2.0,
            0.0,
            2.0, // Small part.
            1.0,
            4.0,
            0.0,
            0.0,
            4.0,
            0.0,
            4.0,
            4.0,
            0.0,
            4.0, // Large part.
        ]);
        // Header and normalized four-point bin take fourteen values; the next
        // value is the root count, followed by the first root's source index.
        assert_eq!(result[14], 2.0);
        assert_eq!(result[15], 1.0);
    }

    #[test]
    fn preserves_three_nested_contours_as_a_hole_and_an_island() {
        let result = generate(vec![
            3.0,
            packed_config(0),
            3.0,
            4.0,
            0.0,
            0.0,
            100.0,
            0.0,
            100.0,
            100.0,
            0.0,
            100.0, // Bin.
            10.0,
            4.0,
            10.0,
            10.0,
            90.0,
            10.0,
            90.0,
            90.0,
            10.0,
            90.0, // Outer part.
            11.0,
            4.0,
            20.0,
            20.0,
            80.0,
            20.0,
            80.0,
            80.0,
            20.0,
            80.0, // Hole.
            12.0,
            5.0,
            35.0,
            35.0,
            65.0,
            35.0,
            65.0,
            65.0,
            35.0,
            65.0,
            35.0,
            35.0, // Island, including a duplicate endpoint.
        ]);

        // Bin occupies 14 values. There is one root (source 10), with source
        // 11 as its only child and source 12 as that child's only child.
        assert_eq!(result[14], 1.0);
        assert_eq!(&result[15..18], &[10.0, 4.0, 1.0]);
        assert_eq!(result[26], 11.0);
        assert_eq!(&result[27..29], &[4.0, 1.0]);
        assert_eq!(result[37], 12.0);
        assert_eq!(&result[38..40], &[4.0, 0.0]);
    }

    #[test]
    fn prepares_concave_parts_from_the_bundled_demo_svg() {
        // Coordinates are representative production contours from
        // apps/web/src/demo.svg. Preparation receives polygonized SVG paths,
        // so this fixture deliberately captures that boundary rather than
        // duplicating SVG parsing in the Rust crate.
        let result = generate(vec![
            3.0,
            packed_config(0),
            2.0,
            4.0,
            0.0,
            0.0,
            1_147.592,
            0.0,
            1_147.592,
            1_397.27,
            0.0,
            1_397.27, // Bin.
            0.0,
            7.0,
            777.062,
            428.025,
            746.983,
            457.397,
            760.468,
            481.256,
            782.898,
            488.173,
            788.995,
            478.145,
            814.669,
            479.959,
            818.817,
            438.722, // Concave production contour.
            1.0,
            3.0,
            759.315,
            529.301,
            775.721,
            500.886,
            792.128,
            529.301, // Production triangle.
        ]);

        assert_eq!(result[14], 2.0);
        assert_eq!(result[15], 0.0);
        assert_eq!(result[16], 7.0);
        let second_root = 15 + 3 + result[16] as usize * 2;
        assert_eq!(result[second_root], 1.0);
        assert_eq!(result[second_root + 1], 3.0);
    }

    #[test]
    fn excludes_parts_smaller_than_the_curve_tolerance_area() {
        let result = generate(vec![
            3.0,
            packed_config(0),
            2.0,
            4.0,
            0.0,
            0.0,
            10.0,
            0.0,
            10.0,
            10.0,
            0.0,
            10.0, // Bin.
            4.0,
            4.0,
            1.0,
            1.0,
            1.1,
            1.0,
            1.1,
            1.1,
            1.0,
            1.1, // Area 0.01, below 0.30².
            5.0,
            4.0,
            2.0,
            2.0,
            4.0,
            2.0,
            4.0,
            4.0,
            2.0,
            4.0,
        ]);

        assert_eq!(result[14], 1.0);
        assert_eq!(result[15], 5.0);
    }

    #[test]
    fn appends_an_opaque_geometry_context_to_the_ui_preparation_result() {
        let result = generate(vec![
            3.0,
            packed_config(0),
            1.0,
            4.0,
            0.0,
            0.0,
            10.0,
            0.0,
            10.0,
            10.0,
            0.0,
            10.0, // Bin.
            4.0,
            4.0,
            2.0,
            2.0,
            4.0,
            2.0,
            4.0,
            4.0,
            2.0,
            4.0, // Part.
        ]);

        // UI result retains the normalized bin and one source-bearing part
        // tree; workers reconstruct their context from this same data.
        assert_eq!(result.len(), 26);
        assert_eq!(result[0], 1.0);
    }

    #[test]
    fn compact_prepared_result_removes_the_duplicate_context_geometry() {
        let result = generate(vec![
            3.0, packed_config(0), 1.0,
            4.0, 0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0,
            7.0, 4.0, 2.0, 2.0, 4.0, 2.0, 4.0, 4.0, 2.0, 4.0,
        ]);
        let compact = compact_result(&result).unwrap();
        let expanded = expand_compact(&compact).unwrap();

        assert_eq!(expanded, result);
        assert!(compact.len() < result.len() * std::mem::size_of::<f64>());
    }
}
