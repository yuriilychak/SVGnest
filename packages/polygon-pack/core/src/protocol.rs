use crate::point::Point;
use crate::polygon::Polygon;

pub(crate) const TYPE_NFP: u64 = 1;
pub(crate) const TYPE_GA: u64 = 0;
pub(crate) const TYPE_PREPARE: u64 = 3;
pub(crate) const CLIPPER_SCALE: f64 = 10_000_000.0;

#[derive(Clone, Copy)]
pub(crate) struct Config {
    pub(crate) curve_tolerance: f64,
    pub(crate) spacing: f64,
    pub(crate) rotations: u32,
    pub(crate) population_size: usize,
    pub(crate) mutation_rate: f64,
}

pub(crate) fn parse_config(data: &[f64], index: &mut usize) -> Result<Config, String> {
    let value = *data.get(*index).ok_or("Missing packed configuration")?;
    *index += 1;
    if !value.is_finite() || value.fract() != 0.0 || !(0.0..=u32::MAX as f64).contains(&value) {
        return Err("Invalid packed configuration".into());
    }
    let packed = value as u32;
    let tolerance = packed & 0x7f;
    let spacing = (packed >> 7) & 0x1f;
    let rotations = (packed >> 12) & 0x1f;
    let population_size = (packed >> 17) & 0x7f;
    let mutation_rate = (packed >> 24) & 0x7f;
    if !(10..=100).contains(&tolerance)
        || spacing > 16
        || !(1..=16).contains(&rotations)
        || !(3..=64).contains(&population_size)
        || !(2..=64).contains(&mutation_rate)
    {
        return Err("Packed configuration is out of range".into());
    }
    Ok(Config {
        curve_tolerance: tolerance as f64 / 100.0,
        spacing: spacing as f64,
        rotations,
        population_size: population_size as usize,
        mutation_rate: mutation_rate as f64,
    })
}
const USE_HOLES_MASK: u64 = 0x04;
const INSIDE_MASK: u64 = 0x08;
const A_ROTATION_SHIFT: u64 = 4;
const B_ROTATION_SHIFT: u64 = 9;
const ROTATION_COUNT_SHIFT: u64 = 14;
const ROTATION_MASK: u64 = 0x1f;
const KEY_SHIFT: u64 = 19;

pub(crate) struct NfpRequest {
    pub(crate) key: u32,
    pub(crate) use_holes: bool,
    pub(crate) inside: bool,
    pub(crate) rotations: u8,
    pub(crate) a_rotation_index: u8,
    pub(crate) b_rotation_index: u8,
    pub(crate) a_rotation: f64,
    pub(crate) b_rotation: f64,
    pub(crate) a: Polygon,
    pub(crate) b: Polygon,
}

pub(crate) fn request_type(data: &[f64]) -> Option<u64> {
    let header = data.first().copied()?;
    (header.is_finite() && header.fract() == 0.0 && header >= 0.0).then_some((header as u64) & 0x03)
}

pub(crate) fn parse_polygon(data: &[f64], start: usize) -> Result<(Polygon, usize), String> {
    let point_count = *data.get(start).ok_or("Missing polygon point count")? as usize;
    let child_count = *data.get(start + 1).ok_or("Missing polygon child count")? as usize;
    let points_start = start + 2 + child_count;
    let points_end = points_start + point_count * 2;
    if points_end > data.len() {
        return Err("Polygon coordinates exceed request bounds".into());
    }
    let points = (0..point_count)
        .map(|index| Point {
            x: data[points_start + index * 2],
            y: data[points_start + index * 2 + 1],
        })
        .collect();
    let mut children = Vec::with_capacity(child_count);
    let mut next = points_end;
    for index in 0..child_count {
        let (child, end) = parse_polygon(data, data[start + 2 + index] as usize)?;
        children.push(child);
        next = next.max(end);
    }
    Ok((Polygon { points, children }, next))
}

pub(crate) fn serialize_recursive_polygon(result: &mut Vec<f64>, polygon: &Polygon) {
    result.extend([polygon.points.len() as f64, polygon.children.len() as f64]);
    for point in &polygon.points {
        result.extend([point.x, point.y]);
    }
    for child in &polygon.children {
        serialize_recursive_polygon(result, child);
    }
}

pub(crate) fn parse_request(data: &[f64]) -> Result<NfpRequest, String> {
    let header = *data.first().ok_or("Missing NFP request header")? as u64;
    if request_type(data) != Some(TYPE_NFP) {
        return Err("Unsupported serialized nesting request".into());
    }
    let rotation_count = (header >> ROTATION_COUNT_SHIFT) & ROTATION_MASK;
    if rotation_count == 0 {
        return Err("NFP request rotation count must be positive".into());
    }
    let (a, next) = parse_polygon(data, 1)?;
    let (b, _) = parse_polygon(data, next)?;
    Ok(NfpRequest {
        key: (header >> KEY_SHIFT) as u32,
        use_holes: header & USE_HOLES_MASK != 0,
        inside: header & INSIDE_MASK != 0,
        rotations: rotation_count as u8,
        a_rotation_index: ((header >> A_ROTATION_SHIFT) & ROTATION_MASK) as u8,
        b_rotation_index: ((header >> B_ROTATION_SHIFT) & ROTATION_MASK) as u8,
        a_rotation: ((header >> A_ROTATION_SHIFT) & ROTATION_MASK) as f64 * 360.0
            / rotation_count as f64,
        b_rotation: ((header >> B_ROTATION_SHIFT) & ROTATION_MASK) as f64 * 360.0
            / rotation_count as f64,
        a,
        b,
    })
}

pub(crate) fn serialize_nfp(key: u32, contours: &[Vec<Point>]) -> Vec<f64> {
    let mut result =
        Vec::with_capacity(2 + contours.len() + contours.iter().map(Vec::len).sum::<usize>() * 2);
    result.extend([key as f64, contours.len() as f64]);
    for contour in contours {
        result.push(contour.len() as f64);
        for point in contour {
            result.extend([point.x, point.y]);
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::{request_type, TYPE_NFP, TYPE_PREPARE};

    #[test]
    fn identifies_the_packed_nfp_header_by_its_low_type_bits() {
        let packed_nfp_header = (42_u64 << 19) | (4_u64 << 14) | TYPE_NFP;
        assert_eq!(request_type(&[packed_nfp_header as f64]), Some(TYPE_NFP));
        assert_eq!(request_type(&[2.0]), Some(2));
        assert_eq!(request_type(&[TYPE_PREPARE as f64]), Some(TYPE_PREPARE));
    }
}
