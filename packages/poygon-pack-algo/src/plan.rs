use std::collections::HashSet;

use crate::{
    cache,
    protocol::{parse_config, request_type, TYPE_GA},
};

#[derive(Debug, PartialEq)]
struct Pair {
    key: u32,
    a: i64,
    b: usize,
    inside: bool,
    a_rotation: u32,
    b_rotation: u32,
}

fn integer(data: &[f64], index: &mut usize) -> Option<i64> {
    let value = *data.get(*index)?;
    *index += 1;
    (value.is_finite() && value.fract() == 0.0 && value >= 0.0).then_some(value as i64)
}

fn rotation_index(degrees: f64, rotations: u32) -> Option<u32> {
    if !degrees.is_finite() || rotations == 0 || rotations > 16 {
        return None;
    }
    Some(
        ((degrees / (360.0 / rotations as f64)).round() as i64).rem_euclid(rotations as i64) as u32,
    )
}

fn key(a: i64, b: i64, inside: bool, a_rotation: u32, b_rotation: u32) -> Option<u32> {
    if !(-1..2047).contains(&a) || !(-1..2047).contains(&b) || a_rotation > 15 || b_rotation > 15 {
        return None;
    }
    Some(
        ((a + 1) as u32)
            | (((b + 1) as u32) << 11)
            | ((inside as u32) << 22)
            | (a_rotation << 23)
            | (b_rotation << 27),
    )
}

/// Plans cache retention and missing NFP work.
/// [0, 2, rotations, pathCount, cacheKeyCount, id, rotation, ..., cacheKey...]
pub(crate) fn generate(data: Vec<f64>) -> Vec<f64> {
    if request_type(&data) != Some(TYPE_GA) || data.get(1) != Some(&2.0) {
        return vec![0.0];
    }
    let mut index = 2;
    let Ok(config) = parse_config(&data, &mut index) else {
        return vec![0.0];
    };
    let rotations = config.rotations;
    let Some(path_count) = integer(&data, &mut index).and_then(|value| usize::try_from(value).ok())
    else {
        return vec![0.0];
    };

    let mut paths = Vec::with_capacity(path_count);
    for _ in 0..path_count {
        let Some(id) = integer(&data, &mut index) else {
            return vec![0.0];
        };
        let Some(rotation) = data
            .get(index)
            .copied()
            .and_then(|value| rotation_index(value, rotations))
        else {
            return vec![0.0];
        };
        index += 1;
        paths.push((id, rotation));
    }
    let Some(cache) = cache::parse(&data[index..]) else {
        return vec![0.0];
    };
    let cached: HashSet<u32> = cache.keys().copied().collect();

    let mut retained = Vec::new();
    let mut retained_cache = cache::Cache::new();
    let mut pairs = Vec::new();
    let mut add = |pair: Pair| {
        if cached.contains(&pair.key) {
            retained.push(pair.key);
            retained_cache.insert(pair.key, cache[&pair.key].clone());
        } else {
            pairs.push(pair);
        }
    };
    for (b, (part_id, b_rotation)) in paths.iter().copied().enumerate() {
        let Some(inside_key) = key(-1, part_id, true, 0, b_rotation) else {
            return vec![0.0];
        };
        add(Pair {
            key: inside_key,
            a: -1,
            b,
            inside: true,
            a_rotation: 0,
            b_rotation,
        });
        for (a, (placed_id, a_rotation)) in paths.iter().copied().take(b).enumerate() {
            let Some(outside_key) = key(placed_id, part_id, false, a_rotation, b_rotation) else {
                return vec![0.0];
            };
            add(Pair {
                key: outside_key,
                a: a as i64,
                b,
                inside: false,
                a_rotation,
                b_rotation,
            });
        }
    }
    let retained_state = cache::serialize(&retained_cache);
    let mut result = vec![1.0, retained_state.len() as f64];
    result.extend(retained_state);
    result.push(retained.len() as f64);
    result.extend(retained.into_iter().map(f64::from));
    result.push(pairs.len() as f64);
    for pair in pairs {
        result.extend([
            pair.key as f64,
            pair.a as f64,
            pair.b as f64,
            pair.inside as u8 as f64,
            pair.a_rotation as f64,
            pair.b_rotation as f64,
        ]);
    }
    result
}

#[cfg(test)]
mod tests {
    #[test]
    fn plans_missing_pairs_and_retains_only_current_cache_keys() {
        // Two parts, with the first bin NFP already cached.
        let request = vec![
            0.0,
            2.0,
            169_099_294.0,
            2.0,
            // Header.
            0.0,
            0.0,
            // Part 0 ID and rotation.
            1.0,
            90.0,
            // Part 1 ID and rotation.
            1.0,
            1.0,
            4_196_352.0,
        ];
        let result = crate::generate(request);
        assert_eq!(result[0], 1.0);
        assert_eq!(&result[1..5], &[3.0, 1.0, 1.0, 4_196_352.0]);
        assert_eq!(result[5], 1.0);
        assert_eq!(result[6], 4_196_352.0);
        assert_eq!(result[7], 2.0); // The second bin pair and first→second pair.
    }
}
