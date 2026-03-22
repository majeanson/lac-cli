import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts'],
  format: 'esm',
  dts: true,
  shims: true,
  outDir: 'dist',
  noExternal: ['@life-as-code/feature-schema'],
})
