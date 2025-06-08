use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

pub fn wasm_log<S: std::fmt::Display>(msg: S) {
    log(&msg.to_string());
}

pub fn wasm_logf(args: std::fmt::Arguments) {
    log(&args.to_string());
}


#[macro_export]
macro_rules! wasm_log {
    ($($t:tt)*) => ($crate::utils::wasm_logger::wasm_logf(format_args!($($t)*)))
}
