pub(crate) const VERSION: u8 = 2;
#[cfg(test)]
pub(crate) const FRAME_HEADER_BYTES: usize = 8;

pub(crate) struct Reader<'a> {
    bytes: &'a [u8],
    index: usize,
}

impl<'a> Reader<'a> {
    pub(crate) fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, index: 0 }
    }

    pub(crate) fn remaining(&self) -> usize {
        self.bytes.len().saturating_sub(self.index)
    }

    pub(crate) fn u8(&mut self) -> Option<u8> {
        let value = *self.bytes.get(self.index)?;
        self.index += 1;
        Some(value)
    }

    pub(crate) fn u16(&mut self) -> Option<u16> {
        let bytes: [u8; 2] = self.take(2)?.try_into().ok()?;
        Some(u16::from_le_bytes(bytes))
    }

    pub(crate) fn u32(&mut self) -> Option<u32> {
        let bytes: [u8; 4] = self.take(4)?.try_into().ok()?;
        Some(u32::from_le_bytes(bytes))
    }

    pub(crate) fn u64(&mut self) -> Option<u64> {
        let bytes: [u8; 8] = self.take(8)?.try_into().ok()?;
        Some(u64::from_le_bytes(bytes))
    }

    pub(crate) fn i32(&mut self) -> Option<i32> {
        let bytes: [u8; 4] = self.take(4)?.try_into().ok()?;
        Some(i32::from_le_bytes(bytes))
    }

    #[cfg(test)]
    pub(crate) fn f32(&mut self) -> Option<f32> {
        let bytes: [u8; 4] = self.take(4)?.try_into().ok()?;
        Some(f32::from_le_bytes(bytes))
    }

    pub(crate) fn f64(&mut self) -> Option<f64> {
        let bytes: [u8; 8] = self.take(8)?.try_into().ok()?;
        Some(f64::from_le_bytes(bytes))
    }

    pub(crate) fn take(&mut self, length: usize) -> Option<&'a [u8]> {
        let end = self.index.checked_add(length)?;
        let value = self.bytes.get(self.index..end)?;
        self.index = end;
        Some(value)
    }
}

pub(crate) struct Writer {
    bytes: Vec<u8>,
}

impl Writer {
    pub(crate) fn new() -> Self {
        Self { bytes: Vec::new() }
    }

    pub(crate) fn u8(&mut self, value: u8) {
        self.bytes.push(value);
    }

    pub(crate) fn u16(&mut self, value: u16) {
        self.bytes.extend(value.to_le_bytes());
    }

    pub(crate) fn u32(&mut self, value: u32) {
        self.bytes.extend(value.to_le_bytes());
    }

    pub(crate) fn u64(&mut self, value: u64) {
        self.bytes.extend(value.to_le_bytes());
    }

    pub(crate) fn i32(&mut self, value: i32) {
        self.bytes.extend(value.to_le_bytes());
    }

    pub(crate) fn f32(&mut self, value: f32) {
        self.bytes.extend(value.to_le_bytes());
    }

    pub(crate) fn f64(&mut self, value: f64) {
        self.bytes.extend(value.to_le_bytes());
    }

    pub(crate) fn bytes(&mut self, value: &[u8]) {
        self.bytes.extend(value);
    }

    pub(crate) fn finish(self) -> Vec<u8> {
        self.bytes
    }
}

pub(crate) fn frame(command: u8, flags: u16, payload: &[u8]) -> Option<Vec<u8>> {
    let payload_length = u32::try_from(payload.len()).ok()?;
    let mut writer = Writer::new();
    writer.u8(VERSION);
    writer.u8(command);
    writer.u16(flags);
    writer.u32(payload_length);
    writer.bytes(payload);
    Some(writer.finish())
}

pub(crate) fn parse_frame(bytes: &[u8]) -> Option<(u8, u16, &[u8])> {
    let mut reader = Reader::new(bytes);
    (reader.u8()? == VERSION).then_some(())?;
    let command = reader.u8()?;
    let flags = reader.u16()?;
    let length = usize::try_from(reader.u32()?).ok()?;
    let payload = reader.take(length)?;
    (reader.remaining() == 0).then_some((command, flags, payload))
}

#[cfg(test)]
mod tests {
    use super::{frame, parse_frame, Reader, Writer, FRAME_HEADER_BYTES};

    #[test]
    fn round_trips_little_endian_values() {
        let mut writer = Writer::new();
        writer.u8(7);
        writer.u16(513);
        writer.u32(0xfeed_beef);
        writer.f32(12.5);
        writer.f64(-0.125);
        let bytes = writer.finish();
        let mut reader = Reader::new(&bytes);
        assert_eq!(reader.u8(), Some(7));
        assert_eq!(reader.u16(), Some(513));
        assert_eq!(reader.u32(), Some(0xfeed_beef));
        assert_eq!(reader.f32(), Some(12.5));
        assert_eq!(reader.f64(), Some(-0.125));
        assert_eq!(reader.remaining(), 0);
    }

    #[test]
    fn frames_validate_version_and_length() {
        let bytes = frame(3, 5, &[1, 2, 3]).unwrap();
        assert_eq!(bytes.len(), FRAME_HEADER_BYTES + 3);
        assert_eq!(parse_frame(&bytes), Some((3, 5, &[1, 2, 3][..])));
        assert_eq!(parse_frame(&bytes[..FRAME_HEADER_BYTES]), None);
    }
}
