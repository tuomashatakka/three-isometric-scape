import { defineConfig } from 'vite'


export default defineConfig({
  base: './',

  // A stamp for the build, so anything the app remembers about a device can be
  // thrown away when the thing it remembered is no longer what ships. The tier
  // memory is the only reader: a deploy that changes what a tier costs must not
  // inherit a verdict reached about the old one.
  define: { __SCAPE_BUILD__: JSON.stringify(new Date().toISOString()) },
  server: {
    port:       4174,
    strictPort: true,
  },
  preview: {
    port:       4174,
    strictPort: true,
  },
})
