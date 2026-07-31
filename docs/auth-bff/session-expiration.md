# Session Expiration - Visitor Sessions

## Descripción

Sistema automático de caducidad de sesiones de visitantes. Cuando el backend deja de recibir heartbeat signals del endpoint `/api/visitors/session/heartbeat`, el sistema automáticamente cierra todas las sesiones activas expiradas del visitante.

## Funcionamiento

### Timeouts por Lifecycle

El sistema aplica diferentes tiempos de timeout según el estado del visitante:

- **ANON** (Anónimo): 5 minutos sin actividad
- **ENGAGED** (Comprometido): 15 minutos sin actividad
- **LEAD** (Lead generado): 30 minutos sin actividad
- **CONVERTED** (Convertido): 60 minutos sin actividad

### Proceso de Limpieza

1. **Scheduler Automático**: `SessionCleanupScheduler` ejecuta cada 5 minutos (configurable via cron)
2. **Búsqueda**: Busca visitantes con sesiones activas usando `findWithActiveSessions()`
3. **Verificación**: Determina qué sesiones han expirado según el timeout del lifecycle del visitante
4. **Cierre Múltiple**: Cierra **TODAS** las sesiones activas expiradas (no solo la primera)
5. **Eventos**: Publica `SessionEndedEvent` por cada sesión cerrada
6. **Persistencia**: Guarda los cambios en MongoDB

**Tiempo máximo de cierre**: timeout + intervalo del scheduler
- ANON: 5 min timeout + 5 min scheduler = **máximo 10 minutos**
- ENGAGED: 15 min timeout + 5 min scheduler = **máximo 20 minutos**
- LEAD: 30 min timeout + 5 min scheduler = **máximo 35 minutos**
- CONVERTED: 60 min timeout + 5 min scheduler = **máximo 65 minutos**

### Endpoints

#### POST /api/visitors/session/heartbeat

Mantiene la sesión activa actualizando el `lastActivityAt`.

**Request:**
```json
{
  "sessionId": "uuid-session-id",
  "visitorId": "uuid-visitor-id"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Heartbeat actualizado exitosamente"
}
```

**Comportamiento:**

- Si no se recibe heartbeat durante el tiempo de timeout, la sesión expirará
- El sistema cerrará automáticamente todas las sesiones expiradas en el próximo ciclo de limpieza

**Frecuencia recomendada de heartbeat desde el frontend:**

- **Visitantes ANON**: cada 30-60 segundos (timeout: 5 minutos)
- **Visitantes ENGAGED**: cada 60-90 segundos (timeout: 15 minutos)
- **Visitantes LEAD**: cada 2-3 minutos (timeout: 30 minutos)
- **Visitantes CONVERTED**: cada 5 minutos (timeout: 60 minutos)

La frecuencia debe ser menor a la mitad del timeout para garantizar que al menos 2 heartbeats lleguen antes de la expiración.

## Configuración

Variables de entorno disponibles (ver `.env.session-cleanup.example`):

```bash
# Habilitar/deshabilitar limpieza automática
SESSION_CLEANUP_ENABLED=true

# Tamaño del lote de procesamiento
SESSION_CLEANUP_BATCH_SIZE=100

# Timeouts personalizados (opcional)
SESSION_TIMEOUT_SHORT_MS=300000     # 5 min
SESSION_TIMEOUT_MEDIUM_MS=900000    # 15 min
SESSION_TIMEOUT_LONG_MS=1800000     # 30 min
SESSION_TIMEOUT_EXTENDED_MS=3600000 # 60 min
```

## Arquitectura

### Dominio

- **VisitorV2 Aggregate**: Contiene múltiples sesiones, puede cerrar sesiones específicas o múltiples
- **Session Entity**: Entidad con `lastActivityAt`, `startedAt` y `endedAt`
- **SessionTimeout VO**: Value Object con lógica de expiración
- **SessionManagementDomainService**: Servicio de dominio que centraliza la lógica de timeouts

### Métodos Clave

#### VisitorV2.endSessionsWhere(predicate)

Cierra todas las sesiones activas que cumplan el predicado proporcionado.

```typescript
visitor.endSessionsWhere(
  (session) => timeout.isExpired(session.getLastActivityAt())
);
```

#### SessionManagementDomainService.cleanExpiredSessions(visitor)

Aplica la lógica de negocio para cerrar todas las sesiones expiradas:

```typescript
const cleanedVisitor = sessionService.cleanExpiredSessions(visitor);
```

### Application Layer

- **CleanExpiredSessionsCommand**: Comando para limpiar sesiones expiradas
- **CleanExpiredSessionsCommandHandler**: Handler que orquesta la limpieza y publica eventos
- **SessionCleanupScheduler**: Scheduler que ejecuta la limpieza cada 15 minutos

## Testing

Se han añadido tests completos:

### Unit Tests

```bash
# Tests de dominio
npm run test:unit -- --testPathPattern="session-management.domain-service"
npm run test:unit -- --testPathPattern="visitor-session-management.aggregate"

# Tests de command handler
npm run test:unit -- --testPathPattern="clean-expired-sessions.command-handler"
```

### Cobertura

- ✅ 13 tests para `SessionManagementDomainService`
- ✅ 5 tests para métodos de sesión en `VisitorV2`
- ✅ 5 tests para `CleanExpiredSessionsCommandHandler`

Total: 23 tests específicos para la funcionalidad de expiración de sesiones.

## Eventos Publicados

Cuando una sesión expira, se publica:

```typescript
SessionEndedEvent {
  visitorId: string,
  sessionId: string,
  endedAt: string (ISO),
  duration: number (ms)
}
```

Estos eventos pueden ser consumidos por otros módulos para:
- Actualizar estado de conexión en Redis
- Notificar a comerciales
- Cerrar chats asociados
- Actualizar métricas

## Mejoras Implementadas

### Problema Original
El sistema solo cerraba la **primera** sesión activa expirada, dejando otras sesiones activas sin cerrar.

### Solución
- Agregado `endSessionsWhere(predicate)` en el aggregate
- `SessionManagementDomainService.cleanExpiredSessions()` ahora cierra TODAS las sesiones expiradas
- `CleanExpiredSessionsCommandHandler` publica eventos correctamente usando `EventPublisher`

### Beneficios
1. **Limpieza Completa**: Todas las sesiones expiradas se cierran, no solo la primera
2. **Eventos Correctos**: Se publica un evento por cada sesión cerrada
3. **Estado Consistente**: El estado del visitante refleja correctamente su actividad real
4. **Mejor Performance**: Al cerrar todas las sesiones de una vez, se reduce el número de operaciones de BD

## Monitoreo

El sistema registra logs en diferentes niveles:

- **INFO**: Inicio/fin de limpieza, cantidad de visitantes procesados
- **DEBUG**: Detalles de cada visitante procesado
- **WARN**: Errores al guardar visitantes individuales (continúa con el siguiente)
- **ERROR**: Errores críticos que detienen la limpieza

## Troubleshooting

### Las sesiones no se cierran

1. Verificar que `SESSION_CLEANUP_ENABLED=true`
2. Revisar logs del scheduler: "Iniciando limpieza automática de sesiones expiradas"
3. Verificar que las sesiones tienen `lastActivityAt` actualizado
4. Comprobar que el timeout es correcto para el lifecycle del visitante

### Sesiones se cierran demasiado rápido

1. Revisar los timeouts configurados en variables de entorno
2. Verificar que los heartbeats se están recibiendo correctamente
3. Comprobar que el lifecycle del visitante es el correcto

### Eventos no se publican

1. Verificar que `EventPublisher` está inyectado en el handler
2. Comprobar que se llama a `mergeObjectContext()` y `commit()`
3. Revisar logs de eventos en el sistema
