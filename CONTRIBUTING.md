# Contributing

## Branch model

- `main`: deployable, reviewed baseline
- `feat/*`: product/visual features
- `fix/*`: defects
- `chore/*`: tooling/docs

Prefer small, reviewable commits and pull requests.

## Definition of done

A change is not done until:

- TypeScript passes strict type checking
- rule tests pass
- Vite production build succeeds
- mobile portrait interaction remains usable
- new visual work respects `docs/ART_DIRECTION.md`
- relevant docs/handoff state are updated

## Commit convention

Use conventional prefixes: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
