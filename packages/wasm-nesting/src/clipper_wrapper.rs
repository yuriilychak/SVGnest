use crate::clipper::clipper::Clipper;
use crate::clipper::clipper_offset::ClipperOffset;
use crate::clipper::constants::CLIPPER_SCALE;
use crate::clipper::enums::{ClipType, PolyFillType, PolyType};
use crate::clipper::utils as clipper_utils;
use crate::geometry::bound_rect::BoundRect;
use crate::geometry::point::Point;
use crate::geometry::polygon::Polygon;
use crate::nesting::polygon_node::PolygonNode;
use crate::utils::number::Number;

/// Cleans a polygon by performing a union operation and returning the largest resulting polygon
///
/// # Arguments
/// * `mem_seg` - Flat array of f32 values representing points (x0, y0, x1, y1, ...)
/// * `curve_tolerance` - Tolerance for cleaning coincident points and edges
///
/// # Returns
/// Cleaned polygon as a flat Vec<f32>, or empty vector if cleaning fails
pub fn clean_node_inner(mem_seg: &[f32], curve_tolerance: f64) -> Vec<f32> {
    // Return empty if input is invalid
    if mem_seg.len() < 6 || mem_seg.len() % 2 != 0 {
        return Vec::new();
    }

    // Convert from memory segment to clipper polygon (scaled i32 points)
    let clipper_polygon = clipper_utils::from_mem_seg(mem_seg, None, false);

    // Perform union operation to simplify the polygon
    let mut simple: Vec<Vec<Point<i32>>> = Vec::new();
    let mut clipper = Clipper::new(false, true);

    clipper.add_path(&clipper_polygon, PolyType::Subject);
    clipper.execute(ClipType::Union, &mut simple, PolyFillType::NonZero);

    // Return empty if no result
    if simple.is_empty() {
        return Vec::new();
    }

    // Find the biggest polygon by area
    let mut biggest_index = 0;
    let mut biggest_area = 0.0f64;

    for (i, polygon) in simple.iter().enumerate() {
        // Convert to flat array for area calculation
        let mut flat: Vec<i32> = Vec::with_capacity(polygon.len() * 2);
        for p in polygon {
            flat.push(p.x);
            flat.push(p.y);
        }
        let area = i32::abs_polygon_area(&flat);

        if area > biggest_area {
            biggest_area = area;
            biggest_index = i;
        }
    }

    let biggest = &simple[biggest_index];

    // Clean up singularities, coincident points and edges
    let cleaned_polygon =
        clipper_utils::clean_polygon(biggest, curve_tolerance * (CLIPPER_SCALE as f64));

    // Return empty if cleaning removed all points
    if cleaned_polygon.is_empty() {
        return Vec::new();
    }

    // Convert back to memory segment (f32 array)
    clipper_utils::to_mem_seg(&cleaned_polygon)
}

/// Offset a polygon node and normalize it
///
/// # Arguments
/// * `mem_seg` - Flat array of f32 values representing points (x0, y0, x1, y1, ...)
/// * `sign` - Sign of the offset (1 or -1)
/// * `spacing` - Spacing value for offset
/// * `curve_tolerance` - Tolerance for cleaning coincident points and edges
///
/// # Returns
/// Normalized and offset polygon as a flat Vec<f32>, or the normalized input if spacing is 0
pub fn offset_node_inner(
    mem_seg: &[f32],
    sign: i32,
    spacing: i32,
    curve_tolerance: f64,
) -> Vec<f32> {
    let mut res_mem_seg = mem_seg.to_vec();

    if spacing != 0 {
        let offset = 0.5 * (spacing as f32) * (sign as f32);
        let path = clipper_utils::from_mem_seg(mem_seg, None, false);

        let mut clipper_offset = ClipperOffset::new();
        let offset_scaled = (offset * (CLIPPER_SCALE as f32)) as i32;
        let result_path = clipper_offset.execute(&path, offset_scaled);

        if result_path.len() != 1 {
            // Error case - return empty or handle error
            // In TypeScript it throws an error, but we'll return empty for Rust
            return Vec::new();
        }

        res_mem_seg = clipper_utils::to_mem_seg(&result_path[0]);

        // Clean the result
        let cleaned = clean_node_inner(&res_mem_seg, curve_tolerance);

        if !cleaned.is_empty() {
            res_mem_seg = cleaned;
        }
    }

    // Normalize the polygon
    let point_count = res_mem_seg.len() / 2;
    if point_count < 3 {
        return res_mem_seg;
    }

    let mut polygon = Polygon::<f32>::new();
    unsafe {
        polygon.bind(res_mem_seg.clone().into_boxed_slice(), 0, point_count);

        if let Some(normalized) = polygon.normalize() {
            return normalized.to_vec();
        }
    }

    res_mem_seg
}

/// Clean a polygon node by removing degenerate points
fn clean_node(node: &mut PolygonNode, curve_tolerance: f64) {
    let cleaned = clean_node_inner(&node.mem_seg, curve_tolerance);
    if !cleaned.is_empty() {
        node.mem_seg = cleaned.into_boxed_slice();
        node.seg_size = node.mem_seg.len();
    }
}

/// Apply offset to a polygon node
fn offset_node(node: &mut PolygonNode, sign: i32, spacing: i32, curve_tolerance: f64) {
    let offset_result = offset_node_inner(&node.mem_seg, sign, spacing, curve_tolerance);
    if !offset_result.is_empty() {
        node.mem_seg = offset_result.into_boxed_slice();
        node.seg_size = node.mem_seg.len();
    }
}

/// Recursively simplify nodes by rounding coordinates to 2 decimal places
fn simplify_nodes(nodes: &mut [PolygonNode]) {
    for node in nodes.iter_mut() {
        // Round all coordinates to 2 decimal places
        for value in node.mem_seg.iter_mut() {
            *value = (*value * 100.0).round() / 100.0;
        }

        // Recursively simplify children
        simplify_nodes(&mut node.children);
    }
}

/// Recursively nest polygons into a parent-child tree structure
fn nest_polygons(nodes: &mut Vec<PolygonNode>) {
    let node_count = nodes.len();
    let mut parents = Vec::new();
    let mut test_point = Point::<f32>::new(None, None);
    let mut polygon = Polygon::<f32>::new();

    // Find parent-child relationships
    for i in 0..node_count {
        let mut is_child = false;

        // Get the first point of the outer polygon
        unsafe {
            test_point.set(nodes[i].mem_seg[0], nodes[i].mem_seg[1]);
        }

        // Check if this polygon is inside any other polygon
        for j in 0..node_count {
            if i == j {
                continue;
            }

            let point_count = nodes[j].mem_seg.len() >> 1;
            unsafe {
                polygon.bind(nodes[j].mem_seg.clone(), 0, point_count);

                if let Some(true) = polygon.point_in(&test_point as *const Point<f32>, None) {
                    is_child = true;
                    break;
                }
            }
        }

        if !is_child {
            parents.push(i);
        }
    }

    // Separate children from parents
    let mut children_map: Vec<(usize, Vec<usize>)> = Vec::new();

    for i in 0..node_count {
        if parents.contains(&i) {
            continue;
        }

        // Get the first point of the child polygon
        unsafe {
            test_point.set(nodes[i].mem_seg[0], nodes[i].mem_seg[1]);
        }

        // Find which parent contains this child
        for &parent_idx in &parents {
            let point_count = nodes[parent_idx].mem_seg.len() >> 1;
            unsafe {
                polygon.bind(nodes[parent_idx].mem_seg.clone(), 0, point_count);

                if let Some(true) = polygon.point_in(&test_point as *const Point<f32>, None) {
                    // Find or create entry for this parent
                    if let Some(entry) = children_map.iter_mut().find(|(p, _)| *p == parent_idx) {
                        entry.1.push(i);
                    } else {
                        children_map.push((parent_idx, vec![i]));
                    }
                    break;
                }
            }
        }
    }

    // Build the tree structure
    let mut result = Vec::new();
    let mut used_indices = Vec::new();

    for &parent_idx in &parents {
        let mut parent_node = nodes[parent_idx].clone();

        // Find children for this parent
        if let Some((_, child_indices)) = children_map.iter().find(|(p, _)| *p == parent_idx) {
            let mut children = Vec::new();
            for &child_idx in child_indices {
                children.push(nodes[child_idx].clone());
                used_indices.push(child_idx);
            }

            // Recursively nest children
            nest_polygons(&mut children);
            parent_node.children = children;
        }

        result.push(parent_node);
        used_indices.push(parent_idx);
    }

    *nodes = result;
}

/// Recursively apply offset to nodes and their children with alternating signs
fn offset_nodes(nodes: &mut [PolygonNode], sign: i32, spacing: i32, curve_tolerance: f64) {
    for node in nodes.iter_mut() {
        offset_node(node, sign, spacing, curve_tolerance);
        offset_nodes(&mut node.children, -sign, spacing, curve_tolerance);
    }
}

/// Main function to generate polygon tree from flat arrays
pub fn generate_tree(
    values: &[f32],
    sizes: &[u16],
    spacing: i32,
    curve_tolerance: f64,
) -> Vec<PolygonNode> {
    let threshold = curve_tolerance * curve_tolerance;
    let mut nodes = Vec::new();
    let mut offset = 0;

    // Parse polygons from flat arrays
    for (i, &size) in sizes.iter().enumerate() {
        let seg_size = (size as usize) << 1;
        if offset + seg_size > values.len() {
            break;
        }

        let mem_seg = values[offset..offset + seg_size].to_vec();
        let mut node = PolygonNode::new(i as i32, 0.0, mem_seg);

        // Clean the polygon
        clean_node(&mut node, curve_tolerance);

        // Calculate absolute area
        let abs_area = f32::abs_polygon_area(&node.mem_seg);

        if abs_area <= threshold {
            eprintln!("Cannot parse polygon {}", i);
            offset += seg_size;
            continue;
        }

        nodes.push(node);
        offset += seg_size;
    }

    // Build the tree structure
    nest_polygons(&mut nodes);

    // Apply offset with alternating signs
    offset_nodes(&mut nodes, 1, spacing, curve_tolerance);

    // Simplify coordinates
    simplify_nodes(&mut nodes);

    nodes
}

/// Reset polygon position by subtracting position from all points
fn reset_position(mem_seg: &mut [f32]) {
    if mem_seg.len() < 6 {
        return;
    }

    let point_count = mem_seg.len() >> 1;

    // Calculate bounds to get position
    let bounds = f32::calculate_bounds(mem_seg, 0, point_count);
    let pos_x = bounds[0];
    let pos_y = bounds[1];

    // Subtract position from all points
    for i in 0..point_count {
        let idx = i << 1;
        mem_seg[idx] -= pos_x;
        mem_seg[idx + 1] -= pos_y;
    }
}

/// Generate bounds for a bin polygon
/// Returns: (bounds, result_bounds, area, node)
pub fn generate_bounds(
    mem_seg: &[f32],
    spacing: i32,
    curve_tolerance: f64,
) -> Option<(BoundRect<f32>, BoundRect<f32>, f64, PolygonNode)> {
    if mem_seg.len() < 6 {
        return None;
    }

    let point_count = mem_seg.len() >> 1;

    // Create node and calculate initial bounds using calculate_bounds
    let mut bin_node = PolygonNode::new(-1, 0.0, mem_seg.to_vec());
    let bounds_arr = f32::calculate_bounds(mem_seg, 0, point_count);
    let bounds = BoundRect::new(bounds_arr[0], bounds_arr[1], bounds_arr[2], bounds_arr[3]);

    // Clean and offset the node
    clean_node(&mut bin_node, curve_tolerance);
    offset_node(&mut bin_node, -1, spacing, curve_tolerance);

    // Reset position and calculate result bounds and area
    reset_position(&mut bin_node.mem_seg);

    let new_point_count = bin_node.mem_seg.len() >> 1;
    let result_bounds_arr = f32::calculate_bounds(&bin_node.mem_seg, 0, new_point_count);
    let result_bounds = BoundRect::new(
        result_bounds_arr[0],
        result_bounds_arr[1],
        result_bounds_arr[2],
        result_bounds_arr[3],
    );
    let area = f32::polygon_area(&bin_node.mem_seg);

    Some((bounds, result_bounds, area, bin_node))
}
