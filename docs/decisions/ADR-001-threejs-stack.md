# ADR-001: Three.js + TypeScript + Vite for the web vertical slice

- Status: Accepted
- Date: 2026-09-10

## Context

The previous Unity direction created friction for AI-driven iteration and visual prototyping. The project needs fast browser iteration, programmatic 3D, mobile portrait testing, and easy GitHub Pages distribution.

## Decision

Use Three.js with TypeScript and Vite for the web vertical slice.

## Consequences

Positive:

- fast AI/code iteration
- direct WebGL rendering control
- easy browser/mobile sharing
- deterministic game logic can remain engine-independent
- GitHub Pages can host every approved build

Trade-offs:

- no Unity editor tooling
- authored asset pipeline must be established explicitly later
- Douyin mini-game runtime adaptation remains a later platform-integration task
