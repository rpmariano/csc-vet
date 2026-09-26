#!/bin/bash
# Prepara uma sessão do Claude Code na web: dependências e o Chromium dos testes.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# `npm install` e não `npm ci`: aproveita o node_modules que fica em cache no contentor.
npm install --no-audit --no-fund

# O contentor traz um Chromium em /opt/pw-browsers/chromium, mas não o da versão que o
# @playwright/test do projeto procura — sem isto a bateria falha inteira, com "Executable
# doesn't exist". O playwright.config.ts já aceita o caminho por esta variável.
if [ -x /opt/pw-browsers/chromium ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium' >> "$CLAUDE_ENV_FILE"
fi
