use wasm_bindgen::prelude::*;
use crate::binary::{parse_frame, Reader};

mod begin;
mod binary;
mod cache;
#[allow(dead_code)] // Activated by the forthcoming GA worker request.
mod ga;
mod nfp;
mod placement;
mod plan;
mod point;
mod polygon;
mod prepare;
mod protocol;

const COMPACT_PREPARE_REQUEST: u8 = 0x93;
const PREPARE_COORDINATE_SCALE: f64 = 100_000.0;

#[wasm_bindgen(js_name = generate)]
pub fn generate_bytes(request: Vec<u8>) -> Vec<u8> {
    if let Some((command, flags, payload)) = parse_frame(&request) {
        if flags != 0 { return Vec::new(); }
        if command == COMPACT_PREPARE_REQUEST {
            let Some(request) = expand_compact_preparation(payload) else { return Vec::new() };
            return prepare::compact_result(&prepare::generate(request)).unwrap_or_default();
        }
        if command == nfp::COMPACT_NFP_REQUEST_COMMAND {
            let request = nfp::expand_compact_request(&request);
            let Some(request) = request else { return Vec::new() };
            return nfp::compact_result(&nfp::generate(request)).unwrap_or_default();
        }
        if command == 5 {
            return compact_begin(payload).unwrap_or_default();
        }
        if command == 6 {
            return compact_complete(payload).unwrap_or_default();
        }
        return Vec::new();
    }
    Vec::new()
}

fn expand_compact_preparation(payload: &[u8]) -> Option<Vec<f64>> {
    fn polygon(reader: &mut Reader<'_>, output: &mut Vec<f64>) -> Option<()> {
        let count = reader.u32()?;
        output.push(count as f64);
        for _ in 0..count {
            output.push(reader.i32()? as f64 / PREPARE_COORDINATE_SCALE);
            output.push(reader.i32()? as f64 / PREPARE_COORDINATE_SCALE);
        }
        Some(())
    }
    let mut reader = Reader::new(payload);
    let config = reader.u32()?;
    let part_count = reader.u32()?;
    let mut request = vec![protocol::TYPE_PREPARE as f64, config as f64, part_count as f64];
    polygon(&mut reader, &mut request)?;
    for _ in 0..part_count {
        request.push(reader.u32()? as f64);
        polygon(&mut reader, &mut request)?;
    }
    (reader.remaining() == 0).then_some(request)
}

const COMPACT_BEGIN_RESULT_COMMAND: u8 = 0x85;
const COMPACT_CONTINUATION_COMMAND: u8 = 0x88;

fn compact_continuation(data: &[f64], rotations: u8) -> Option<Vec<u8>> {
    if rotations == 0 || data.first().copied()? != 1.0 { return None; }
    let mut index = 1;
    let state_length = *data.get(index)? as usize;
    index += 1;
    let state = data.get(index..index + state_length)?;
    index += state_length;
    let cache_length = *data.get(index)? as usize;
    index += 1;
    let cache = data.get(index..index + cache_length)?;
    index += cache_length;
    let candidate = *data.get(index)?;
    index += 1;
    let length = *data.get(index)? as usize;
    index += 1;
    (candidate.is_finite() && candidate.fract() == 0.0 && (0.0..=u32::MAX as f64).contains(&candidate)).then_some(())?;
    let placements = data.get(index..index + length)?;
    index += length;
    let angles = data.get(index..index + length)?;
    index += length;
    (index == data.len()).then_some(())?;
    let state = ga::compact_state(state, rotations)?;
    let cache = cache::compact(&cache::parse(cache)?)?;
    let mut writer = binary::Writer::new();
    writer.u32(u32::try_from(state.len()).ok()?);
    writer.bytes(&state);
    writer.u32(u32::try_from(cache.len()).ok()?);
    writer.bytes(&cache);
    writer.u32(candidate as u32);
    writer.u32(u32::try_from(length).ok()?);
    writer.u8(rotations);
    for (&placement, &angle) in placements.iter().zip(angles) {
        (placement.is_finite() && placement.fract() == 0.0 && (0.0..=u32::MAX as f64).contains(&placement) && angle.is_finite()).then_some(())?;
        let rotation = (angle / (360.0 / rotations as f64)).round();
        (rotation.is_finite() && (0.0..rotations as f64).contains(&rotation)).then_some(())?;
        writer.u32(placement as u32);
        writer.u8(rotation as u8);
    }
    binary::frame(COMPACT_CONTINUATION_COMMAND, 0, &writer.finish())
}

fn expand_compact_continuation(data: &[u8]) -> Option<Vec<f64>> {
    let (command, flags, payload) = parse_frame(data)?;
    if command != COMPACT_CONTINUATION_COMMAND || flags != 0 { return None; }
    let mut reader = Reader::new(payload);
    let state_length = reader.u32()? as usize;
    let state = ga::expand_compact_state(reader.take(state_length)?)?;
    let cache_length = reader.u32()? as usize;
    let cache = cache::expand_compact(reader.take(cache_length)?)?;
    let candidate = reader.u32()?;
    let length = reader.u32()?;
    let rotation_count = reader.u8()?;
    if rotation_count == 0 { return None; }
    let mut placement = Vec::with_capacity(length as usize);
    let mut rotations = Vec::with_capacity(length as usize);
    for _ in 0..length {
        placement.push(reader.u32()? as f64);
        let rotation = reader.u8()?;
        if rotation >= rotation_count { return None; }
        rotations.push(rotation as f64 * (360.0 / rotation_count as f64));
    }
    (reader.remaining() == 0).then_some(())?;
    let mut result = vec![1.0, state.len() as f64];
    result.extend(state);
    result.push(cache.len() as f64);
    result.extend(cache);
    result.extend([candidate as f64, length as f64]);
    result.extend(placement);
    result.extend(rotations);
    Some(result)
}

fn compact_begin(payload: &[u8]) -> Option<Vec<u8>> {
    let mut reader = Reader::new(payload);
    let config = reader.u32()? as f64;
    let length = reader.u32()? as usize;
    let preparation = prepare::expand_compact(reader.take(length)?)?;
    let length = reader.u32()? as usize;
    let state_bytes = reader.take(length)?;
    let state = if state_bytes.is_empty() { Vec::new() } else { ga::expand_compact_state(state_bytes)? };
    let length = reader.u32()? as usize;
    let cache_bytes = reader.take(length)?;
    let cache = cache::expand_compact(cache_bytes)?;
    (reader.remaining() == 0).then_some(())?;
    let mut request = vec![0.0, 5.0, config, preparation.len() as f64];
    request.extend(preparation);
    request.push(state.len() as f64);
    request.extend(state);
    request.extend(cache);
    let begun = begin::generate(request);
    if begun.first() != Some(&1.0) { return None; }
    let mut index = 1;
    let continuation_length = *begun.get(index)? as usize;
    index += 1;
    let continuation = begun.get(index..index + continuation_length)?;
    index += continuation_length;
    let job_count = *begun.get(index)?;
    (job_count.is_finite() && job_count.fract() == 0.0 && (0.0..=u32::MAX as f64).contains(&job_count)).then_some(())?;
    index += 1;
    let rotations = ((config as u32 >> 12) & 0x0f) as u8;
    let continuation_bytes = compact_continuation(continuation, rotations)?;
    let mut writer = binary::Writer::new();
    writer.u32(u32::try_from(continuation_bytes.len()).ok()?);
    writer.bytes(&continuation_bytes);
    writer.u32(job_count as u32);
    for _ in 0..job_count as usize {
        let length = *begun.get(index)? as usize;
        index += 1;
        let job = begun.get(index..index + length)?;
        index += length;
        let job_bytes = nfp::compact_request(job)?;
        writer.u32(u32::try_from(job_bytes.len()).ok()?);
        writer.bytes(&job_bytes);
    }
    (index == begun.len()).then(|| binary::frame(COMPACT_BEGIN_RESULT_COMMAND, 0, &writer.finish())).flatten()
}

const COMPACT_COMPLETE_RESULT_COMMAND: u8 = 0x86;

fn compact_complete(payload: &[u8]) -> Option<Vec<u8>> {
    let mut reader = Reader::new(payload);
    let config = reader.u32()? as f64;
    let length = reader.u32()? as usize;
    let preparation = prepare::expand_compact(reader.take(length)?)?;
    let length = reader.u32()? as usize;
    let continuation_bytes = reader.take(length)?;
    let continuation = expand_compact_continuation(continuation_bytes)?;
    let result_count = reader.u32()?;
    let mut request = vec![0.0, 6.0, config, preparation.len() as f64];
    request.extend(preparation);
    request.push(continuation.len() as f64);
    request.extend(continuation);
    request.push(result_count as f64);
    for _ in 0..result_count {
        let length = reader.u32()? as usize;
        let bytes = reader.take(length)?;
        let result = nfp::expand_compact_result(bytes)?;
        request.push(result.len() as f64);
        request.extend(result);
    }
    (reader.remaining() == 0).then_some(())?;
    let completed = begin::complete(request);
    if completed.first() != Some(&1.0) { return None; }
    let mut index = 1;
    let state_length = *completed.get(index)? as usize;
    index += 1;
    let state = completed.get(index..index + state_length)?;
    index += state_length;
    let cache_length = *completed.get(index)? as usize;
    index += 1;
    let cache = completed.get(index..index + cache_length)?;
    index += cache_length;
    let part_count = *completed.get(index)?;
    (part_count.is_finite() && part_count.fract() == 0.0 && (0.0..=u32::MAX as f64).contains(&part_count)).then_some(())?;
    index += 1;
    let placement = completed.get(index..)?;
    let rotations = ((config as u32 >> 12) & 0x0f) as u8;
    let state_bytes = ga::compact_state(state, rotations)?;
    let placement_bytes = placement::compact_result(placement)?;
    let cache_bytes = cache::compact(&cache::parse(cache)?)?;
    let mut writer = binary::Writer::new();
    writer.u32(u32::try_from(state_bytes.len()).ok()?);
    writer.bytes(&state_bytes);
    writer.u32(u32::try_from(cache_bytes.len()).ok()?);
    writer.bytes(&cache_bytes);
    writer.u32(part_count as u32);
    writer.u32(u32::try_from(placement_bytes.len()).ok()?);
    writer.bytes(&placement_bytes);
    binary::frame(COMPACT_COMPLETE_RESULT_COMMAND, 0, &writer.finish())
}

#[cfg(test)]
pub(crate) fn generate(request: Vec<f64>) -> Vec<f64> {
    match protocol::request_type(&request) {
        Some(protocol::TYPE_GA) if request.get(1) == Some(&2.0) => plan::generate(request),
        Some(protocol::TYPE_GA) if request.get(1) == Some(&3.0) => ga::select(request),
        Some(protocol::TYPE_GA) if request.get(1) == Some(&5.0) => begin::generate(request),
        Some(protocol::TYPE_GA) if request.get(1) == Some(&6.0) => begin::complete(request),
        Some(protocol::TYPE_GA) => ga::generate(request),
        Some(protocol::TYPE_NFP) => nfp::generate(request),
        Some(2) => placement::generate(request),
        Some(protocol::TYPE_PREPARE) => prepare::generate(request),
        _ => vec![0.0, 0.0],
    }
}

#[cfg(test)]
mod tests {
    use super::generate_bytes;

    #[test]
    fn byte_boundary_rejects_unframed_legacy_values() {
        let request = f64::NAN.to_le_bytes().to_vec();
        let response = generate_bytes(request);
        assert!(response.is_empty());
    }

    #[test]
    fn byte_boundary_rejects_partial_f64_values() {
        assert!(generate_bytes(vec![0; 7]).is_empty());
    }
}
