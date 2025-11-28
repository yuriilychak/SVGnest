use crate::utils::bit_ops::{get_u16, join_u16};
use crate::utils::math::{read_uint32_from_f32, write_uint32_to_f32};

/// Rust port of NFPWrapper class from TypeScript
/// Handles serialization and deserialization of NFP (No-Fit Polygon) data
pub struct NFPWrapper {
    buffer: Vec<f32>,
}

impl NFPWrapper {
    const NFP_INFO_START_INDEX: usize = 2;
    const MIN_BUFFER_SIZE: usize = 3;

    /// Creates a new NFPWrapper from a Vec<f32> buffer
    pub fn new(buffer: Vec<f32>) -> Self {
        Self { buffer }
    }

    /// Creates an empty NFPWrapper
    pub fn empty() -> Self {
        Self { buffer: Vec::new() }
    }

    /// Gets the NFP memory segment at the specified index
    /// Returns a slice of the internal buffer representing one NFP polygon
    pub fn get_nfp_mem_seg(&self, index: usize) -> &[f32] {
        if self.is_broken() {
            return &[];
        }

        let compressed_info = self.get_uint32(Self::NFP_INFO_START_INDEX + index);
        let offset = get_u16(compressed_info, 1) as usize;
        let size = get_u16(compressed_info, 0) as usize;

        if offset + size > self.buffer.len() {
            return &[];
        }

        &self.buffer[offset..offset + size]
    }

    /// Reads a u32 value from the buffer at the specified index
    #[inline]
    fn get_uint32(&self, index: usize) -> u32 {
        if index >= self.buffer.len() {
            return 0;
        }
        read_uint32_from_f32(&self.buffer, index)
    }

    /// Returns a reference to the internal buffer
    pub fn buffer(&self) -> &[f32] {
        &self.buffer
    }

    /// Returns a mutable reference to the internal buffer
    pub fn buffer_mut(&mut self) -> &mut Vec<f32> {
        &mut self.buffer
    }

    /// Sets the buffer, replacing the existing one
    pub fn set_buffer(&mut self, buffer: Vec<f32>) {
        self.buffer = buffer;
    }

    /// Returns the count of NFP polygons stored
    pub fn count(&self) -> usize {
        if self.is_broken() {
            0
        } else {
            self.get_uint32(1) as usize
        }
    }

    /// Checks if the buffer is too small to be valid
    pub fn is_broken(&self) -> bool {
        self.buffer.len() < Self::MIN_BUFFER_SIZE
    }

    /// Serializes NFP arrays into a single buffer
    ///
    /// # Arguments
    /// * `key` - Cache key identifier
    /// * `nfp_arrays` - Vector of NFP polygon data (each as a Vec<f32>)
    ///
    /// # Returns
    /// A Vec<f32> containing the serialized data
    pub fn serialize(key: u32, nfp_arrays: &[Vec<f32>]) -> Vec<f32> {
        let nfp_count = nfp_arrays.len();
        let mut info = vec![0u32; nfp_count];
        let mut total_size = Self::NFP_INFO_START_INDEX + nfp_count;

        // Calculate offsets and total size
        for (i, nfp_array) in nfp_arrays.iter().enumerate() {
            let size = nfp_array.len();
            info[i] = join_u16(size as u16, total_size as u16);
            total_size += size;
        }

        // Create result buffer
        let mut result = vec![0.0f32; total_size];

        // Write header
        write_uint32_to_f32(&mut result, 0, key);
        write_uint32_to_f32(&mut result, 1, nfp_count as u32);

        // Write NFP info and data
        for (i, nfp_array) in nfp_arrays.iter().enumerate() {
            write_uint32_to_f32(&mut result, Self::NFP_INFO_START_INDEX + i, info[i]);
            let offset = get_u16(info[i], 1) as usize;
            result[offset..offset + nfp_array.len()].copy_from_slice(nfp_array);
        }

        result
    }

    /// Deserializes from a buffer and returns the key
    pub fn deserialize_key(&self) -> u32 {
        if self.is_broken() {
            0
        } else {
            self.get_uint32(0)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_wrapper() {
        let wrapper = NFPWrapper::empty();
        assert!(wrapper.is_broken());
        assert_eq!(wrapper.count(), 0);
    }

    #[test]
    fn test_serialize_deserialize() {
        let nfp1 = vec![1.0, 2.0, 3.0, 4.0];
        let nfp2 = vec![5.0, 6.0, 7.0];
        let nfp3 = vec![8.0, 9.0];
        let nfps = vec![nfp1.clone(), nfp2.clone(), nfp3.clone()];

        let key = 12345u32;
        let serialized = NFPWrapper::serialize(key, &nfps);

        let wrapper = NFPWrapper::new(serialized);
        assert!(!wrapper.is_broken());
        assert_eq!(wrapper.count(), 3);
        assert_eq!(wrapper.deserialize_key(), key);

        let retrieved1 = wrapper.get_nfp_mem_seg(0);
        let retrieved2 = wrapper.get_nfp_mem_seg(1);
        let retrieved3 = wrapper.get_nfp_mem_seg(2);

        assert_eq!(retrieved1, nfp1.as_slice());
        assert_eq!(retrieved2, nfp2.as_slice());
        assert_eq!(retrieved3, nfp3.as_slice());
    }

    #[test]
    fn test_broken_buffer() {
        let wrapper = NFPWrapper::new(vec![1.0, 2.0]); // Too small
        assert!(wrapper.is_broken());
        assert_eq!(wrapper.count(), 0);
        let empty: &[f32] = &[];
        assert_eq!(wrapper.get_nfp_mem_seg(0), empty);
    }

    #[test]
    fn test_single_nfp() {
        let nfp = vec![10.0, 20.0, 30.0, 40.0, 50.0];
        let nfps = vec![nfp.clone()];
        let key = 99999u32;

        let serialized = NFPWrapper::serialize(key, &nfps);
        let wrapper = NFPWrapper::new(serialized);

        assert_eq!(wrapper.count(), 1);
        assert_eq!(wrapper.deserialize_key(), key);
        assert_eq!(wrapper.get_nfp_mem_seg(0), nfp.as_slice());
    }
}
