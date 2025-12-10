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
        let (mut nodes, _) = PolygonNode::deserialize_nodes(buffer, node_offset + 1, root_count);

        self.nest_config.deserialize(nest_data);
        self.nodes.append(&mut nodes);
    }

    /// Initialize from f32 buffer (for PlaceContent)
    /// Buffer contains only the nodes section starting with node count
    pub fn init_from_f32(&mut self, buffer: &[f32], nest_config: u32) {
        self.nest_config.deserialize(nest_config);

        if buffer.is_empty() {
            return;
        }

        // Read node count (big-endian u32, matching TypeScript DataView)
        let root_count = buffer[0].to_bits().swap_bytes() as usize;
        let (nodes, _) = PolygonNode::deserialize_nodes(buffer, 1, root_count);
        self.nodes = nodes;
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
