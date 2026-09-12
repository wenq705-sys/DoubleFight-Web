#!/bin/bash
set -euo pipefail
expected_release="${1:?Pass the full main SHA whose CI was verified green}"
cd /opt/doublefight
test "$(git branch --show-current)" = main
test -z "$(git status --porcelain)"
git fetch origin main
git merge --ff-only origin/main
export DOUBLEFIGHT_RELEASE="$(git rev-parse HEAD)"
test "$DOUBLEFIGHT_RELEASE" = "$(git rev-parse origin/main)"
test "$DOUBLEFIGHT_RELEASE" = "$expected_release"
sudo env DOUBLEFIGHT_RELEASE="$DOUBLEFIGHT_RELEASE" docker compose -f ops/compose.server.yml build --pull
sudo env DOUBLEFIGHT_RELEASE="$DOUBLEFIGHT_RELEASE" docker compose -f ops/compose.server.yml up -d --no-build --wait --wait-timeout 90
curl --fail --silent --show-error http://127.0.0.1:8787/health
printf '\nDeployed main %s\n' "$DOUBLEFIGHT_RELEASE"
