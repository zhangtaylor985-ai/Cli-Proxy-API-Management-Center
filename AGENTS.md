# Project Workflow

## Frontend Build + Caddy

When the user asks to rebuild the frontend, make the frontend effective, support Caddy, or run the production UI locally, use this workflow by default:

1. Check for existing uncommitted changes with `git status --short`.
2. Avoid touching unrelated user edits unless the task explicitly requires it.
3. Build the frontend with `npm run build`.
4. Validate the repo-local Caddy config with `npm run check:caddy`.
5. If the user wants the built frontend to be live locally, run `npm run serve:caddy`.
6. Verify service status with:
   - `ss -ltnp | rg ':5173|:80|:443'`
   - `ps -ef | rg 'caddy|vite'`
   - `curl -I http://127.0.0.1:5173/`
7. Report separately:
   - whether the build succeeded
   - whether Caddy config validation succeeded
   - whether a Caddy process is actually serving the new `dist/index.html`

## Files And Commands

- Repo-local Caddy config: `Caddyfile`
- Production build output: `dist/index.html`
- Local serve command: `npm run serve:caddy`
- Local validate command: `npm run check:caddy`
- Docker build path: `Dockerfile` + `deploy/Caddyfile.docker`

## Deployment Notes

- The repo uses hash routing, so no SPA history fallback is required in Caddy.
- A successful `npm run build` only updates `dist/index.html`; it does not by itself guarantee that users are already seeing the new frontend.
- If repo-local Caddy is already running and serving `./dist`, rebuilding the frontend updates what it serves immediately because the static file on disk changed.
- If system Caddy or another deployment target is serving a different directory, that target must be reloaded or redeployed explicitly.

## Safety

- Never overwrite or revert unrelated user changes.
- Before editing or deploying, inspect `git diff` for files the user already modified.
- If `docker` is unavailable, say so explicitly instead of claiming Docker validation was completed.
