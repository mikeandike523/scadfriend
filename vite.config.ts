import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const writeVmDebugEnv = process.env.WRITE_VM_DEBUG ?? "";
const writeVmDebugEnabled = /^(1|true|yes|on)$/i.test(writeVmDebugEnv);

export default defineConfig({
  plugins: [react()],
  define: {
    __WRITE_VM_DEBUG__: writeVmDebugEnabled,
  },
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
