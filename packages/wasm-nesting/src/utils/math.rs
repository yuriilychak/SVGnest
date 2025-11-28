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
pub fn cast_int64(a: f64) -> i64 {
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

/// Returns the sign of a number as an i32, matching JavaScript's Math.sign()
/// Returns:
/// - 1 if x > 0
/// - -1 if x < 0  
/// - 0 if x == 0
///
/// This is different from f64::signum() which returns 1.0 for positive zero
#[inline(always)]
fn sign(x: f64) -> i32 {
    if x > 0.0 {
        1
    } else if x < 0.0 {
        -1
    } else {
        0
    }
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

    // BUGFIX: Use sign() function that returns 0 for zero, matching JavaScript's Math.sign()
    // Rust's f64::signum() returns 1.0 for positive zero, which causes incorrect results
    // when comparing slopes where one or both values are zero
    result[0] = (1 + (sign(x) * sign(y))) as u32;

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

/// Reads a u32 value from a f32 array by reinterpreting the bytes at the given index.
/// This is equivalent to TypeScript's readUint32FromF32 using DataView.getUint32 with little-endian.
#[inline(always)]
pub fn read_uint32_from_f32(array: &[f32], index: usize) -> u32 {
    // In Rust, we can use f32::to_bits() to get the u32 representation
    // or use from_le_bytes if we need explicit little-endian conversion
    array[index].to_bits()
}

/// Writes a u32 value to a f32 array by reinterpreting the bytes at the given index.
/// This is equivalent to TypeScript's writeUint32ToF32 using DataView.setUint32 with little-endian.
#[inline(always)]
pub fn write_uint32_to_f32(array: &mut [f32], index: usize, value: u32) {
    // Convert u32 to f32 by reinterpreting the bits
    array[index] = f32::from_bits(value);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_read_write_uint32_from_f32() {
        let mut array = vec![0.0f32; 10];

        // Write some u32 values
        write_uint32_to_f32(&mut array, 0, 42);
        write_uint32_to_f32(&mut array, 1, 12345);
        write_uint32_to_f32(&mut array, 2, u32::MAX);
        write_uint32_to_f32(&mut array, 3, 0);

        // Read them back and verify
        assert_eq!(read_uint32_from_f32(&array, 0), 42);
        assert_eq!(read_uint32_from_f32(&array, 1), 12345);
        assert_eq!(read_uint32_from_f32(&array, 2), u32::MAX);
        assert_eq!(read_uint32_from_f32(&array, 3), 0);
    }

    #[test]
    fn test_roundtrip_uint32_f32_conversion() {
        let test_values = [0u32, 1, 100, 1000, 65535, 16777216, u32::MAX / 2, u32::MAX];
        let mut array = vec![0.0f32; test_values.len()];

        // Write all values
        for (i, &value) in test_values.iter().enumerate() {
            write_uint32_to_f32(&mut array, i, value);
        }

        // Read them back and verify they match
        for (i, &expected) in test_values.iter().enumerate() {
            let actual = read_uint32_from_f32(&array, i);
            assert_eq!(
                actual, expected,
                "Mismatch at index {}: expected {}, got {}",
                i, expected, actual
            );
        }
    }
}
