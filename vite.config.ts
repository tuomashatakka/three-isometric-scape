import { defineConfig } from 'vite'


export default defineConfig({
  base:   './',
  server: {
    port:       4174,
    strictPort: true,
  },
  preview: {
    port:       4174,
    strictPort: true,
  },
})
