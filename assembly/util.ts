// floating point comparison tolerance
export const TOLERANCE: f64 = Math.pow(10, -9); // Floating point error is likely to be above 1 epsilon

export const POLYGON_CONFIG_SIZE: u16 = 10;

export function almostEqual(
  a: f64,
  b: f64 = 0,
  tolerance: f64 = TOLERANCE
): boolean {
  return Math.abs(a - b) < tolerance;
}

export function clipperRound(a: f64): f64 {
  return a < 0 ? -Math.round(Math.abs(a)) : Math.round(a);
}
