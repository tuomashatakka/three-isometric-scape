import config from '@tuomashatakka/eslint-config'


export default [
  {
    // `.scape/` holds captured stills, diffs and the worktree `scape:diff`
    // builds a reference in — generated output, and one of those checkouts is
    // an entire second copy of this repository.
    ignores: [ 'dist/**', '.scape/**' ],
  },
  ...config,
  {
    // Three house rules that were prose until now. Prose is checked by whoever
    // remembers to check it; these are checked by the `--fix` pass every change
    // already runs through, which is the difference between a rule and a hope.
    files:   [ 'src/**/*.ts' ],
    ignores: [ 'src/**/*.test.ts' ],

    rules: {
      'no-restricted-syntax': [ 'error',
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message:  'the scape is deterministic: fork the seeded rng instead (rng.fork(name)), so adding one prop does not reshuffle every prop built after it',
        },
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message:  'wall time makes a capture irreproducible: take the elapsed time from the frame (frame.delta / frame.elapsed), or performance.now() if this is a measurement rather than a clock',
        },
        {
          selector: "Identifier[name='requestAnimationFrame']",
          message:  'createApp owns the only render loop: animate in a module update hook rather than starting a second one',
        },
      ],
    },
  },
]
