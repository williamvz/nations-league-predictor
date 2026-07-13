#!/bin/sh
set -e

# Under Home Assistant the add-on options live in /data/options.json; when the
# container runs standalone (docker-compose) plain env vars are used instead.
if [ -f /data/options.json ]; then
  JWT_SECRET=$(jq -r '.jwt_secret // ""' /data/options.json)
  ADMIN_USERNAME=$(jq -r '.admin_username // ""' /data/options.json)
  ADMIN_PASSWORD=$(jq -r '.admin_password // ""' /data/options.json)
  INVITE_CODE=$(jq -r '.invite_code // ""' /data/options.json)
  HA_NOTIFY_SERVICE=$(jq -r '.ha_notify_service // ""' /data/options.json)
  if [ "$(jq -r '.demo_mode // false' /data/options.json)" = "true" ]; then
    DEMO_MODE=1
  fi
  export DB_PATH=/data/nlpool.db
fi

if [ "${DEMO_MODE:-}" = "1" ]; then
  # demo season runs against its own database; the real one stays untouched.
  # a fresh demo starts on every restart while demo mode is on.
  export DEMO_MODE=1
  export DB_PATH=/data/nlpool-demo.db
  rm -f /data/nlpool-demo.db /data/nlpool-demo.db-wal /data/nlpool-demo.db-shm
  echo "🧪 DEMO-MODUS: gesimuleerd seizoen op ${DB_PATH} (echte database blijft ongemoeid)"
fi

if [ -z "${JWT_SECRET}" ]; then
  echo "❌ jwt_secret is niet ingesteld."
  echo "   Ga naar de add-on → Configuratie en vul bij jwt_secret een lange,"
  echo "   willekeurige tekst in (bijv. de uitkomst van 'openssl rand -hex 32')."
  echo "   Zonder geheim zou iedereen een geldige (admin)sessie kunnen vervalsen,"
  echo "   daarom start de app bewust niet."
  exit 1
fi

export JWT_SECRET ADMIN_USERNAME ADMIN_PASSWORD INVITE_CODE HA_NOTIFY_SERVICE
export PORT="${PORT:-8099}"
export DB_PATH="${DB_PATH:-/data/nlpool.db}"

echo "🏆 Nations League Pool wordt gestart…"
echo "   Database: ${DB_PATH}"

exec node /app/src/server.js
