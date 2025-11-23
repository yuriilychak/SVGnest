use wasm_nesting::utils::bit_ops::join_u16;

fn main() {
    let result = join_u16(2, 3);
    println!("join_u16(2, 3) = {}", result);
    
    // Let's also calculate manually
    // Current implementation: (value1 as u32) | ((value2 as u32) << 16)
    let manual = (2u32) | ((3u32) << 16);
    println!("Manual calculation: (2) | (3 << 16) = {}", manual);
    
    // What would be needed for 131075:
    // 131075 = (2 << 16) | 3 = 131072 + 3
    let expected = (2u32 << 16) | 3u32;
    println!("Expected calculation: (2 << 16) | 3 = {}", expected);
}
