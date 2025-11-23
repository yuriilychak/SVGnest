// Mock for wasm-nesting module
export const mid_value_f64 = (a: number, b: number, c: number): number => {
    return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
};

// Join two 16-bit unsigned integers into a 32-bit unsigned integer
export const join_u16_to_u32 = (value1: number, value2: number): number => {
    return (value1 & 0xFFFF) | ((value2 & 0xFFFF) << 16);
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

// Cycle index function for array indexing with wrap-around
export const cycle_index_wasm = (index: number, length: number, offset: number): number => {
    const newIndex = index + offset;
    if (newIndex < 0) {
        return length + newIndex;
    }
    return newIndex % length;
};

// Calculate polygon area using the shoelace formula
export const polygon_area_i32 = (polyData: Int32Array): number => {
    const len = polyData.length;
    if (len < 6) return 0; // Need at least 3 points (6 values)

    let area = 0;
    for (let i = 0; i < len; i += 2) {
        const j = (i + 2) % len;
        area += polyData[i] * polyData[j + 1];
        area -= polyData[j] * polyData[i + 1];
    }

    return area / 2;
};