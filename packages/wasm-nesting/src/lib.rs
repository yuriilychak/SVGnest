use wasm_bindgen::prelude::*;

// Export a simple function to WebAssembly
#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}
