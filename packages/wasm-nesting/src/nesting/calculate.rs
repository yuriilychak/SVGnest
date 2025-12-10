use crate::nesting::pair_flow::pair_data;
use crate::nesting::place_flow::place_paths;

/// Thread type enum matching TypeScript THREAD_TYPE
#[derive(Debug, PartialEq)]
pub enum ThreadType {
    Pair = 0,
    Placement = 1,
}

impl ThreadType {
    /// Parse thread type from u32 value
    pub fn from_u32(value: u32) -> Option<ThreadType> {
        match value {
            0 => Some(ThreadType::Pair),
            1 => Some(ThreadType::Placement),
            _ => None,
        }
    }
}

/// Main calculation function that routes to either pair_data or place_paths
/// based on the thread type in the buffer.
///
/// Port of TypeScript calculate function from worker-flow/index.ts
///
/// # Arguments
/// * `buffer` - Input buffer where first 4 bytes (u32 big-endian) indicate thread type
///
/// # Returns
/// Result buffer from either pair_data or place_paths
pub fn calculate(buffer: &[u8]) -> Vec<f32> {
    if buffer.len() < 4 {
        return Vec::new();
    }

    // Read thread type from first 4 bytes (big-endian u32, matching DataView.getUint32)
    let data_type = u32::from_be_bytes([buffer[0], buffer[1], buffer[2], buffer[3]]);

    let thread_type = match ThreadType::from_u32(data_type) {
        Some(t) => t,
        None => return Vec::new(),
    };

    match thread_type {
        ThreadType::Pair => {
            // Convert u8 buffer to f32 buffer for pair_data
            if buffer.len() % 4 != 0 {
                return Vec::new();
            }

            let f32_buffer: Vec<f32> = buffer
                .chunks_exact(4)
                .map(|chunk| f32::from_ne_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
                .collect();

            unsafe { pair_data(&f32_buffer) }
        }
        ThreadType::Placement => place_paths(buffer),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_thread_type_from_u32() {
        assert_eq!(ThreadType::from_u32(0), Some(ThreadType::Pair));
        assert_eq!(ThreadType::from_u32(1), Some(ThreadType::Placement));
        assert_eq!(ThreadType::from_u32(2), None);
    }

    #[test]
    fn test_calculate_empty_buffer() {
        let result = calculate(&[]);
        assert!(result.is_empty());
    }

    #[test]
    fn test_calculate_invalid_buffer() {
        let result = calculate(&[0, 0]);
        assert!(result.is_empty());
    }
}
