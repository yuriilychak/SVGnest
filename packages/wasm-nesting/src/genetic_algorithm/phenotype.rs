use rand::Rng;

#[derive(Debug, Clone)]
pub struct Phenotype {
    source: u16,
    placement: Vec<i32>,
    rotation: Vec<u16>,
    fitness: f32,
}

impl Phenotype {
    pub fn new(source: u16, placement: Vec<i32>, rotation: Vec<u16>) -> Self {
        Phenotype {
            source,
            placement,
            rotation,
            fitness: 0.0,
        }
    }

    pub fn cut(&self, source: u16, cut_point: usize) -> Self {
        Phenotype {
            source,
            placement: self.placement[0..cut_point].to_vec(),
            rotation: self.rotation[0..cut_point].to_vec(),
            fitness: 0.0,
        }
    }

    pub fn clone_with_source(&self, source: u16) -> Self {
        Phenotype {
            source,
            placement: self.placement.clone(),
            rotation: self.rotation.clone(),
            fitness: 0.0,
        }
    }

    pub fn contains(&self, source: i32) -> bool {
        self.placement.iter().any(|&p| p == source)
    }

    pub fn mate(&mut self, phenotype: &Phenotype) {
        for i in 0..phenotype.size() {
            let placement = phenotype.placement[i];
            let rotation = phenotype.rotation[i];

            if !self.contains(placement) {
                self.placement.push(placement);
                self.rotation.push(rotation);
            }
        }
    }

    pub fn swap(&mut self, index: usize) -> bool {
        let next_index = index + 1;

        if next_index >= self.size() {
            return false;
        }

        // Swap current part with next part
        self.placement.swap(index, next_index);

        true
    }

    pub fn placement(&self) -> &[i32] {
        &self.placement
    }

    pub fn rotation(&self) -> &[u16] {
        &self.rotation
    }

    pub fn rotation_mut(&mut self) -> &mut [u16] {
        &mut self.rotation
    }

    pub fn cut_point(&self) -> usize {
        let mut rng = rand::thread_rng();
        let random_value: f32 = rng.gen();
        let clamped = random_value.max(0.1).min(0.9);
        (clamped * (self.placement.len() - 1) as f32).round() as usize
    }

    pub fn size(&self) -> usize {
        self.placement.len()
    }

    pub fn fitness(&self) -> f32 {
        self.fitness
    }

    pub fn set_fitness(&mut self, value: f32) {
        self.fitness = value;
    }

    pub fn source(&self) -> u16 {
        self.source
    }
}
