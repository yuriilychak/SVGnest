import assert from 'node:assert/strict';
import test from 'node:test';
import { BinaryReader, BinaryWriter, decodeFrame, encodeFrame } from '../src/binary-codec.ts';

test('round-trips typed little-endian binary values', () => {
	const bytes = new BinaryWriter().u8(7).u16(513).u32(0xfeed_beef).f32(12.5).f64(-0.125).finish();
	const reader = new BinaryReader(bytes);
	assert.equal(reader.u8(), 7);
	assert.equal(reader.u16(), 513);
	assert.equal(reader.u32(), 0xfeed_beef);
	assert.equal(reader.f32(), 12.5);
	assert.equal(reader.f64(), -0.125);
	assert.equal(reader.remaining, 0);
});

test('rejects malformed frames', () => {
	assert.throws(() => decodeFrame(new Uint8Array()));
	assert.throws(() => decodeFrame(new Uint8Array([2, 1, 0, 0, 4, 0, 0, 0])));
});

test('round-trips framed payloads', () => {
	const frame = encodeFrame(3, 5, new Uint8Array([1, 2, 3]));
	assert.deepEqual(decodeFrame(frame), { command: 3, flags: 5, payload: new Uint8Array([1, 2, 3]) });
});
