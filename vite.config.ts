import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    copyPublicDir: false,
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'index', cssFileName: 'style' },
    rollupOptions: {
      external: (id) => /^(vue|konva|vue-konva|docx-preview|@aiden0z\/pptx-renderer)(\/|$)/.test(id)
    }
  }
})
