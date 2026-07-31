# Sistema Automático de Limpieza de Sesiones

## Descripción

Sistema automático que detecta y desactiva sesiones de visitantes que no tienen respuesta (sin heartbeat) basándose en timeouts configurables por tipo de sesión.

## Componentes

### 1. SessionTimeout Value Object
- `SHORT`: 5 minutos - Para sesiones muy cortas
- `MEDIUM`: 15 minutos - Para sesiones normales
- `LONG`: 30 minutos - Para sesiones extendidas  
- `EXTENDED`: 60 minutos - Para sesiones de larga duración

### 2. SessionManagementDomainService
- `hasExpiredSessions()`: Detecta si un visitante tiene sesiones expiradas
- `cleanExpiredSessions()`: Limpia sesiones expiradas de un visitante
- `shouldBeMarkedAsInactive()`: Determina si una sesión debe marcarse como inactiva

### 3. CleanExpiredSessionsCommand
- Command CQRS para ejecutar limpieza de sesiones
- Soporta procesamiento por lotes
- Filtrado opcional por tenant

### 4. SessionCleanupScheduler
- Scheduler automático con @Cron decorators
- Ejecución cada 15 minutos (configurable)
- Limpieza intensiva semanal los domingos

## Configuración

### Variables de Entorno

```bash
# Habilitar/deshabilitar limpieza automática
SESSION_CLEANUP_ENABLED=true

# Tamaño de lote para procesamiento
SESSION_CLEANUP_BATCH_SIZE=100

# Configuraciones de timeout (milisegundos)
SESSION_TIMEOUT_SHORT_MS=300000     # 5 min
SESSION_TIMEOUT_MEDIUM_MS=900000    # 15 min  
SESSION_TIMEOUT_LONG_MS=1800000     # 30 min
SESSION_TIMEOUT_EXTENDED_MS=3600000 # 60 min
```

## Programación Automática

### Limpieza Regular
- **Frecuencia**: Cada 15 minutos
- **Cron**: `0 */15 * * * *`
- **Lote**: Configurable via ENV (default: 100)

### Limpieza Intensiva
- **Frecuencia**: Domingos a las 02:00 UTC  
- **Cron**: `0 0 2 * * 0`
- **Lote**: 5x el tamaño normal

## Arquitectura Híbrida

### MongoDB (Persistencia)
- Sesiones históricas para analytics
- Índices optimizados para consultas
- Integridad referencial con visitantes

### Redis (Estado Temporal)  
- Estado de conexión en tiempo real
- TTL automático (120 segundos)
- Sets para consultas rápidas

## Logging y Monitoreo

### Logs Informativos
```
🕐 Session Cleanup Scheduler inicializado
🧹 Iniciando limpieza automática de sesiones expiradas
✅ Limpieza automática completada. Visitantes procesados: 42
📊 Estadísticas: 42 visitantes tuvieron sesiones limpiadas
```

### Logs de Error
```
❌ Error en limpieza automática: [mensaje]
🚨 Error inesperado durante limpieza automática de sesiones
```

## API Manual

### Trigger Manual
```typescript
// Desde cualquier servicio
@Inject(SessionCleanupScheduler)
private readonly scheduler: SessionCleanupScheduler;

// Ejecutar limpieza manual
await this.scheduler.triggerManualCleanup(200); // lote personalizado
```

## Casos de Uso

### 1. Sesión Sin Heartbeat
- Visitante deja la página sin cerrar sesión
- Después de timeout → sesión marcada como expirada
- Limpieza automática cada 15 minutos

### 2. Visitante Inactivo
- No hay actividad durante el timeout configurado
- `lastActivityAt` usado para determinar expiración
- Session cleanup mantiene datos históricos

### 3. Limpieza Masiva
- Limpieza semanal intensiva
- Procesa mayor volumen de visitantes
- Ejecuta en horario de baja actividad

## Performance

### Optimizaciones MongoDB
```typescript
// Índices para consultas eficientes
{ 'sessions.id': 1 }
{ 'sessions.endedAt': 1 }
{ 'sessions.lastActivityAt': 1 }
```

### Procesamiento por Lotes
- Evita cargar todos los visitantes en memoria
- Configurable via `SESSION_CLEANUP_BATCH_SIZE`
- Balance entre memoria y throughput

## Testing

### Unit Tests
```bash
npm run test:unit -- --testNamePattern="SessionCleanup"
```

### Integration Tests  
```bash
npm run test:int -- --testNamePattern="session.*cleanup"
```

### Manual Testing
```bash
# CLI para testing
node bin/guiders-cli.js trigger-session-cleanup --batch-size 50
```

## Troubleshooting

### Verificar Estado
1. Logs de aplicación para errores
2. MongoDB: consultar sesiones activas
3. Redis: verificar estado de conexiones

### Desactivar Temporalmente
```bash
SESSION_CLEANUP_ENABLED=false
```

### Ajustar Frecuencia
```bash
# Cambiar intervalo (cada 30 minutos)
SESSION_CLEANUP_CRON="0 */30 * * * *"
```