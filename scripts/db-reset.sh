#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="homecal-postgres"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Also delete the volume so initdb runs fresh — POSTGRES_DB / POSTGRES_PASSWORD
# env vars are only honored on an empty PGDATA.
echo "Removing container '${CONTAINER_NAME}' + volume..."
VOLUME=$(docker inspect "${CONTAINER_NAME}" --format '{{range .Mounts}}{{.Name}}{{end}}' 2>/dev/null || true)
docker rm -f "${CONTAINER_NAME}" 2>/dev/null || true
[ -n "${VOLUME}" ] && docker volume rm "${VOLUME}" 2>/dev/null || true

echo "Recreating..."
"${SCRIPT_DIR}/db-start.sh"

echo "Applying migrations..."
cd "${REPO_ROOT}"
pnpm --filter @homecal/api db:migrate
