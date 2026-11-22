import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const workspaceFile = path => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@svgnest/format-plugin': workspaceFile('../../packages/format-plugin/src/index.ts'),
      '@svgnest/svg-format-plugin': workspaceFile('../../packages/svg-format-plugin/src/index.ts')
    }
  },
  esbuild: {
    jsx: 'automatic',
    jsxInject: "import React from 'react'"
  }
});
