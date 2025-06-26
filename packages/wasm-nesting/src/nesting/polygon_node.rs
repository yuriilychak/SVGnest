#[derive(Debug)]
pub struct PolygonNode {
    pub source: u32,
    pub rotation: f32,
    pub seg_size: usize,
    pub mem_seg: Box<[f32]>,
    pub children: Vec<PolygonNode>,
}
