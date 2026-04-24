#!/usr/bin/env bash
set -uo pipefail

REPO="${CLI_PROXY_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PULL=1
AUTOSTASH=1
START_CADDY=1

usage() {
  cat <<'USAGE'
Usage: redeploy_frontend.sh [options]

Options:
  --repo PATH       Repository path. Defaults to this script's repository.
  --no-pull         Skip git pull.
  --no-autostash    Refuse to pull when local changes are present.
  --no-start        Do not start repo-local Caddy if :5173 is not already live.
  -h, --help        Show this help.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO="${2:-}"
      shift 2
      ;;
    --no-pull)
      PULL=0
      shift
      ;;
    --no-autostash)
      AUTOSTASH=0
      shift
      ;;
    --no-start)
      START_CADDY=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$REPO" || ! -d "$REPO/.git" ]]; then
  echo "Repository not found or not a git repo: $REPO" >&2
  exit 2
fi

cd "$REPO" || exit 2

have_rg=0
if command -v rg >/dev/null 2>&1; then
  have_rg=1
fi

filter_ports() {
  if [[ "$have_rg" -eq 1 ]]; then
    rg ':5173|:80|:443' || true
  else
    grep -E ':5173|:80|:443' || true
  fi
}

filter_processes() {
  if [[ "$have_rg" -eq 1 ]]; then
    rg 'caddy|vite' || true
  else
    grep -E 'caddy|vite' || true
  fi
}

hash_file() {
  sha256sum "$1" | awk '{print $1}'
}

hash_url() {
  curl -fsS "$1" | sha256sum | awk '{print $1}'
}

section() {
  printf '\n==> %s\n' "$1"
}

run_logged() {
  local label="$1"
  shift
  section "$label"
  "$@"
  return $?
}

initial_status="$(git status --short)"
before_ref="$(git rev-parse --short HEAD)"
local_changes="no"
if [[ -n "$initial_status" ]]; then
  local_changes="yes"
fi

pull_rc=0
pull_summary="skipped"
if [[ "$PULL" -eq 1 ]]; then
  if [[ "$local_changes" == "yes" && "$AUTOSTASH" -ne 1 ]]; then
    echo "Local changes are present and --no-autostash was set:" >&2
    echo "$initial_status" >&2
    exit 1
  fi

  if [[ "$local_changes" == "yes" ]]; then
    run_logged "git pull --rebase --autostash origin main" git pull --rebase --autostash origin main
    pull_rc=$?
  else
    run_logged "git pull origin main" git pull origin main
    pull_rc=$?
  fi

  after_ref="$(git rev-parse --short HEAD)"
  if [[ "$pull_rc" -eq 0 ]]; then
    pull_summary="ok: ${before_ref} -> ${after_ref}"
  else
    pull_summary="failed: ${before_ref} -> ${after_ref}"
  fi
fi

if [[ "$pull_rc" -ne 0 ]]; then
  printf '\n==> Summary\n'
  printf 'git pull: %s\n' "$pull_summary"
  printf 'local changes before pull: %s\n' "$local_changes"
  exit "$pull_rc"
fi

build_log="$(mktemp)"
section "npm run build"
npm run build 2>&1 | tee "$build_log"
build_rc=${PIPESTATUS[0]}
node_warning="no"
if grep -q 'Vite requires Node.js version' "$build_log"; then
  node_warning="yes"
fi
rm -f "$build_log"

section "npm run check:caddy"
npm run check:caddy
caddy_rc=$?

section "service status"
ss -ltnp | filter_ports
ps -ef | filter_processes
curl -I http://127.0.0.1:5173/ || true

repo_caddy_live="no"
if ss -ltnp 2>/dev/null | grep -E ':5173\b' | grep -q 'caddy'; then
  repo_caddy_live="yes"
fi

if [[ "$repo_caddy_live" != "yes" && "$START_CADDY" -eq 1 ]]; then
  section "start repo-local Caddy"
  nohup npm run serve:caddy > .caddy-serve.log 2>&1 &
  caddy_pid=$!
  echo "started npm run serve:caddy in background, launcher pid ${caddy_pid}"
  for _ in 1 2 3 4 5; do
    sleep 1
    if curl -fsSI http://127.0.0.1:5173/ >/dev/null 2>&1; then
      break
    fi
  done
  if ss -ltnp 2>/dev/null | grep -E ':5173\b' | grep -q 'caddy'; then
    repo_caddy_live="yes"
  fi
fi

served_current="no"
dist_hash=""
http_hash=""
if [[ -f dist/index.html ]] && curl -fsS http://127.0.0.1:5173/ >/dev/null 2>&1; then
  dist_hash="$(hash_file dist/index.html)"
  http_hash="$(hash_url http://127.0.0.1:5173/)"
  if [[ "$dist_hash" == "$http_hash" ]]; then
    served_current="yes"
  fi
fi

final_status="$(git status --short)"

printf '\n==> Summary\n'
printf 'git pull: %s\n' "$pull_summary"
printf 'local changes before pull: %s\n' "$local_changes"
printf 'npm run build: '
if [[ "$build_rc" -eq 0 ]]; then printf 'ok\n'; else printf 'failed (%s)\n' "$build_rc"; fi
printf 'npm run check:caddy: '
if [[ "$caddy_rc" -eq 0 ]]; then printf 'ok\n'; else printf 'failed (%s)\n' "$caddy_rc"; fi
printf 'repo-local Caddy on :5173: %s\n' "$repo_caddy_live"
printf 'serving current dist/index.html: %s\n' "$served_current"
if [[ -n "$dist_hash" || -n "$http_hash" ]]; then
  printf 'dist hash: %s\n' "${dist_hash:-unavailable}"
  printf 'http hash: %s\n' "${http_hash:-unavailable}"
fi
printf 'Node version warning: %s\n' "$node_warning"
printf 'final git status: %s\n' "${final_status:-clean}"

if [[ "$build_rc" -ne 0 ]]; then
  exit "$build_rc"
fi
if [[ "$caddy_rc" -ne 0 ]]; then
  exit "$caddy_rc"
fi
if [[ "$served_current" != "yes" ]]; then
  exit 1
fi
