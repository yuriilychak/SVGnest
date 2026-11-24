export const BINARY_PROTOCOL_VERSION = 2;
export const BINARY_FRAME_HEADER_BYTES = 8;

export interface BinaryFrame {
	command: number;
	flags: number;
	payload: Uint8Array;
}

export class BinaryWriter {
	#bytes: Uint8Array;
	#view: DataView;
	#offset = 0;

	constructor(capacity = 64) {
		this.#bytes = new Uint8Array(capacity);
		this.#view = new DataView(this.#bytes.buffer);
	}

	get length(): number {
		return this.#offset;
	}

	u8(value: number): this {
		this.#ensure(1);
		this.#view.setUint8(this.#offset, value);
		this.#offset += 1;
		return this;
	}

	u16(value: number): this {
		this.#ensure(2);
		this.#view.setUint16(this.#offset, value, true);
		this.#offset += 2;
		return this;
	}

	u32(value: number): this {
		this.#ensure(4);
		this.#view.setUint32(this.#offset, value, true);
		this.#offset += 4;
		return this;
	}

	i32(value: number): this {
		this.#ensure(4);
		this.#view.setInt32(this.#offset, value, true);
		this.#offset += 4;
		return this;
	}

	f32(value: number): this {
		this.#ensure(4);
		this.#view.setFloat32(this.#offset, value, true);
		this.#offset += 4;
		return this;
	}

	f64(value: number): this {
		this.#ensure(8);
		this.#view.setFloat64(this.#offset, value, true);
		this.#offset += 8;
		return this;
	}

	bytes(value: Uint8Array): this {
		this.#ensure(value.byteLength);
		this.#bytes.set(value, this.#offset);
		this.#offset += value.byteLength;
		return this;
	}

	finish(): Uint8Array {
		return this.#bytes.slice(0, this.#offset);
	}

	#ensure(length: number): void {
		const required = this.#offset + length;
		if (required <= this.#bytes.byteLength) return;
		const bytes = new Uint8Array(Math.max(required, this.#bytes.byteLength * 2));
		bytes.set(this.#bytes);
		this.#bytes = bytes;
		this.#view = new DataView(bytes.buffer);
	}
}

export class BinaryReader {
	#view: DataView;
	#bytes: Uint8Array;
	#offset = 0;

	constructor(bytes: Uint8Array) {
		this.#bytes = bytes;
		this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	}

	get remaining(): number {
		return this.#bytes.byteLength - this.#offset;
	}

	u8(): number { this.#require(1); return this.#view.getUint8(this.#offset++); }
	u16(): number { this.#require(2); const value = this.#view.getUint16(this.#offset, true); this.#offset += 2; return value; }
	u32(): number { this.#require(4); const value = this.#view.getUint32(this.#offset, true); this.#offset += 4; return value; }
	i32(): number { this.#require(4); const value = this.#view.getInt32(this.#offset, true); this.#offset += 4; return value; }
	f32(): number { this.#require(4); const value = this.#view.getFloat32(this.#offset, true); this.#offset += 4; return value; }
	f64(): number { this.#require(8); const value = this.#view.getFloat64(this.#offset, true); this.#offset += 8; return value; }

	bytes(length: number): Uint8Array {
		if (!Number.isSafeInteger(length) || length < 0) throw new Error('Invalid binary byte length');
		this.#require(length);
		const value = this.#bytes.subarray(this.#offset, this.#offset + length);
		this.#offset += length;
		return value;
	}

	#require(length: number): void {
		if (length > this.remaining) throw new Error('Truncated binary payload');
	}
}

export function encodeFrame(command: number, flags: number, payload: Uint8Array): Uint8Array {
	return new BinaryWriter(BINARY_FRAME_HEADER_BYTES + payload.byteLength)
		.u8(BINARY_PROTOCOL_VERSION).u8(command).u16(flags).u32(payload.byteLength).bytes(payload).finish();
}

export function decodeFrame(bytes: Uint8Array): BinaryFrame {
	const reader = new BinaryReader(bytes);
	if (reader.u8() !== BINARY_PROTOCOL_VERSION) throw new Error('Unsupported binary protocol version');
	const command = reader.u8();
	const flags = reader.u16();
	const payload = reader.bytes(reader.u32());
	if (reader.remaining !== 0) throw new Error('Unexpected binary frame suffix');
	return { command, flags, payload };
}
