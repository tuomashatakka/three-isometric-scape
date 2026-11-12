#!/bin/bash
# SessionStart hook for Claude Code cloud sessions (the scheduled scene
# enhancement run). Installs dependencies when the lockfile changed, then prints
# the run card: the commands a run needs and the state of the repository, so the
# session starts with them in context instead of rediscovering them.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# Install only if a file that decides what gets installed has changed.
hashes=node_modules/.session-start.sha256
if ! sha256sum --check --status "$hashes" 2>/dev/null; then
  rm -f "$hashes"
  bun install --frozen-lockfile >/dev/null
  sha256sum .claude/hooks/session-start.sh package.json bun.lock > "$hashes" || rm -f "$hashes"
fi

cat <<'CARD'
== three-iso run card (from .claude/hooks/session-start.sh) ==

read first   instructions.md (the brief) · agents.md (every tool and trap) · .claude/skills/scape-*
start        bun run setup                      chromium check, api digest, prewarm origin/main for scape:diff, brief
             bun run brief                      inventory, recent themes, map stats, readme sections
             bun run assets [filter] [--kit]    asset catalog: props, shared kit helpers, textures (no gpu)
look         bun run studio serve               (background; wait for "studio ready"), then:
             bun run studio shot --poses tour --census      default near far noon night winter
             bun run studio shot --poses fog|coast|<set>    named sets in scripts/scape-poses*.ts
             bun run studio shot --zoom 60 --time 0.3 --set <config.path>=<v> --name x [--tier desktop]
             bun run studio probe x y · studio census · studio eval "<expr>" · studio stop
no gpu       bun run scape:map --stats          the world model as numbers / ascii
             bun run prop:map <name> --view front,right [--audit] · bun run prop:audit
measure      bun run scape:bench                first-load cpu cost
             bun run scape:diff --ref origin/main --poses tour   pixel table vs main (once, at the end)
verify       bun run gate                       light: lint, typecheck, changed tests, build, prop audit
             bun run gate --full                what CI runs — before merging
             bun test <file> · bunx eslint --fix <file>
pages        bun run dev → :4174  /  (the scape)  ·  /props.html (asset catalog; linked from the card)
rules        one rendering theme + one refactor per run · every tier must run · deterministic · 666 lines a file
             announce title + tasks before building · changelog entry · pr → green checks → squash-merge
traps        studio opens on the mobile tier · one software-rendered browser at a time · desktop shots take ~50 s

CARD

# The live state: inventory, recent themes, the survey. Never fails the hook.
bun scripts/brief.ts 2>/dev/null | sed -n '/^brief/,/^readme/p' | sed '$d' || echo "brief unavailable — run: bun run brief"
bun scripts/assets.ts --json 2>/dev/null \
  | bun -e 'const c = JSON.parse(await Bun.stdin.text()); console.log(`assets      ${c.props.length} props · ${c.kit.length} kit helpers · ${c.textures.length} textures — bun run assets`)' \
  || true
echo "git         $(git rev-parse --abbrev-ref HEAD) @ $(git log -1 --format='%h %s' | cut -c1-90)"
