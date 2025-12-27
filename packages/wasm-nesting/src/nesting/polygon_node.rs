#[derive(Debug, Clone)]
pub struct PolygonNode {
    pub source: i32,
    pub rotation: f32,
    pub seg_size: usize,
    pub mem_seg: Box<[f32]>,
    pub children: Vec<PolygonNode>,
}

impl PolygonNode {
    /// Create a new PolygonNode from source, rotation, and memory segment
    pub fn new(source: i32, rotation: f32, mem_seg: Vec<f32>) -> Self {
        let seg_size = mem_seg.len();
        PolygonNode {
            source,
            rotation,
            seg_size,
            mem_seg: mem_seg.into_boxed_slice(),
            children: Vec::new(),
        }
    }
    /// Deserialize PolygonNodes from f32 buffer
    ///
    /// Reads node count from buffer[offset] and deserializes that many nodes
    /// starting from buffer[offset + 1]
    ///
    /// Arguments:
    /// - buffer: f32 buffer containing serialized node data
    /// - offset: Position where node count is stored
    ///
    /// Returns: Vector of deserialized PolygonNodes
    pub fn deserialize(buffer: &[f32], offset: usize) -> Vec<PolygonNode> {
        if buffer.len() <= offset {
            return Vec::new();
        }

        // Read node count (big-endian u32, matching TypeScript DataView)
        let root_count = buffer[offset].to_bits().swap_bytes() as usize;

        if root_count == 0 {
            return Vec::new();
        }

        let (nodes, _) = Self::deserialize_inner(buffer, offset + 1, root_count);
        nodes
    }

    pub fn serialize(nodes: &[PolygonNode], offset: usize) -> Vec<u8> {
        let initial_offset = std::mem::size_of::<u32>() + offset;
        let total_size = Self::calculate_total_size(nodes, initial_offset);
        let mut buffer = vec![0u8; total_size];

        // Write node count at offset
        let node_count = nodes.len() as u32;
        let count_bytes = node_count.to_le_bytes();
        buffer[offset..offset + 4].copy_from_slice(&count_bytes);

        Self::serialize_internal(nodes, &mut buffer, initial_offset);

        buffer
    }

    fn deserialize_inner(
        buffer: &[f32],
        mut idx: usize,
        count: usize,
    ) -> (Vec<PolygonNode>, usize) {
        let mut nodes = Vec::with_capacity(count);

        for _ in 0..count {
            let raw_source = buffer[idx].to_bits().swap_bytes();
            let source = raw_source.wrapping_sub(1) as i32;
            idx += 1;

            // Rotation is also stored in big-endian by DataView.setFloat32()
            let rotation = f32::from_bits(buffer[idx].to_bits().swap_bytes());
            idx += 1;

            let seg_size = (buffer[idx].to_bits().swap_bytes() as usize) << 1;
            idx += 1;

            let mem_seg = buffer[idx..idx + seg_size].to_vec().into_boxed_slice();
            idx += seg_size;

            let child_count = buffer[idx].to_bits().swap_bytes() as usize;
            idx += 1;

            let (children, new_idx) = Self::deserialize_inner(buffer, idx, child_count);
            idx = new_idx;

            nodes.push(PolygonNode {
                source,
                seg_size,
                rotation,
                mem_seg,
                children,
            });
        }

        (nodes, idx)
    }

    fn calculate_total_size(nodes: &[PolygonNode], initial_size: usize) -> usize {
        nodes.iter().fold(initial_size, |result, node| {
            let node_size =
                (std::mem::size_of::<u32>() << 2) + node.mem_seg.len() * std::mem::size_of::<f32>();
            let new_result = result + node_size;
            Self::calculate_total_size(&node.children, new_result)
        })
    }

    fn serialize_internal(nodes: &[PolygonNode], buffer: &mut [u8], offset: usize) -> usize {
        nodes.iter().fold(offset, |mut result, node| {
            // Write source (u32)
            let source_bytes = ((node.source + 1) as u32).to_le_bytes();
            buffer[result..result + 4].copy_from_slice(&source_bytes);
            result += std::mem::size_of::<u32>();

            // Write rotation (f32)
            let rotation_bytes = node.rotation.to_le_bytes();
            buffer[result..result + 4].copy_from_slice(&rotation_bytes);
            result += std::mem::size_of::<f32>();

            // Write mem_seg length (u32) - storing as number of points (length / 2)
            let mem_seg_length = (node.mem_seg.len() >> 1) as u32;
            let length_bytes = mem_seg_length.to_le_bytes();
            buffer[result..result + 4].copy_from_slice(&length_bytes);
            result += std::mem::size_of::<u32>();

            // Write mem_seg data
            let mem_seg_bytes = unsafe {
                std::slice::from_raw_parts(
                    node.mem_seg.as_ptr() as *const u8,
                    node.mem_seg.len() * std::mem::size_of::<f32>(),
                )
            };
            buffer[result..result + mem_seg_bytes.len()].copy_from_slice(mem_seg_bytes);
            result += mem_seg_bytes.len();

            // Write children count (u32)
            let children_count = node.children.len() as u32;
            let children_count_bytes = children_count.to_le_bytes();
            buffer[result..result + 4].copy_from_slice(&children_count_bytes);
            result += std::mem::size_of::<u32>();

            // Recursively serialize children
            Self::serialize_internal(&node.children, buffer, result)
        })
    }

    /// Serialize nodes to Vec<f32> format (for Float32Array)
    /// Only the root node count uses big-endian (swap_bytes), all other values are native format
    pub fn serialize_f32(nodes: &[PolygonNode], offset: usize) -> Vec<f32> {
        // Calculate total f32 count needed
        let total_count = Self::calculate_total_f32_count(nodes, offset + 1);
        let mut buffer = vec![0.0f32; total_count];

        // Write node count as f32 with big-endian (swap_bytes) - only for root level
        let node_count = nodes.len() as u32;
        buffer[offset] = f32::from_bits(node_count.swap_bytes());

        // Serialize nodes starting after the count
        Self::serialize_f32_internal(nodes, &mut buffer, offset + 1);
        buffer
    }

    fn serialize_f32_internal(nodes: &[PolygonNode], buffer: &mut [f32], offset: usize) -> usize {
        nodes.iter().fold(offset, |mut result, node| {
            // Write source as f32 (reinterpreting u32 bits) - big-endian to match deserialize
            buffer[result] = f32::from_bits(((node.source + 1) as u32).swap_bytes());
            result += 1;

            // Write rotation - big-endian to match deserialize
            buffer[result] = f32::from_bits(node.rotation.to_bits().swap_bytes());
            result += 1;

            // Write mem_seg length as f32 (number of points) - big-endian to match deserialize
            let mem_seg_length = ((node.mem_seg.len() >> 1) as u32).swap_bytes();
            buffer[result] = f32::from_bits(mem_seg_length);
            result += 1;

            // Write mem_seg data directly (coordinate data in native format)
            buffer[result..result + node.mem_seg.len()].copy_from_slice(&node.mem_seg);
            result += node.mem_seg.len();

            // Write children count as f32 - big-endian to match deserialize
            buffer[result] = f32::from_bits((node.children.len() as u32).swap_bytes());
            result += 1;

            // Recursively serialize children
            Self::serialize_f32_internal(&node.children, buffer, result)
        })
    }

    fn calculate_total_f32_count(nodes: &[PolygonNode], initial_count: usize) -> usize {
        nodes.iter().fold(initial_count, |result, node| {
            // 4 f32 values for: source, rotation, mem_seg_length, children_count
            // + mem_seg.len() f32 values for the polygon data
            let node_count = 4 + node.mem_seg.len();
            let new_result = result + node_count;
            Self::calculate_total_f32_count(&node.children, new_result)
        })
    }

    /// Generate NFP cache key from two polygon nodes
    pub fn generate_nfp_cache_key(
        rotation_split: u32,
        inside: bool,
        polygon1: &PolygonNode,
        polygon2: &PolygonNode,
    ) -> u32 {
        use crate::utils::bit_ops::set_bits;

        let rotation_index1 = Self::to_rotation_index(polygon1.rotation, rotation_split);
        let rotation_index2 = Self::to_rotation_index(polygon2.rotation, rotation_split);

        let data = [
            (polygon1.source + 1) as u16,
            (polygon2.source + 1) as u16,
            rotation_index1 as u16,
            rotation_index2 as u16,
            if inside { 1u16 } else { 0u16 },
        ];

        const NFP_KEY_INDICES: [u8; 6] = [0, 10, 19, 23, 27, 32];
        let mut result: u32 = 0;

        for i in 0..data.len() {
            let bit_count = NFP_KEY_INDICES[i + 1] - NFP_KEY_INDICES[i];
            result = set_bits(result, data[i], NFP_KEY_INDICES[i], bit_count);
        }

        result
    }

    pub fn to_rotation_index(rotation: f32, rotation_split: u32) -> u32 {
        const ROTATION_STEP: f32 = 360.0;
        let split = rotation_split as f32;
        let step = ROTATION_STEP / split;
        let index = (rotation / step).round() as i32;
        ((index % rotation_split as i32 + rotation_split as i32) % rotation_split as i32) as u32
    }

    /// Rotate multiple polygon nodes
    ///
    /// Clones the nodes and applies rotation to each node and its children
    pub fn rotate_nodes(nodes: &[PolygonNode]) -> Vec<PolygonNode> {
        let mut result = Self::clone_nodes(nodes);

        for node in result.iter_mut() {
            let rotation = node.rotation;
            Self::rotate_node(node, rotation);
        }

        result
    }

    /// Rotate a single polygon node and all its children
    fn rotate_node(root_node: &mut PolygonNode, rotation: f32) {
        use crate::utils::number::Number;

        // Rotate the polygon's memory segment
        let mut mem_seg = root_node.mem_seg.to_vec();
        f32::rotate_polygon(&mut mem_seg, rotation);
        root_node.mem_seg = mem_seg.into_boxed_slice();

        // Recursively rotate children
        for child in root_node.children.iter_mut() {
            Self::rotate_node(child, rotation);
        }
    }

    /// Deep clone a slice of polygon nodes
    fn clone_nodes(nodes: &[PolygonNode]) -> Vec<PolygonNode> {
        nodes
            .iter()
            .map(|node| PolygonNode {
                source: node.source,
                rotation: node.rotation,
                seg_size: node.seg_size,
                mem_seg: node.mem_seg.clone(),
                children: Self::clone_nodes(&node.children),
            })
            .collect()
    }
}
