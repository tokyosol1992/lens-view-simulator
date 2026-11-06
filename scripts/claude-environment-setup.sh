#!/usr/bin/env bash
set -euo pipefail
NODE24_ROOT="$HOME/.cache/ai-cloud/node24"
mkdir -p "$NODE24_ROOT"
if [[ ! -x "$NODE24_ROOT/node_modules/.bin/node" ]] || [[ "$("$NODE24_ROOT/node_modules/.bin/node" -p 'process.versions.node.split(".")[0]')" != "24" ]]; then
  npm install --prefix "$NODE24_ROOT" --no-save --package-lock=false --no-audit --no-fund node@24
fi
mkdir -p "$HOME/.cache/ai-cloud"
cat > "$HOME/.cache/ai-cloud/node24-env.sh" <<'ENV'
export PATH="$HOME/.cache/ai-cloud/node24/node_modules/.bin:$PATH"
ENV
"$NODE24_ROOT/node_modules/.bin/node" --version
printf 'Node 24 준비 완료. 프로젝트 설치는 저장소의 SessionStart에서 실행합니다.\n'
