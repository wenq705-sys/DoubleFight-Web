# Douyin RC operator deployment (after approval)

This runbook is preparatory. Do not deploy from the RC branch or CI. Merge only an approved, green PR to `main`; record its full SHA as `RELEASE_SHA`. Keep provider and signing secrets in an operator-managed file outside Git, never in terminal output, chat or logs. The existing `doublefight-data` Docker volume contains durable accounts: do not delete it or run `docker compose down -v`.

1. On the local DoubleFight-Web checkout, fetch approved `main`, verify its SHA, then create `git bundle create doublefight-rc.bundle origin/main`. Use SCP over the existing deploy-user SSH key to upload it as `/tmp/doublefight-rc.bundle`. The production server must not fetch GitHub HTTPS.
2. On `deploy@150.158.127.128`, in `/opt/doublefight`, require empty `git status --porcelain`. Fetch from `/tmp/doublefight-rc.bundle` into `refs/remotes/offline/main`, `git checkout main`, and `git merge --ff-only "$RELEASE_SHA"`. Require `git rev-parse HEAD` to equal `RELEASE_SHA`; stop on any mismatch.

   ```bash
   cd /opt/doublefight
   test -z "$(git status --porcelain)"
   git fetch /tmp/doublefight-rc.bundle refs/remotes/origin/main:refs/remotes/offline/main
   git checkout main
   git merge --ff-only "$RELEASE_SHA"
   test "$(git rev-parse HEAD)" = "$RELEASE_SHA"
   ```
3. The operator prepares `/etc/doublefight/server.env` outside the repository with restricted permissions. It supplies `DOUYIN_APP_ID` matching the release project, `DOUYIN_APP_SECRET`, a random `DOUBLEFIGHT_SESSION_SECRET` of at least 32 bytes, and optionally `DOUBLEFIGHT_SESSION_SECRET_PREVIOUS` of at least 32 bytes. Do not print this file or run `docker compose config` without redacting secrets. `npm run check:production-env` validates these categories in an admin environment with dependencies; the live `/ready` check validates writable container storage.
4. Confirm the named `doublefight-data` volume exists. With `DOUBLEFIGHT_RELEASE="$RELEASE_SHA"`, run `sudo env DOUBLEFIGHT_RELEASE="$DOUBLEFIGHT_RELEASE" docker compose --env-file /etc/doublefight/server.env -f ops/compose.server.yml build --pull`, then the same Compose invocation with `up -d --no-build --wait --wait-timeout 90`. Never use `-v` volume removal. Require Docker `healthy`, HEAD exact SHA, and port 8787 bound only to `127.0.0.1`.
5. Install only the reviewed `ops/doublefight-tls.conf` at `/etc/nginx/conf.d/doublefight-tls.conf`, run `sudo nginx -t`, then `sudo systemctl reload nginx`. Confirm the TLS chain and certificate name with `openssl s_client -connect game.whvwayfare.online:443 -servername game.whvwayfare.online -verify_return_error </dev/null`; confirm the certificate renewal timer remains active. Keep only 22/80/443 public.
6. Require local and public `GET /health` to stay HTTP 200 with Protocol v6. Require public `GET https://game.whvwayfare.online/ready` HTTP 200 with `authConfigured`, `sessionSigningConfigured`, and `dataDirectoryWritable` all true; it must show no values. If not ready, stop acceptance while guest Browser PvP remains available.
7. From the reviewed local `main`, run `node scripts/smoke-online.mjs wss://game.whvwayfare.online/ws`; it covers quick, private and reconnect. Run `npm run smoke:auth` with its mock provider for code regression. Verify actual account exchange and `/me` from a real Douyin client, not by pasting a one-use login code or bearer into a shell, issue or log. Check server logs for safe event categories only.
8. Build `npm run build:douyin:release`, run `npm run preflight:douyin`, and upload `platform/douyin/dist-release` in Douyin IDE. Formal request/socket legal domains must include `game.whvwayfare.online`; development bypass is prohibited. Execute every row in `docs/DOUYIN_RC_DEVICE_ACCEPTANCE.md` on real devices and mark PASS/FAIL with redacted evidence.

The rollout is accepted only when `/ready`, public WSS, real provider account restoration, legal-domain behavior and the complete device matrix pass. A failure stops the rollout; retain the existing data volume and inspect safe logs before an operator-approved rollback.
