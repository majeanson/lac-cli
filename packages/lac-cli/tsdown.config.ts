import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: { index: './src/index.ts' },
    format: 'esm',
    dts: true,
    shims: true,
    outDir: 'dist',
    noExternal: ['@life-as-code/feature-schema', '@life-as-code/lac-claude'],
  },
  {
    entry: { lsp: '../lac-lsp/src/index.ts' },
    format: 'esm',
    dts: false,
    shims: true,
    outDir: 'dist',
    noExternal: ['chokidar'],
  },
  {
    entry: { mcp: '../lac-mcp/src/index.ts' },
    format: 'esm',
    dts: false,
    shims: true,
    outDir: 'dist',
    noExternal: [
      '@modelcontextprotocol/sdk',
      '@life-as-code/lac-claude',
      '@life-as-code/feature-schema',
    ],
  },
])
