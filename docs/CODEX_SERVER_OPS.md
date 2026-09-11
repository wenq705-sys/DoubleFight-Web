# Codex Server Ops Handoff

## Purpose

This document is the bootstrap contract for a dedicated Codex workspace that owns **Double Fight server deployment and operations**.

Do not fork gameplay rules. Work from the same repository and reuse the existing server architecture.

## Read first

Before any server edit or deployment, read:

1. `AGENTS.md`
2. `docs/HANDOFF.md`
3. `docs/ARCHITECTURE.md`
4. `docs/GAME_DESIGN.md`
5. `docs/ROADMAP.md`
6. `docs/decisions/0004-public-matchmaking-reuses-room-session.md`

These files are the source of truth. Do not rely on chat-history memory when the repository docs disagree.

## Current server milestone

M2.5 is implemented:
- Node.js + TypeScript + ws authoritative game server
- shared client/server Board2048
- 6-digit private rooms
- reconnect grace
- dual-board online play
- battle energy
- Random Clear / Shield / Petrify
- authoritative 180-second round
- result/tie-break/rematch loop
- public FIFO quick matchmaking
- Dockerfile.server
- /health endpoint
- CI smoke test

M2.6 goal:
**deploy the current game server to a stable public TLS WebSocket endpoint and harden it for real-device testing.**

## Deployment rules

- Never commit passwords, SSH private keys, API tokens, cloud secrets, certificates or account credentials.
- Use a dedicated deploy user where practical; avoid routine root operation.
- Keep the Node game process private on localhost/bridge networking.
- Expose only TLS WebSocket/HTTP through the reverse proxy.
- Production browser/minigame traffic must use `wss://`.
- Do not expose port 8787 publicly unless temporarily required for controlled debugging.
- Keep private-room and matchmaking traffic on the exact same RoomSession implementation.
- Before changing firewall/security-group rules, inspect existing services so unrelated workloads are not broken.
- Back up or document any pre-existing 2048/server deployment before replacing it.
- Prefer reproducible deployment from the GitHub repository, not ad-hoc copied files.

## Recommended first deployment shape

```text
Internet
   |
   | 443 / TLS
   v
Caddy or Nginx
   |
   | localhost / private bridge
   v
doublefight-server container
   |
   +-- GET /health
   +-- WS  /ws
```

Repository already provides `Dockerfile.server`.

Initial container target:

```text
HOST=0.0.0.0
PORT=8787
restart=unless-stopped
host bind: 127.0.0.1:8787
```

## Initial deployment checklist

1. Inspect OS, CPU/RAM/disk, open ports and existing processes.
2. Inspect existing folders/services named 2048/server before modifying anything.
3. Confirm SSH access and cloud security-group rules.
4. Install/update Git and Docker (or document why systemd/native Node is preferable).
5. Clone/pull `wenq705-sys/DoubleFight-Web` into a clean deployment directory such as `/opt/doublefight`.
6. Build `Dockerfile.server`.
7. Start the server bound privately to localhost.
8. Verify `curl http://127.0.0.1:8787/health`.
9. Configure TLS reverse proxy for `/ws` and `/health`.
10. Open only the required public ports (normally 443; 80 only if needed for ACME validation).
11. Verify public HTTPS health and public WSS handshake.
12. Configure the web build with `VITE_WS_URL=wss://.../ws`.
13. Rebuild/deploy the GitHub Pages client.
14. Test two real phones on different networks.
15. Test Wi-Fi↔5G changes, background/resume and reconnect.
16. Record deployment commands, rollback procedure and service locations in repository docs.

## Security / hardening after first successful test

Before broad public traffic:
- connection/message rate limiting
- max concurrent sockets guard
- structured logs
- queue/room/match/error metrics
- process/container resource limits
- log rotation
- automated restart
- automatic certificate renewal
- firewall least privilege
- dependency/security review

Do not add Redis, distributed rooms, regions or MMR before real usage data requires them.

## Server capacity intent

The first host is for development, real-device validation and small-scale beta. Measure actual:
- event-loop lag
- CPU
- RSS memory
- socket count
- queue size
- rooms / playing matches
- message rate
- reconnect/error rate

Scale from measurements, not guesses.

## Codex working style

For every meaningful server change:
1. inspect current state
2. explain the intended change briefly
3. create a branch
4. edit code/config/docs
5. run typecheck/tests/build/server smoke test
6. open a PR
7. merge only after CI is green
8. deploy from the merged main branch
9. verify health/WSS externally
10. document any operational change

Do not modify gameplay balance while doing infrastructure work unless explicitly requested.

## Asset / Blender boundary

A later Codex workspace may automate Blender asset production, but Blender work should not run on the game server.

Recommended split:
- **Server Ops workspace:** deployment, WebSocket, observability, networking, security
- **Asset workspace:** Blender Python/headless generation, GLB export, optimization, visual validation
- same GitHub repository and shared documentation, separate branches/worktrees

Generated production models should ultimately be exported as optimized GLB assets and integrated through the existing Three.js asset pipeline. The game server should serve competitive state, not perform rendering/model generation.
