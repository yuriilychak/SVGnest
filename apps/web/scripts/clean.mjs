import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)));
rmSync(resolve(appDirectory, 'dist'), { recursive: true, force: true });
