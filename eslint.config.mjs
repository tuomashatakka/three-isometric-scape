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

  {
    // `config.ts` is the scape's schema *and* its manual: two and a half
    // thousand lines of which roughly two thirds is the prose explaining what
    // each knob does and why it is the number it is. Splitting it at the obvious
    // seam — the interface in one file and the defaults in another — would put a
    // knob and its reason on two sides of an import, which is how the two drift
    // apart. So the ceiling is raised for this one file rather than the document
    // being broken up.
    //
    // Raised once, from 800, by the section the far squall added. The run after
    // that named what would happen when it ran out — a *per-section* seam, each
    // slice carrying its own part of the interface and the defaults that go with
    // it — and the run that added the seals is where it ran out. So the number
    // has not moved a second time. `config-guard.ts` is the first slice, and the
    // seam it draws is the one the rest of the document follows when it needs
    // to: a subject at a time, schema and numbers together, spread back into
    // `SCAPE_CONFIG` here.
    //
    // `error` rather than `warn` because `lint` runs `--max-warnings 0`, so a
    // warning here would fail the gate exactly like an error while reading as
    // though it were advisory. Still a real ceiling, just a higher one.
    files: [ 'src/scene/config.ts' ],

    rules: {
      'max-lines': [ 'error', { max: 850, skipComments: true, skipBlankLines: true }],
    },
  },
]
