use crate::nest_config::NestConfig;
use crate::nesting::polygon_node::PolygonNode;

#[derive(Debug)]
pub struct NestContent {
    nest_config: NestConfig,
    nodes: Vec<PolygonNode>,
}

impl NestContent {
    pub fn new() -> NestContent {
        NestContent {
            nodes: Vec::new(),
            nest_config: NestConfig::new(),
        }
    }

    pub fn init(&mut self, buffer: &[f32], node_offset: usize) {
        let nest_data = buffer[1].to_bits().swap_bytes();
        let root_count = buffer[node_offset].to_bits().swap_bytes() as usize;
        let (mut nodes, _) = Self::deserialize_nodes(buffer, node_offset + 1, root_count);

        self.nest_config.deserialize(nest_data);
        self.nodes.append(&mut nodes);
    }

    fn deserialize_nodes(
        buffer: &[f32],
        mut idx: usize,
        count: usize,
    ) -> (Vec<PolygonNode>, usize) {
        let mut nodes = Vec::with_capacity(count);

        for _ in 0..count {
            let raw_source = buffer[idx].to_bits().swap_bytes();
            let source = raw_source.wrapping_sub(1) as u32;
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

    pub fn clean(&mut self) {
        self.nodes.clear();
    }

    pub fn is_broken(&self) -> bool {
        self.nodes.is_empty()
    }

    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }

    pub fn node_at(&self, index: usize) -> &PolygonNode {
        &self.nodes[index]
    }

    pub fn remove_node(&mut self, index: usize) {
        if index < self.nodes.len() {
            self.nodes.remove(index);
        }
    }

    pub fn use_holes(&self) -> bool {
        self.nest_config.use_holes
    }
}
