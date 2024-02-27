// floating point comparison tolerance
export const TOLEARANCE: f64 = Math.pow(10, -9); // Floating point error is likely to be above 1 epsilon

export const POLYGON_CONFIG_SIZE: u16 = 14;

export function almostEqual(
  a: f32,
  b: f32,
  tolerance: f64 = TOLEARANCE
): boolean {
  return Math.abs(a - b) < tolerance;
}
