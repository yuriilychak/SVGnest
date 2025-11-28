/// Root-level PolygonNode with serialization/deserialization methods
/// This is separate from nesting::polygon_node to provide standalone serialization
#[derive(Debug, Clone)]
pub struct PolygonNode {
    pub source: i32,
    pub rotation: f32,
    pub mem_seg: Vec<f32>,
    pub children: Vec<PolygonNode>,
}

/// NFP cache key indices for bit packing
const NFP_KEY_INDICES: [u8; 6] = [0, 10, 19, 23, 27, 32];

impl PolygonNode {
    /// Creates a new PolygonNode
    pub fn new(source: i32, rotation: f32, mem_seg: Vec<f32>) -> Self {
        Self {
            source,
            rotation,
            mem_seg,
            children: Vec::new(),
        }
    }

    /// Generates an NFP cache key from two polygon nodes
    ///
    /// # Arguments
    /// * `rotation_split` - Number of rotation splits (used to calculate rotation index)
    /// * `inside` - Whether this is an inside NFP
    /// * `polygon1` - First polygon node
    /// * `polygon2` - Second polygon node
    ///
    /// # Returns
    /// u32 cache key packed with polygon sources, rotation indices, and inside flag
    pub fn generate_nfp_cache_key(
        rotation_split: u16,
        inside: bool,
        polygon1: &PolygonNode,
        polygon2: &PolygonNode,
    ) -> u32 {
        use crate::utils::bit_ops::set_bits;
        use crate::utils::math::to_rotation_index;

        let rotation_index1 = to_rotation_index(polygon1.rotation as u16, rotation_split);
        let rotation_index2 = to_rotation_index(polygon2.rotation as u16, rotation_split);

        // Create data array: [source1+1, source2+1, rotation_index1, rotation_index2, inside]
        let data: [u16; 5] = [
            (polygon1.source + 1) as u16,
            (polygon2.source + 1) as u16,
            rotation_index1 as u16,
            rotation_index2 as u16,
            if inside { 1 } else { 0 },
        ];

        let mut result: u32 = 0;

        // Pack the data using bit operations
        for i in 0..data.len() {
            let bit_offset = NFP_KEY_INDICES[i];
            let bit_count = NFP_KEY_INDICES[i + 1] - NFP_KEY_INDICES[i];
            result = set_bits(result, data[i], bit_offset, bit_count);
        }

        result
    }

    /// Calculates the total size needed for serialization
    fn calculate_total_size(nodes: &[PolygonNode], initial_size: usize) -> usize {
        nodes.iter().fold(initial_size, |result, node| {
            // Each node: source (u32) + rotation (f32) + point_count (u32) + mem_seg data + children_count (u32)
            let node_size = 4 + 4 + 4 + (node.mem_seg.len() * 4) + 4;
            let new_result = result + node_size;
            Self::calculate_total_size(&node.children, new_result)
        })
    }

    /// Serializes nodes recursively into the buffer
    fn serialize_nodes(nodes: &[PolygonNode], buffer: &mut Vec<u8>, offset: &mut usize) {
        for node in nodes {
            // Write source (add 1 like TypeScript does)
            let source_bytes = ((node.source + 1) as u32).to_le_bytes();
            buffer[*offset..*offset + 4].copy_from_slice(&source_bytes);
            *offset += 4;

            // Write rotation
            let rotation_bytes = node.rotation.to_le_bytes();
            buffer[*offset..*offset + 4].copy_from_slice(&rotation_bytes);
            *offset += 4;

            // Write point count (memSeg.length >> 1)
            let point_count = (node.mem_seg.len() >> 1) as u32;
            let point_count_bytes = point_count.to_le_bytes();
            buffer[*offset..*offset + 4].copy_from_slice(&point_count_bytes);
            *offset += 4;

            // Write mem_seg data
            for &value in &node.mem_seg {
                let value_bytes = value.to_le_bytes();
                buffer[*offset..*offset + 4].copy_from_slice(&value_bytes);
                *offset += 4;
            }

            // Write children count
            let children_count = node.children.len() as u32;
            let children_count_bytes = children_count.to_le_bytes();
            buffer[*offset..*offset + 4].copy_from_slice(&children_count_bytes);
            *offset += 4;

            // Recursively serialize children
            Self::serialize_nodes(&node.children, buffer, offset);
        }
    }

    /// Serializes polygon nodes to a byte buffer
    ///
    /// # Arguments
    /// * `nodes` - Vector of PolygonNode to serialize
    /// * `offset` - Initial offset in the buffer (default 0)
    ///
    /// # Returns
    /// Vec<u8> containing the serialized data
    pub fn serialize(nodes: &[PolygonNode], offset: usize) -> Vec<u8> {
        let initial_offset = 4 + offset; // 4 bytes for node count
        let total_size = Self::calculate_total_size(nodes, initial_offset);
        let mut buffer = vec![0u8; total_size];

        // Write node count at offset
        let node_count = nodes.len() as u32;
        let node_count_bytes = node_count.to_le_bytes();
        buffer[offset..offset + 4].copy_from_slice(&node_count_bytes);

        let mut write_offset = initial_offset;
        Self::serialize_nodes(nodes, &mut buffer, &mut write_offset);

        buffer
    }

    /// Deserializes nodes recursively from the buffer
    fn deserialize_nodes(buffer: &[u8], offset: &mut usize, count: usize) -> Vec<PolygonNode> {
        let mut nodes = Vec::with_capacity(count);

        for _ in 0..count {
            if *offset + 12 > buffer.len() {
                break; // Not enough data
            }

            // Read source (subtract 1 like TypeScript does)
            let source_bytes = [
                buffer[*offset],
                buffer[*offset + 1],
                buffer[*offset + 2],
                buffer[*offset + 3],
            ];
            let source = (u32::from_le_bytes(source_bytes) as i32) - 1;
            *offset += 4;

            // Read rotation
            let rotation_bytes = [
                buffer[*offset],
                buffer[*offset + 1],
                buffer[*offset + 2],
                buffer[*offset + 3],
            ];
            let rotation = f32::from_le_bytes(rotation_bytes);
            *offset += 4;

            // Read point count
            let point_count_bytes = [
                buffer[*offset],
                buffer[*offset + 1],
                buffer[*offset + 2],
                buffer[*offset + 3],
            ];
            let point_count = u32::from_le_bytes(point_count_bytes) as usize;
            *offset += 4;

            // Read mem_seg data
            let mem_seg_length = point_count << 1; // point_count * 2
            let mem_seg_bytes_needed = mem_seg_length * 4;

            if *offset + mem_seg_bytes_needed > buffer.len() {
                break; // Not enough data
            }

            let mut mem_seg = Vec::with_capacity(mem_seg_length);
            for _ in 0..mem_seg_length {
                let value_bytes = [
                    buffer[*offset],
                    buffer[*offset + 1],
                    buffer[*offset + 2],
                    buffer[*offset + 3],
                ];
                let value = f32::from_le_bytes(value_bytes);
                mem_seg.push(value);
                *offset += 4;
            }

            // Read children count
            if *offset + 4 > buffer.len() {
                break;
            }
            let children_count_bytes = [
                buffer[*offset],
                buffer[*offset + 1],
                buffer[*offset + 2],
                buffer[*offset + 3],
            ];
            let children_count = u32::from_le_bytes(children_count_bytes) as usize;
            *offset += 4;

            // Recursively deserialize children
            let children = Self::deserialize_nodes(buffer, offset, children_count);

            nodes.push(PolygonNode {
                source,
                rotation,
                mem_seg,
                children,
            });
        }

        nodes
    }

    /// Deserializes polygon nodes from a byte buffer
    ///
    /// # Arguments
    /// * `buffer` - Byte buffer containing serialized data
    /// * `offset` - Initial offset in the buffer (default 0)
    ///
    /// # Returns
    /// Vec<PolygonNode> containing the deserialized nodes
    pub fn deserialize(buffer: &[u8], offset: usize) -> Vec<PolygonNode> {
        if buffer.len() < offset + 4 {
            return Vec::new();
        }

        // Read node count
        let node_count_bytes = [
            buffer[offset],
            buffer[offset + 1],
            buffer[offset + 2],
            buffer[offset + 3],
        ];
        let node_count = u32::from_le_bytes(node_count_bytes) as usize;

        let mut read_offset = offset + 4;
        Self::deserialize_nodes(buffer, &mut read_offset, node_count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_serialize_deserialize_single_node() {
        let node = PolygonNode::new(0, 0.0, vec![1.0, 2.0, 3.0, 4.0]);
        let nodes = vec![node];

        let serialized = PolygonNode::serialize(&nodes, 0);
        let deserialized = PolygonNode::deserialize(&serialized, 0);

        assert_eq!(deserialized.len(), 1);
        assert_eq!(deserialized[0].source, 0);
        assert_eq!(deserialized[0].rotation, 0.0);
        assert_eq!(deserialized[0].mem_seg, vec![1.0, 2.0, 3.0, 4.0]);
        assert_eq!(deserialized[0].children.len(), 0);
    }

    #[test]
    fn test_serialize_deserialize_with_children() {
        let child1 = PolygonNode::new(1, 45.0, vec![5.0, 6.0, 7.0, 8.0]);
        let child2 = PolygonNode::new(2, 90.0, vec![9.0, 10.0]);

        let mut parent = PolygonNode::new(0, 0.0, vec![1.0, 2.0, 3.0, 4.0]);
        parent.children = vec![child1, child2];

        let nodes = vec![parent];

        let serialized = PolygonNode::serialize(&nodes, 0);
        let deserialized = PolygonNode::deserialize(&serialized, 0);

        assert_eq!(deserialized.len(), 1);
        assert_eq!(deserialized[0].source, 0);
        assert_eq!(deserialized[0].children.len(), 2);
        assert_eq!(deserialized[0].children[0].source, 1);
        assert_eq!(deserialized[0].children[0].rotation, 45.0);
        assert_eq!(deserialized[0].children[1].source, 2);
        assert_eq!(deserialized[0].children[1].rotation, 90.0);
    }

    #[test]
    fn test_serialize_deserialize_nested_children() {
        let grandchild = PolygonNode::new(2, 180.0, vec![11.0, 12.0]);
        let mut child = PolygonNode::new(1, 90.0, vec![5.0, 6.0, 7.0, 8.0]);
        child.children = vec![grandchild];

        let mut parent = PolygonNode::new(0, 0.0, vec![1.0, 2.0, 3.0, 4.0]);
        parent.children = vec![child];

        let nodes = vec![parent];

        let serialized = PolygonNode::serialize(&nodes, 0);
        let deserialized = PolygonNode::deserialize(&serialized, 0);

        assert_eq!(deserialized.len(), 1);
        assert_eq!(deserialized[0].children.len(), 1);
        assert_eq!(deserialized[0].children[0].children.len(), 1);
        assert_eq!(deserialized[0].children[0].children[0].source, 2);
        assert_eq!(deserialized[0].children[0].children[0].rotation, 180.0);
    }

    #[test]
    fn test_serialize_deserialize_multiple_nodes() {
        let node1 = PolygonNode::new(0, 0.0, vec![1.0, 2.0]);
        let node2 = PolygonNode::new(1, 45.0, vec![3.0, 4.0, 5.0, 6.0]);
        let node3 = PolygonNode::new(2, 90.0, vec![7.0, 8.0, 9.0, 10.0, 11.0, 12.0]);

        let nodes = vec![node1, node2, node3];

        let serialized = PolygonNode::serialize(&nodes, 0);
        let deserialized = PolygonNode::deserialize(&serialized, 0);

        assert_eq!(deserialized.len(), 3);
        assert_eq!(deserialized[0].source, 0);
        assert_eq!(deserialized[1].source, 1);
        assert_eq!(deserialized[2].source, 2);
    }

    #[test]
    fn test_serialize_with_offset() {
        let node = PolygonNode::new(0, 0.0, vec![1.0, 2.0]);
        let nodes = vec![node];

        let offset = 8;
        let serialized = PolygonNode::serialize(&nodes, offset);
        let deserialized = PolygonNode::deserialize(&serialized, offset);

        assert_eq!(deserialized.len(), 1);
        assert_eq!(deserialized[0].source, 0);
    }

    #[test]
    fn test_generate_nfp_cache_key() {
        let polygon1 = PolygonNode::new(0, 0.0, vec![1.0, 2.0]);
        let polygon2 = PolygonNode::new(1, 90.0, vec![3.0, 4.0]);

        // Test with inside = false
        let key1 = PolygonNode::generate_nfp_cache_key(4, false, &polygon1, &polygon2);
        assert!(key1 > 0);

        // Test with inside = true
        let key2 = PolygonNode::generate_nfp_cache_key(4, true, &polygon1, &polygon2);
        assert!(key2 > 0);
        assert_ne!(key1, key2); // Keys should be different when inside flag changes

        // Test that same inputs produce same key
        let key3 = PolygonNode::generate_nfp_cache_key(4, false, &polygon1, &polygon2);
        assert_eq!(key1, key3);

        // Test with different rotation split
        let key4 = PolygonNode::generate_nfp_cache_key(8, false, &polygon1, &polygon2);
        // May or may not be different depending on rotation indices
    }

    #[test]
    fn test_generate_nfp_cache_key_different_sources() {
        let polygon1 = PolygonNode::new(0, 0.0, vec![1.0, 2.0]);
        let polygon2 = PolygonNode::new(1, 0.0, vec![3.0, 4.0]);
        let polygon3 = PolygonNode::new(2, 0.0, vec![5.0, 6.0]);

        let key1 = PolygonNode::generate_nfp_cache_key(4, false, &polygon1, &polygon2);
        let key2 = PolygonNode::generate_nfp_cache_key(4, false, &polygon1, &polygon3);
        let key3 = PolygonNode::generate_nfp_cache_key(4, false, &polygon2, &polygon3);

        // All keys should be different because sources are different
        assert_ne!(key1, key2);
        assert_ne!(key1, key3);
        assert_ne!(key2, key3);
    }
}
