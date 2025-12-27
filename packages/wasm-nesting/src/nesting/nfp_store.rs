use crate::{nest_config::NestConfig, nesting::polygon_node::PolygonNode, utils::number::Number};
use std::cell::RefCell;
use std::collections::HashMap;

// Thread type constants
const THREAD_TYPE_PLACEMENT: u32 = 1;
const THREAD_TYPE_PAIR: u32 = 0;

pub struct NFPStore {
    nfp_cache: HashMap<u32, Vec<u8>>,
    nfp_pairs: Vec<Vec<f32>>,
    sources: Vec<i32>,
    phenotype_source: u16,
    angle_split: u8,
    config_compressed: u32,
}

// Singleton instance using thread_local
thread_local! {
    static INSTANCE: RefCell<NFPStore> = RefCell::new(NFPStore::new());
}

impl NFPStore {
    fn new() -> Self {
        NFPStore {
            nfp_cache: HashMap::new(),
            nfp_pairs: Vec::new(),
            sources: Vec::new(),
            phenotype_source: 0,
            angle_split: 0,
            config_compressed: 0,
        }
    }

    /// Access the singleton instance
    pub fn with_instance<F, R>(f: F) -> R
    where
        F: FnOnce(&mut NFPStore) -> R,
    {
        INSTANCE.with(|instance| f(&mut instance.borrow_mut()))
    }

    pub fn init(
        &mut self,
        nodes: &[PolygonNode],
        bin_node: &PolygonNode,
        config: &NestConfig,
        phenotype_source: u16,
        sources: &[i32],
        rotations: &[u16],
    ) {
        self.config_compressed = config.serialize();
        self.phenotype_source = phenotype_source;
        self.sources = sources.to_vec();
        self.angle_split = config.rotations;
        self.nfp_pairs.clear();

        let mut new_cache: HashMap<u32, Vec<u8>> = HashMap::new();

        for i in 0..self.sources.len() {
            let mut node = nodes[self.sources[i] as usize].clone();
            node.rotation = rotations[i] as f32;

            self.update_cache(bin_node, &node, true, &mut new_cache);

            for j in 0..i {
                let node_j = &nodes[sources[j] as usize];
                self.update_cache(node_j, &node, false, &mut new_cache);
            }
        }

        // Only keep cache for one cycle
        self.nfp_cache = new_cache;
    }

    pub fn update(&mut self, nfps: Vec<Vec<u8>>) {
        let nfp_count = nfps.len();

        if nfp_count != 0 {
            for nfp in nfps {
                if nfp.len() > 16 {
                    // 16 = 2 * f64 bytes (2 floats for header)
                    // A null nfp means the nfp could not be generated
                    let key = u32::from_le_bytes([nfp[0], nfp[1], nfp[2], nfp[3]]);
                    self.nfp_cache.insert(key, nfp);
                }
            }
        }
    }

    fn update_cache(
        &mut self,
        node1: &PolygonNode,
        node2: &PolygonNode,
        inside: bool,
        new_cache: &mut HashMap<u32, Vec<u8>>,
    ) {
        let key =
            PolygonNode::generate_nfp_cache_key(self.angle_split as u32, inside, node1, node2);

        if !self.nfp_cache.contains_key(&key) {
            let nodes = [node1.clone(), node2.clone()];
            let f32_buffer = Self::generate_pair(key, &nodes, self.config_compressed);
            self.nfp_pairs.push(f32_buffer);
        } else {
            if let Some(cached) = self.nfp_cache.get(&key) {
                new_cache.insert(key, cached.clone());
            }
        }
    }

    pub fn clean(&mut self) {
        self.nfp_cache.clear();
        self.nfp_pairs.clear();
        self.sources.clear();
        self.phenotype_source = 0;
        self.angle_split = 0;
        self.config_compressed = 0;
    }

    pub fn get_placement_data(&self, input_nodes: &[PolygonNode], area: f32) -> Vec<u8> {
        let nfp_buffer = Self::serialize_map_to_buffer(&self.nfp_cache);
        let nodes: Vec<PolygonNode> = self
            .sources
            .iter()
            .map(|&source| input_nodes[source as usize].clone())
            .collect();

        Self::generate_placement_data(&nfp_buffer, self.config_compressed, &nodes, area)
    }

    pub fn nfp_pairs(&self) -> &[Vec<f32>] {
        &self.nfp_pairs
    }

    pub fn nfp_pairs_count(&self) -> usize {
        self.nfp_pairs.len()
    }

    pub fn placement_count(&self) -> usize {
        self.sources.len()
    }

    pub fn phenotype_source(&self) -> u16 {
        self.phenotype_source
    }

    /// Generate pair data for NFP calculation
    ///
    /// Takes two nodes, rotates them, serializes with header
    pub fn generate_pair(key: u32, nodes: &[PolygonNode], config: u32) -> Vec<f32> {
        // Rotate the nodes
        let rotated_nodes = PolygonNode::rotate_nodes(nodes);

        // Serialize the nodes directly to f32 (no byte conversion needed)
        let serialized_f32 = PolygonNode::serialize_f32(&rotated_nodes, 0);

        // Create buffer with header + serialized nodes
        let mut f32_buffer = Vec::with_capacity(3 + serialized_f32.len());

        // Write header as f32 (reinterpreted from u32) in big-endian to match TypeScript DataView default
        f32_buffer.push(f32::from_bits(THREAD_TYPE_PAIR.swap_bytes()));
        f32_buffer.push(f32::from_bits(config.swap_bytes()));
        f32_buffer.push(f32::from_bits(key.swap_bytes()));

        // Append serialized f32 data directly
        f32_buffer.extend_from_slice(&serialized_f32);

        f32_buffer
    }

    /// Generate placement data for genetic algorithm
    ///
    /// Takes NFP cache buffer, config, input nodes, and area
    /// Returns serialized buffer with header + NFP cache + rotated nodes as f32
    pub fn generate_placement_data(
        nfp_buffer: &[u8],
        config: u32,
        input_nodes: &[PolygonNode],
        area: f32,
    ) -> Vec<u8> {
        let buffer_size = nfp_buffer.len();
        let nodes = PolygonNode::rotate_nodes(input_nodes);

        // Serialize nodes as f32
        let nodes_f32 = PolygonNode::serialize_f32(&nodes, 0);
        let nodes_bytes_len = nodes_f32.len() * std::mem::size_of::<f32>();

        let header_size = 16; // 4 * u32
        let total_size = header_size + buffer_size + nodes_bytes_len;
        let mut buffer = vec![0u8; total_size];

        // Write header in big-endian to match TypeScript DataView default
        buffer[0..4].copy_from_slice(&THREAD_TYPE_PLACEMENT.to_be_bytes());
        buffer[4..8].copy_from_slice(&config.to_be_bytes());
        buffer[8..12].copy_from_slice(&area.to_be_bytes());
        buffer[12..16].copy_from_slice(&(buffer_size as u32).to_be_bytes());

        // Copy NFP cache buffer
        buffer[16..16 + buffer_size].copy_from_slice(nfp_buffer);

        // Copy serialized nodes as f32 at the end
        let nodes_bytes =
            unsafe { std::slice::from_raw_parts(nodes_f32.as_ptr() as *const u8, nodes_bytes_len) };
        buffer[16 + buffer_size..].copy_from_slice(nodes_bytes);

        buffer
    }

    fn serialize_map_to_buffer(map: &HashMap<u32, Vec<u8>>) -> Vec<u8> {
        // Calculate total size
        let total_size: usize = map
            .values()
            .map(|buffer| 8 + buffer.len()) // 8 = 2 * u32 (key + length)
            .sum();

        let mut result = vec![0u8; total_size];
        let mut offset = 0;

        for (key, buffer) in map.iter() {
            // Write key in big-endian to match TypeScript DataView default
            result[offset..offset + 4].copy_from_slice(&key.to_be_bytes());
            offset += 4;

            // Write length in big-endian to match TypeScript DataView default
            let length = buffer.len() as u32;
            result[offset..offset + 4].copy_from_slice(&length.to_be_bytes());
            offset += 4;

            // Write buffer data
            result[offset..offset + buffer.len()].copy_from_slice(buffer);
            offset += buffer.len();
        }

        result
    }
}
