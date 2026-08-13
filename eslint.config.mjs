import config from '@tuomashatakka/eslint-config'


export default [
  {
    // Device-bisect snapshots keep their Vite bundles under `public/*/assets`.
    // They are committed output, not source; lint the probe and snapshot shells,
    // but do not parse the same minified bundle once per experiment.
    ignores: [ 'dist/**', 'public/*/assets/**' ],
  },
  ...config,
]
