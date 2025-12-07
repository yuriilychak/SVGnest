#[derive(Debug)]
pub struct PolygonNode {
    pub source: i32,
    pub rotation: f32,
    pub seg_size: usize,
    pub mem_seg: Box<[f32]>,
    pub children: Vec<PolygonNode>,
}

impl PolygonNode {
    pub fn deserialize_nodes(
        buffer: &[f32],
        mut idx: usize,
        count: usize,
    ) -> (Vec<PolygonNode>, usize) {
        let mut nodes = Vec::with_capacity(count);

        for _ in 0..count {
            let raw_source = buffer[idx].to_bits().swap_bytes();
            let source = raw_source.wrapping_sub(1) as i32;
            idx += 1;

            let rotation = buffer[idx];
            idx += 1;

            let seg_size = (buffer[idx].to_bits().swap_bytes() as usize) << 1;
            idx += 1;

            let mem_seg = buffer[idx..idx + seg_size].to_vec().into_boxed_slice();
            idx += seg_size;

            let child_count = buffer[idx].to_bits().swap_bytes() as usize;
            idx += 1;

            let (children, new_idx) = Self::deserialize_nodes(buffer, idx, child_count);
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

    fn serialize_nodes_internal(nodes: &[PolygonNode], buffer: &mut [u8], offset: usize) -> usize {
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
            Self::serialize_nodes_internal(&node.children, buffer, result)
        })
    }

    pub fn serialize_nodes(nodes: &[PolygonNode], offset: usize) -> Vec<u8> {
        let initial_offset = std::mem::size_of::<u32>() + offset;
        let total_size = Self::calculate_total_size(nodes, initial_offset);
        let mut buffer = vec![0u8; total_size];

        // Write node count at offset
        let node_count = nodes.len() as u32;
        let count_bytes = node_count.to_le_bytes();
        buffer[offset..offset + 4].copy_from_slice(&count_bytes);

        Self::serialize_nodes_internal(nodes, &mut buffer, initial_offset);

        buffer
    }

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

    /// Serialize a vector of PolygonNodes to a byte buffer
    pub fn serialize(nodes: &[PolygonNode], offset: usize) -> Vec<u8> {
        Self::serialize_nodes(nodes, offset)
    }

    /// Deserialize PolygonNodes from a byte buffer
    pub fn deserialize(buffer: &[u8], offset: usize) -> Vec<PolygonNode> {
        if buffer.len() < offset + 4 {
            return Vec::new();
        }

        // Read node count from byte buffer (little-endian u32)
        let count_bytes = [
            buffer[offset],
            buffer[offset + 1],
            buffer[offset + 2],
            buffer[offset + 3],
        ];
        let root_count = u32::from_le_bytes(count_bytes) as usize;

        if root_count == 0 {
            return Vec::new();
        }

        // Deserialize nodes
        Self::deserialize_nodes_from_bytes(buffer, offset + 4, root_count).0
    }

    /// Deserialize nodes directly from byte buffer
    fn deserialize_nodes_from_bytes(
        buffer: &[u8],
        mut idx: usize,
        count: usize,
    ) -> (Vec<PolygonNode>, usize) {
        let mut nodes = Vec::with_capacity(count);

        for _ in 0..count {
            if idx + 12 > buffer.len() {
                break; // Not enough data
            }

            // Read source (u32, little-endian)
            let source_bytes = [
                buffer[idx],
                buffer[idx + 1],
                buffer[idx + 2],
                buffer[idx + 3],
            ];
            let source = u32::from_le_bytes(source_bytes).wrapping_sub(1) as i32;
            idx += 4;

            // Read rotation (f32, little-endian)
            let rotation_bytes = [
                buffer[idx],
                buffer[idx + 1],
                buffer[idx + 2],
                buffer[idx + 3],
            ];
            let rotation = f32::from_le_bytes(rotation_bytes);
            idx += 4;

            // Read mem_seg length (u32, little-endian) - number of points
            let seg_len_bytes = [
                buffer[idx],
                buffer[idx + 1],
                buffer[idx + 2],
                buffer[idx + 3],
            ];
            let point_count = u32::from_le_bytes(seg_len_bytes) as usize;
            let seg_size = point_count << 1; // Convert to number of floats
            idx += 4;

            // Read mem_seg data
            if idx + seg_size * 4 > buffer.len() {
                break; // Not enough data
            }

            let mut mem_seg = Vec::with_capacity(seg_size);
            for _ in 0..seg_size {
                let f32_bytes = [
                    buffer[idx],
                    buffer[idx + 1],
                    buffer[idx + 2],
                    buffer[idx + 3],
                ];
                mem_seg.push(f32::from_le_bytes(f32_bytes));
                idx += 4;
            }

            if idx + 4 > buffer.len() {
                break; // Not enough data for child count
            }

            // Read children count (u32, little-endian)
            let child_count_bytes = [
                buffer[idx],
                buffer[idx + 1],
                buffer[idx + 2],
                buffer[idx + 3],
            ];
            let child_count = u32::from_le_bytes(child_count_bytes) as usize;
            idx += 4;

            // Recursively deserialize children
            let (children, new_idx) = Self::deserialize_nodes_from_bytes(buffer, idx, child_count);
            idx = new_idx;

            nodes.push(PolygonNode {
                source,
                seg_size,
                rotation,
                mem_seg: mem_seg.into_boxed_slice(),
                children,
            });
        }

        (nodes, idx)
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

    fn to_rotation_index(rotation: f32, rotation_split: u32) -> u32 {
        const ROTATION_STEP: f32 = 360.0;
        let split = rotation_split as f32;
        let step = ROTATION_STEP / split;
        let index = (rotation / step).round() as i32;
        ((index % rotation_split as i32 + rotation_split as i32) % rotation_split as i32) as u32
    }
}
