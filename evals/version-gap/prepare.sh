#!/usr/bin/env bash
# Builds the inputs every run reuses, into a cache directory outside this repository.
#
#   evals/version-gap/prepare.sh <cache-dir> <docs-checkout> <python-sdk-checkout>
#
# <docs-checkout> is a zoowork-agents-docs clone and <python-sdk-checkout> a zoowork-sdk-python
# clone; both must have the refs below fetched. Nothing here calls a ZooWork API.
set -euo pipefail

CACHE=$(mkdir -p "$1" && cd "$1" && pwd)
DOCS_REPO=$(cd "$2" && pwd)
PY_REPO=$(cd "$3" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)

# The docs the "current" arms read: the published site at the time of the run.
DOCS_CURRENT_REF=${DOCS_CURRENT_REF:-origin/main}
# The docs as they stood when TypeScript SDK 0.10.2 and Python SDK 0.5.2 were published
# (2026-10-03 16:55 UTC). The "bundled-docs" arm ships this snapshot inside the package.
DOCS_SNAPSHOT_REF=${DOCS_SNAPSHOT_REF:-bc6f4cc}
PY_TAG=${PY_TAG:-v0.5.2}

build_docs() { # <name> <ref> [annotate]
  local dir="$CACHE/src-$1"
  rm -rf "$dir" "$CACHE/docs-$1"
  git -C "$DOCS_REPO" worktree remove --force "$dir" 2>/dev/null || true
  git -C "$DOCS_REPO" worktree add --detach "$dir" "$2" >/dev/null
  if [ "${3:-}" = annotate ]; then python3 "$HERE/arms/annotate-docs.py" "$dir"; fi
  (cd "$dir" && pnpm install --frozen-lockfile >/dev/null && pnpm build >/dev/null)
  cp -R "$dir/dist" "$CACHE/docs-$1"
  git -C "$DOCS_REPO" worktree remove --force "$dir"
  echo "docs-$1: $(git -C "$DOCS_REPO" rev-parse --short "$2")"
}

build_docs current "$DOCS_CURRENT_REF"
build_docs annotated "$DOCS_CURRENT_REF" annotate
build_docs snapshot "$DOCS_SNAPSHOT_REF"

# TypeScript fixture with its pinned dependencies installed once.
rm -rf "$CACHE/ts-template"
cp -R "$HERE/fixtures/ts" "$CACHE/ts-template"
rm -rf "$CACHE/ts-template/node_modules"
(cd "$CACHE/ts-template" && npm ci --silent >/dev/null)
echo "ts-template: @zoowork-ai/sdk $(node -p "require('$CACHE/ts-template/node_modules/@zoowork-ai/sdk/package.json').version")"

# The Python wheel does not ship a CHANGELOG; the package-agents-md arm adds the one released with
# the pinned version, the way a future wheel would carry it.
git -C "$PY_REPO" show "$PY_TAG:CHANGELOG.md" > "$CACHE/py-CHANGELOG.md"
echo "py-CHANGELOG: $PY_TAG"
