// Clipper module - geometric clipping operations
// Contains implementations for polygon clipping, offset, and related utilities

pub mod constants;
pub mod enums;
pub mod intersect_node;
pub mod join;
pub mod local_minima;
pub mod scanbeam;
pub mod utils;

#[cfg(test)]
pub mod tests;

// Re-export commonly used items for convenience
pub use constants::*;
pub use enums::*;
