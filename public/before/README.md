# /before — a built snapshot, deliberately committed

This is the compiled output of `269e10f` ("a boat harbour on the shore"), the last commit
**before** `01160af` reworked what the mobile tier means. It is checked in as a build artifact,
which is normally the wrong thing to do, for one reason: the phone that loses its WebGL context
is the only place the bug exists, and the reader reports that the scape ran there on full
graphics before. Two urls on one deploy is the only way to test that claim on the device
itself rather than reason about it from a diff.

- `/` — current head
- `/before/` — this snapshot

It predates `ui/diagnostics.ts`, so it prints no log. That is fine: the question it answers is
binary. If this one runs and head does not, the regression is somewhere in the eleven commits
between them and can be bisected. If both fail, "before" means something earlier and the search
moves with it.

**Delete this directory once the regression is found.** It is 724 KB of duplicated bundle and
it has no reason to outlive the answer.
