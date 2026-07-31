#!/usr/bin/env bash
# docker-entrypoint.e2e.sh
# Orquesta el arranque del backend E2E:
#   1. Espera a que PostgreSQL y MongoDB estén listos
#   2. Ejecuta las migraciones de TypeORM
#   3. Ejecuta el seed E2E (crea empresa + admin + visitantes)
#   4. Arranca NestJS
#
# Las credenciales E2E vienen de .env.e2e (montado via env_file en el compose).

set -euo pipefail

echo "🚀 [E2E Entrypoint] Iniciando backend E2E..."

# -------------------------------------------------------
# 1. Esperar a PostgreSQL
# -------------------------------------------------------
echo "⏳ Esperando a PostgreSQL en ${DATABASE_HOST}:${DATABASE_PORT}..."
until node -e "
  const { Client } = require('pg');
  const c = new Client({
    host: process.env.DATABASE_HOST,
    port: process.env.DATABASE_PORT,
    user: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE,
  });
  c.connect().then(() => { c.end(); process.exit(0); }).catch(() => process.exit(1));
" 2>/dev/null; do
  sleep 2
done
echo "✅ PostgreSQL listo"

# -------------------------------------------------------
# 2. Esperar a MongoDB
# -------------------------------------------------------
echo "⏳ Esperando a MongoDB en ${MONGODB_HOST}:${MONGODB_PORT}..."
until node -e "
  const { MongoClient } = require('mongodb');
  const url = 'mongodb://${MONGODB_HOST}:${MONGODB_PORT}';
  MongoClient.connect(url, { serverSelectionTimeoutMS: 2000 })
    .then(c => { c.close(); process.exit(0); })
    .catch(() => process.exit(1));
" 2>/dev/null; do
  sleep 2
done
echo "✅ MongoDB listo"

# -------------------------------------------------------
# 3. Sincronizar schema TypeORM (TYPEORM_SYNC=true en .env.e2e)
# Se usa synchronize en lugar de migraciones porque el entorno E2E
# arranca con una base de datos vacía y algunas migraciones históricas
# asumen tablas que ya no existen (contextos V1 deprecados).
# -------------------------------------------------------
echo "🗄️  Sincronizando schema TypeORM..."
node -e "
const { AppDataSource } = require('./dist/src/data-source');
AppDataSource.initialize()
  .then(() => { console.log('✅ Schema sincronizado'); process.exit(0); })
  .catch(e => { console.error('❌ Error sincronizando schema:', e.message); process.exit(1); });
"
echo "✅ Schema listo"

# -------------------------------------------------------
# 4. Ejecutar seed E2E
# Se llama al CLI compilado directamente (dist/tools/cli.js)
# porque la imagen de producción no tiene ts-node.
# -------------------------------------------------------
echo "🌱 Ejecutando seed E2E..."
node /app/dist/tools/cli.js seed-e2e-company \
  --name "${E2E_COMPANY_NAME:-Guiders E2E Test Company}" \
  --domain "${E2E_DOMAIN:-e2e.guiders.local}" \
  --admin-email "${E2E_ADMIN_EMAIL:-admin@e2e.guiders.local}" \
  --visitors 50

echo "✅ Seed completado"

# -------------------------------------------------------
# 5. Arrancar NestJS
# -------------------------------------------------------
echo "🌐 Arrancando NestJS en puerto ${PORT:-3099}..."
exec node dist/src/main.js
