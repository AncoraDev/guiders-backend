# Tracking V2 - Documentación Técnica

## Descripción General

Sistema de tracking de eventos de usuario optimizado para alto volumen con estrategias de batching, throttling, agregación y particionamiento temporal.

## Arquitectura

```
┌─────────────────┐
│   Frontend      │
│   (Sitio Web)   │
└────────┬────────┘
         │ HTTP POST /tracking-v2/events
         │ (Batch de eventos)
         ▼
┌─────────────────────────────────────────────────────┐
│              TrackingV2Controller                   │
│                (Infrastructure)                     │
└────────┬────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│       IngestTrackingEventsCommandHandler            │
│                (Application)                        │
│  - Convierte DTOs a Agregados                       │
│  - Delega a BufferService                           │
└────────┬────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│         TrackingEventBufferService                  │
│              (Application)                          │
│  ┌───────────────────────────────────────┐          │
│  │ 1. Throttling (descarte probabilístico)│         │
│  └───────────────────────────────────────┘          │
│  ┌───────────────────────────────────────┐          │
│  │ 2. Buffer en memoria (max 500 eventos) │         │
│  └───────────────────────────────────────┘          │
│  ┌───────────────────────────────────────┐          │
│  │ 3. Auto-flush (5s o 500 eventos)      │         │
│  └───────────────────────────────────────┘          │
└────────┬────────────────────────────────────────────┘
         │ Flush
         ▼
┌─────────────────────────────────────────────────────┐
│      EventAggregationDomainService                  │
│               (Domain)                              │
│  - Consolida eventos duplicados                     │
│  - Incrementa contador de eventos similares         │
└────────┬────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│    MongoTrackingEventRepository                     │
│           (Infrastructure)                          │
│  - Determina partición (YYYY_MM)                    │
│  - Usa bulkWrite() para batch insert                │
└────────┬────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│              MongoDB                                │
│  Collection: tracking_events_2025_01                │
│  Collection: tracking_events_2025_02                │
│  Collection: tracking_events_2025_03                │
│  ...                                                │
└─────────────────────────────────────────────────────┘
```

## Componentes Principales

### 1. Domain Layer

#### TrackingEvent (Aggregate Root)
```typescript
src/context/tracking-v2/domain/tracking-event.aggregate.ts
```
- Agregado principal que representa un evento de tracking
- Métodos: `canAggregateWith()`, `incrementCount()`, `getAggregationKey()`
- Emite `TrackingEventCreatedEvent` al crearse

#### Value Objects
```
src/context/tracking-v2/domain/value-objects/
├── tracking-event-id.ts      # UUID del evento
├── visitor-id.ts             # UUID del visitante
├── session-id.ts             # UUID de la sesión
├── tenant-id.ts              # UUID del tenant/empresa
├── site-id.ts                # UUID del sitio
├── event-type.ts             # Tipo de evento (extensible)
├── event-metadata.ts         # Metadata JSON flexible
└── event-occurred-at.ts      # Timestamp con utilidades
```

#### Domain Services
```typescript
// Throttling: Descarte probabilístico
src/context/tracking-v2/domain/services/event-throttling.domain-service.ts

// Agregación: Consolidación de duplicados
src/context/tracking-v2/domain/services/event-aggregation.domain-service.ts
```

**Configuración de Throttling por Defecto:**
```typescript
{
  PAGE_VIEW: { samplingRate: 100, alwaysKeep: true },   // 100% conservado
  CLICK: { samplingRate: 100, alwaysKeep: false },      // 100% conservado
  SCROLL: { samplingRate: 10, alwaysKeep: false },      // 10% conservado
  MOUSE_MOVE: { samplingRate: 1, alwaysKeep: false },   // 1% conservado
  FORM_SUBMIT: { samplingRate: 100, alwaysKeep: true }, // 100% crítico
  ADD_TO_CART: { samplingRate: 100, alwaysKeep: true }, // 100% crítico
  // ...
}
```

### 2. Application Layer

#### TrackingEventBufferService
```typescript
src/context/tracking-v2/application/services/tracking-event-buffer.service.ts
```
Servicio principal de batching con:
- Buffer en memoria (configurable, default 500 eventos)
- Auto-flush por tiempo (5 segundos) o tamaño (500 eventos)
- Integración con throttling y agregación
- Estadísticas en tiempo real

**Configuración (Environment Variables):**
```bash
TRACKING_BUFFER_MAX_SIZE=500              # Tamaño máximo del buffer
TRACKING_BUFFER_FLUSH_INTERVAL_MS=5000    # Intervalo de flush (ms)
TRACKING_ENABLE_THROTTLING=true           # Habilitar throttling
TRACKING_ENABLE_AGGREGATION=true          # Habilitar agregación
```

#### Commands
```typescript
src/context/tracking-v2/application/commands/
├── ingest-tracking-events.command.ts
└── ingest-tracking-events.command-handler.ts
```

#### Queries
```typescript
src/context/tracking-v2/application/queries/
├── get-event-stats-by-tenant.query.ts
└── get-event-stats-by-tenant.query-handler.ts
```

### 3. Infrastructure Layer

#### PartitionRouterService
```typescript
src/context/tracking-v2/infrastructure/persistence/services/partition-router.service.ts
```
- Gestión dinámica de collections mensuales
- Cache de modelos Mongoose
- Creación automática de índices
- Limpieza de particiones antiguas

**Collections Creadas:**
```
tracking_events_2025_01
tracking_events_2025_02
tracking_events_2025_03
...
```

#### MongoTrackingEventRepository
```typescript
src/context/tracking-v2/infrastructure/persistence/impl/mongo-tracking-event.repository.impl.ts
```
- Implementación del repositorio con MongoDB
- Uso de `bulkWrite()` para inserciones batch optimizadas
- Soporte multi-partición para queries de rango

**Índices Creados:**
```javascript
// Índice principal para queries frecuentes
{ tenantId: 1, siteId: 1, occurredAt: -1 }

// Índice para visitantes
{ visitorId: 1, occurredAt: -1 }

// Índice para sesiones
{ sessionId: 1, occurredAt: -1 }

// Índice para tipos de evento
{ eventType: 1, occurredAt: -1 }

// Índice compuesto para estadísticas
{ tenantId: 1, eventType: 1, occurredAt: -1 }
```

#### Controller
```typescript
src/context/tracking-v2/infrastructure/controllers/tracking-v2.controller.ts
```

**Endpoints:**
- `POST /tracking-v2/events` - Ingerir batch de eventos
- `GET /tracking-v2/stats/tenant/:tenantId` - Estadísticas por tenant
- `GET /tracking-v2/health` - Health check

#### Schedulers
```typescript
src/context/tracking-v2/infrastructure/schedulers/
├── buffer-flush.scheduler.ts          # Flush backup cada 10s
└── partition-maintenance.scheduler.ts # Mantenimiento diario 3 AM
```

## Flujo de Datos

### 1. Ingesta de Eventos

```
Frontend → Controller → CommandHandler → BufferService
                                            ↓
                                       [Throttling]
                                            ↓
                                       [Buffer Add]
                                            ↓
                                   ¿Buffer lleno O timeout?
                                            ↓
                                         [Flush]
                                            ↓
                                      [Aggregation]
                                            ↓
                                       Repository
                                            ↓
                          [PartitionRouter: Determina collection]
                                            ↓
                                     [bulkWrite()]
                                            ↓
                                    MongoDB Collection
```

### 2. Optimizaciones Aplicadas

#### Throttling (Descarte Probabilístico)
- **Objetivo**: Reducir volumen de eventos de alta frecuencia
- **Implementación**: Sampling rate configurable por tipo de evento
- **Ejemplo**: SCROLL events → Solo 10% se conserva

#### Agregación (Consolidación)
- **Objetivo**: Reducir duplicados
- **Criterio**: Eventos con misma clave de agregación dentro de ventana de 1 minuto
- **Resultado**: Un solo evento con `count` incrementado

**Clave de Agregación:**
```typescript
`${visitorId}:${sessionId}:${eventType}:${metadataHash}`
```

#### Particionamiento Temporal
- **Objetivo**: Mejorar rendimiento de queries y facilitar limpieza
- **Estrategia**: Una collection por mes (YYYY_MM)
- **Ventajas**:
  - Queries más rápidas (menos documentos por collection)
  - Limpieza fácil (drop collection antigua)
  - Índices más pequeños

#### Batching
- **Objetivo**: Reducir round-trips a la BD
- **Implementación**: Buffer en memoria + bulkWrite()
- **Configuración**: Max 500 eventos o 5 segundos

## Testing

### Tests Unitarios

```bash
# Tests de dominio
npm run test:unit -- src/context/tracking-v2/domain

# Cobertura: 5 archivos, todas las funcionalidades críticas
```

**Archivos testeados:**
- `event-type.spec.ts` - Value object EventType
- `event-metadata.spec.ts` - Value object EventMetadata
- `tracking-event.aggregate.spec.ts` - Aggregate root
- `event-throttling.domain-service.spec.ts` - Servicio de throttling
- `event-aggregation.domain-service.spec.ts` - Servicio de agregación

### Tests E2E

```bash
# Tests end-to-end
npm run test:e2e -- tracking-v2.e2e-spec.ts

# Cobertura: 20 tests, todos los endpoints
```

**Escenarios testeados:**
- ✅ Ingesta exitosa de eventos
- ✅ Validación de DTOs
- ✅ Manejo de errores (UUIDs inválidos, batches grandes)
- ✅ Consulta de estadísticas
- ✅ Health checks

## Monitoring y Observabilidad

### Logs

El sistema registra eventos importantes:

```typescript
// Ingesta
[TrackingV2Controller] Recibidos 50 eventos para tenant=xxx, site=yyy

// Buffer
[TrackingEventBufferService] Auto-flush triggered: 500 eventos en buffer

// Resultados
[IngestTrackingEventsCommandHandler]
  Ingesta completada: 50 recibidos, 45 procesados, 5 descartados (10.0%),
  buffer=100, tiempo=45ms
```

### Métricas Disponibles

#### BufferStats
```typescript
{
  currentSize: number;      // Tamaño actual del buffer
  totalReceived: number;    // Total eventos recibidos
  totalFlushed: number;     // Total eventos enviados a BD
  totalDiscarded: number;   // Total descartados por throttling
  lastFlushAt: Date;        // Último flush
  flushCount: number;       // Cantidad de flushes realizados
}
```

#### EventStats
```typescript
{
  totalEvents: number;                    // Total de eventos
  eventsByType: Record<string, number>;   // Por tipo de evento
  uniqueVisitors: number;                 // Visitantes únicos
  uniqueSessions: number;                 // Sesiones únicas
  dateRange: { from: Date; to: Date };   // Rango consultado
}
```

## Configuración de Producción

### Variables de Entorno Recomendadas

```bash
# Buffer
TRACKING_BUFFER_MAX_SIZE=500
TRACKING_BUFFER_FLUSH_INTERVAL_MS=5000

# Optimizaciones
TRACKING_ENABLE_THROTTLING=true
TRACKING_ENABLE_AGGREGATION=true

# Mantenimiento
TRACKING_AUTO_CLEANUP_ENABLED=true
TRACKING_RETENTION_MONTHS=12
TRACKING_CLEANUP_OLDER_THAN_MONTHS=13
```

### Índices MongoDB

Los índices se crean automáticamente, pero para producción se recomienda:

```javascript
// Índice TTL para auto-limpieza (opcional)
db.tracking_events_2025_01.createIndex(
  { "occurredAt": 1 },
  { expireAfterSeconds: 31536000 } // 1 año
);
```

### Escalabilidad

**Estimaciones de Volumen:**

| Eventos/min | Eventos/día | Storage/mes (aprox) | Recomendación |
|-------------|-------------|---------------------|---------------|
| 100 | 144K | ~500 MB | Single instance OK |
| 1,000 | 1.44M | ~5 GB | Single instance OK |
| 10,000 | 14.4M | ~50 GB | Considerar sharding |
| 100,000 | 144M | ~500 GB | Sharding + Read replicas |

**Optimizaciones para Alto Volumen:**
1. Incrementar `TRACKING_BUFFER_MAX_SIZE` a 1000-2000
2. Habilitar throttling agresivo para eventos de alta frecuencia
3. Configurar MongoDB con sharding por `tenantId`
4. Usar read replicas para queries de estadísticas

## Troubleshooting

### El buffer no se vacía

**Síntomas**: `currentSize` siempre en valores altos

**Causas posibles**:
- MongoDB connection issues
- Errores en bulkWrite

**Solución**:
```bash
# Verificar logs
grep "Error al hacer flush" logs/app.log

# Verificar conexión MongoDB
mongo --eval "db.adminCommand('ping')"
```

### Alto descarte de eventos

**Síntomas**: `totalDiscarded` muy alto

**Causa**: Throttling agresivo

**Solución**:
```typescript
// Ajustar configuración de throttling
bufferService.updateThrottlingConfig('SCROLL', {
  samplingRate: 50, // Incrementar de 10% a 50%
  alwaysKeep: false
});
```

### Performance lento en queries

**Síntomas**: Queries de estadísticas lentas

**Soluciones**:
1. Verificar que los índices existen: `db.tracking_events_2025_01.getIndexes()`
2. Limitar rango de fechas en queries
3. Usar agregación de MongoDB en lugar de cargar todos los docs

## Roadmap

### v2.1 (Próximo)
- [ ] Streaming de eventos con Server-Sent Events
- [ ] Dashboard de métricas en tiempo real
- [ ] Alertas configurables por umbrales

### v2.2 (Futuro)
- [ ] Análisis de patrones con ML
- [ ] Detección de anomalías
- [ ] Export a Data Warehouse (BigQuery, Snowflake)

## Referencias

- [Guía de Frontend](../../../docs/tracking/TRACKING_V2_FRONTEND_GUIDE.md)
- [MongoDB Bulk Write Docs](https://www.mongodb.com/docs/manual/reference/method/db.collection.bulkWrite/)
- [NestJS CQRS](https://docs.nestjs.com/recipes/cqrs)
