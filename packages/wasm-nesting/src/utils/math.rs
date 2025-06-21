#[inline(always)]
pub fn cycle_index(index: usize, size: usize, offset: isize) -> usize {
    ((index as isize + offset).rem_euclid(size as isize)) as usize
}

#[inline(always)]
pub fn to_rotation_index(angle: u16, rotation_split: u16) -> u16 {
    debug_assert!(
        (angle as u32 * rotation_split as u32 + 180) <= u16::MAX as u32,
        "to_rotation_index: potential overflow with angle={}, rotation_split={}",
        angle,
        rotation_split
    );

    (angle * rotation_split + 180) / 360
}

#[inline(always)]
fn cast_int64(a: f64) -> i64 {
    if a < 0.0 {
        a.ceil() as i64
    } else {
        a.floor() as i64
    }
}

#[inline(always)]
fn split_to_16bits(value: i64) -> [u16; 4] {
    let mask = 0xffff;
    let mut result = [0u16; 4];
    let mut current_value = value.abs() as u64;

    for i in 0..4 {
        result[i] = (current_value & mask) as u16;
        current_value >>= 16;
    }

    result
}

#[inline(always)]
fn mul_int128(x: f64, y: f64) -> [u32; 5] {
    let x_parts = split_to_16bits(x as i64);
    let y_parts = split_to_16bits(y as i64);
    let mut result = [0u32; 5];

    let mask = 0xffffffff;

    result[1] = (x_parts[0] as u32 * y_parts[0] as u32) & mask;
    result[2] =
        ((x_parts[1] as u32 * y_parts[0] as u32) + (x_parts[0] as u32 * y_parts[1] as u32)) & mask;
    result[3] = ((x_parts[2] as u32 * y_parts[0] as u32)
        + (x_parts[0] as u32 * y_parts[2] as u32)
        + (x_parts[1] as u32 * y_parts[1] as u32))
        & mask;
    result[4] = ((x_parts[3] as u32 * y_parts[3] as u32)
        + (x_parts[3] as u32 * y_parts[0] as u32)
        + (x_parts[2] as u32 * y_parts[1] as u32))
        & mask;

    // propagate carries
    for i in (1..5).rev() {
        result[i] = result[i].wrapping_add(result[i - 1] >> 16);
    }

    result[0] = 1 + ((x.signum() * y.signum()) as u32);

    result
}

pub fn equality_int128(left: &[u32], right: &[u32]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter().zip(right).all(|(a, b)| a == b)
}

pub fn slopes_equal(v1: f64, v2: f64, v3: f64, v4: f64, use_full_range: bool) -> bool {
    if use_full_range {
        let a = mul_int128(v1, v2);
        let b = mul_int128(v3, v4);
        equality_int128(&a, &b)
    } else {
        cast_int64(v1 * v2) - cast_int64(v3 * v4) == 0
    }
}
