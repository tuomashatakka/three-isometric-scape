import config from '@tuomashatakka/eslint-config'


export default [
  {
    // `public/before` is a committed build snapshot for a device A/B, not source
    // — linting a minified bundle buries the real output under 78k warnings.
    ignores: [ 'dist/**', 'public/before/**' ],
  },
  ...config,
]
