use crate::point::Point;
use crate::polygon::Polygon;
use crate::protocol::{parse_config, Config};
use crate::binary::{frame, parse_frame, Reader, Writer};

pub(crate) const COMPACT_STATE_COMMAND: u8 = 0x84;

#[derive(Clone, Debug)]
pub(crate) struct Individual {
    pub(crate) placement: Vec<usize>,
    pub(crate) rotation: Vec<f64>,
    pub(crate) fitness: Option<f64>,
}

#[derive(Clone)]
pub(crate) struct GeneticAlgorithm {
    polygons: Vec<Polygon>,
    bin_width: f64,
    bin_height: f64,
    rotations: u32,
    mutation_rate: f64,
    rng: Rng,
    pub(crate) population: Vec<Individual>,
}

#[derive(Clone)]
struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn unit(&mut self) -> f64 {
        (self.next() >> 11) as f64 / (1_u64 << 53) as f64
    }
    fn index(&mut self, bound: usize) -> usize {
        (self.unit() * bound as f64) as usize
    }
}

fn initial_seed(config: Config, bin: &Polygon, polygons: &[Polygon]) -> u64 {
    let mut seed = (config.rotations as u64)
        | ((config.population_size as u64) << 8)
        | ((config.mutation_rate as u64) << 16)
        | ((config.curve_tolerance.to_bits()) << 32);
    for polygon in std::iter::once(bin).chain(polygons.iter()) {
        for point in &polygon.points {
            seed ^= point.x.to_bits().wrapping_mul(0x9e37_79b9_7f4a_7c15);
            seed = seed.rotate_left(17) ^ point.y.to_bits();
        }
    }
    seed.max(1)
}

/// Stable transport form for GA state. JavaScript treats this as opaque data,
/// allowing any worker to evaluate the next deterministic step.
pub(crate) fn serialize_state(seed: u64, population: &[Individual]) -> Vec<f64> {
    // Float64 can represent each u32 exactly, unlike an arbitrary u64 RNG state.
    let mut result = vec![
        (seed >> 32) as u32 as f64,
        seed as u32 as f64,
        population.len() as f64,
    ];
    for individual in population {
        result.push(individual.placement.len() as f64);
        result.push(individual.fitness.unwrap_or(f64::NAN));
        for index in &individual.placement {
            result.push(*index as f64);
        }
        result.extend(&individual.rotation);
    }
    result
}

pub(crate) fn deserialize_state(data: &[f64]) -> Option<(u64, Vec<Individual>)> {
    let mut index = 0;
    let high = *data.get(index)?;
    index += 1;
    let low = *data.get(index)?;
    index += 1;
    if !high.is_finite()
        || !low.is_finite()
        || high.fract() != 0.0
        || low.fract() != 0.0
        || !(0.0..=u32::MAX as f64).contains(&high)
        || !(0.0..=u32::MAX as f64).contains(&low)
    {
        return None;
    }
    let seed = ((high as u64) << 32) | low as u64;
    let count = *data.get(index)? as usize;
    index += 1;
    let mut population = Vec::with_capacity(count);
    for _ in 0..count {
        let length = *data.get(index)? as usize;
        index += 1;
        let fitness = *data.get(index)?;
        index += 1;
        let placement = data
            .get(index..index + length)?
            .iter()
            .map(|value| *value as usize)
            .collect();
        index += length;
        let rotation = data.get(index..index + length)?.to_vec();
        index += length;
        population.push(Individual {
            placement,
            rotation,
            fitness: (!fitness.is_nan()).then_some(fitness),
        });
    }
    (index == data.len()).then_some((seed, population))
}

/// Compact retained GA state. The algorithm still expands this to f64 at its
/// boundary, while JavaScript keeps only this framed byte representation.
pub(crate) fn compact_state(data: &[f64], rotations: u8) -> Option<Vec<u8>> {
    (rotations > 0).then_some(())?;
    let (seed, population) = deserialize_state(data)?;
    let mut writer = Writer::new();
    writer.u64(seed);
    writer.u8(rotations);
    writer.u32(u32::try_from(population.len()).ok()?);
    for individual in population {
        let length = u32::try_from(individual.placement.len()).ok()?;
        (individual.rotation.len() == individual.placement.len()).then_some(())?;
        writer.u32(length);
        match individual.fitness {
            Some(fitness) if fitness.is_finite() => { writer.u8(1); writer.f64(fitness); }
            None => writer.u8(0),
            _ => return None,
        }
        for placement in individual.placement { writer.u32(u32::try_from(placement).ok()?); }
        for rotation in individual.rotation {
            (rotation.is_finite()).then_some(())?;
            let index = (rotation / (360.0 / rotations as f64)).round();
            (index.is_finite() && (0.0..rotations as f64).contains(&index)).then_some(())?;
            writer.u8(index as u8);
        }
    }
    frame(COMPACT_STATE_COMMAND, 0, &writer.finish())
}

pub(crate) fn expand_compact_state(data: &[u8]) -> Option<Vec<f64>> {
    let (command, flags, payload) = parse_frame(data)?;
    if command != COMPACT_STATE_COMMAND || flags != 0 { return None; }
    let mut reader = Reader::new(payload);
    let seed = reader.u64()?;
    let rotations = reader.u8()?;
    if rotations == 0 { return None; }
    let count = reader.u32()?;
    let mut population = Vec::with_capacity(count as usize);
    for _ in 0..count {
        let length = reader.u32()? as usize;
        let fitness = match reader.u8()? { 0 => None, 1 => Some(reader.f64()?), _ => return None };
        let mut placement = Vec::with_capacity(length);
        for _ in 0..length { placement.push(reader.u32()? as usize); }
        let mut rotation = Vec::with_capacity(length);
        for _ in 0..length {
            let index = reader.u8()?;
            if index >= rotations { return None; }
            rotation.push(index as f64 * (360.0 / rotations as f64));
        }
        population.push(Individual { placement, rotation, fitness });
    }
    (reader.remaining() == 0).then(|| serialize_state(seed, &population))
}

impl GeneticAlgorithm {
    pub(crate) fn new(
        polygons: Vec<Polygon>,
        bin: &Polygon,
        population_size: usize,
        mutation_rate: f64,
        rotations: u32,
        seed: u64,
    ) -> Option<Self> {
        let (min, max) = bin.bounds()?;
        let mut ga = Self {
            polygons,
            bin_width: max.x - min.x,
            bin_height: max.y - min.y,
            rotations: rotations.max(1),
            mutation_rate,
            rng: Rng(seed.max(1)),
            population: Vec::new(),
        };
        let placement: Vec<usize> = (0..ga.polygons.len()).collect();
        let rotation = placement
            .iter()
            .map(|part| ga.random_angle(*part))
            .collect();
        ga.population.push(Individual {
            placement,
            rotation,
            fitness: None,
        });
        while ga.population.len() < population_size.max(1) {
            let first = ga.population[0].clone();
            let mutated = ga.mutate(first);
            ga.population.push(mutated);
        }
        Some(ga)
    }
    fn random_angle(&mut self, part: usize) -> f64 {
        let step = 360.0 / self.rotations as f64;
        let mut angles: Vec<f64> = (0..self.rotations)
            .map(|index| index as f64 * step)
            .collect();
        for index in (1..angles.len()).rev() {
            let swap = self.rng.index(index + 1);
            angles.swap(index, swap);
        }
        angles
            .into_iter()
            .find(|angle| {
                self.polygons[part]
                    .rotate(*angle)
                    .bounds()
                    .is_some_and(|(min, max)| {
                        max.x - min.x < self.bin_width && max.y - min.y < self.bin_height
                    })
            })
            .unwrap_or(0.0)
    }
    fn mutate(&mut self, mut individual: Individual) -> Individual {
        individual.fitness = None;
        for index in 0..individual.placement.len() {
            if self.rng.unit() < self.mutation_rate * 0.01 && index + 1 < individual.placement.len()
            {
                individual.placement.swap(index, index + 1);
                individual.rotation.swap(index, index + 1);
            }
            if self.rng.unit() < self.mutation_rate * 0.01 {
                individual.rotation[index] = self.random_angle(individual.placement[index]);
            }
        }
        individual
    }

    fn mate(&mut self, male: &Individual, female: &Individual) -> (Individual, Individual) {
        let length = male.placement.len();
        let cutpoint =
            (self.rng.unit().clamp(0.1, 0.9) * length.saturating_sub(1) as f64).round() as usize;
        let mut first = Individual {
            placement: male.placement[..cutpoint].to_vec(),
            rotation: male.rotation[..cutpoint].to_vec(),
            fitness: None,
        };
        let mut second = Individual {
            placement: female.placement[..cutpoint].to_vec(),
            rotation: female.rotation[..cutpoint].to_vec(),
            fitness: None,
        };
        for (part, rotation) in female.placement.iter().zip(&female.rotation) {
            if !first.placement.contains(part) {
                first.placement.push(*part);
                first.rotation.push(*rotation);
            }
        }
        for (part, rotation) in male.placement.iter().zip(&male.rotation) {
            if !second.placement.contains(part) {
                second.placement.push(*part);
                second.rotation.push(*rotation);
            }
        }
        (first, second)
    }

    fn weighted_index(&mut self, exclude: Option<usize>) -> usize {
        let candidates: Vec<usize> = (0..self.population.len())
            .filter(|index| Some(*index) != exclude)
            .collect();
        let random = self.rng.unit();
        let weight = 1.0 / candidates.len() as f64;
        let mut lower = 0.0;
        let mut upper = weight;
        for (index, candidate) in candidates.iter().enumerate() {
            if random > lower && random < upper {
                return *candidate;
            }
            lower = upper;
            upper += 2.0 * weight * (candidates.len() - index) as f64 / candidates.len() as f64;
        }
        candidates[0]
    }

    fn generation(&mut self) -> Option<()> {
        self.population
            .sort_by(|a, b| a.fitness.unwrap().total_cmp(&b.fitness.unwrap()));
        let mut next = vec![self.population.first()?.clone()];
        while next.len() < self.population.len() {
            let male = self.weighted_index(None);
            let female = self.weighted_index(Some(male));
            let (first, second) = self.mate(
                &self.population[male].clone(),
                &self.population[female].clone(),
            );
            next.push(self.mutate(first));
            if next.len() < self.population.len() {
                next.push(self.mutate(second));
            }
        }
        self.population = next;
        Some(())
    }
}

pub(crate) fn generate(data: Vec<f64>) -> Vec<f64> {
    // init:    [0, 0, packedConfig, bin, partCount, part...]
    // advance: [0, 1, stateLength, state..., fitnessCount, fitness..., packedConfig, bin, partCount, part...]
    let Some(command) = data.get(1).copied() else {
        return vec![0.0];
    };
    let mut index = 2;
    let read = |index: &mut usize| {
        let value = *data.get(*index)?;
        *index += 1;
        value.is_finite().then_some(value)
    };
    let (serialized_seed, mut population) = if command == 0.0 {
        (0, None)
    } else if command == 1.0 {
        let Some(length) = read(&mut index) else {
            return vec![0.0];
        };
        let length = length as usize;
        let Some(state) = data.get(index..index + length) else {
            return vec![0.0];
        };
        index += length;
        let Some((seed, population)) = deserialize_state(state) else {
            return vec![0.0];
        };
        let Some(fitness_count) = read(&mut index) else {
            return vec![0.0];
        };
        if fitness_count as usize != population.len() {
            return vec![0.0];
        }
        let mut population = population;
        for individual in &mut population {
            let Some(fitness) = data.get(index).copied() else {
                return vec![0.0];
            };
            index += 1;
            if fitness.is_infinite() {
                return vec![0.0];
            }
            individual.fitness = fitness.is_finite().then_some(fitness);
        }
        (seed, Some(population))
    } else {
        return vec![0.0];
    };
    let Ok(config) = parse_config(&data, &mut index) else {
        return vec![0.0];
    };
    let polygon = |index: &mut usize| -> Option<Polygon> {
        let count = read(index)? as usize;
        let mut points = Vec::with_capacity(count);
        for _ in 0..count {
            points.push(Point {
                x: read(index)?,
                y: read(index)?,
            });
        }
        Some(Polygon {
            points,
            children: vec![],
        })
    };
    let Some(bin) = polygon(&mut index) else {
        return vec![0.0];
    };
    let Some(count) = read(&mut index) else {
        return vec![0.0];
    };
    let mut polygons = Vec::new();
    for _ in 0..count as usize {
        let Some(part) = polygon(&mut index) else {
            return vec![0.0];
        };
        polygons.push(part);
    }
    let part_count = polygons.len();
    if index != data.len() {
        return vec![0.0];
    }
    let seed = population.as_ref().map_or_else(
        || initial_seed(config, &bin, &polygons),
        |_| serialized_seed,
    );
    let size = population.as_ref().map_or(config.population_size, Vec::len);
    let Some(ga) = GeneticAlgorithm::new(
        polygons,
        &bin,
        size,
        config.mutation_rate,
        config.rotations,
        seed,
    ) else {
        return vec![0.0];
    };
    let mut ga = ga;
    if let Some(population) = population.take() {
        if population.iter().any(|individual| {
            individual.placement.len() != part_count
                || individual.rotation.len() != part_count
                || individual.placement.iter().any(|part| *part >= part_count)
                || {
                    let mut sorted = individual.placement.clone();
                    sorted.sort_unstable();
                    sorted.windows(2).any(|pair| pair[0] == pair[1])
                }
                || individual
                    .rotation
                    .iter()
                    .any(|rotation| !rotation.is_finite())
                || individual.fitness.is_none()
        }) {
            return vec![0.0];
        }
        ga.population = population;
        if ga.generation().is_none() {
            return vec![0.0];
        }
    }
    let mut result = vec![1.0];
    result.extend(serialize_state(ga.rng.0, &ga.population));
    result
}

/// Selects the first unevaluated genome from opaque GA state.
/// [0, 3, stateLength, state..., fitnessCount, fitness...]
pub(crate) fn select(data: Vec<f64>) -> Vec<f64> {
    if data.get(1) != Some(&3.0) {
        return vec![0.0];
    }
    let mut index = 2;
    let Some(length) = data
        .get(index)
        .copied()
        .filter(|value| value.is_finite() && *value >= 0.0 && value.fract() == 0.0)
    else {
        return vec![0.0];
    };
    index += 1;
    let length = length as usize;
    let Some(state) = data.get(index..index + length) else {
        return vec![0.0];
    };
    index += length;
    let Some((_seed, mut population)) = deserialize_state(state) else {
        return vec![0.0];
    };
    let Some(fitness_count) = data.get(index).copied() else {
        return vec![0.0];
    };
    index += 1;
    if !fitness_count.is_finite()
        || fitness_count.fract() != 0.0
        || fitness_count as usize != population.len()
        || index + population.len() > data.len()
    {
        return vec![0.0];
    }
    for individual in &mut population {
        let fitness = data[index];
        index += 1;
        if fitness.is_infinite() {
            return vec![0.0];
        }
        individual.fitness = fitness.is_finite().then_some(fitness);
    }
    let Some((candidate_index, candidate)) = population
        .iter()
        .enumerate()
        .find(|(_, individual)| individual.fitness.is_none())
    else {
        // Reuse the geometry appended to this request to advance immediately,
        // rather than making JavaScript issue a separate GA command.
        let mut advance = vec![0.0, 1.0, length as f64];
        advance.extend_from_slice(state);
        advance.push(population.len() as f64);
        advance.extend(
            population
                .iter()
                .map(|individual| individual.fitness.unwrap()),
        );
        advance.extend_from_slice(&data[index..]);
        let advanced = generate(advance);
        let Some((next_seed, next_population)) = advanced.get(1..).and_then(deserialize_state)
        else {
            return vec![0.0];
        };
        let Some((next_index, next_candidate)) = next_population
            .iter()
            .enumerate()
            .find(|(_, individual)| individual.fitness.is_none())
        else {
            return vec![0.0];
        };
        let next_state = serialize_state(next_seed, &next_population);
        let mut result = vec![1.0, -2.0, next_state.len() as f64];
        result.extend(next_state);
        result.extend([next_index as f64, next_candidate.placement.len() as f64]);
        result.extend(next_candidate.placement.iter().map(|value| *value as f64));
        result.extend(&next_candidate.rotation);
        return result;
    };
    let mut result = vec![
        1.0,
        candidate_index as f64,
        candidate.placement.len() as f64,
    ];
    result.extend(candidate.placement.iter().map(|value| *value as f64));
    result.extend(&candidate.rotation);
    result
}

#[cfg(test)]
mod tests {
    use super::GeneticAlgorithm;
    use crate::{point::Point, polygon::Polygon};
    fn square(size: f64) -> Polygon {
        Polygon {
            points: vec![
                Point { x: 0.0, y: 0.0 },
                Point { x: size, y: 0.0 },
                Point { x: size, y: size },
                Point { x: 0.0, y: size },
            ],
            children: vec![],
        }
    }
    #[test]
    fn seeded_population_is_reproducible() {
        let first = GeneticAlgorithm::new(
            vec![square(2.0), square(3.0)],
            &square(10.0),
            4,
            10.0,
            4,
            123,
        )
        .unwrap();
        let second = GeneticAlgorithm::new(
            vec![square(2.0), square(3.0)],
            &square(10.0),
            4,
            10.0,
            4,
            123,
        )
        .unwrap();
        assert_eq!(
            first
                .population
                .iter()
                .map(|p| &p.rotation)
                .collect::<Vec<_>>(),
            second
                .population
                .iter()
                .map(|p| &p.rotation)
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn population_state_round_trips() {
        let ga = GeneticAlgorithm::new(vec![square(2.0)], &square(10.0), 2, 10.0, 4, 123).unwrap();
        let state = super::serialize_state(123, &ga.population);
        let (seed, population) = super::deserialize_state(&state).unwrap();
        assert_eq!(seed, 123);
        assert_eq!(population.len(), ga.population.len());
        assert_eq!(population[0].rotation, ga.population[0].rotation);
    }

    #[test]
    fn compact_population_state_round_trips_with_f32_rotation_precision() {
        let ga = GeneticAlgorithm::new(vec![square(2.0)], &square(10.0), 2, 10.0, 7, 123).unwrap();
        let state = super::serialize_state(123, &ga.population);
        let compact = super::compact_state(&state, 7).unwrap();
        let expanded = super::expand_compact_state(&compact).unwrap();
        let (seed, population) = super::deserialize_state(&expanded).unwrap();
        assert_eq!(seed, 123);
        assert_eq!(population.len(), ga.population.len());
        assert_eq!(population[0].rotation, ga.population[0].rotation);
    }

    #[test]
    fn advancing_a_serialized_population_is_deterministic_and_keeps_the_elite() {
        let init = vec![
            0.0,
            0.0,
            168_312_862.0,
            4.0,
            0.0,
            0.0,
            10.0,
            0.0,
            10.0,
            10.0,
            0.0,
            10.0,
            2.0,
            4.0,
            0.0,
            0.0,
            2.0,
            0.0,
            2.0,
            2.0,
            0.0,
            2.0,
            4.0,
            0.0,
            0.0,
            3.0,
            0.0,
            3.0,
            3.0,
            0.0,
            3.0,
        ];
        let initialized = super::generate(init.clone());
        let (seed, mut population) = super::deserialize_state(&initialized[1..]).unwrap();
        for (index, individual) in population.iter_mut().enumerate() {
            individual.fitness = Some((index + 1) as f64);
        }
        let state = super::serialize_state(seed, &population);
        let mut advance = vec![0.0, 1.0, state.len() as f64];
        advance.extend(state);
        advance.extend([4.0, 1.0, 2.0, 3.0, 4.0]);
        advance.extend_from_slice(&init[2..]);

        let first = super::generate(advance.clone());
        let second = super::generate(advance);
        assert_eq!(
            first
                .iter()
                .map(|value| value.to_bits())
                .collect::<Vec<_>>(),
            second
                .iter()
                .map(|value| value.to_bits())
                .collect::<Vec<_>>()
        );
        let (_, next) = super::deserialize_state(&first[1..]).unwrap();
        assert_eq!(next.len(), 4);
        assert_eq!(next[0].fitness, Some(1.0));
        assert!(next[1..]
            .iter()
            .all(|individual| individual.fitness.is_none()));
    }
}
