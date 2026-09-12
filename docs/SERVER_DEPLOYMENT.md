# M2.6 single-host operations

Target: `https://150.158.127.128/health` and `wss://150.158.127.128/ws`.
The Pages build uses that WSS endpoint. Deployment and phone acceptance remain
pending until the evidence below is updated. This is a small real-device beta;
message rate limits and application metrics remain required before broad traffic.

## Read-only audit, 2026-09-12

- SSH as `deploy`, key authentication, passwordless sudo verified. Never use a root SSH session.
- OpenCloudOS 9.4 x86_64, 2 vCPU, 1.7 GiB RAM (~1.1 GiB available), no swap.
- 40 GB XFS root disk, ~28 GB free. Node 18.20.8, Git 2.43.7, Nginx 1.26.3.
- Docker absent. Distribution repositories offer Docker CE 28.0.1 and Compose 2.32.1.
- Listeners: SSH 22, Nginx 80/443, obsolete PM2 `2048_net` on 0.0.0.0:3000.
- `8787` unused. PM2 runs `/root/2048-server/server.js`; Python runs `/root/MoneyAI_Bot.py`.
- Obsolete files: `/root/2048-server`, `/root/server.js`, `/root/MoneyAI_Bot.py`.
- `/etc/systemd/system/pm2-root.service` enabled; saved PM2 state points to absent `/root/wayfare/server.js`.
- Root cron has an obsolete `/root/wayfare/spider.py` entry and a cloud stargate entry. Preserve stargate.
- `/etc/nginx/conf.d/wayfare.conf` proxies to unused 8889; its certificate expired 2026-06-29; domain now resolves elsewhere.
- IPv4 INPUT/FORWARD/OUTPUT ACCEPT, with Tencent YJ-FIREWALL-INPUT IP blocking chain. IPv6 policies ACCEPT; NAT empty.
- Preserve Tencent agents (tat, stargate, barad, YD), cloud rc.local commands, SSH, system packages and existing cloud firewall chain.
- Cloud console firewall cannot be audited through SSH. User must allow TCP 22 (management sources), 80 and 443; remove 3000/8787 and obsolete allowances.

## Change and release discipline

All repository/config changes: branch → typecheck/tests/build/online smoke → PR →
green CI → merge → deploy main. Keep `Dockerfile.server`, `RoomManager` and
`RoomSession` as the game implementation. No alternative server.

Use a clean `/opt/doublefight` checkout owned by deploy. Before each deployment,
verify the exact merged main commit's CI is green, then run:

```sh
bash /opt/doublefight/ops/deploy-main.sh <full-main-sha-with-green-ci>
```

The script builds the existing Dockerfile before replacing the container. Compose
publishes **only 127.0.0.1:8787**, runs as node with a read-only filesystem,
512 MiB/1.5 CPU/128 PID limits, restart policy, healthcheck and bounded logs.
Do not use `docker run -p 8787:8787`. Container health does not automatically
restart an unhealthy but still-running process; inspect logs before restarting.

Bootstrap package installation uses OpenCloudOS repositories:

```sh
sudo dnf install -y docker-ce docker-ce-cli docker-compose-plugin docker-buildx-plugin python3-pip
sudo systemctl enable --now docker
sudo python3 -m venv /opt/certbot
sudo /opt/certbot/bin/pip install 'certbot>=5.4,<6'
sudo /opt/certbot/bin/certbot --version
```

## Dedicated host cleanup

After rechecking identities against the audit, stop/delete PM2 app `2048_net`,
stop its daemon and disable/remove `pm2-root.service`. Stop only the Python PID
whose argv identifies `/root/MoneyAI_Bot.py`. Remove the three obsolete paths
listed above, `/root/.pm2` after verifying no remaining apps, the Wayfare cron
line only, and the old Wayfare Nginx config and its expired certificate/key.
Do not print old app source, environment, PM2 dumps or key contents: they may
contain credentials. Never recursively delete a computed or unknown root path.

## IP TLS bootstrap and renewal

Official reference: [Let's Encrypt IP certificates with Certbot](https://letsencrypt.org/2026/03/11/shorter-certs-certbot).
Certbot >=5.4 supports IP webroot validation. IP certificates require the
`shortlived` profile (~160 hours). No DNS name or self-signed production fallback.

Install `ops/nginx.conf` as `/etc/nginx/nginx.conf`. Initially create an empty
`/etc/nginx/conf.d/doublefight-tls.conf`; keep TLS disabled until production
issuance succeeds. Create `/var/lib/letsencrypt/.well-known/acme-challenge`,
validate `sudo nginx -t`, enable/reload Nginx and externally verify an HTTP
challenge probe on port 80. Then staging first, in isolated directories:

```sh
sudo /opt/certbot/bin/certbot certonly --staging --non-interactive --agree-tos \
  --register-unsafely-without-email --required-profile shortlived \
  --webroot -w /var/lib/letsencrypt --ip-address 150.158.127.128 \
  --config-dir /var/lib/letsencrypt-staging/config \
  --work-dir /var/lib/letsencrypt-staging/work --logs-dir /var/log/letsencrypt-staging
```

After successful staging, repeat without `--staging` and without its custom
directories. Use `--cert-name 150.158.127.128`. Account registration uses no email;
the local timer/logs must be monitored. No credentials belong in this repository.

Install `ops/doublefight-tls.conf` into `/etc/nginx/conf.d/`, validate Nginx,
reload, and verify TLS with normal trust/hostname checks (never `curl -k`).
Install `ops/reload-nginx.sh` executable/root-owned at
`/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh`.
Install the two `ops/doublefight-cert-renew.*` files into `/etc/systemd/system/`:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now doublefight-cert-renew.timer
sudo /opt/certbot/bin/certbot renew --dry-run --run-deploy-hooks
sudo systemctl start doublefight-cert-renew.service
sudo systemctl list-timers doublefight-cert-renew.timer
```

The timer checks hourly (up to five minutes jitter), catches missed schedules,
and checks for at least 48 hours of certificate validity after renewal. Renewal
failure or low validity marks the service failed in systemd/journal. Operator
must monitor failures; this alone does not send off-host alerts. The deploy hook
validates and reloads Nginx only after successful renewal. Port 80 must remain
reachable for HTTP-01 validation, including on future renewals.

## Validation and rollback

```sh
curl --fail http://127.0.0.1:8787/health
# From a machine outside the server network:
curl --fail https://150.158.127.128/health
node scripts/smoke-online.mjs wss://150.158.127.128/ws
```

Smoke checks TLS, protocol v5, quick match, private room, an authoritative move,
and reconnect identity/board/sequence/deadline preservation. It creates real
temporary rooms; run only in a controlled beta window (quick match could pair
with an unrelated waiting player). It does not prove real phone network handover.

Inspect `sudo docker compose -f ops/compose.server.yml logs --tail=100` with
`DOUBLEFIGHT_RELEASE` set, `sudo ss -lntp`, Nginx logs and renewal journal.
Validate externally that 3000/8787 cannot be reached; only 22/80/443 should remain.

Keep the previous known-good main image. For rollback, from `/opt/doublefight`:

```sh
sudo env DOUBLEFIGHT_RELEASE=<previous-main-sha> docker compose -f ops/compose.server.yml up -d --no-build --wait
```

Verify health/WSS again. Config rollback uses a reviewed revert PR and green CI.
Rooms/queue are in-memory; replacing/restarting the process loses active matches
and reconnect identities. Deploy in an empty maintenance window.

## Acceptance evidence

| Check | Status |
| --- | --- |
| SSH and host audit | Passed 2026-09-12 |
| Legacy cleanup, container/local health | Pending deployment |
| IP staging then production issuance | Pending deployment |
| Trusted external HTTPS/WSS + protocol smoke | Pending deployment |
| Renewal dry run, deploy hook and active timer | Pending deployment |
| Pages build contains production WSS | Pending deployment |
| Two physical phones, different networks, quick/private match | Human test required |
| Disconnect/reconnect, Wi-Fi → 5G, background/resume | Human test required |

Do not mark M2.6 complete from automation alone.
