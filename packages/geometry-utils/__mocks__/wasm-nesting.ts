// Mock for wasm-nesting module
export const mid_value_f64 = (a: number, b: number, c: number): number => {
    return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
};

// Add other wasm-nesting functions as needed
export const some_other_function = () => 0;