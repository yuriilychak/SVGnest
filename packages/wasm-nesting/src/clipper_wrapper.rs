use crate::geometry::point::Point;
use crate::geometry::polygon::Polygon;
use crate::nesting::polygon_node::PolygonNode;
use crate::utils::number::Number;

/// Clean a polygon node by removing degenerate points
fn clean_node(node: &mut PolygonNode, curve_tolerance: f64) {
    let cleaned = crate::clean_node_inner(&node.mem_seg, curve_tolerance);
    if !cleaned.is_empty() {
        node.mem_seg = cleaned.into_boxed_slice();
        node.seg_size = node.mem_seg.len();
    }
}

/// Apply offset to a polygon node
fn offset_node(node: &mut PolygonNode, sign: i32, spacing: i32, curve_tolerance: f64) {
    let offset_result = crate::offset_node_inner(&node.mem_seg, sign, spacing, curve_tolerance);
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
