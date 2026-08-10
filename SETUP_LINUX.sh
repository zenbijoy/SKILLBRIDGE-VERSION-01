#!/usr/bin/env bash
set -euo pipefail
cp -n frontend/.env.example frontend/.env || true
cp -n backend/.env.example backend/.env || true
(cd frontend && npm install && npx expo install --fix)
(cd backend && npm install)
echo "Edit .env files and run Supabase migrations before launching."
