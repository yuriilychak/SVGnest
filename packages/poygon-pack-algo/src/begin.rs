//! Rust-owned beginning of one nesting generation.
//!
//! JavaScript supplies only opaque buffers and fans the returned NFP jobs out
//! to workers. The continuation is intentionally not decoded outside Rust.

use crate::{
    cache, ga, placement, plan,
    polygon::Polygon,
    protocol::{
        parse_config, request_type, serialize_recursive_polygon, TYPE_GA,
    },
};

const BEGIN_COMMAND: f64 = 5.0;
const CONTINUATION_VERSION: f64 = 1.0;
const TYPE_NFP: u64 = 1;
const USE_HOLES_MASK: u64 = 0x04;
const INSIDE_MASK: u64 = 0x08;
const A_ROTATION_SHIFT: u64 = 4;
const B_ROTATION_SHIFT: u64 = 9;
const ROTATION_COUNT_SHIFT: u64 = 14;
const KEY_SHIFT: u64 = 19;

struct Context {
    bin: Polygon,
    roots: Vec<Polygon>,
}

struct Candidate {
    state: Vec<f64>,
    index: usize,
    placement: Vec<usize>,
    rotations: Vec<f64>,
}

fn parse_continuation(data: &[f64]) -> Option<Candidate> {
    if data.first().copied()? != CONTINUATION_VERSION {
        return None;
    }
    let mut index = 1;
    let state_length = integer(*data.get(index)?)?;
    index += 1;
    let state = data.get(index..index + state_length)?.to_vec();
    let (_, population) = ga::deserialize_state(&state)?;
    index += state_length;
    let cache_length = integer(*data.get(index)?)?;
    index += 1 + cache_length;
    let candidate_index = integer(*data.get(index)?)?;
    index += 1;
    let length = integer(*data.get(index)?)?;
    index += 1;
    let placement = data
        .get(index..index + length)?
        .iter()
        .map(|value| integer(*value))
        .collect::<Option<Vec<_>>>()?;
    index += length;
    let rotations = data.get(index..index + length)?.to_vec();
    index += length;
    (index == data.len()
        && candidate_index < population.len()
        && rotations.iter().all(|value| value.is_finite()))
    .then_some(Candidate {
        state,
        index: candidate_index,
        placement,
        rotations,
    })
}

fn continuation_cache(data: &[f64]) -> Option<&[f64]> {
    let state_length = integer(*data.get(1)?)?;
    let cache_start = 2 + state_length;
    let cache_length = integer(*data.get(cache_start)?)?;
    data.get(cache_start + 1..cache_start + 1 + cache_length)
}

fn integer(value: f64) -> Option<usize> {
    (value.is_finite() && value.fract() == 0.0 && value >= 0.0).then_some(value as usize)
}

fn parse_context(data: &[f64]) -> Option<Context> {
    // Prepared results retain one source-bearing UI tree. The source field is
    // intentionally skipped here; workers only need the normalized geometry.
    if data.first().copied()? != 1.0 {
        return None;
    }
    let mut index = 5;
    let bin_count = integer(*data.get(index)?)?;
    index += 1;
    let mut bin_points = Vec::with_capacity(bin_count);
    for _ in 0..bin_count {
        bin_points.push(crate::point::Point { x: *data.get(index)?, y: *data.get(index + 1)? });
        index += 2;
    }
    let root_count = integer(*data.get(index)?)?;
    index += 1;
    let mut roots = Vec::with_capacity(root_count);
    for _ in 0..root_count {
        roots.push(parse_ui_polygon(data, &mut index)?);
    }
    (index == data.len()).then_some(Context { bin: Polygon { points: bin_points, children: vec![] }, roots })
}

fn parse_ui_polygon(data: &[f64], index: &mut usize) -> Option<Polygon> {
    integer(*data.get(*index)?)?; // source
    *index += 1;
    let point_count = integer(*data.get(*index)?)?;
    let child_count = integer(*data.get(*index + 1)?)?;
    *index += 2;
    let mut points = Vec::with_capacity(point_count);
    for _ in 0..point_count {
        points.push(crate::point::Point { x: *data.get(*index)?, y: *data.get(*index + 1)? });
        *index += 2;
    }
    let mut children = Vec::with_capacity(child_count);
    for _ in 0..child_count {
        children.push(parse_ui_polygon(data, index)?);
    }
    Some(Polygon { points, children })
}

fn serialize_ga_geometry(config: f64, context: &Context) -> Vec<f64> {
    let mut values = vec![config, context.bin.points.len() as f64];
    for point in &context.bin.points {
        values.extend([point.x, point.y]);
    }
    values.push(context.roots.len() as f64);
    for root in &context.roots {
        values.push(root.points.len() as f64);
        for point in &root.points {
            values.extend([point.x, point.y]);
        }
    }
    values
}

fn select_candidate(config: f64, context: &Context, supplied_state: &[f64]) -> Option<Candidate> {
    let state = if supplied_state.is_empty() {
        let mut init = vec![0.0, 0.0];
        init.extend(serialize_ga_geometry(config, context));
        ga::generate(init).get(1..)?.to_vec()
    } else {
        ga::deserialize_state(supplied_state)?;
        supplied_state.to_vec()
    };
    let (_, population) = ga::deserialize_state(&state)?;
    let mut select = vec![0.0, 3.0, state.len() as f64];
    select.extend(&state);
    select.push(population.len() as f64);
    select.extend(
        population
            .iter()
            .map(|individual| individual.fitness.unwrap_or(f64::NAN)),
    );
    select.extend(serialize_ga_geometry(config, context));
    let selected = ga::select(select);
    if selected.first().copied()? != 1.0 {
        return None;
    }
    let mut index = 1;
    let state = if selected.get(index).copied()? == -2.0 {
        index += 1;
        let length = integer(*selected.get(index)?)?;
        index += 1;
        let state = selected.get(index..index + length)?.to_vec();
        ga::deserialize_state(&state)?;
        index += length;
        state
    } else {
        state
    };
    let candidate_index = integer(*selected.get(index)?)?;
    index += 1;
    let length = integer(*selected.get(index)?)?;
    index += 1;
    let placement = selected
        .get(index..index + length)?
        .iter()
        .map(|value| integer(*value))
        .collect::<Option<Vec<_>>>()?;
    index += length;
    let rotations = selected.get(index..index + length)?.to_vec();
    index += length;
    (index == selected.len() && rotations.iter().all(|value| value.is_finite())).then_some(
        Candidate {
            state,
            index: candidate_index,
            placement,
            rotations,
        },
    )
}

fn serialize_polygon(values: &mut Vec<f64>, polygon: &Polygon) {
    let start = values.len();
    values.extend([polygon.points.len() as f64, polygon.children.len() as f64]);
    let offsets = values.len();
    values.resize(offsets + polygon.children.len(), 0.0);
    for point in &polygon.points {
        values.extend([point.x, point.y]);
    }
    for (child_index, child) in polygon.children.iter().enumerate() {
        values[offsets + child_index] = values.len() as f64;
        serialize_polygon(values, child);
    }
    debug_assert_eq!(start + 2 + polygon.children.len(), offsets);
}

fn nfp_job(
    config: f64,
    rotations: u32,
    key: u32,
    a: i64,
    b: usize,
    inside: bool,
    a_rotation: u32,
    b_rotation: u32,
    context: &Context,
    candidate: &Candidate,
) -> Option<Vec<f64>> {
    let use_holes = (config as u32 & 0x8000_0000) != 0;
    let a_polygon = if a < 0 {
        &context.bin
    } else {
        context.roots.get(*candidate.placement.get(a as usize)?)?
    };
    let b_polygon = context.roots.get(*candidate.placement.get(b)?)?;
    let header = TYPE_NFP
        | (u64::from(use_holes) * USE_HOLES_MASK)
        | (u64::from(inside) * INSIDE_MASK)
        | ((a_rotation as u64) << A_ROTATION_SHIFT)
        | ((b_rotation as u64) << B_ROTATION_SHIFT)
        | ((rotations as u64) << ROTATION_COUNT_SHIFT)
        | ((key as u64) << KEY_SHIFT);
    let mut request = vec![header as f64];
    serialize_polygon(&mut request, a_polygon);
    serialize_polygon(&mut request, b_polygon);
    Some(request)
}

/// `[0, 5, packedConfig, preparationLength, preparation..., stateLength, state..., cache...]`.
/// Returns `[1, continuationLength, continuation..., jobCount, jobLength, job...]`.
pub(crate) fn generate(data: Vec<f64>) -> Vec<f64> {
    if request_type(&data) != Some(TYPE_GA) || data.get(1) != Some(&BEGIN_COMMAND) {
        return vec![0.0];
    }
    let mut index = 2;
    let Ok(config) = parse_config(&data, &mut index) else {
        return vec![0.0];
    };
    let packed_config = *data.get(2).unwrap_or(&f64::NAN);
    let preparation_length = data.get(index).copied().and_then(integer);
    let Some(preparation_length) = preparation_length else {
        return vec![0.0];
    };
    index += 1;
    let Some(context) = data
        .get(index..index + preparation_length)
        .and_then(parse_context)
    else {
        return vec![0.0];
    };
    index += preparation_length;
    let Some(state_length) = data.get(index).copied().and_then(integer) else {
        return vec![0.0];
    };
    index += 1;
    let Some(state) = data.get(index..index + state_length) else {
        return vec![0.0];
    };
    index += state_length;
    let Some(candidate) = select_candidate(packed_config, &context, state) else {
        return vec![0.0];
    };
    if candidate.placement.len() != context.roots.len()
        || candidate
            .placement
            .iter()
            .any(|part| *part >= context.roots.len())
    {
        return vec![0.0];
    }
    let mut plan_request = vec![0.0, 2.0, packed_config, candidate.placement.len() as f64];
    for (&part, &rotation) in candidate.placement.iter().zip(&candidate.rotations) {
        plan_request.extend([part as f64, rotation]);
    }
    plan_request.extend_from_slice(&data[index..]);
    let planned = plan::generate(plan_request);
    if planned.first().copied() != Some(1.0) {
        return vec![0.0];
    }
    let mut plan_index = 1;
    let Some(cache_length) = planned.get(plan_index).copied().and_then(integer) else {
        return vec![0.0];
    };
    plan_index += 1;
    let Some(cache_state) = planned.get(plan_index..plan_index + cache_length) else {
        return vec![0.0];
    };
    plan_index += cache_length;
    let Some(retained_count) = planned.get(plan_index).copied().and_then(integer) else {
        return vec![0.0];
    };
    plan_index += 1 + retained_count;
    let Some(pair_count) = planned.get(plan_index).copied().and_then(integer) else {
        return vec![0.0];
    };
    plan_index += 1;
    let mut jobs = Vec::with_capacity(pair_count);
    for _ in 0..pair_count {
        let pair = planned.get(plan_index..plan_index + 6);
        let Some(pair) = pair else { return vec![0.0] };
        let (Some(key), Some(a), Some(b), Some(a_rotation), Some(b_rotation)) = (
            integer(pair[0]).and_then(|value| u32::try_from(value).ok()),
            (pair[1].is_finite() && pair[1].fract() == 0.0 && pair[1] >= -1.0)
                .then_some(pair[1] as i64),
            integer(pair[2]),
            integer(pair[4]).and_then(|value| u32::try_from(value).ok()),
            integer(pair[5]).and_then(|value| u32::try_from(value).ok()),
        ) else {
            return vec![0.0];
        };
        let Some(job) = nfp_job(
            packed_config,
            config.rotations,
            key,
            a,
            b,
            pair[3] == 1.0,
            a_rotation,
            b_rotation,
            &context,
            &candidate,
        ) else {
            return vec![0.0];
        };
        jobs.push(job);
        plan_index += 6;
    }
    if plan_index != planned.len() {
        return vec![0.0];
    }
    let mut continuation = vec![CONTINUATION_VERSION, candidate.state.len() as f64];
    continuation.extend(candidate.state);
    continuation.push(cache_state.len() as f64);
    continuation.extend_from_slice(cache_state);
    continuation.extend([candidate.index as f64, candidate.placement.len() as f64]);
    continuation.extend(candidate.placement.into_iter().map(|part| part as f64));
    continuation.extend(candidate.rotations);
    let mut result = vec![1.0, continuation.len() as f64];
    result.extend(continuation);
    result.push(jobs.len() as f64);
    for job in jobs {
        result.push(job.len() as f64);
        result.extend(job);
    }
    result
}

/// `[0, 6, packedConfig, preparationLength, preparation..., continuationLength,
/// continuation..., nfpResultCount, resultLength, result..., ...]`.
///
/// Merges generated NFPs, scores the selected individual, and returns the
/// updated opaque GA/cache state followed by UI-facing placement data.
pub(crate) fn complete(data: Vec<f64>) -> Vec<f64> {
    if request_type(&data) != Some(TYPE_GA) || data.get(1) != Some(&6.0) {
        return vec![0.0];
    }
    let mut index = 2;
    if parse_config(&data, &mut index).is_err() {
        return vec![0.0];
    }
    let packed_config = *data.get(2).unwrap_or(&f64::NAN);
    let Some(preparation_length) = data.get(index).copied().and_then(integer) else {
        return vec![0.0];
    };
    index += 1;
    let Some(context) = data
        .get(index..index + preparation_length)
        .and_then(parse_context)
    else {
        return vec![0.0];
    };
    index += preparation_length;
    let Some(continuation_length) = data.get(index).copied().and_then(integer) else {
        return vec![0.0];
    };
    index += 1;
    let Some(continuation) = data.get(index..index + continuation_length) else {
        return vec![0.0];
    };
    let Some(candidate) = parse_continuation(continuation) else {
        return vec![0.0];
    };
    let Some(cache_state) = continuation_cache(continuation) else {
        return vec![0.0];
    };
    if candidate.placement.len() != context.roots.len()
        || candidate
            .placement
            .iter()
            .any(|part| *part >= context.roots.len())
    {
        return vec![0.0];
    }
    index += continuation_length;
    let Some(result_count) = data.get(index).copied().and_then(integer) else {
        return vec![0.0];
    };
    index += 1;
    let mut merge = vec![cache_state.len() as f64];
    merge.extend_from_slice(cache_state);
    merge.push(result_count as f64);
    for _ in 0..result_count {
        let Some(length) = data.get(index).copied().and_then(integer) else {
            return vec![0.0];
        };
        index += 1;
        let Some(result) = data.get(index..index + length) else {
            return vec![0.0];
        };
        merge.push(length as f64);
        merge.extend_from_slice(result);
        index += length;
    }
    if index != data.len() {
        return vec![0.0];
    }
    let Some(cache) = cache::merge_payload(&merge, &mut 0) else {
        return vec![0.0];
    };
    let cache_state = cache::serialize(&cache);
    let mut placement_request = vec![2.0, packed_config, candidate.placement.len() as f64];
    serialize_recursive_polygon(&mut placement_request, &context.bin);
    for (&part, &rotation) in candidate.placement.iter().zip(&candidate.rotations) {
        placement_request.extend([part as f64, rotation]);
        serialize_recursive_polygon(&mut placement_request, &context.roots[part]);
    }
    placement_request.extend_from_slice(&cache_state);
    let placement_result = placement::generate(placement_request);
    let Some(fitness) = placement_result
        .first()
        .copied()
        .filter(|value| value.is_finite())
    else {
        return vec![0.0];
    };
    let (seed, mut population) = match ga::deserialize_state(&candidate.state) {
        Some(state) => state,
        None => return vec![0.0],
    };
    let Some(individual) = population.get_mut(candidate.index) else {
        return vec![0.0];
    };
    individual.fitness = Some(fitness);
    let state = ga::serialize_state(seed, &population);
    let mut response = vec![1.0, state.len() as f64];
    response.extend(state);
    response.push(cache_state.len() as f64);
    response.extend(cache_state);
    response.push(context.roots.len() as f64);
    response.extend(placement_result);
    response
}

#[cfg(test)]
mod tests {
    fn prepared_result() -> Vec<f64> {
        crate::generate(vec![
            3.0,
            169_099_294.0,
            1.0,
            4.0,
            0.0,
            0.0,
            10.0,
            0.0,
            10.0,
            10.0,
            0.0,
            10.0,
            0.0,
            4.0,
            2.0,
            2.0,
            4.0,
            2.0,
            4.0,
            4.0,
            2.0,
            4.0,
        ])
    }

    #[test]
    fn begins_a_generation_with_self_contained_nfp_jobs() {
        let prepared = prepared_result();
        let mut request = vec![0.0, 5.0, 169_099_294.0, prepared.len() as f64];
        request.extend(prepared);
        request.push(0.0); // Initialize GA from context.
        request.push(0.0); // Empty cache.
        let result = crate::generate(request);
        assert_eq!(result[0], 1.0);
        let continuation_length = result[1] as usize;
        let job_count_index = continuation_length + 2;
        assert_eq!(result[job_count_index], 1.0);
        let job_length = result[job_count_index + 1] as usize;
        let job = &result[job_count_index + 2..job_count_index + 2 + job_length];
        assert_eq!((job[0] as u64) & 0x03, 1); // NFP request type.
        let generated = crate::generate(job.to_vec());
        assert!(
            generated.len() > 2,
            "the job is executable without JavaScript geometry"
        );
    }

    #[test]
    fn completes_a_generation_and_records_the_candidate_fitness() {
        let prepared = prepared_result();
        let mut begin_request = vec![0.0, 5.0, 169_099_294.0, prepared.len() as f64];
        begin_request.extend(&prepared);
        begin_request.extend([0.0, 0.0]);
        let begun = crate::generate(begin_request);
        let continuation_length = begun[1] as usize;
        let continuation = &begun[2..2 + continuation_length];
        let job_count_index = continuation_length + 2;
        let job_length = begun[job_count_index + 1] as usize;
        let job_start = job_count_index + 2;
        let nfp = crate::generate(begun[job_start..job_start + job_length].to_vec());

        let mut complete_request = vec![0.0, 6.0, 169_099_294.0, prepared.len() as f64];
        complete_request.extend(&prepared);
        complete_request.push(continuation.len() as f64);
        complete_request.extend_from_slice(continuation);
        complete_request.extend([1.0, nfp.len() as f64]);
        complete_request.extend(nfp);
        let completed = super::complete(complete_request);
        assert_eq!(completed[0], 1.0);
        let state_length = completed[1] as usize;
        let (_, population) =
            crate::ga::deserialize_state(&completed[2..2 + state_length]).unwrap();
        assert!(population
            .iter()
            .any(|individual| individual.fitness.is_some()));
        let placement_start = 4 + state_length + completed[2 + state_length] as usize;
        assert_eq!(completed[placement_start - 1], 1.0);
        assert!(completed[placement_start].is_finite());
    }
}
