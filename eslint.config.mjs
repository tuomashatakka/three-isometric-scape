import config from '@tuomashatakka/eslint-config'


export default [
  {
    // `.scape/` holds captured stills, diffs and the worktree `scape:diff`
    // builds a reference in — generated output, and one of those checkouts is
    // an entire second copy of this repository.
    ignores: [ 'dist/**', '.scape/**' ],
  },
  ...config,
]
