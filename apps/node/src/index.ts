import { readFile, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { PolygonPack, NodeSingleThreadNestingExecutor, NodeWorkerNestingExecutor } from '@svgnest/polygon-pack/node';

const usage = 'Usage: npm --workspace @svgnest/node start -- <input.{svg,ai,dxf}> --bin <source> --out <output> --iterations <count> [--single-thread]';
const args = process.argv.slice(2); const inputPath = args.find(value => !value.startsWith('-'));
const option = (name: string) => args[args.indexOf(name) + 1];
if (!inputPath || !option('--bin') || !option('--out') || !option('--iterations')) throw new Error(usage);
const binSource = Number(option('--bin')); const iterationLimit = Number(option('--iterations'));
if (!Number.isSafeInteger(binSource) || binSource < 0 || !Number.isSafeInteger(iterationLimit) || iterationLimit <= 0) throw new Error(usage);
const plugin = await loadPlugin(extname(inputPath).toLowerCase());
const input = new Uint8Array(await readFile(resolve(inputPath)));
const config = { curveTolerance: 0.3, spacing: 0, rotations: 4, populationSize: 10, mutationRate: 10, useHoles: false };
const polygons = await plugin.inputToPolygons(input, config);
if (!polygons.value.sources.includes(binSource)) throw new Error(`Source ${binSource} cannot be used as a bin`);
const singleThread = args.includes('--single-thread');
const pack = new PolygonPack(() => singleThread ? new NodeSingleThreadNestingExecutor() : new NodeWorkerNestingExecutor());
let best: any; let iterations = 0; let finish!: () => void;
const finished = new Promise<void>(resolve => { finish = resolve; });
if (!pack.start(config, polygons.value.polygons, binSource, () => {}, result => { if (result) best = result; if (++iterations >= iterationLimit) finish(); }, 'main-thread')) throw new Error('Unable to start nesting');
await finished;
pack.stop(); const context = pack.placementContext; pack.terminate();
if (!best || !context) throw new Error('No placement was produced; increase --iterations or select a different bin');
const output = await plugin.outputToData(input, { placements: best.placements, tree: context.tree, binBounds: context.binBounds, binSource });
const bytes = output.value instanceof Uint8Array ? output.value : new TextEncoder().encode(output.value.documents[0] ?? '');
await writeFile(resolve(option('--out')!), bytes);
console.log(`Wrote ${option('--out')} (${best.placedCount}/${best.partCount} parts placed after ${iterations} iterations).`);

async function loadPlugin(extension: string): Promise<any> {
	if (extension === '.svg') return (await import('@svgnest/svg-format-plugin/node')).loadSvgFormatPlugin();
	if (extension === '.ai') return (await import('@svgnest/ai-format-plugin/node')).loadAiFormatPlugin();
	if (extension === '.dxf') return (await import('@svgnest/dxf-format-plugin/node')).loadDxfFormatPlugin();
	throw new Error(`Unsupported input extension ${extension}. ${usage}`);
}
