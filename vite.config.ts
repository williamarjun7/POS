/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { boneyardPlugin } from 'boneyard-js/vite'
import visualizer from 'rollup-plugin-visualizer'

const isBundleAnalysis = process.env.ANALYZE_BUNDLE === 'true'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
  plugins: [
    react(),
    boneyardPlugin({ out: './src/bones', wait: 500 }),
    // Bundle analysis — run with: ANALYZE_BUNDLE=true npm run build
    ...(isBundleAnalysis
      ? [
          visualizer({
            filename: 'dist/bundle-report.html',
            open: true,
            gzipSize: true,
            brotliSize: true,
            template: 'treemap', // 'sunburst' | 'treemap' | 'network'
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    watch: {
      ignored: ['**/src/bones/**'],
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router')) {
            return 'vendor'
          }
          if (id.includes('node_modules/recharts')) {
            return 'recharts'
          }
          if (id.includes('node_modules/framer-motion')) {
            return 'animations'
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'icons'
          }
          if (id.includes('node_modules/@tanstack/react-query')) {
            return 'query'
          }
        },
      },
    },
    // Report build sizes
    reportCompressedSize: true,
  },
})
