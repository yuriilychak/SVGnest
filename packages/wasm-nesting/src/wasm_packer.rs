use crate::{
    genetic_algorithm::GeneticAlgorithm,
    geometry::bound_rect::BoundRect,
    nest_config::NestConfig,
    nesting::{nfp_store::NFPStore, polygon_node::PolygonNode},
    utils::{bit_ops::get_u16, number::Number},
};

pub struct WasmPacker {
    bin_node: Option<PolygonNode>,
    bin_area: f32,
    bin_bounds: Option<BoundRect<f32>>,
    result_bounds: Option<BoundRect<f32>>,
    best: Option<Vec<f32>>,
    nfp_store: NFPStore,
    nodes: Vec<PolygonNode>,
    config: NestConfig,
}

impl WasmPacker {
    pub fn new() -> Self {
        WasmPacker {
            bin_node: None,
            bin_area: 0.0,
            bin_bounds: None,
            result_bounds: None,
            best: None,
            nfp_store: NFPStore::new(),
            nodes: Vec::new(),
            config: NestConfig::new(),
        }
    }

    pub fn init(&mut self, configuration: u32, polygon_data: &[f32], sizes: &[u16]) {
        let mut offset = 0;
        let mut polygons: Vec<&[f32]> = Vec::new();

        for &size in sizes {
            let size_usize = size as usize;
            polygons.push(&polygon_data[offset..offset + size_usize]);
            offset += size_usize;
        }

        // Last polygon is the bin
        let bin_polygon = polygons.pop().unwrap();

        // Deserialize config
        self.config.deserialize(configuration);

        // Generate bounds for bin
        let bin_data = Self::generate_bounds_internal(
            bin_polygon,
            self.config.spacing as i32,
            self.config.curve_tolerance,
        );

        self.bin_node = Some(bin_data.bin_node);
        self.bin_bounds = Some(bin_data.bounds);
        self.result_bounds = Some(bin_data.result_bounds);
        self.bin_area = bin_data.area;

        // Generate tree for other polygons
        self.nodes = Self::generate_tree_internal(
            &polygons,
            self.config.spacing as i32,
            self.config.curve_tolerance,
        );

        // Initialize genetic algorithm
        GeneticAlgorithm::with_instance(|ga| {
            ga.init(
                &self.nodes,
                self.result_bounds.as_ref().unwrap(),
                &self.config,
            );
        });
    }

    pub fn get_pairs(&mut self) -> Vec<u8> {
        let individual = GeneticAlgorithm::with_instance(|ga| ga.get_individual(&self.nodes))
            .expect("Failed to get individual");

        self.nfp_store.init(
            &self.nodes,
            self.bin_node.as_ref().unwrap(),
            &self.config,
            individual.source(),
            individual.placement(),
            individual.rotation(),
        );

        let pairs = self.nfp_store.nfp_pairs();

        // Serialize pairs: count (u32) + [size (u32) + data] for each pair
        let mut total_size = 4; // count
        for pair in pairs {
            total_size += 4 + pair.len(); // size + data
        }

        let mut buffer = vec![0u8; total_size];
        let mut offset = 0;

        // Write count
        buffer[offset..offset + 4].copy_from_slice(&(pairs.len() as u32).to_le_bytes());
        offset += 4;

        // Write each pair
        for pair in pairs {
            buffer[offset..offset + 4].copy_from_slice(&(pair.len() as u32).to_le_bytes());
            offset += 4;

            buffer[offset..offset + pair.len()].copy_from_slice(pair);
            offset += pair.len();
        }

        buffer
    }

    pub fn get_placement_data(&mut self, generated_nfp: Vec<Vec<u8>>) -> Vec<u8> {
        self.nfp_store.update(generated_nfp);
        self.nfp_store
            .get_placement_data(&self.nodes, self.bin_area)
    }

    pub fn get_placement_result(&mut self, placements: Vec<Vec<u8>>) -> Vec<u8> {
        if placements.is_empty() {
            return Vec::new();
        }

        // Convert first placement to f32 slice
        let mut placements_data = Self::bytes_to_f32_vec(&placements[0]);

        GeneticAlgorithm::with_instance(|ga| {
            ga.update_fitness(self.nfp_store.phenotype_source(), placements_data[0]);
        });

        // Find best placement
        for i in 1..placements.len() {
            let current_placement = Self::bytes_to_f32_vec(&placements[i]);
            if current_placement[0] < placements_data[0] {
                placements_data = current_placement;
            }
        }

        let mut num_parts: u16 = 0;
        let mut num_placed_parts: u16 = 0;
        let mut place_percentage: f32 = 0.0;
        let mut has_result = false;

        if self.best.is_none() || placements_data[0] < self.best.as_ref().unwrap()[0] {
            self.best = Some(placements_data.clone());

            let bin_area = self.bin_area.abs();
            let placement_count = placements_data[1] as usize;
            let mut placed_count: u16 = 0;
            let mut placed_area: f32 = 0.0;
            let mut total_area: f32 = 0.0;

            for i in 0..placement_count {
                total_area += bin_area;
                let item_data = Self::read_uint32_from_f32(&placements_data, 2 + i);
                let offset = get_u16(item_data, 1) as usize;
                let size = get_u16(item_data, 0);
                placed_count += size;

                for j in 0..size as usize {
                    let path_data = Self::read_uint32_from_f32(&placements_data, offset + j);
                    let path_id = get_u16(path_data, 1) as usize;
                    placed_area += f32::abs_polygon_area(&self.nodes[path_id].mem_seg) as f32;
                }
            }

            num_parts = self.nfp_store.placement_count() as u16;
            num_placed_parts = placed_count;
            place_percentage = placed_area / total_area;
            has_result = true;
        }

        // Serialize result
        Self::serialize_placement_result(
            place_percentage,
            num_placed_parts,
            num_parts,
            self.config.rotations,
            has_result,
            self.bin_bounds.as_ref().unwrap(),
            if has_result {
                Self::convert_nodes_to_source_items(&self.nodes)
            } else {
                Vec::new()
            },
            if has_result { &placements_data } else { &[] },
        )
    }

    pub fn stop(&mut self) {
        self.nodes.clear();
        self.best = None;
        self.bin_node = None;
        GeneticAlgorithm::with_instance(|ga| {
            ga.clean();
        });
        self.nfp_store.clean();
    }

    pub fn pair_count(&self) -> usize {
        self.nfp_store.nfp_pairs().len()
    }

    // Helper functions

    fn bytes_to_f32_vec(bytes: &[u8]) -> Vec<f32> {
        let len = bytes.len() / 4;
        let mut result = vec![0f32; len];
        unsafe {
            std::ptr::copy_nonoverlapping(
                bytes.as_ptr(),
                result.as_mut_ptr() as *mut u8,
                bytes.len(),
            );
        }
        result
    }

    fn read_uint32_from_f32(data: &[f32], index: usize) -> u32 {
        data[index].to_bits()
    }

    fn generate_bounds_internal(mem_seg: &[f32], spacing: i32, curve_tolerance: f32) -> BoundsData {
        use crate::clipper_wrapper;

        let result = clipper_wrapper::generate_bounds(mem_seg, spacing, curve_tolerance as f64);

        match result {
            Some((bounds, result_bounds, area, node)) => BoundsData {
                bounds,
                result_bounds,
                area: area as f32,
                bin_node: node,
            },
            None => panic!("Failed to generate bounds"),
        }
    }

    fn generate_tree_internal(
        polygons: &[&[f32]],
        spacing: i32,
        curve_tolerance: f32,
    ) -> Vec<PolygonNode> {
        use crate::clipper_wrapper;

        // Flatten polygons into single array with sizes
        let mut total_length = 0;
        let mut sizes = Vec::new();

        for polygon in polygons {
            sizes.push((polygon.len() >> 1) as u16); // Point count
            total_length += polygon.len();
        }

        let mut values = vec![0f32; total_length];
        let mut offset = 0;

        for polygon in polygons {
            values[offset..offset + polygon.len()].copy_from_slice(polygon);
            offset += polygon.len();
        }

        clipper_wrapper::generate_tree(&values, &sizes, spacing, curve_tolerance as f64)
    }

    fn convert_nodes_to_source_items(nodes: &[PolygonNode]) -> Vec<SourceItem> {
        nodes
            .iter()
            .map(|node| Self::convert_node_to_source_item(node))
            .collect()
    }

    fn convert_node_to_source_item(node: &PolygonNode) -> SourceItem {
        SourceItem {
            source: node.source as u16,
            children: Self::convert_nodes_to_source_items(&node.children),
        }
    }

    fn calculate_source_items_size(items: &[SourceItem]) -> usize {
        items.iter().fold(0, |total, item| {
            // Each item: u16 (source) + u16 (children count) = 4 bytes
            let item_size = 4;
            total + item_size + Self::calculate_source_items_size(&item.children)
        })
    }

    fn serialize_source_items_internal(
        items: &[SourceItem],
        buffer: &mut [u8],
        offset: usize,
    ) -> usize {
        let mut current_offset = offset;

        for item in items {
            // Write source (u16)
            buffer[current_offset..current_offset + 2].copy_from_slice(&item.source.to_le_bytes());
            current_offset += 2;

            // Write children count (u16)
            buffer[current_offset..current_offset + 2]
                .copy_from_slice(&(item.children.len() as u16).to_le_bytes());
            current_offset += 2;

            // Recursively serialize children
            current_offset =
                Self::serialize_source_items_internal(&item.children, buffer, current_offset);
        }

        current_offset
    }

    fn serialize_source_items(items: &[SourceItem]) -> Vec<u8> {
        let items_size = Self::calculate_source_items_size(items);
        let total_size = 2 + items_size; // u16 count + items data

        let mut buffer = vec![0u8; total_size];

        // Write items count
        buffer[0..2].copy_from_slice(&(items.len() as u16).to_le_bytes());

        // Serialize items
        Self::serialize_source_items_internal(items, &mut buffer, 2);

        buffer
    }

    fn serialize_placement_result(
        place_percentage: f32,
        num_placed_parts: u16,
        num_parts: u16,
        angle_split: u8,
        has_result: bool,
        bounds: &BoundRect<f32>,
        sources: Vec<SourceItem>,
        placements_data: &[f32],
    ) -> Vec<u8> {
        let serialized_sources = Self::serialize_source_items(&sources);
        let sources_size = serialized_sources.len();
        let placements_data_size = placements_data.len() * 4;

        // Header: 34 bytes
        // placePercentage (4) + numPlacedParts (2) + numParts (2) + angleSplit (1) + hasResult (1)
        // + boundsX (4) + boundsY (4) + boundsWidth (4) + boundsHeight (4)
        // + sourcesSize (4) + placementsDataSize (4)
        let header_size = 34;
        let total_size = header_size + sources_size + placements_data_size;

        let mut buffer = vec![0u8; total_size];
        let mut offset = 0;

        // Write header
        buffer[offset..offset + 4].copy_from_slice(&place_percentage.to_le_bytes());
        offset += 4;

        buffer[offset..offset + 2].copy_from_slice(&num_placed_parts.to_le_bytes());
        offset += 2;

        buffer[offset..offset + 2].copy_from_slice(&num_parts.to_le_bytes());
        offset += 2;

        buffer[offset] = angle_split;
        offset += 1;

        buffer[offset] = if has_result { 1 } else { 0 };
        offset += 1;

        unsafe {
            buffer[offset..offset + 4].copy_from_slice(&bounds.x().to_le_bytes());
            offset += 4;

            buffer[offset..offset + 4].copy_from_slice(&bounds.y().to_le_bytes());
            offset += 4;

            buffer[offset..offset + 4].copy_from_slice(&bounds.width().to_le_bytes());
            offset += 4;

            buffer[offset..offset + 4].copy_from_slice(&bounds.height().to_le_bytes());
            offset += 4;
        }

        buffer[offset..offset + 4].copy_from_slice(&(sources_size as u32).to_le_bytes());
        offset += 4;

        buffer[offset..offset + 4].copy_from_slice(&(placements_data_size as u32).to_le_bytes());
        offset += 4;

        // Write serialized sources
        buffer[offset..offset + sources_size].copy_from_slice(&serialized_sources);
        offset += sources_size;

        // Write placements data
        unsafe {
            std::ptr::copy_nonoverlapping(
                placements_data.as_ptr() as *const u8,
                buffer[offset..].as_mut_ptr(),
                placements_data_size,
            );
        }

        buffer
    }
}

struct BoundsData {
    bounds: BoundRect<f32>,
    result_bounds: BoundRect<f32>,
    area: f32,
    bin_node: PolygonNode,
}

#[derive(Debug, Clone)]
struct SourceItem {
    source: u16,
    children: Vec<SourceItem>,
}
