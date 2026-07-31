# Docker Compose para Staging

Este archivo `docker/docker-compose-staging.yml` está específicamente diseñado para el entorno de staging de Guiders Backend.

## Diferencias con Producción

### Servicios Principales
- **PostgreSQL**: Base de datos principal para datos relacionales
- **MongoDB**: Base de datos para mensajes cifrados  
- **Redis**: Cache y manejo de sesiones

### Servicios de Desarrollo (Profile `tools`)
- **Adminer** (puerto 8080): Interfaz web para PostgreSQL
- **Redis Commander** (puerto 8081): Interfaz web para Redis
- **Mongo Express** (puerto 8082): Interfaz web para MongoDB

## Configuración Específica de Staging

### Healthchecks Más Rápidos
- Intervalos de 20s (vs 30s en producción)
- Timeouts más cortos para detección rápida de problemas

### Logs Más Verbosos
- Archivos de log de hasta 20MB (vs 10MB en producción)
- 5 archivos de rotación (vs 3 en producción)

### Volúmenes Nombrados
Los volúmenes tienen nombres específicos para evitar conflictos:
- `guiders_postgres_staging_data`
- `guiders_redis_staging_data` 
- `guiders_mongodb_staging_data`

## Variables de Entorno Requeridas

### Base de Datos PostgreSQL
```env
DATABASE_USERNAME=staging_user
DATABASE_PASSWORD=staging_secure_password
DATABASE=guiders_staging
DATABASE_PORT=5432
```

### Redis
```env
REDIS_PORT=6379
```

### MongoDB
```env
MONGODB_ROOT_USERNAME=admin
MONGODB_ROOT_PASSWORD=mongodb_admin_password
MONGODB_DATABASE=guiders_staging
MONGODB_PORT=27017
MONGODB_USERNAME=staging_user  # Usuario aplicación (opcional)
MONGODB_PASSWORD=staging_pass  # Password aplicación (opcional)
```

### Herramientas de Desarrollo (Opcionales)
```env
REDIS_COMMANDER_PASSWORD=staging123
MONGO_EXPRESS_PASSWORD=staging123
```

## Comandos Útiles

### Iniciar solo servicios básicos
```bash
docker compose -f docker/docker-compose-staging.yml up -d
```

### Iniciar con herramientas de desarrollo
```bash
docker compose -f docker/docker-compose-staging.yml --profile tools up -d
```

### Ver logs de un servicio específico
```bash
docker compose -f docker/docker-compose-staging.yml logs -f postgres-staging
```

### Verificar estado de salud
```bash
docker compose -f docker/docker-compose-staging.yml ps
```

### Acceder a las herramientas web

- **Adminer (PostgreSQL)**: http://localhost:8080
  - Servidor: `postgres-staging`
  - Usuario: valor de `DATABASE_USERNAME`
  - Password: valor de `DATABASE_PASSWORD`
  - Base de datos: valor de `DATABASE`

- **Redis Commander**: http://localhost:8081
  - Usuario: `admin`
  - Password: valor de `REDIS_COMMANDER_PASSWORD`

- **Mongo Express**: http://localhost:8082
  - Usuario: `admin` 
  - Password: valor de `MONGO_EXPRESS_PASSWORD`

## Red Aislada

Todos los servicios están en la red `guiders-staging-network` para aislarlos de otros entornos.

## Secretos de GitHub Actions Necesarios

Para el deployment automático, configurar estos secretos en GitHub:

```
STAGING_DATABASE_USERNAME
STAGING_DATABASE_PASSWORD  
STAGING_DATABASE
STAGING_DATABASE_PORT
STAGING_REDIS_PORT
STAGING_MONGODB_ROOT_USERNAME
STAGING_MONGODB_ROOT_PASSWORD
STAGING_MONGODB_DATABASE
STAGING_MONGODB_PORT
STAGING_MONGODB_USERNAME (opcional)
STAGING_MONGODB_PASSWORD (opcional)
STAGING_REDIS_COMMANDER_PASSWORD (opcional)
STAGING_MONGO_EXPRESS_PASSWORD (opcional)
```
