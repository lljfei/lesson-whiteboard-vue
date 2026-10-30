import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({ plugins: [vue()], base: './', build: { outDir: 'example-dist', rollupOptions: { input: ['index.html', 'office.html', 'teaching.html'] } } })
