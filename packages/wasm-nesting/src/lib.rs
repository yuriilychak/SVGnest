use wasm_bindgen::prelude::*;
use web_sys::js_sys::{Float32Array, Uint8Array};

pub mod clipper;
pub mod clipper_wrapper;
pub mod constants;
pub mod genetic_algorithm;
pub mod geometry;
pub mod nest_config;
pub mod nesting;
pub mod utils;
pub mod wasm_packer;

use crate::nesting::polygon_node::PolygonNode;

use crate::utils::almost_equal::AlmostEqual;
use crate::utils::bit_ops::*;
use crate::utils::math::*;
use crate::utils::mid_value::MidValue;
use crate::utils::number::Number;

#[wasm_bindgen]
pub fn abs_polygon_area(points: &[f32]) -> f64 {
    return Number::abs_polygon_area(points);
}

#[wasm_bindgen]
pub fn calculate_bounds_wasm(polygon: &[f32]) -> Float32Array {
    let size = polygon.len() >> 1;
    let bounds = f32::calculate_bounds(polygon, 0, size);
    let out = Float32Array::new_with_length(4);
    out.copy_from(&bounds);
    out
}

#[wasm_bindgen]
pub fn set_bits_u32(source: u32, value: u16, index: u8, bit_count: u8) -> u32 {
    set_bits(source, value, index, bit_count)
}

#[wasm_bindgen]
pub fn get_u16_from_u32(source: u32, index: u8) -> u16 {
    get_u16(source, index)
}

/// Generate NFP cache key from two polygon nodes (WASM wrapper)
///
/// # Arguments
/// * `rotation_split` - Number of rotation splits (used to calculate rotation index)
/// * `inside` - Whether this is an inside NFP
/// * `source1` - Source ID of first polygon
/// * `rotation1` - Rotation of first polygon
/// * `source2` - Source ID of second polygon
/// * `rotation2` - Rotation of second polygon
///
/// # Returns
/// u32 cache key packed with polygon sources, rotation indices, and inside flag
#[wasm_bindgen]
pub fn generate_nfp_cache_key_wasm(
    rotation_split: u32,
    inside: bool,
    source1: i32,
    rotation1: f32,
    source2: i32,
    rotation2: f32,
) -> u32 {
    let polygon1 = PolygonNode::new(source1, rotation1, Vec::new());
    let polygon2 = PolygonNode::new(source2, rotation2, Vec::new());

    PolygonNode::generate_nfp_cache_key(rotation_split, inside, &polygon1, &polygon2)
}

/// WASM wrapper for calculate function
///
/// Main calculation function that routes to either pair_data or place_paths
/// based on the thread type in the buffer.
///
/// Port of TypeScript calculate function from worker-flow/index.ts
///
/// Arguments:
/// - buffer: Uint8Array where first 4 bytes (u32 big-endian) indicate thread type
///   - 0 = PAIR (calls pair_data)
///   - 1 = PLACEMENT (calls place_paths)
///
/// Returns: Float32Array containing result from either pair_data or place_paths
#[wasm_bindgen]
pub fn calculate_wasm(buffer: &[u8]) -> Float32Array {
    let result = crate::nesting::calculate::calculate(buffer);
    let out = Float32Array::new_with_length(result.len() as u32);
    out.copy_from(&result);
    out
}

/// Generate polygon tree from flat arrays
///
/// Arguments:
/// - values: Float32Array containing flattened polygon coordinates [x1, y1, x2, y2, ...]
/// - sizes: Uint16Array containing point counts for each polygon
/// - spacing: Offset spacing value (u8)
/// - curve_tolerance: Curve tolerance for cleaning/offsetting (f32)
///
/// Returns: Uint8Array containing serialized PolygonNode tree
#[wasm_bindgen]
pub fn generate_tree_wasm(
    values: &[f32],
    sizes: &[u16],
    spacing: u8,
    curve_tolerance: f32,
) -> Uint8Array {
    let nodes =
        clipper_wrapper::generate_tree(values, sizes, spacing as i32, curve_tolerance as f64);
    let serialized = PolygonNode::serialize(&nodes, 0);

    let result = Uint8Array::new_with_length(serialized.len() as u32);
    result.copy_from(&serialized);
    result
}

/// Generate bounds for a bin polygon
///
/// Arguments:
/// - mem_seg: Float32Array containing polygon coordinates [x1, y1, x2, y2, ...]
/// - spacing: Offset spacing value (i32)
/// - curve_tolerance: Curve tolerance for cleaning/offsetting (f32)
///
/// Returns: Float32Array with structure:
/// [boundsX, boundsY, boundsWidth, boundsHeight,
///  resultBoundsX, resultBoundsY, resultBoundsWidth, resultBoundsHeight,
///  area, ...serialized_node]
#[wasm_bindgen]
pub fn generate_bounds_wasm(mem_seg: &[f32], spacing: i32, curve_tolerance: f32) -> Float32Array {
    match clipper_wrapper::generate_bounds(mem_seg, spacing, curve_tolerance as f64) {
        Some((bounds, result_bounds, area, node)) => {
            // Serialize the node
            let nodes = vec![node];
            let serialized = PolygonNode::serialize(&nodes, 0);

            // Calculate total size: 9 floats + serialized bytes (as f32 array)
            // We need to convert bytes to f32 count
            let serialized_f32_count = (serialized.len() + 3) / 4; // Round up to next f32
            let total_size = 9 + serialized_f32_count;
            let mut result_vec = vec![0f32; total_size];

            // Fill in bounds data
            unsafe {
                result_vec[0] = bounds.x();
                result_vec[1] = bounds.y();
                result_vec[2] = bounds.width();
                result_vec[3] = bounds.height();
                result_vec[4] = result_bounds.x();
                result_vec[5] = result_bounds.y();
                result_vec[6] = result_bounds.width();
                result_vec[7] = result_bounds.height();
            }
            result_vec[8] = area as f32;

            // Copy serialized data as bytes into the f32 array
            let bytes_slice = unsafe {
                std::slice::from_raw_parts_mut(
                    result_vec[9..].as_mut_ptr() as *mut u8,
                    serialized.len(),
                )
            };
            bytes_slice.copy_from_slice(&serialized);

            let out = Float32Array::new_with_length(result_vec.len() as u32);
            out.copy_from(&result_vec);
            out
        }
        None => Float32Array::new_with_length(0),
    }
}

/// Initialize the singleton GeneticAlgorithm
///
/// Arguments:
/// - nodes_data: Float32Array containing serialized PolygonNode data
/// - bounds: Float32Array [x, y, width, height]
/// - config: Serialized NestConfig (u32)
#[wasm_bindgen]
pub fn genetic_algorithm_init(nodes_data: &[f32], bounds: &[f32], config: u32) {
    use crate::genetic_algorithm::GeneticAlgorithm;
    use crate::geometry::bound_rect::BoundRect;
    use crate::nest_config::NestConfig;

    // Deserialize nodes directly from f32 array
    let nodes = PolygonNode::deserialize(nodes_data, 0);

    // Create bounds - check bounds array length
    if bounds.len() < 4 {
        return; // Not enough data
    }
    let bound_rect = BoundRect::<f32>::from_array(bounds);

    // Deserialize config
    let mut nest_config = NestConfig::new();
    nest_config.deserialize(config);

    // Initialize GA
    GeneticAlgorithm::with_instance(|ga| {
        ga.init(&nodes, &bound_rect, &nest_config);
    });
}

/// Clean the singleton GeneticAlgorithm
#[wasm_bindgen]
pub fn genetic_algorithm_clean() {
    use crate::genetic_algorithm::GeneticAlgorithm;

    GeneticAlgorithm::with_instance(|ga| {
        ga.clean();
    });
}

/// Get individual from the singleton GeneticAlgorithm
///
/// Arguments:
/// - nodes_data: Float32Array containing serialized PolygonNode data
///
/// Returns: Uint8Array containing serialized Phenotype [source (u16), placement_count (u32), placement[] (i32[]), rotation[] (u16[])]
#[wasm_bindgen]
pub fn genetic_algorithm_get_individual(nodes_data: &[f32]) -> Uint8Array {
    use crate::genetic_algorithm::GeneticAlgorithm;

    // Deserialize nodes directly from f32 array
    let nodes = PolygonNode::deserialize(nodes_data, 0);

    let phenotype_opt = GeneticAlgorithm::with_instance(|ga| ga.get_individual(&nodes));

    match phenotype_opt {
        Some(phenotype) => {
            // Serialize: source (u16) + placement_count (u32) + placement[] (i32[]) + rotation[] (u16[])
            let placement = phenotype.placement();
            let rotation = phenotype.rotation();
            let placement_count = placement.len() as u32;

            // Calculate total size
            let total_size =
                2 + 4 + (placement_count as usize * 4) + (placement_count as usize * 2);
            let mut buffer = vec![0u8; total_size];
            let mut offset = 0;

            // Write source (u16)
            buffer[offset..offset + 2].copy_from_slice(&phenotype.source().to_le_bytes());
            offset += 2;

            // Write placement count (u32)
            buffer[offset..offset + 4].copy_from_slice(&placement_count.to_le_bytes());
            offset += 4;

            // Write placement array (i32[])
            for &p in placement {
                buffer[offset..offset + 4].copy_from_slice(&p.to_le_bytes());
                offset += 4;
            }

            // Write rotation array (u16[])
            for &r in rotation {
                buffer[offset..offset + 2].copy_from_slice(&r.to_le_bytes());
                offset += 2;
            }

            let result = Uint8Array::new_with_length(buffer.len() as u32);
            result.copy_from(&buffer);
            result
        }
        None => Uint8Array::new_with_length(0),
    }
}

/// Update fitness in the singleton GeneticAlgorithm
///
/// Arguments:
/// - source: Phenotype source ID (u16)
/// - fitness: Fitness value (f32)
#[wasm_bindgen]
pub fn genetic_algorithm_update_fitness(source: u16, fitness: f32) {
    use crate::genetic_algorithm::GeneticAlgorithm;

    GeneticAlgorithm::with_instance(|ga| {
        ga.update_fitness(source, fitness);
    });
}

// ============================================================================
// NFPStore WASM Wrappers
// ============================================================================

/// Initialize the singleton NFPStore
///
/// Arguments:
/// - nodes_data: Float32Array containing serialized PolygonNode data (all nodes + bin_node)
/// - config: Serialized NestConfig (u32)
/// - phenotype_source: Phenotype source ID (u16)
/// - sources: Int32Array of source indices
/// - rotations: Uint16Array of rotation values
#[wasm_bindgen]
pub fn nfp_store_init(
    nodes_data: &[f32],
    config: u32,
    phenotype_source: u16,
    sources: &[i32],
    rotations: &[u16],
) {
    use crate::nest_config::NestConfig;
    use crate::nesting::nfp_store::NFPStore;

    // Deserialize all nodes (including bin_node as last) directly from f32 array
    let nodes = PolygonNode::deserialize(nodes_data, 0);

    // Split: last node is bin_node, rest are regular nodes
    let bin_node = &nodes[nodes.len() - 1];
    let regular_nodes = &nodes[..nodes.len() - 1];

    // Deserialize config
    let mut nest_config = NestConfig::new();
    nest_config.deserialize(config);

    // Initialize NFPStore
    NFPStore::with_instance(|nfp_store| {
        nfp_store.init(
            regular_nodes,
            bin_node,
            &nest_config,
            phenotype_source,
            sources,
            rotations,
        );
    });
}

/// Update NFP cache in the singleton NFPStore
///
/// Arguments:
/// - nfps_data: Uint8Array containing serialized NFPs [count (u32), [size (u32), data]...]
#[wasm_bindgen]
pub fn nfp_store_update(nfps_data: &[u8]) {
    use crate::nesting::nfp_store::NFPStore;

    if nfps_data.len() < 4 {
        return;
    }

    // Read count
    let count =
        u32::from_le_bytes([nfps_data[0], nfps_data[1], nfps_data[2], nfps_data[3]]) as usize;
    let mut offset = 4;

    let mut nfps: Vec<Vec<u8>> = Vec::with_capacity(count);

    for _ in 0..count {
        if offset + 4 > nfps_data.len() {
            break;
        }

        // Read size
        let size = u32::from_le_bytes([
            nfps_data[offset],
            nfps_data[offset + 1],
            nfps_data[offset + 2],
            nfps_data[offset + 3],
        ]) as usize;
        offset += 4;

        if offset + size > nfps_data.len() {
            break;
        }

        // Read NFP data
        let nfp = nfps_data[offset..offset + size].to_vec();
        offset += size;

        nfps.push(nfp);
    }

    NFPStore::with_instance(|nfp_store| {
        nfp_store.update(nfps);
    });
}

/// Clean the singleton NFPStore
#[wasm_bindgen]
pub fn nfp_store_clean() {
    use crate::nesting::nfp_store::NFPStore;

    NFPStore::with_instance(|nfp_store| {
        nfp_store.clean();
    });
}

/// Get placement data from the singleton NFPStore
///
/// Arguments:
/// - nodes_data: Float32Array containing serialized PolygonNode data
/// - area: Bin area (f32)
///
/// Returns: Uint8Array containing placement data
#[wasm_bindgen]
pub fn nfp_store_get_placement_data(nodes_data: &[f32], area: f32) -> Uint8Array {
    use crate::nesting::nfp_store::NFPStore;

    // Deserialize nodes directly from f32 array
    let nodes = PolygonNode::deserialize(nodes_data, 0);

    let result = NFPStore::with_instance(|nfp_store| nfp_store.get_placement_data(&nodes, area));

    let out = Uint8Array::new_with_length(result.len() as u32);
    out.copy_from(&result);
    out
}

/// Get NFP pairs from the singleton NFPStore
///
/// Returns: Uint8Array containing serialized pairs [count (u32), [size (u32), data]...]
#[wasm_bindgen]
pub fn nfp_store_get_nfp_pairs() -> Float32Array {
    use crate::nesting::nfp_store::NFPStore;

    let pairs = NFPStore::with_instance(|nfp_store| nfp_store.nfp_pairs().to_vec());

    // Serialize: count (f32) + [size (f32) + data] for each pair
    let mut total_size = 1; // count as f32
    for pair in &pairs {
        total_size += 1 + pair.len(); // size as f32 + data
    }

    let mut buffer = Vec::with_capacity(total_size);

    // Write count as f32
    buffer.push(f32::from_bits(pairs.len() as u32));

    // Write each pair
    for pair in &pairs {
        buffer.push(f32::from_bits(pair.len() as u32));
        buffer.extend_from_slice(pair);
    }

    let out = Float32Array::new_with_length(buffer.len() as u32);
    out.copy_from(&buffer);
    out
}

/// Get NFP pairs count from the singleton NFPStore
#[wasm_bindgen]
pub fn nfp_store_get_nfp_pairs_count() -> usize {
    use crate::nesting::nfp_store::NFPStore;

    NFPStore::with_instance(|nfp_store| nfp_store.nfp_pairs_count())
}

/// Get placement count from the singleton NFPStore
#[wasm_bindgen]
pub fn nfp_store_get_placement_count() -> usize {
    use crate::nesting::nfp_store::NFPStore;

    NFPStore::with_instance(|nfp_store| nfp_store.placement_count())
}

/// Get phenotype source from the singleton NFPStore
#[wasm_bindgen]
pub fn nfp_store_get_phenotype_source() -> u16 {
    use crate::nesting::nfp_store::NFPStore;

    NFPStore::with_instance(|nfp_store| nfp_store.phenotype_source())
}

/// Rotate polygon nodes
///
/// Takes serialized nodes as Float32Array, deserializes them, rotates them,
/// and returns the rotated nodes as Uint8Array
#[wasm_bindgen]
pub fn rotate_nodes_wasm(nodes_data: &[f32]) -> Uint8Array {
    use crate::nesting::polygon_node::PolygonNode;

    // Deserialize nodes directly from f32 array
    let nodes = PolygonNode::deserialize(nodes_data, 0);

    // Rotate nodes
    let rotated_nodes = PolygonNode::rotate_nodes(&nodes);

    // Serialize rotated nodes
    let serialized = PolygonNode::serialize(&rotated_nodes, 0);

    // Return as Uint8Array
    let out = Uint8Array::new_with_length(serialized.len() as u32);
    out.copy_from(&serialized);
    out
}

/// Generate pair data for NFP calculation
///
/// Takes key, config, and serialized nodes (2 nodes), returns Float32Array with header and rotated nodes
#[wasm_bindgen]
pub fn nfp_generate_pair(key: u32, config: u32, nodes_data: &[f32]) -> Float32Array {
    use crate::nesting::nfp_store::NFPStore;
    use crate::nesting::polygon_node::PolygonNode;

    // Deserialize nodes directly from f32 array
    let nodes = PolygonNode::deserialize(nodes_data, 0);

    // Generate pair
    let pair_data = NFPStore::generate_pair(key, &nodes, config);

    // Return as Float32Array
    let out = Float32Array::new_with_length(pair_data.len() as u32);
    out.copy_from(&pair_data);
    out
}
