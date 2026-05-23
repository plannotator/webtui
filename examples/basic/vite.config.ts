import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '../..')

export default defineConfig({
  root: here,
  plugins: [react()],
  resolve: {
    alias: [
      { find: 'webtui/browser', replacement: resolve(packageRoot, 'src/browser/index.ts') },
      { find: 'webtui/react', replacement: resolve(packageRoot, 'src/react/index.ts') },
      { find: 'webtui/styles.css', replacement: resolve(packageRoot, 'src/react/webtui.css') },
      { find: /^webtui$/, replacement: resolve(packageRoot, 'src/core/index.ts') }
    ]
  },
  build: {
    outDir: resolve(packageRoot, 'dist-example'),
    emptyOutDir: true
  }
})
