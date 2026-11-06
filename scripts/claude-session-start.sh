#!/usr/bin/env bash
set -euo pipefail
if [[ "${CLAUDE_CODE_REMOTE:-}" != "true" ]]; then
  exit 0
fi
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"
if [[ -x "$HOME/.cache/ai-cloud/node24/node_modules/.bin/node" ]]; then
  export PATH="$HOME/.cache/ai-cloud/node24/node_modules/.bin:$PATH"
fi
bash scripts/cloud-setup.sh
