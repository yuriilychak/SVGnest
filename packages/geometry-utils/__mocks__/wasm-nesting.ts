// Mock for wasm-nesting module
export const mid_value_f64 = (a: number, b: number, c: number): number => {
    return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
};

// Join two 16-bit unsigned integers into a 32-bit unsigned integer
export const join_u16_to_u32 = (high: number, low: number): number => {
    return ((high & 0xFFFF) << 16) | (low & 0xFFFF);
};

// Extract 16-bit unsigned integer from 32-bit unsigned integer
export const get_u16_from_u32 = (value: number, index: number): number => {
    if (index === 0) {
        return (value >>> 16) & 0xFFFF; // High 16 bits
    } else {
        return value & 0xFFFF; // Low 16 bits
    }
};

// Almost equal comparison for floating point numbers
export const almost_equal = (a: number, b: number, tolerance: number): boolean => {
    return Math.abs(a - b) <= tolerance;
};