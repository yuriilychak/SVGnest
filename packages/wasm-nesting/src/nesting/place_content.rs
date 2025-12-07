use crate::nesting::nest_content::NestContent;
use crate::nesting::polygon_node::PolygonNode;
use crate::utils::bit_ops::get_bits;
use std::collections::HashMap;

/// Rust port of PlaceContent class from TypeScript
/// Manages placement content including NFP cache and nodes
pub struct PlaceContent {
    nest_content: NestContent,
    nfp_cache: HashMap<u32, Vec<u8>>,
    area: f32,
    empty_node: PolygonNode,
    rotations: u32,
}

impl PlaceContent {
    /// Creates a new PlaceContent instance
    pub fn new() -> Self {
        Self {
            nest_content: NestContent::new(),
            nfp_cache: HashMap::new(),
            area: 0.0,
            empty_node: PolygonNode::new(-1, 0.0, Vec::new()),
            rotations: 0,
        }
    }

    /// Initialize from byte buffer
    /// Buffer format (matching TypeScript PlaceContent):
    /// - [0..4]: UNKNOWN (skipped)
    /// - [4..8]: nest_config (u32)
    /// - [8..12]: area (f32)
    /// - [12..16]: map_buffer_size (u32)
    /// - [16..16+map_buffer_size]: NFP cache map
    /// - [16+map_buffer_size..]: nodes data
    pub fn init(&mut self, buffer: &[u8]) -> &mut Self {
        if buffer.len() < 20 {
            return self;
        }

        // Read nest_config from bytes 4-8 (big-endian u32, matching TypeScript DataView)
        let nest_config = u32::from_be_bytes([buffer[4], buffer[5], buffer[6], buffer[7]]);

        // Read area from bytes 8-12 (big-endian f32, matching TypeScript DataView)
        self.area = f32::from_be_bytes([buffer[8], buffer[9], buffer[10], buffer[11]]);

        // Read map_buffer_size from bytes 12-16 (big-endian u32, matching TypeScript DataView)
        let map_buffer_size =
            u32::from_be_bytes([buffer[12], buffer[13], buffer[14], buffer[15]]) as usize;

        // Extract rotations from nest_config (bits 9-13, 5 bits)
        self.rotations = get_bits(nest_config, 9, 5) as u32;

        // Deserialize NFP cache map
        self.nfp_cache = Self::deserialize_buffer_to_map(buffer, 16, map_buffer_size);

        // Initialize nodes from remaining buffer
        let node_offset = 16 + map_buffer_size;
        if node_offset < buffer.len() {
            // Convert byte buffer to f32 buffer (matching TypeScript Float32Array view)
            let f32_buffer = Self::bytes_to_f32_buffer(&buffer[node_offset..]);
            self.nest_content.init_from_f32(&f32_buffer, nest_config);
        }

        self
    }

    /// Clean up resources
    pub fn clean(&mut self) {
        self.nest_content.clean();
        self.nfp_cache.clear();
        self.area = 0.0;
    }

    /// Get bin NFP for a node at given index
    pub fn get_bin_nfp(&self, index: usize) -> Option<&[u8]> {
        if index >= self.nest_content.node_count() {
            return None;
        }

        let key = PolygonNode::generate_nfp_cache_key(
            self.rotations,
            true,
            &self.empty_node,
            self.nest_content.node_at(index),
        );

        self.nfp_cache.get(&key).map(|v| v.as_slice())
    }

    /// Check if all necessary NFPs exist for placed nodes and path
    pub fn get_nfp_error(&self, placed: &[PolygonNode], path: &PolygonNode) -> bool {
        for placed_node in placed {
            let key = PolygonNode::generate_nfp_cache_key(self.rotations, false, placed_node, path);

            if !self.nfp_cache.contains_key(&key) {
                return true;
            }
        }

        false
    }

    /// Get path key for a node at given index
    pub fn get_path_key(&self, index: usize) -> u32 {
        use crate::utils::bit_ops::join_u16;

        if index >= self.nest_content.node_count() {
            return 0;
        }

        let node = self.nest_content.node_at(index);
        let rotation_index = PolygonNode::to_rotation_index(node.rotation, self.rotations);

        join_u16(node.source as u16, rotation_index as u16)
    }

    /// Deserialize buffer to NFP cache map
    /// Map format: [key (u32 BE), length (u32 BE), value (bytes), key, length, value, ...]
    /// Matches TypeScript PlaceContent.deserializeBufferToMap (DataView big-endian)
    fn deserialize_buffer_to_map(
        buffer: &[u8],
        initial_offset: usize,
        buffer_size: usize,
    ) -> HashMap<u32, Vec<u8>> {
        let mut map = HashMap::new();
        let result_offset = initial_offset + buffer_size;
        let mut offset = initial_offset;

        while offset + 8 <= result_offset {
            // Read key (big-endian u32, matching TypeScript DataView)
            let key = u32::from_be_bytes([
                buffer[offset],
                buffer[offset + 1],
                buffer[offset + 2],
                buffer[offset + 3],
            ]);
            offset += 4;

            // Read length (big-endian u32, matching TypeScript DataView)
            let length = u32::from_be_bytes([
                buffer[offset],
                buffer[offset + 1],
                buffer[offset + 2],
                buffer[offset + 3],
            ]) as usize;
            offset += 4;

            // Read value bytes
            if offset + length <= buffer.len() {
                let value = buffer[offset..offset + length].to_vec();
                map.insert(key, value);
                offset += length;
            } else {
                break;
            }
        }

        map
    }

    /// Convert byte buffer to f32 buffer (matching TypeScript Float32Array view)
    /// Creates a view of the byte data as f32 values using little-endian byte order
    fn bytes_to_f32_buffer(buffer: &[u8]) -> Vec<f32> {
        let f32_count = buffer.len() / 4;
        let mut result = Vec::with_capacity(f32_count);

        for i in 0..f32_count {
            let offset = i * 4;
            let bytes = [
                buffer[offset],
                buffer[offset + 1],
                buffer[offset + 2],
                buffer[offset + 3],
            ];
            // Float32Array uses little-endian (native byte order on x86/ARM)
            result.push(f32::from_le_bytes(bytes));
        }

        result
    }

    // Getters
    pub fn rotations(&self) -> u32 {
        self.rotations
    }

    pub fn nfp_cache(&self) -> &HashMap<u32, Vec<u8>> {
        &self.nfp_cache
    }

    pub fn area(&self) -> f32 {
        self.area
    }

    pub fn node_count(&self) -> usize {
        self.nest_content.node_count()
    }

    pub fn node_at(&self, index: usize) -> &PolygonNode {
        self.nest_content.node_at(index)
    }

    pub fn remove_node(&mut self, node: &PolygonNode) {
        // Find and remove node by comparing source
        for i in 0..self.nest_content.node_count() {
            if self.nest_content.node_at(i).source == node.source {
                self.nest_content.remove_node(i);
                break;
            }
        }
    }
}

impl Default for PlaceContent {
    fn default() -> Self {
        Self::new()
    }
}
