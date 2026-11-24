pub fn cmyk_to_rgb(c: f64, m: f64, y: f64, k: f64) -> (u8, u8, u8) {
    let r = (255.0 * (1.0 - c) * (1.0 - k)).round() as i32;
    let g = (255.0 * (1.0 - m) * (1.0 - k)).round() as i32;
    let b = (255.0 * (1.0 - y) * (1.0 - k)).round() as i32;
    (
        r.clamp(0, 255) as u8,
        g.clamp(0, 255) as u8,
        b.clamp(0, 255) as u8,
    )
}

pub fn load_icc_profile(_profile_data: &[u8]) -> bool {
    false
}
