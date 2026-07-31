# AGENTS.md - Leads Context

Gestión de datos de contacto de visitantes y sincronización CRM. Captura leads desde la consola comercial o la IA, y los sincroniza automáticamente con CRMs externos (LeadCars, extensible a HubSpot/Salesforce).

**Parent documentation**: [Root AGENTS.md](../../AGENTS.md) | **Related**: [Visitors V2](../visitors-v2/AGENTS.md), [Conversations V2](../conversations-v2/AGENTS.md), [LLM](../llm/AGENTS.md)

## Context Overview

El contexto Leads maneja:

- Guardado y actualización de datos de contacto de visitantes (upsert con merge parcial)
- Conversión automática de visitor a estado LEAD cuando el contacto cumple el criterio de Lead:
  **nombre** (no vacío) **+** (**email** o **teléfono**)
- Sincronización automática de leads a CRM al cambiar lifecycle a LEAD
- Sincronización automática de conversaciones de chat al cerrar un chat
- Configuración CRM multi-tenant (una config por empresa + tipo de CRM)
- Dashboard de registros de sincronización (synced, failed, partial)
- Proxy discovery de datos del CRM (concesionarios, sedes, campañas, tipos de lead)
- Test de conexión CRM (con credenciales manuales o config guardada)

Este contexto es **crítico para la integración con CRMs** y cierra el ciclo entre la captura del lead en guiders y su aparición en el CRM del cliente.

## Directory Structure (Real)

```
src/context/leads/
├── AGENTS.md
├── leads.module.ts
├── application/
│   ├── commands/
│   │   ├── index.ts
│   │   ├── save-lead-contact-data.command.ts
│   │   ├── save-lead-contact-data-command.handler.ts
│   │   ├── sync-chat-to-crm.command.ts
│   │   ├── sync-chat-to-crm-command.handler.ts
│   │   ├── sync-lead-to-crm.command.ts
│   │   ├── sync-lead-to-crm-command.handler.ts
│   │   └── __tests__/
│   │       └── save-lead-contact-data-command.handler.spec.ts
│   ├── dtos/
│   │   ├── index.ts
│   │   ├── crm-config.dto.ts
│   │   ├── lead-contact-data.dto.ts
│   │   └── update-contact-data.dto.ts
│   └── events/
│       ├── index.ts
│       ├── sync-chat-on-chat-closed.event-handler.ts
│       └── sync-lead-on-lifecycle-changed.event-handler.ts
├── domain/
│   ├── crm-company-config.repository.ts
│   ├── crm-sync-record.repository.ts
│   ├── lead-contact-data.repository.ts
│   ├── errors/
│   │   └── leads.error.ts
│   ├── events/
│   │   └── lead-synced.event.ts
│   └── services/
│       └── crm-sync.service.ts
└── infrastructure/
    ├── adapters/
    │   └── leadcars/
    │       ├── index.ts
    │       ├── leadcars.types.ts
    │       ├── leadcars-api.service.ts
    │       └── leadcars-crm-sync.adapter.ts
    ├── controllers/
    │   ├── index.ts
    │   ├── leads-admin.controller.ts
    │   └── leads-contact.controller.ts
    ├── persistence/
    │   ├── impl/
    │   │   ├── mongo-crm-company-config.repository.impl.ts
    │   │   ├── mongo-crm-sync-record.repository.impl.ts
    │   │   └── mongo-lead-contact-data.repository.impl.ts
    │   └── schemas/
    │       ├── crm-company-config.schema.ts
    │       ├── crm-sync-record.schema.ts
    │       └── lead-contact-data.schema.ts
    └── services/
        └── crm-sync-service.factory.ts
```

## Persistencia (MongoDB)

Tres colecciones en MongoDB:

### `lead_contact_data`

Datos de contacto del visitante. Índice unique: `(visitorId, companyId)`.

```typescript
{
  id: string;              // UUID
  visitorId: string;       // UUID del visitor
  companyId: string;       // UUID de la empresa (tenantId)
  nombre?: string;
  apellidos?: string;
  email?: string;
  telefono?: string;
  dni?: string;
  poblacion?: string;
  additionalData?: Record<string, unknown>;
  extractedFromChatId?: string;
  extractedAt: Date;
  updatedAt: Date;
}
```

### `crm_company_configs`

Configuración CRM por empresa. Índice unique: `(companyId, crmType)`.

```typescript
{
  id: string;
  companyId: string;
  crmType: 'leadcars' | 'hubspot' | 'salesforce';
  enabled: boolean;
  syncChatConversations: boolean;
  triggerEvents: string[];   // ['lifecycle_to_lead', 'chat_closed']
  config: {                  // Para LeadCars:
    clienteToken: string;    // API token (header 'cliente-token')
    useSandbox: boolean;
    concesionarioId: number; // ID del concesionario
    sedeId?: number;         // ID de la sede (opcional)
    campanaCode?: string;    // Código de campaña (texto, no numérico)
    tipoLeadDefault: number; // ID del tipo de lead (de GET /tipos)
  };
  createdAt: Date;
  updatedAt: Date;
}
```

### `crm_sync_records`

Registros de sincronización. Índice unique: `(visitorId, companyId, crmType)`.

```typescript
{
  id: string;
  visitorId: string;
  companyId: string;
  crmType: string;
  crmConfigId: string;
  status: 'pending' | 'synced' | 'failed' | 'partial';
  externalLeadId?: string;   // ID del lead en LeadCars
  chatsSynced?: string[];    // IDs de chats sincronizados
  requestPayload: object;
  responsePayload?: object;
  errorMessage?: string;
  syncedAt: Date;
  retryCount: number;
}
```

## Referencia de la API LeadCars v2.4

> Documentación oficial: `docs/leadcar/LeadCars_API_V2_4.pdf`
> Última revisión: 10/06/2025

### URLs Base

| Entorno    | URL                                     |
| ---------- | --------------------------------------- |
| Producción | `https://api.leadcars.es/api/v2`        |
| Sandbox    | `https://apisandbox.leadcars.es/api/v2` |

### Autenticación

Header `cliente-token` con el token proporcionado por LeadCars (20 caracteres).
El módulo Automagic usa headers distintos: `api-user` + `api-token`.

### Endpoints Implementados

| Método | Endpoint                            | Descripción                    | Estado       |
| ------ | ----------------------------------- | ------------------------------ | ------------ |
| `POST` | `/leads`                            | Crear nuevo lead               | Implementado |
| `POST` | `/leads/{idLead}/comments`          | Registrar comentario           | Implementado |
| `POST` | `/leads/{idLead}/chat_conversation` | Registrar conversación de chat | Implementado |
| `GET`  | `/concesionarios`                   | Listar concesionarios          | Implementado |
| `GET`  | `/sedes/{concesionarioId}`          | Sedes de un concesionario      | Implementado |
| `GET`  | `/campanas/{concesionarioId}`       | Campañas de un concesionario   | Implementado |
| `GET`  | `/tipos`                            | Listar tipos de lead           | Implementado |

### Endpoints Pendientes de Implementar

| Método | Endpoint                           | Descripción              | Prioridad |
| ------ | ---------------------------------- | ------------------------ | --------- |
| `GET`  | `/leadinfos/{idLead}`              | Obtener info de un lead  | Media     |
| `PUT`  | `/leads/{idLead}/submit`           | Editar lead              | Media     |
| `GET`  | `/contacts/{idContacto}`           | Listar contacto          | Baja      |
| `PUT`  | `/gdprs/{idContact}`               | Modificar GDPR           | Baja      |
| `GET`  | `/journeys/list/summary`           | Listar flujos Automagic  | Alta      |
| `POST` | `/journeys/generate-lead-journey`  | Añadir lead a flujo      | Alta      |
| `GET`  | `/journeys/list/get-lead-journeys` | Estado de lead en flujos | Alta      |

### Campos de `POST /leads` (API Real v2.4)

| Campo              | Tipo          | Requerido | Descripción                                |
| ------------------ | ------------- | --------- | ------------------------------------------ |
| `nombre`           | Texto         | Sí        | Nombre del lead                            |
| `apellidos`        | Texto         | Sí        | Apellidos                                  |
| `email`            | Texto (x@y.z) | Sí        | Email                                      |
| `telefono`         | Texto E.164   | No        | Teléfono principal (+34XXXXXXXXX)          |
| `movil`            | Texto E.164   | No        | Teléfono móvil adicional                   |
| `cp`               | Texto         | No        | Código postal                              |
| `provincia`        | Texto         | No        | Provincia                                  |
| `comentario`       | Texto         | No        | Comentario/observaciones                   |
| `url_origen`       | Texto (URL)   | No        | URL de origen del lead                     |
| `concesionario`    | Número        | Sí        | ID del concesionario                       |
| `sede`             | Número        | No        | ID de la sede                              |
| `tipo_lead`        | Número        | Sí        | ID del tipo de lead (de GET /tipos)        |
| `campana`          | Texto         | No        | Código de la campaña                       |
| `{campo_dinamico}` | Texto         | No        | Campos dinámicos clave:valor al nivel raíz |

> **IMPORTANTE**: Los campos dinámicos se envían al nivel raíz del JSON (no dentro de un campo `datos_adicionales`). Las claves no deben llevar caracteres especiales ni espacios.

### Estructura de Chat Conversation (`POST /leads/{idLead}/chat_conversation`)

La API v2.4 espera un campo `chat` con esta estructura JSON:

```json
{
  "chat": {
    "chat_id": "string",
    "users": [
      {
        "_id": "string",
        "user": {
          "name": "string",
          "first_lastname": "string",
          "second_lastname": "string",
          "email": "string",
          "phone": "string",
          "id": "string"
        }
      },
      {
        "_id": "string",
        "visitor": {
          "name": "string",
          "first_lastname": "string",
          "second_lastname": "string",
          "email": "string",
          "phone": "string",
          "id": "string"
        }
      }
    ],
    "messages": [
      {
        "_id": "string",
        "message": { "text": "string", "type": "text" },
        "created_at": "ISO 8601",
        "user_sender": "users._id del emisor",
        "interaction_type": "welcome | default | close"
      }
    ]
  }
}
```

### Módulo Automagic (Nurturing) — Nuevo en v2.4

Módulo opcional de nurturing. Usa autenticación diferente: `api-user` (email) + `api-token` en headers.

| Método | Endpoint                           | Descripción                      |
| ------ | ---------------------------------- | -------------------------------- |
| `GET`  | `/journeys/list/summary`           | Listar flujos disponibles        |
| `POST` | `/journeys/generate-lead-journey`  | Añadir lead a flujo de nurturing |
| `GET`  | `/journeys/list/get-lead-journeys` | Estado de un lead en flujos      |

**Errores Automagic:**

- `409 CONFLICT` — El lead ya pasó por el flujo
- `400 BAD REQUEST` — El lead se encuentra actualmente en el flujo
- `404 NOT FOUND` — Lead o flujo no encontrados

## Discrepancias Conocidas: Código vs API v2.4

> **CRÍTICO**: Los tipos actuales en `leadcars.types.ts` no coinciden con la API real. Se requiere una story de alineación (ver Epic 4 en epics.md).

| Aspecto                | Código Actual                | API Real v2.4                                   | Impacto                                       |
| ---------------------- | ---------------------------- | ----------------------------------------------- | --------------------------------------------- |
| Campo concesionario    | `concesionario_id`           | `concesionario`                                 | **Alto** — nombre de campo incorrecto         |
| Campo sede             | `sede_id`                    | `sede`                                          | **Alto** — nombre de campo incorrecto         |
| Campo campaña          | `campana_id` (number)        | `campana` (texto/código)                        | **Alto** — tipo y nombre incorrectos          |
| Tipo de lead           | String enum (`COMPRA`, etc.) | Número (ID de GET /tipos)                       | **Alto** — tipo completamente incorrecto      |
| Campo origen           | `origen_lead`                | No existe                                       | **Medio** — campo inventado                   |
| Datos adicionales      | `datos_adicionales: {}`      | Campos dinámicos al nivel raíz                  | **Alto** — estructura incorrecta              |
| Observaciones          | `observaciones`              | `comentario`                                    | **Medio** — nombre incorrecto                 |
| Teléfono               | Sin formato especificado     | E.164 obligatorio                               | **Medio** — falta validación                  |
| Móvil                  | No existe                    | `movil` (E.164)                                 | **Bajo** — campo faltante                     |
| Código postal          | No existe                    | `cp`                                            | **Bajo** — campo faltante                     |
| URL origen             | No existe                    | `url_origen`                                    | **Bajo** — campo faltante                     |
| Chat conversation      | Formato custom interno       | Formato específico con `users[]` + `messages[]` | **Alto** — estructura completamente diferente |
| Response de crear lead | Asumido (success/data)       | No especificado en docs oficiales               | **Medio** — verificar en sandbox              |
| `listCampanas` URL     | `/campanas` (sin param)      | `/campanas/:concesionarioId`                    | **Alto** — falta parámetro requerido          |
| Automagic              | No implementado              | Nuevo en v2.4                                   | **Bajo** — feature nueva no crítica           |

## Commands Implementados

- `SaveLeadContactDataCommand` → Guarda/actualiza datos de contacto; si hay **nombre + (email|teléfono)** y el visitor está en ANON/ENGAGED, llama a `convertToLead()` + `commit()` (emite `VisitorLifecycleChangedEvent`). Si la promoción falla, el contacto igual se persiste.
- `SyncLeadToCrmCommand` → Sincroniza lead al CRM configurado
- `SyncChatToCrmCommand` → Sincroniza conversación de chat al CRM

### Criterio de Lead

| Campo | Requisito |
|-------|-----------|
| `nombre` | Obligatorio (trim no vacío) |
| `email` **o** `telefono` | Al menos uno (trim no vacío) |

Backfill de contactos ya existentes (one-shot):

```bash
node bin/guiders-cli.js promote-leads-from-contact-data --dry-run
node bin/guiders-cli.js promote-leads-from-contact-data --company-id <uuid>
```

## Event Handlers

- `SyncLeadOnLifecycleChangedEventHandler` → Escucha `VisitorLifecycleChangedEvent`, dispara sync si lifecycle → LEAD
- `SyncChatOnChatClosedEventHandler` → Escucha `ChatClosedEvent`, sincroniza mensajes si `syncChatConversations` está habilitado

## Eventos Emitidos

- `LeadContactDataSavedEvent` → Al crear nuevo contacto
- `LeadSyncedToCrmEvent` → Al sincronizar exitosamente un lead
- `LeadSyncFailedEvent` → Al fallar la sincronización
- `ChatSyncedToCrmEvent` → Al sincronizar exitosamente un chat

## Integration Points

| Contexto           | Propósito                 | Método                                       |
| ------------------ | ------------------------- | -------------------------------------------- |
| `visitors-v2`      | Conversión a LEAD         | Escucha `VisitorLifecycleChangedEvent`       |
| `conversations-v2` | Sync chat                 | Escucha `ChatClosedEvent`                    |
| `company`          | Tenant isolation          | `companyId` en todas las queries             |
| `llm`              | Captura automática por IA | Tool `save_lead_contact_data` → `CommandBus` |

## Arquitectura Multi-CRM

```
ICrmSyncService (interfaz)
├── LeadcarsCrmSyncAdapter  (implementado)
├── HubSpotCrmSyncAdapter   (futuro)
└── SalesforceCrmSyncAdapter (futuro)

CrmSyncServiceFactory → resuelve adapter por CrmType
```

## API Endpoints (Guiders Backend)

### Datos de Contacto

| Método | Endpoint                                    | Roles             | Descripción               |
| ------ | ------------------------------------------- | ----------------- | ------------------------- |
| `POST` | `/v1/leads/contact-data`                    | admin, commercial | Guardar datos de contacto |
| `GET`  | `/v1/leads/contact-data/visitor/:visitorId` | admin, commercial | Datos por visitor         |
| `GET`  | `/v1/leads/contact-data/:id`                | admin, commercial | Datos por ID              |
| `GET`  | `/v1/leads/contact-data/company/all`        | admin             | Todos los contactos       |

### Administración CRM

| Método   | Endpoint                                          | Roles             | Descripción                    |
| -------- | ------------------------------------------------- | ----------------- | ------------------------------ |
| `POST`   | `/v1/leads/admin/config`                          | admin             | Crear config CRM               |
| `GET`    | `/v1/leads/admin/config`                          | admin             | Listar configs                 |
| `GET`    | `/v1/leads/admin/config/:id`                      | admin             | Obtener config                 |
| `PUT`    | `/v1/leads/admin/config/:id`                      | admin             | Actualizar config              |
| `DELETE` | `/v1/leads/admin/config/:id`                      | admin             | Eliminar config                |
| `POST`   | `/v1/leads/admin/test-connection`                 | admin             | Test con credenciales manuales |
| `POST`   | `/v1/leads/admin/config/:configId/test`           | admin             | Test con config guardada       |
| `GET`    | `/v1/leads/admin/sync-records`                    | admin             | Registros de sync              |
| `GET`    | `/v1/leads/admin/sync-records/failed`             | admin             | Syncs fallidos                 |
| `GET`    | `/v1/leads/admin/sync-records/visitor/:visitorId` | admin, commercial | Sync por visitor               |
| `GET`    | `/v1/leads/admin/supported-crms`                  | admin             | CRMs soportados                |

### Proxy Discovery LeadCars

| Método | Endpoint                                             | Roles | Descripción                |
| ------ | ---------------------------------------------------- | ----- | -------------------------- |
| `GET`  | `/v1/leads/admin/leadcars/concesionarios`            | admin | Listar concesionarios      |
| `GET`  | `/v1/leads/admin/leadcars/sedes/:concesionarioId`    | admin | Sedes del concesionario    |
| `GET`  | `/v1/leads/admin/leadcars/campanas/:concesionarioId` | admin | Campañas del concesionario |
| `GET`  | `/v1/leads/admin/leadcars/tipos`                     | admin | Tipos de lead              |
| `GET`  | `/v1/leads/admin/leadcars/states`                    | admin | Estados disponibles (API v2.5) — mapa nombre→{id,group,fields} |

## Testing Strategy

### Unit Tests (existentes)

```bash
npm run test:unit -- src/context/leads/**/*.spec.ts
```

- `SaveLeadContactDataCommandHandler`: 6 casos (create, update, merge, edge cases)

### Tests Pendientes

- `SyncLeadToCrmCommandHandler`: sync exitoso, fallido, ya sincronizado, datos incompletos
- `SyncChatToCrmCommandHandler`: sync exitoso, chat ya sincronizado, lead no sincronizado
- `SyncLeadOnLifecycleChangedEventHandler`: triggers, sin config, sin datos
- `SyncChatOnChatClosedEventHandler`: con/sin config habilitada

## Known Limitations

- `clienteToken` se almacena sin encriptar en MongoDB (pendiente Story 2.5)
- Los tipos en `leadcars.types.ts` NO coinciden con la API real v2.4 (pendiente Epic 4)
- `listCampanas` no pasa `concesionarioId` como requiere la API real
- La estructura de `chat_conversation` usa formato custom en vez del formato real de la API
- No hay implementación del módulo Automagic (journeys/nurturing)
- Falta validación de formato E.164 para teléfonos
- No hay endpoint para obtener info de un lead ya creado (`GET /leadinfos/{id}`)
- No hay endpoint para editar un lead existente (`PUT /leads/{id}/submit`)

## Future Enhancements

1. **Alineación con API v2.4** — Corregir tipos, mapeo de campos, estructura de chat (Epic 4)
2. **Integración Automagic** — Flujos de nurturing de LeadCars (post-alineación)
3. **Encriptación API keys** — AES-256 para `clienteToken` en MongoDB (Story 2.5)
4. **HubSpot adapter** — Segundo CRM soportado
5. **Salesforce adapter** — Tercer CRM soportado
6. **Webhook bidireccional** — LeadCars → Guiders para actualizar estado del lead
7. **Retry manual** — Dashboard para reintentar syncs fallidos

## Related Documentation

- [Frontend Integration](../../../docs/leadcar/frontend-integration.md) — Guía para frontend
- [LeadCars API v2.4 (PDF)](../../../docs/leadcar/LeadCars_API_V2_4.pdf) — Documentación oficial de la API
- [LLM Tool Use Guide](../../../docs/LLM_TOOL_USE_GUIDE.md) — Captura automática por IA
- [Root AGENTS.md](../../AGENTS.md) — Arquitectura general
