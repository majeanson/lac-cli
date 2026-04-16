import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: './src/index.ts' },
  format: 'esm',
  dts: true,
  outDir: 'dist',
  // Keep react/react-dom as peer deps — don't bundle them
  external: ['react', 'react-dom', 'react/jsx-runtime'],
})
