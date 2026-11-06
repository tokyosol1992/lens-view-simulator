#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"
if [[ "$(node -p 'process.versions.node.split(".")[0]')" != "24" ]]; then
  printf 'Node.js 24 환경을 선택한 뒤 다시 실행해 주세요.\n' >&2
  exit 1
fi
python3 --version
node tools/check-optics.mjs
node tools/catalog-check.mjs
