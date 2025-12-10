use crate::utils::bit_ops::{get_u16, join_u16};

/// Rust port of NFPWrapper class from TypeScript
/// Handles serialization and deserialization of NFP (No-Fit Polygon) data
/// Works with f32 slice directly from nfp_cache
pub struct NFPWrapper<'a> {
    buffer: &'a [f32],
}

impl<'a> NFPWrapper<'a> {
    const NFP_INFO_START_INDEX: usize = 2;
    const MIN_BUFFER_SIZE: usize = 3; // 3 f32 values (key, count, info)

    /// Creates a new NFPWrapper from a f32 buffer
    pub fn new(buffer: &'a [f32]) -> Self {
        Self { buffer }
    }

    /// Gets the NFP memory segment at the specified index as a Float32Array view
    /// Returns a slice of f32 values representing one NFP polygon
    pub fn get_nfp_mem_seg(&self, index: usize) -> Vec<f32> {
        if self.is_broken() {
            return Vec::new();
        }

        let compressed_info = self.get_uint32(Self::NFP_INFO_START_INDEX + index);
        let offset = get_u16(compressed_info, 1) as usize;
        let size = get_u16(compressed_info, 0) as usize;

        if offset + size > self.buffer.len() {
            return Vec::new();
        }

        // Return slice as Vec
        self.buffer[offset..offset + size].to_vec()
    }

    /// Reads a u32 value from the buffer at the specified index by reinterpreting f32 bits
    #[inline]
    fn get_uint32(&self, index: usize) -> u32 {
        if index >= self.buffer.len() {
            return 0;
        }

        self.buffer[index].to_bits()
    }

    /// Returns a reference to the internal buffer
    pub fn buffer(&self) -> &[f32] {
        self.buffer
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

        // Write header (key and nfp_count as u32 bits reinterpreted as f32)
        result[0] = f32::from_bits(key);
        result[1] = f32::from_bits(nfp_count as u32);

        // Write NFP info and data
        for (i, nfp_array) in nfp_arrays.iter().enumerate() {
            result[Self::NFP_INFO_START_INDEX + i] = f32::from_bits(info[i]);

            let data_offset = get_u16(info[i], 1) as usize;
            result[data_offset..data_offset + nfp_array.len()].copy_from_slice(nfp_array);
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
