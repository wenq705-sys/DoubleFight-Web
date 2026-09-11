# ADR 0002 — Mobile rendering budget, pooling and asset migration

## Status

Accepted — M1.4 Production Foundation.

## Context

The first playable themes proved the 3D art direction, but long sessions showed progressive mobile slowdown and the fixed low DPR made core models look soft on high-density iPhone displays.

The project also intends to migrate hero pieces toward authored stylized low-poly GLB assets over time without blocking current development.

## Decision

1. Use adaptive DPR rather than a permanently low mobile DPR.
2. Expose renderer telemetry via `?debug=1`.
3. Pool transient merge/skill VFX and environment particles.
4. Use template caches for repeated 2048 piece visuals.
5. Use `InstancedMesh` for repeated static environment props when practical.
6. Treat draw calls/material switches as first-class performance constraints; triangle count alone is not an adequate proxy.
7. Keep large fullscreen presentation in DOM/CSS where this avoids unnecessary WebGL object count.
8. Use silhouette-first piece design. Numeric/rank text is secondary and should not cover hero geometry.
9. Gradually introduce authored stylized low-poly GLB assets after a small pilot validates cache/material/package-size rules. Procedural geometry remains a fallback/blockout path until then.

## Consequences

Positive:
- sharper devices can use higher DPR when performance allows
- weaker devices degrade gracefully
- long-session allocation churn is reduced
- theme content becomes easier to scale
- future GLB migration has a clear performance contract

Tradeoffs:
- pooled systems are more stateful than one-shot allocation
- adaptive quality makes visual debugging slightly less deterministic
- procedural and authored assets will coexist during migration
- some static scene code becomes less straightforward due to instancing

## Validation

The decision is only considered successful after real-device sessions show:
- stable gameplay for 10–20 minutes
- no obvious progressive frame-rate collapse
- stable renderer memory counters after warmup
- acceptable sharpness on modern iPhone displays
