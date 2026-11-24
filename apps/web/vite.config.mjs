import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const workspaceFile = path => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  // GitHub Pages serves this site from a repository subpath. Relative URLs keep
  // the production build deployable there as well as from a custom domain.
  base: './',
  resolve: {
    alias: {
      '@svgnest/format-plugin': workspaceFile('../../packages/plugins/format/src/index.ts'),
      '@svgnest/ai-format-plugin': workspaceFile('../../packages/plugins/ai/adapter/src/index.ts'),
      '@svgnest/dxf-format-plugin': workspaceFile('../../packages/plugins/dxf/adapter/src/index.ts'),
      '@svgnest/svg-format-plugin': workspaceFile('../../packages/plugins/svg/adapter/src/index.ts')
    }
  },
  esbuild: {
    jsx: 'automatic',
    jsxInject: "import React from 'react'"
  }
});
