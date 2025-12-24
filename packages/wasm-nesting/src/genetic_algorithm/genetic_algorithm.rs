use super::phenotype::Phenotype;
use crate::{
    geometry::bound_rect::BoundRect, nest_config::NestConfig, nesting::polygon_node::PolygonNode,
    utils::number::Number,
};
use rand::Rng;

pub struct GeneticAlgorithm {
    bin_width: f32,
    bin_height: f32,
    population: Vec<Phenotype>,
    rotations: u8,
    threshold: f32,
    current_source: u16,
}

impl GeneticAlgorithm {
    pub fn new() -> Self {
        GeneticAlgorithm {
            bin_width: 0.0,
            bin_height: 0.0,
            population: Vec::new(),
            rotations: 0,
            threshold: 0.0,
            current_source: 0,
        }
    }

    pub fn init(&mut self, nodes: &[PolygonNode], bounds: &BoundRect<f32>, config: &NestConfig) {
        self.rotations = config.rotations;
        self.threshold = 0.01 * config.mutation_rate as f32;
        self.bin_width = unsafe { bounds.width() };
        self.bin_height = unsafe { bounds.height() };

        // Initiate new GA
        let mut adam: Vec<PolygonNode> = nodes.to_vec();

        // Sort by area (largest first)
        adam.sort_by(|a, b| {
            let area_a = f32::polygon_area(&a.mem_seg).abs();
            let area_b = f32::polygon_area(&b.mem_seg).abs();
            area_b
                .partial_cmp(&area_a)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        // Create initial individual
        let sources: Vec<i32> = adam.iter().map(|node| node.source).collect();
        let mut angles: Vec<u16> = Vec::with_capacity(adam.len());

        for node in &adam {
            angles.push(self.random_angle(node));
        }

        self.population
            .push(Phenotype::new(self.current_source, sources, angles));
        self.current_source += 1;

        // Create population through mutation
        let first = self.population[0].clone_with_source(self.population[0].source());
        while self.population.len() < config.population_size as usize {
            let mutant = self.mutate(&adam, &first);
            self.population.push(mutant);
        }
    }

    pub fn clean(&mut self) {
        self.rotations = 0;
        self.threshold = 0.0;
        self.bin_width = 0.0;
        self.bin_height = 0.0;
        self.population.clear();
        self.current_source = 0;
    }

    // Returns a mutated individual with the given mutation rate
    fn mutate(&mut self, nodes: &[PolygonNode], individual: &Phenotype) -> Phenotype {
        let mut clone = individual.clone_with_source(self.current_source);
        self.current_source += 1;

        let size = clone.size();

        for i in 0..size {
            if self.get_mutate() {
                clone.swap(i);
            }

            if self.get_mutate() {
                let placement_idx = clone.placement()[i] as usize;
                clone.rotation_mut()[i] = self.random_angle(&nodes[placement_idx]);
            }
        }

        clone
    }

    // Single point crossover
    fn mate(&mut self, male: &Phenotype, female: &Phenotype) -> [Phenotype; 2] {
        let cut_point = male.cut_point();
        let mut child1 = male.cut(self.current_source, cut_point);
        let mut child2 = female.cut(self.current_source + 1, cut_point);

        self.current_source += 2;

        child1.mate(female);
        child2.mate(male);

        [child1, child2]
    }

    // Returns a random individual from the population, weighted to the front of the list
    // (lower fitness value is more likely to be selected)
    fn random_weighted_individual(&self, exclude: Option<usize>) -> usize {
        let mut local_indices: Vec<usize> = (0..self.population.len()).collect();

        if let Some(exclude_idx) = exclude {
            local_indices.retain(|&idx| idx != exclude_idx);
        }

        let size = local_indices.len();
        let mut rng = rand::thread_rng();
        let rand: f32 = rng.gen();
        let weight = 2.0 / size as f32;
        let mut lower = 0.0;
        let mut upper = weight / 2.0;

        for i in 0..size {
            // If the random number falls between lower and upper bounds, select this individual
            if rand > lower && rand < upper {
                return local_indices[i];
            }

            lower = upper;
            upper = upper + weight * ((size - i) as f32 / size as f32);
        }

        local_indices[0]
    }

    // Returns a random angle of insertion
    fn random_angle(&self, node: &PolygonNode) -> u16 {
        let last_index = self.rotations as usize - 1;
        let step = 360.0 / self.rotations as f32;
        let mut angles: Vec<u16> = Vec::with_capacity(self.rotations as usize);

        for i in 0..self.rotations as usize {
            angles.push((i as f32 * step).round() as u16);
        }

        // Shuffle angles
        let mut rng = rand::thread_rng();
        for i in (1..=last_index).rev() {
            let j = rng.gen_range(0..=i);
            angles.swap(i, j);
        }

        // Try each angle and find one that fits
        for angle in &angles {
            let mut rotated = node.mem_seg.to_vec();
            f32::rotate_polygon(&mut rotated, *angle as f32);

            let size = rotated.len() >> 1;
            let bounds = f32::calculate_bounds(&rotated, 0, size);

            // Don't use obviously bad angles where the part doesn't fit in the bin
            if bounds[2] < self.bin_width && bounds[3] < self.bin_height {
                return *angle;
            }
        }

        0
    }

    pub fn get_individual(&mut self, nodes: &[PolygonNode]) -> Option<&Phenotype> {
        // Check if all members have been evaluated
        let all_evaluated = self.population.iter().all(|p| p.fitness() > 0.0);

        if !all_evaluated {
            // Find first unevaluated individual
            for i in 0..self.population.len() {
                if self.population[i].fitness() == 0.0 {
                    return Some(&self.population[i]);
                }
            }
        }

        // All individuals have been evaluated, start next generation
        // Sort by fitness (lower is better)
        self.population.sort_by(|a, b| {
            a.fitness()
                .partial_cmp(&b.fitness())
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        // Fittest individual is preserved in the new generation (elitism)
        let mut result = vec![self.population[0].clone_with_source(self.population[0].source())];

        while result.len() < self.population.len() {
            let male_idx = self.random_weighted_individual(None);
            let female_idx = self.random_weighted_individual(Some(male_idx));

            let male =
                self.population[male_idx].clone_with_source(self.population[male_idx].source());
            let female =
                self.population[female_idx].clone_with_source(self.population[female_idx].source());

            // Each mating produces two children
            let children = self.mate(&male, &female);

            // Slightly mutate children
            result.push(self.mutate(nodes, &children[0]));

            if result.len() < self.population.len() {
                result.push(self.mutate(nodes, &children[1]));
            }
        }

        self.population = result;

        if self.population.len() > 1 {
            Some(&self.population[1])
        } else {
            None
        }
    }

    pub fn update_fitness(&mut self, source: u16, fitness: f32) {
        for phenotype in &mut self.population {
            if phenotype.source() == source {
                phenotype.set_fitness(fitness);
                break;
            }
        }
    }

    fn get_mutate(&self) -> bool {
        let mut rng = rand::thread_rng();
        let random_value: f32 = rng.gen();
        random_value < self.threshold
    }
}
