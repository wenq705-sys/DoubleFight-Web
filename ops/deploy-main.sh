#!/bin/bash
set -euo pipefail
expected_release="${1:?Pass the full main SHA whose CI was verified green}"
env_file="/etc/doublefight/server.env"
cd /opt/doublefight
test "$(git branch --show-current)" = main
test -z "$(git status --porcelain)"
sudo test -r "$env_file"
export DOUBLEFIGHT_RELEASE="$(git rev-parse HEAD)"
test "$DOUBLEFIGHT_RELEASE" = "$expected_release"
sudo env DOUBLEFIGHT_RELEASE="$DOUBLEFIGHT_RELEASE" docker compose --env-file "$env_file" -f ops/compose.server.yml build --pull
sudo env DOUBLEFIGHT_RELEASE="$DOUBLEFIGHT_RELEASE" docker compose --env-file "$env_file" -f ops/compose.server.yml up -d --no-build --wait --wait-timeout 90
curl --fail --silent --show-error http://127.0.0.1:8787/health
curl --fail --silent --show-error http://127.0.0.1:8787/ready
printf '\nDeployed main %s\n' "$DOUBLEFIGHT_RELEASE"
