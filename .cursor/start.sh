#!/usr/bin/env bash
# Se ejecuta en cada arranque del entorno. Solo reconcilia servicios de sistema: deja el
# cluster de Postgres corriendo. El proxy Neon y `npm run dev` viven en los `terminals`.
set -euo pipefail

echo "==> Arrancando el cluster de Postgres"
sudo pg_ctlcluster 16 main start 2>/dev/null || true
for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q 2>/dev/null; then
    echo "==> Postgres listo."
    exit 0
  fi
  sleep 1
done

echo "!! Postgres no respondio a tiempo" >&2
exit 1
