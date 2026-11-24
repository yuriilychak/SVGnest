import { readFile, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { PolygonPack, NodeSingleThreadNestingExecutor, NodeWorkerNestingExecutor } from '@svgnest/polygon-pack/node';

const usage = 'Usage: npm --workspace @svgnest/node start -- <input.{svg,ai,dxf}> --bin <source> --out <output> --iterations <count> [--config config.json] [--curve-tolerance n] [--spacing n] [--rotations n] [--population-size n] [--mutation-rate n] [--use-holes] [--single-thread]';
const args = process.argv.slice(2);
const inputPath = args.find(value => !value.startsWith('-'));
const option = (name: string) => {
	const index = args.indexOf(name);
	return index < 0 ? undefined : args[index + 1];
};
if (!inputPath || !option('--bin') || !option('--out') || !option('--iterations')) {
	throw new Error(usage);
}

const binSource = Number(option('--bin'));
const iterationLimit = Number(option('--iterations'));
if (!Number.isSafeInteger(binSource) || binSource < 0 || !Number.isSafeInteger(iterationLimit) || iterationLimit <= 0) {
	throw new Error(usage);
}

const fileConfig = await loadConfig(option('--config'));
const config = nestingConfig(fileConfig);
const plugin = await loadPlugin(extname(inputPath).toLowerCase());
const input = new Uint8Array(await readFile(resolve(inputPath)));
const polygons = await plugin.inputToPolygons(input, config);
if (!polygons.value.sources.includes(binSource)) {
	throw new Error(`Source ${binSource} cannot be used as a bin`);
}

const singleThread = args.includes('--single-thread');
const pack = new PolygonPack(() => singleThread
	? new NodeSingleThreadNestingExecutor()
	: new NodeWorkerNestingExecutor());
let best: any;
let iterations = 0;
let finish!: () => void;
const finished = new Promise<void>(resolve => { finish = resolve; });
const started = pack.start(
	config,
	polygons.value.polygons,
	binSource,
	() => {},
	result => {
		if (result) best = result;
		if (++iterations >= iterationLimit) finish();
	},
	'main-thread',
);
if (!started) throw new Error('Unable to start nesting');
await finished;
pack.stop();
const context = pack.placementContext;
pack.terminate();
if (!best || !context) {
	throw new Error('No placement was produced; increase --iterations or select a different bin');
}

const output = await plugin.outputToData(input, {
	placements: best.placements,
	tree: context.tree,
	binBounds: context.binBounds,
	binSource,
});
const bytes = output.value instanceof Uint8Array
	? output.value
	: new TextEncoder().encode(output.value.documents[0] ?? '');
await writeFile(resolve(option('--out')!), bytes);
console.log(`Wrote ${option('--out')} (${best.placedCount}/${best.partCount} parts placed after ${iterations} iterations).`);

async function loadPlugin(extension: string): Promise<any> {
	switch (extension) {
		case '.svg':
			return (await import('@svgnest/svg-format-plugin/node')).loadSvgFormatPlugin();
		case '.ai':
			return (await import('@svgnest/ai-format-plugin/node')).loadAiFormatPlugin();
		case '.dxf':
			return (await import('@svgnest/dxf-format-plugin/node')).loadDxfFormatPlugin();
		default:
			throw new Error(`Unsupported input extension ${extension}. ${usage}`);
	}
}

async function loadConfig(path: string | undefined): Promise<Record<string, unknown>> {
	if (!path) return {};
	try {
		const value: unknown = JSON.parse(await readFile(resolve(path), 'utf8'));
		if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Configuration must be a JSON object');
		return value as Record<string, unknown>;
	} catch (error) {
		throw new Error(`Unable to read --config ${path}: ${String(error)}`);
	}
}

function nestingConfig(file: Record<string, unknown>) {
	const number = (flag: string, key: string, fallback: number) => {
		const value = option(flag) ?? file[key] ?? fallback;
		const parsed = Number(value);
		if (!Number.isFinite(parsed)) throw new Error(`${flag} must be a finite number`);
		return parsed;
	};
	const integer = (flag: string, key: string, fallback: number) => {
		const value = number(flag, key, fallback);
		if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${flag} must be a positive integer`);
		return value;
	};
	const useHoles = args.includes('--use-holes') ? true : args.includes('--no-use-holes') ? false : Boolean(file.useHoles ?? false);
	return {
		curveTolerance: number('--curve-tolerance', 'curveTolerance', 0.3),
		spacing: number('--spacing', 'spacing', 0),
		rotations: integer('--rotations', 'rotations', 4),
		populationSize: integer('--population-size', 'populationSize', 10),
		mutationRate: integer('--mutation-rate', 'mutationRate', 10),
		useHoles,
	};
}
