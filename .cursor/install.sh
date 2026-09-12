#!/usr/bin/env bash
# Bootstrap del entorno de desarrollo para el Cloud Agent.
#
# La app habla con Postgres a traves del driver serverless de Neon, que no usa el protocolo
# de Postgres sino HTTP contra `/sql`. En la nube ese endpoint es Neon; en local levantamos
# un Postgres comun + un proxy HTTP (.cursor/neon-proxy) que emula ese contrato, para no
# tocar el codigo de la app. Este script es idempotente: se puede correr varias veces.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO_DIR="$(pwd)"

echo "==> Instalando PostgreSQL (si falta)"
if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-contrib
fi

echo "==> Arrancando el cluster de Postgres"
sudo pg_ctlcluster 16 main start 2>/dev/null || true
# Espera a que acepte conexiones.
for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q 2>/dev/null; then break; fi
  sleep 1
done

echo "==> Configurando usuario y base 'main'"
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';" >/dev/null
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='main'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE DATABASE main;" >/dev/null
fi

echo "==> Escribiendo .env (si falta)"
if [ ! -f "$REPO_DIR/.env" ]; then
  cat > "$REPO_DIR/.env" <<'EOF'
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/main"
NEON_PROXY_PORT="4444"
EOF
fi

echo "==> Instalando dependencias del proyecto"
npm install

echo "==> Instalando dependencias del proxy Neon local"
( cd .cursor/neon-proxy && npm install )

echo "==> Arrancando el proxy Neon local (temporal, para migrar)"
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/main" \
  node .cursor/neon-proxy/server.mjs >/tmp/neon-proxy-install.log 2>&1 &
PROXY_PID=$!
for _ in $(seq 1 30); do
  if curl -sf http://localhost:4444/health >/dev/null 2>&1; then break; fi
  sleep 1
done

echo "==> Aplicando migraciones"
NODE_OPTIONS="--import=$REPO_DIR/.cursor/neon-local.mjs" npm run db:migrate

# El proxy temporal ya cumplio; en runtime lo levanta el terminal 'neon-proxy'.
kill "$PROXY_PID" 2>/dev/null || true

echo "==> Listo."
