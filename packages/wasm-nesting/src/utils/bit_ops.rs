use crate::constants::{UINT16_BIT_COUNT, MAX_U32_BITS};

#[inline(always)]
fn get_mask(bit_count: u8, offset: u8) -> u32 {
    ((1u32 << bit_count) - 1) << offset
}

#[inline(always)]
pub fn set_bits(source: u32, value: u16, index: u8, bit_count: u8) -> u32 {
    let mask = get_mask(bit_count, index);
    (source & !mask) | (((value as u32) << index) & mask)
}

#[inline(always)]
pub fn get_bits(source: u32, index: u8, num_bits: u8) -> u16 {
    ((source >> index) & get_mask(num_bits, 0)) as u16
}

#[inline(always)]
pub fn get_u16(source: u32, index: u8) -> u16 {
    get_bits(source, index * UINT16_BIT_COUNT, UINT16_BIT_COUNT)
}

#[inline(always)]
pub fn join_u16(value1: u16, value2: u16) -> u32 {
    (value1 as u32) | ((value2 as u32) << UINT16_BIT_COUNT)
}

#[inline(always)]
pub fn highest_bit_index(mask: u32) -> u8 {
    debug_assert!(mask != 0, "highest_bit_index called with 0");
    MAX_U32_BITS - (mask.leading_zeros() as u8)
}
