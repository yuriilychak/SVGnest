import { readdir, rm } from 'node:fs/promises';

const packageDirectory = new URL('../pkg/', import.meta.url);

for (const entry of await readdir(packageDirectory, { withFileTypes: true })) {
	if (entry.isFile() && entry.name !== 'polygon_pack_core_bg.wasm') {
		await rm(new URL(entry.name, packageDirectory));
	}
}
