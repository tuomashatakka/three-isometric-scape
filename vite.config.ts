import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'


const entry = (name: string): string => fileURLToPath(new URL(name, import.meta.url))

export default defineConfig({
  base: './',

  // Two pages, not one app with a route. The prop preview imports the roster
  // and nothing else from the scene, so keeping it a separate entry keeps that
  // true — it stays loadable exactly when the scape itself is what is broken,
  // and none of its editor chrome ships in the scape's bundle.
  build: {
    rollupOptions: {
      input: {
        main:  entry('index.html'),
        props: entry('props.html'),
      },

      // three and the scene library are shared by both entries, so they get a
      // chunk that says so. Left to itself the bundler hoists them into
      // whichever entry it reached first and names the result after it — which
      // puts a chunk called `props` on the scape's critical path, and sends
      // anyone reading a network tab looking for a bug that is not there.
      output: {
        manualChunks: (id: string): string | undefined =>
          id.includes('node_modules') ? 'vendor' : undefined,
      },
    },
  },

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
