use crate::constants::NFP_KEY_INDICES;
use crate::nesting::constants::NFP_INFO_START_INDEX;
use crate::nesting::nest_content::NestContent;
use crate::nesting::polygon_node::PolygonNode;
use crate::utils::bit_ops::{get_bits, join_u16};

#[derive(Debug)]
pub struct PairContent {
    nest_content: NestContent,
    key: u32,
    is_inside: bool,
}

impl PairContent {
    pub fn new() -> PairContent {
        PairContent {
            nest_content: NestContent::new(),
            key: 0,
            is_inside: false,
        }
    }

    pub fn init(&mut self, buffer: &[f32]) {
        self.key = buffer[2].to_bits().swap_bytes();
        self.is_inside = get_bits(self.key, NFP_KEY_INDICES[4], 1) != 0;

        self.nest_content.init(buffer, 3);
    }

    pub fn key(&self) -> u32 {
        self.key
    }

    pub fn is_inside(&self) -> bool {
        self.is_inside
    }

    pub fn use_holes(&self) -> bool {
        self.nest_content.use_holes()
    }

    pub fn first_node(&self) -> &PolygonNode {
        self.nest_content.node_at(0)
    }

    pub fn second_node(&self) -> &PolygonNode {
        self.nest_content.node_at(1)
    }

    pub fn serialize_result(&self, mut nfp_arrays: Vec<Vec<f32>>) -> Vec<f32> {
        let n = nfp_arrays.len();

        let mut result = Vec::new();

        result.push(f32::from_bits(self.key));
        result.push(f32::from_bits(n as u32));

        let mut offset = NFP_INFO_START_INDEX as u16 + n as u16;
        for arr in &nfp_arrays {
            let len = arr.len() as u16;
            let packed = join_u16(len, offset);
            result.push(f32::from_bits(packed));
            offset += len;
        }

        for mut nfp in nfp_arrays.iter_mut() {
            result.append(&mut nfp);
        }

        result
    }
}
