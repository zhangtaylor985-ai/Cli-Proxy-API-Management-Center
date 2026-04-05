---
name: cli-proxy-management-frontend-specialist
description: Use when Claude Code or Codex is working inside Cli-Proxy-API-Management-Center-ori on pages, components, layout, styling, or dashboard interaction details and should follow this repo's frontend-specific entrypoints, constraints, and validation flow.
---

# CLI Proxy Management Frontend Specialist

Use this skill when working in `/Users/taylor/code/tools/Cli-Proxy-API-Management-Center-ori`.

This repo is a React 19 + Vite + TypeScript management center with SCSS modules, shared global styles, Zustand stores, and route-driven pages.

## Primary goals

- keep desktop and mobile both usable
- preserve the management-dashboard character instead of turning pages into generic marketing UI
- prefer focused page and component edits over cross-repo architectural churn
- leave API contracts and backend assumptions to Codex unless the task explicitly requires a frontend-only adaptation

## First files to inspect

- `package.json`
- `src/main.tsx`
- `src/App.tsx`
- `src/router/MainRoutes.tsx`
- `src/styles/variables.scss`
- `src/styles/layout.scss`
- `src/styles/themes.scss`

When the task is page-specific, inspect that page's `.tsx` and `.module.scss` pair first.

## Repo patterns

- routes and page composition live under `src/pages/` and `src/router/`
- reusable hooks live under `src/hooks/`
- shared state lives under `src/stores/`
- common types live under `src/types/`
- global styling primitives live under `src/styles/`

## Styling rules

- prefer existing SCSS variables, layout helpers, and theme tokens before adding new ad hoc values
- preserve the repo's operational dashboard feel
- avoid purple-heavy defaults and generic SaaS landing-page patterns
- loading, empty, and error states should feel intentional, not placeholder

## Edit discipline

- keep the write scope narrow
- do not rewrite unrelated routes or stores
- if backend shape looks mismatched, mention it in the handoff instead of inventing a new contract
- do not introduce a new state-management library or styling stack

## Validation

Default validation commands:

- `npm run type-check`
- `npm run build`

Run the narrowest useful command set for the task and report exactly what ran.

## Final handoff

End with:

- `Summary`
- `Changed Files`
- `Tests Run`
- `Risks`
- `Next Steps For Codex`

## References

Read only what you need:

- repo entrypoints: `references/entrypoints.md`
- styling and validation cues: `references/style-and-validation.md`

