#!/usr/bin/env bash
set -euo pipefail
if [[ -x "$HOME/.cache/ai-cloud/node24/node_modules/.bin/node" ]]; then
  export PATH="$HOME/.cache/ai-cloud/node24/node_modules/.bin:$PATH"
fi
if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(".")[0]')" != "24" ]]; then
  printf 'Node.js 24가 필요합니다. Claude 환경의 런타임 준비를 완료하거나 Codex에서 Node 24를 선택해 주세요.\n' >&2
  exit 1
fi
if [[ "$#" -eq 0 ]]; then
  node --version
else
  exec "$@"
fi
