use crate::utils::bit_ops::{get_u16, join_u16};

/// Rust port of NFPWrapper class from TypeScript
/// Handles serialization and deserialization of NFP (No-Fit Polygon) data
/// Works with ArrayBuffer representation (byte slice) like the TypeScript version
pub struct NFPWrapper<'a> {
    buffer: &'a [u8],
}

impl<'a> NFPWrapper<'a> {
    const NFP_INFO_START_INDEX: usize = 2;
    const MIN_BUFFER_SIZE: usize = 3 * 4; // 3 u32 values * 4 bytes each

    /// Creates a new NFPWrapper from a byte buffer
    pub fn new(buffer: &'a [u8]) -> Self {
        Self { buffer }
    }

    /// Gets the NFP memory segment at the specified index as a Float32Array view
    /// Returns a slice of f32 values representing one NFP polygon
    pub fn get_nfp_mem_seg(&self, index: usize) -> Vec<f32> {
        if self.is_broken() {
            return Vec::new();
        }

        let compressed_info = self.get_uint32(Self::NFP_INFO_START_INDEX + index);
        let offset = get_u16(compressed_info, 1) as usize * 4; // Convert f32 index to byte offset
        let size = get_u16(compressed_info, 0) as usize;

        if offset + size * 4 > self.buffer.len() {
            return Vec::new();
        }

        // Read f32 values from buffer
        let mut result = Vec::with_capacity(size);
        for i in 0..size {
            let byte_offset = offset + i * 4;
            let bytes = [
                self.buffer[byte_offset],
                self.buffer[byte_offset + 1],
                self.buffer[byte_offset + 2],
                self.buffer[byte_offset + 3],
            ];
            result.push(f32::from_le_bytes(bytes));
        }

        result
    }

    /// Reads a u32 value from the buffer at the specified index (little-endian)
    #[inline]
    fn get_uint32(&self, index: usize) -> u32 {
        let byte_offset = index * 4;
        if byte_offset + 4 > self.buffer.len() {
            return 0;
        }

        u32::from_le_bytes([
            self.buffer[byte_offset],
            self.buffer[byte_offset + 1],
            self.buffer[byte_offset + 2],
            self.buffer[byte_offset + 3],
        ])
    }

    /// Returns a reference to the internal buffer
    pub fn buffer(&self) -> &[u8] {
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
    /// A Vec<u8> containing the serialized data (ArrayBuffer representation)
    pub fn serialize(key: u32, nfp_arrays: &[Vec<f32>]) -> Vec<u8> {
        let nfp_count = nfp_arrays.len();
        let mut info = vec![0u32; nfp_count];
        let mut total_size = Self::NFP_INFO_START_INDEX + nfp_count;

        // Calculate offsets and total size
        for (i, nfp_array) in nfp_arrays.iter().enumerate() {
            let size = nfp_array.len();
            info[i] = join_u16(size as u16, total_size as u16);
            total_size += size;
        }

        // Create result buffer (total_size * 4 bytes per f32)
        let mut result = vec![0u8; total_size * 4];

        // Write header (key and nfp_count as little-endian u32)
        result[0..4].copy_from_slice(&key.to_le_bytes());
        result[4..8].copy_from_slice(&(nfp_count as u32).to_le_bytes());

        // Write NFP info and data
        for (i, nfp_array) in nfp_arrays.iter().enumerate() {
            let info_offset = (Self::NFP_INFO_START_INDEX + i) * 4;
            result[info_offset..info_offset + 4].copy_from_slice(&info[i].to_le_bytes());

            let data_offset = get_u16(info[i], 1) as usize * 4; // Convert to byte offset
            for (j, &value) in nfp_array.iter().enumerate() {
                let byte_offset = data_offset + j * 4;
                result[byte_offset..byte_offset + 4].copy_from_slice(&value.to_le_bytes());
            }
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
