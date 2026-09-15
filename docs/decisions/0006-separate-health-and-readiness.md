# ADR 0006 — Separate liveness from release readiness

Status: Accepted for Douyin RC hardening.

Browser and guest PvP must continue when optional Douyin provider credentials are unavailable. Therefore `/health` remains a backward-compatible liveness check and Docker restart signal. A separate rate-limited `GET /ready` returns HTTP 200 only when provider variables, current/optional previous signing key and an actual write to the account data directory are valid; otherwise it returns HTTP 503. Its JSON contains only booleans and Protocol v6, with no values or paths. The operator checks release AppID consistency, the persistent named volume and TLS/legal domains separately before accepting the RC.
