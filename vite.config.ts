import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  worker:{
    format: "es"
  },
  optimizeDeps: {
    include: [],
  },
  build: {
    commonjsOptions: {
      include: [/@fontsource\/.*/, 'node_modules/**'],
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@import "@fontsource/fira-code/index.css";`,
      },
    },
  },
  assetsInclude: ['**/*.scad'], // Add this line
})
