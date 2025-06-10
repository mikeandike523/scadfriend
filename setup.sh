#!/usr/bin/env bash
set -euo pipefail

# ————— Git configuration (repo-local) —————
git config core.eol lf
git config core.autocrlf false
git config commit.safecrlf true
git config push.autoSetupRemote true

# ————— Clean and install dependencies —————
rm -rf node_modules
pnpm install