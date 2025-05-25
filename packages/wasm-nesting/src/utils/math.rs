

#[inline(always)]
pub fn cycle_index(index: usize, size: usize, offset: isize) -> usize {
    ((index as isize + offset).rem_euclid(size as isize)) as usize
}

#[inline(always)]
pub fn to_rotation_index(angle: u16, rotation_split: u16) -> u16 {
    debug_assert!(
        (angle as u32 * rotation_split as u32 + 180) <= u16::MAX as u32,
        "to_rotation_index: potential overflow with angle={}, rotation_split={}",
        angle, rotation_split
    );

    ((angle * rotation_split + 180) / 360)
}