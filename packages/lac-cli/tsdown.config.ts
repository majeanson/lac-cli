import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: { index: './src/index.ts' },
    format: 'esm',
    dts: true,
    shims: true,
    outDir: 'dist',
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
    noExternal: ['@modelcontextprotocol/sdk'],
  },
])
