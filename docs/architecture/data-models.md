# Guiders Backend - Modelos de Datos

**Fecha:** 2026-04-01
**Colecciones MongoDB:** 15
**Tablas PostgreSQL:** 7
**Contextos:** 9

## Resumen Ejecutivo

Documentacion completa del esquema de base de datos del backend Guiders. El sistema utiliza persistencia dual: **PostgreSQL** (via TypeORM) para entidades core/legacy y **MongoDB** (via Mongoose) para los contextos V2 de alto rendimiento. Adicionalmente, **Redis** se usa para cache de sesiones y presencia en tiempo real.

---

## PostgreSQL (TypeORM)

### 1. companies (Contexto: company)

**Archivo:** `src/context/company/infrastructure/persistence/entity/company-typeorm.entity.ts`

| Columna        | Tipo DB      | Nullable | Default             | Constraint |
| -------------- | ------------ | -------- | ------------------- | ---------- |
| `id`           | uuid         | NO       | -                   | PK         |
| `company_name` | varchar(255) | NO       | -                   | -          |
| `created_at`   | timestamp    | NO       | `CURRENT_TIMESTAMP` | -          |
| `updated_at`   | timestamp    | NO       | `CURRENT_TIMESTAMP` | -          |

**Relaciones:** `sites` → OneToMany → `company_sites` (cascade: true, eager: true)

---

### 2. company_sites (Contexto: company)

**Archivo:** `src/context/company/infrastructure/persistence/typeorm/company-site.entity.ts`

| Columna        | Tipo DB      | Nullable | Default        | Constraint                    |
| -------------- | ------------ | -------- | -------------- | ----------------------------- |
| `id`           | uuid         | NO       | auto-generated | PK                            |
| `domain`       | varchar(255) | NO       | -              | -                             |
| `is_canonical` | boolean      | NO       | `false`        | -                             |
| `company_id`   | uuid         | NO       | -              | FK → `companies.id` (CASCADE) |
| `created_at`   | timestamp    | NO       | auto           | CreateDateColumn              |
| `updated_at`   | timestamp    | NO       | auto           | UpdateDateColumn              |

**Relaciones:** `company` → ManyToOne → `companies` (onDelete: CASCADE)

---

### 3. user_account_entity (Contexto: auth)

**Archivo:** `src/context/auth/auth-user/infrastructure/user-account.entity.ts`

| Columna       | Tipo DB             | Nullable | Default             | Constraint |
| ------------- | ------------------- | -------- | ------------------- | ---------- |
| `id`          | uuid                | NO       | auto-generated      | PK         |
| `email`       | varchar             | NO       | -                   | UNIQUE     |
| `name`        | varchar(255)        | NO       | -                   | -          |
| `password`    | text                | SI       | -                   | -          |
| `createdAt`   | timestamptz         | NO       | `CURRENT_TIMESTAMP` | -          |
| `updatedAt`   | timestamptz         | NO       | `CURRENT_TIMESTAMP` | -          |
| `lastLoginAt` | timestamptz         | SI       | -                   | -          |
| `roles`       | text (simple-array) | NO       | `''`                | -          |
| `companyId`   | uuid                | NO       | -                   | -          |
| `isActive`    | boolean             | NO       | `true`              | -          |
| `keycloakId`  | uuid                | SI       | -                   | UNIQUE     |
| `avatarUrl`   | text                | SI       | -                   | -          |

---

### 4. invites (Contexto: auth)

**Archivo:** `src/context/auth/auth-user/infrastructure/persistence/entity/invite-typeorm.entity.ts`

| Columna     | Tipo DB   | Nullable | Constraint |
| ----------- | --------- | -------- | ---------- |
| `id`        | uuid      | NO       | PK         |
| `userId`    | uuid      | NO       | -          |
| `email`     | varchar   | NO       | -          |
| `token`     | varchar   | NO       | -          |
| `expiresAt` | timestamp | NO       | -          |

---

### 5. api_key_entity (Contexto: auth)

**Archivo:** `src/context/auth/api-key/infrastructure/api-key.entity.ts`

| Columna      | Tipo DB     | Nullable | Default             | Constraint |
| ------------ | ----------- | -------- | ------------------- | ---------- |
| `id`         | uuid        | NO       | auto-generated      | PK         |
| `apiKey`     | varchar     | NO       | -                   | UNIQUE     |
| `domain`     | varchar     | NO       | -                   | UNIQUE     |
| `publicKey`  | text        | NO       | -                   | -          |
| `privateKey` | text        | NO       | -                   | (cifrado)  |
| `kid`        | varchar     | NO       | -                   | UNIQUE     |
| `companyId`  | uuid        | NO       | -                   | -          |
| `createdAt`  | timestamptz | NO       | `CURRENT_TIMESTAMP` | -          |

**Relaciones:** `visitors` → OneToMany → `visitor_account_entity`

---

### 6. visitor_account_entity (Contexto: auth)

**Archivo:** `src/context/auth/auth-visitor/infrastructure/visitor-account.entity.ts`

| Columna       | Tipo DB     | Nullable | Default             | Constraint |
| ------------- | ----------- | -------- | ------------------- | ---------- |
| `id`          | uuid        | NO       | auto-generated      | PK         |
| `clientID`    | varchar     | NO       | -                   | UNIQUE     |
| `userAgent`   | varchar     | NO       | -                   | -          |
| `createdAt`   | timestamptz | NO       | `CURRENT_TIMESTAMP` | -          |
| `lastLoginAt` | timestamptz | SI       | -                   | -          |

**Relaciones:** `apiKey` → ManyToOne → `api_key_entity` (JoinColumn: `apiKey`)

---

### 7. visitors (Contexto: visitors V1 - Legacy)

**Archivo:** `src/context/visitors/infrastructure/persistence/visitor-typeorm.entity.ts`

| Columna | Tipo DB             | Nullable | Constraint |
| ------- | ------------------- | -------- | ---------- |
| `id`    | varchar(36)         | NO       | PK         |
| `name`  | varchar(255)        | SI       | -          |
| `email` | varchar(255)        | SI       | -          |
| `tel`   | varchar(50)         | SI       | -          |
| `tags`  | text (simple-array) | SI       | -          |

> **Nota:** Tabla legacy, reemplazada por la coleccion `visitors_v2` en MongoDB.

---

### Migraciones TypeORM

**Directorio:** `src/migrations/`

Las migraciones gestionan el esquema PostgreSQL. Se ejecutan con:

```bash
npm run typeorm:migrate:run
npm run typeorm:migrate:generate -- -n NombreMigracion
```

---

## MongoDB (Mongoose)

### 1. visitors_v2 (Contexto: visitors-v2)

**Archivo:** `src/context/visitors-v2/infrastructure/persistence/entity/visitor-v2-mongo.entity.ts`

| Campo                      | Tipo                                  | Requerido | Default     | Indice                     |
| -------------------------- | ------------------------------------- | --------- | ----------- | -------------------------- |
| `id`                       | string                                | SI        | -           | unique                     |
| `tenantId`                 | string                                | SI        | -           | single + compound          |
| `siteId`                   | string                                | SI        | -           | single + compound          |
| `fingerprint`              | string                                | SI        | -           | compound unique (+ siteId) |
| `lifecycle`                | enum: ANON, ENGAGED, LEAD, CONVERTED  | SI        | -           | single + compound          |
| `connectionStatus`         | enum: online, away, chatting, offline | SI        | `'offline'` | single + compound          |
| `hasAcceptedPrivacyPolicy` | boolean                               | SI        | `false`     | single                     |
| `privacyPolicyAcceptedAt`  | Date \| null                          | NO        | `null`      | single                     |
| `consentVersion`           | string \| null                        | NO        | `null`      | -                          |
| `currentUrl`               | string \| null                        | NO        | `null`      | -                          |
| `isInternal`               | boolean                               | SI        | `false`     | single + compound          |
| `createdAt`                | Date                                  | SI        | -           | compound                   |
| `updatedAt`                | Date                                  | SI        | -           | compound                   |
| `sessions`                 | Array (embedded)                      | NO        | `[]`        | sessions.id: single        |

**Sub-documento sessions[]:** `id` (string), `startedAt` (Date), `lastActivityAt` (Date), `endedAt` (Date|null), `currentUrl` (string|null), `ipAddress` (string|null), `userAgent` (string|null)

**Indices compuestos (6):**

- `{ fingerprint: 1, siteId: 1 }` (unique)
- `{ tenantId: 1, lifecycle: 1, connectionStatus: 1 }`
- `{ tenantId: 1, createdAt: -1 }` / `{ tenantId: 1, updatedAt: -1 }`
- `{ tenantId: 1, siteId: 1, lifecycle: 1 }`
- `{ tenantId: 1, isInternal: 1, updatedAt: -1 }`

---

### 2. saved_filters (Contexto: visitors-v2)

**Archivo:** `src/context/visitors-v2/infrastructure/persistence/entity/saved-filter-mongo.entity.ts`

| Campo         | Tipo                            | Requerido | Default |
| ------------- | ------------------------------- | --------- | ------- |
| `id`          | string                          | SI        | -       |
| `userId`      | string                          | SI        | -       |
| `tenantId`    | string                          | SI        | -       |
| `name`        | string                          | SI        | -       |
| `description` | string \| null                  | NO        | `null`  |
| `filters`     | Record<string, unknown>         | SI        | -       |
| `sort`        | Record<string, unknown> \| null | NO        | `null`  |
| `createdAt`   | Date                            | SI        | -       |
| `updatedAt`   | Date                            | SI        | -       |

**Indices:** `{ id: 1 }` (unique), `{ userId: 1, tenantId: 1 }`

---

### 3. chats_v2 (Contexto: conversations-v2)

**Archivo:** `src/context/conversations-v2/infrastructure/schemas/chat.schema.ts`

| Campo                        | Tipo                                                            | Requerido | Default | Indice                     |
| ---------------------------- | --------------------------------------------------------------- | --------- | ------- | -------------------------- |
| `id`                         | string                                                          | SI        | -       | unique                     |
| `status`                     | enum: PENDING, ASSIGNED, ACTIVE, CLOSED, TRANSFERRED, ABANDONED | SI        | -       | single + compound          |
| `priority`                   | enum: LOW, MEDIUM, NORMAL, HIGH, URGENT                         | SI        | -       | single + compound          |
| `visitorInfo`                | VisitorInfoSchema (embedded)                                    | SI        | -       | text index                 |
| `assignedCommercialId`       | string                                                          | NO        | -       | single (sparse) + compound |
| `availableCommercialIds`     | string[]                                                        | NO        | -       | single                     |
| `metadata`                   | ChatMetadataSchema (embedded)                                   | SI        | -       | compound                   |
| `createdAt`                  | Date                                                            | SI        | auto    | single + compound          |
| `assignedAt`                 | Date                                                            | NO        | -       | single (sparse)            |
| `closedAt`                   | Date                                                            | NO        | -       | single (sparse)            |
| `lastMessageDate`            | Date                                                            | NO        | -       | single (sparse) + compound |
| `lastMessageContent`         | string                                                          | NO        | -       | -                          |
| `totalMessages`              | number                                                          | SI        | `0`     | single                     |
| `unreadMessagesCount`        | number                                                          | SI        | `0`     | -                          |
| `isActive`                   | boolean                                                         | SI        | `true`  | single + compound          |
| `visitorId`                  | string                                                          | SI        | -       | single + compound          |
| `department`                 | string                                                          | SI        | -       | single + compound          |
| `tags`                       | string[]                                                        | NO        | -       | single                     |
| `averageResponseTimeMinutes` | number                                                          | NO        | -       | -                          |
| `chatDurationMinutes`        | number                                                          | NO        | -       | -                          |
| `resolutionStatus`           | enum: resolved, unresolved, escalated                           | NO        | -       | -                          |
| `satisfactionRating`         | number (1-5)                                                    | NO        | -       | -                          |

**Sub-documento VisitorInfoSchema:** `id`, `name`, `email`, `phone`, `location`, `additionalData`
**Sub-documento ChatMetadataSchema:** `department`, `source`, `initialUrl`, `userAgent`, `referrer`, `tags`, `customFields`

**Indices compuestos (9) + Indice de texto:**

- `{ status: 1, priority: 1, createdAt: 1 }`
- `{ assignedCommercialId: 1, status: 1 }`
- `{ visitorId: 1, createdAt: -1 }`
- `{ department: 1, status: 1 }`
- `{ isActive: 1, status: 1, priority: 1 }`
- Texto: `visitorInfo.name`, `visitorInfo.email`, `metadata.tags`

---

### 4. messages_v2 (Contexto: conversations-v2)

**Archivo:** `src/context/conversations-v2/infrastructure/schemas/message.schema.ts`

| Campo              | Tipo                                                      | Requerido | Default | Indice                     |
| ------------------ | --------------------------------------------------------- | --------- | ------- | -------------------------- |
| `id`               | string                                                    | SI        | -       | unique                     |
| `chatId`           | string                                                    | SI        | -       | single + compound (muchos) |
| `type`             | enum: TEXT, SYSTEM, FILE, IMAGE, TRANSFER, ASSIGNMENT, AI | SI        | -       | single + compound          |
| `content`          | MessageContentSchema (embedded)                           | SI        | -       | text index                 |
| `senderId`         | string                                                    | SI        | -       | single + compound          |
| `senderType`       | enum: visitor, commercial, system, ai                     | SI        | -       | single + compound          |
| `sentAt`           | Date                                                      | SI        | -       | single + compound (muchos) |
| `readAt`           | Date                                                      | NO        | -       | single (sparse)            |
| `readBy`           | string                                                    | NO        | -       | single (sparse)            |
| `isRead`           | boolean                                                   | SI        | `false` | single + compound          |
| `isEdited`         | boolean                                                   | SI        | `false` | single                     |
| `isDeleted`        | boolean                                                   | SI        | `false` | compound                   |
| `sequenceNumber`   | number                                                    | SI        | -       | single + compound          |
| `replyToMessageId` | string                                                    | NO        | -       | single (sparse)            |
| `isInternal`       | boolean                                                   | SI        | `false` | single                     |
| `isAI`             | boolean                                                   | SI        | `false` | single                     |
| `tags`             | string[]                                                  | NO        | -       | single                     |
| `searchableText`   | string                                                    | NO        | -       | text index                 |

**Sub-documento MessageContentSchema:** `text` (string), `metadata` (Object), `attachments[]` (id, name, url, type, size, mimeType)

**Indices compuestos (12) + Indice de texto:**

- `{ chatId: 1, sentAt: 1 }`, `{ chatId: 1, sequenceNumber: 1 }`
- `{ chatId: 1, isRead: 1, senderType: 1 }`
- `{ chatId: 1, sentAt: -1, isDeleted: 1 }`
- Texto: `searchableText`, `content.text`

---

### 5. assignment_rules (Contexto: conversations-v2)

**Archivo:** `src/context/conversations-v2/infrastructure/persistence/entity/assignment-rules-mongoose.entity.ts`

| Campo                     | Tipo                      | Requerido | Default    |
| ------------------------- | ------------------------- | --------- | ---------- |
| `id`                      | string                    | SI        | -          |
| `companyId`               | string                    | SI        | -          |
| `siteId`                  | string                    | NO        | -          |
| `defaultStrategy`         | AssignmentStrategy (enum) | SI        | -          |
| `maxChatsPerCommercial`   | number (min: 1)           | SI        | -          |
| `maxWaitTimeSeconds`      | number (min: 1)           | SI        | -          |
| `enableSkillBasedRouting` | boolean                   | SI        | `false`    |
| `workingHours`            | Object (embedded)         | NO        | -          |
| `fallbackStrategy`        | AssignmentStrategy (enum) | SI        | -          |
| `priorities`              | Map<string, number>       | NO        | `{}`       |
| `isActive`                | boolean                   | SI        | `true`     |
| `createdAt`               | Date                      | SI        | `Date.now` |
| `updatedAt`               | Date                      | SI        | `Date.now` |

**Indice compuesto:** `{ companyId: 1, siteId: 1 }` (unique)

---

### 6. tracking_events_YYYY_MM (Contexto: tracking-v2) ⚡ Particionado

**Archivo:** `src/context/tracking-v2/infrastructure/persistence/entity/tracking-event-mongo.entity.ts`

| Campo        | Tipo                | Requerido | Default |
| ------------ | ------------------- | --------- | ------- |
| `id`         | string              | SI        | -       |
| `visitorId`  | string              | SI        | -       |
| `sessionId`  | string              | SI        | -       |
| `tenantId`   | string              | SI        | -       |
| `siteId`     | string              | SI        | -       |
| `eventType`  | string              | SI        | -       |
| `metadata`   | Record<string, any> | SI        | `{}`    |
| `occurredAt` | Date                | SI        | -       |
| `count`      | number              | SI        | `1`     |

**Particionamiento:** Colecciones mensuales dinamicas (`tracking_events_2026_04`, etc.)

**Indices compuestos (8):**

- `{ visitorId: 1, occurredAt: -1 }`, `{ sessionId: 1, occurredAt: -1 }`
- `{ tenantId: 1, eventType: 1, occurredAt: -1 }`
- `{ siteId: 1, occurredAt: -1 }`
- `{ tenantId: 1, siteId: 1, occurredAt: -1 }`
- `{ visitorId: 1, sessionId: 1, eventType: 1 }`

---

### 7. commercials (Contexto: commercial)

**Archivo:** `src/context/commercial/infrastructure/persistence/schemas/commercial.schema.ts`

| Campo               | Tipo           | Requerido | Default |
| ------------------- | -------------- | --------- | ------- |
| `id`                | string         | SI        | -       |
| `name`              | string         | SI        | -       |
| `connectionStatus`  | string         | SI        | -       |
| `lastActivity`      | Date           | SI        | -       |
| `avatarUrl`         | string \| null | NO        | -       |
| `metadata`          | Mixed          | NO        | -       |
| `knownFingerprints` | string[]       | NO        | `[]`    |
| `createdAt`         | Date           | auto      | -       |
| `updatedAt`         | Date           | auto      | -       |

**Indice compuesto:** `{ connectionStatus: 1, lastActivity: -1 }`

---

### 8. crm_company_configs (Contexto: leads)

**Archivo:** `src/context/leads/infrastructure/persistence/schemas/crm-company-config.schema.ts`

| Campo                   | Tipo                                | Requerido | Default                 |
| ----------------------- | ----------------------------------- | --------- | ----------------------- |
| `id`                    | string                              | SI        | -                       |
| `companyId`             | string                              | SI        | -                       |
| `crmType`               | enum: leadcars, hubspot, salesforce | SI        | -                       |
| `enabled`               | boolean                             | SI        | `false`                 |
| `syncChatConversations` | boolean                             | SI        | `true`                  |
| `triggerEvents`         | string[]                            | SI        | `['lifecycle_to_lead']` |
| `config`                | Record<string, unknown>             | SI        | -                       |

**Sub-documento config (LeadCars):** `clienteToken`, `useSandbox`, `concesionarioId`, `sedeId`, `campanaId`, `tipoLeadDefault`

**Indices:** `{ companyId: 1, crmType: 1 }` (unique), `{ enabled: 1, crmType: 1 }` (partial)

---

### 9. crm_sync_records (Contexto: leads)

**Archivo:** `src/context/leads/infrastructure/persistence/schemas/crm-sync-record.schema.ts`

| Campo            | Tipo                                   | Requerido | Default     |
| ---------------- | -------------------------------------- | --------- | ----------- |
| `id`             | string                                 | SI        | -           |
| `visitorId`      | string                                 | SI        | -           |
| `companyId`      | string                                 | SI        | -           |
| `crmType`        | enum: leadcars, hubspot, salesforce    | SI        | -           |
| `externalLeadId` | string                                 | NO        | -           |
| `status`         | enum: pending, synced, failed, partial | SI        | `'pending'` |
| `retryCount`     | number                                 | SI        | `0`         |
| `chatsSynced`    | string[]                               | SI        | `[]`        |

**Indice unico:** `{ visitorId: 1, companyId: 1, crmType: 1 }`

---

### 10. lead_contact_data (Contexto: leads)

**Archivo:** `src/context/leads/infrastructure/persistence/schemas/lead-contact-data.schema.ts`

| Campo                 | Tipo                    | Requerido | Default |
| --------------------- | ----------------------- | --------- | ------- |
| `id`                  | string                  | SI        | -       |
| `visitorId`           | string                  | SI        | -       |
| `companyId`           | string                  | SI        | -       |
| `nombre`              | string                  | NO        | -       |
| `apellidos`           | string                  | NO        | -       |
| `email`               | string                  | NO        | -       |
| `telefono`            | string                  | NO        | -       |
| `dni`                 | string                  | NO        | -       |
| `poblacion`           | string                  | NO        | -       |
| `additionalData`      | Record<string, unknown> | NO        | `{}`    |
| `extractedFromChatId` | string                  | NO        | -       |

**Indice unico:** `{ visitorId: 1, companyId: 1 }`

---

### 11. visitor_consents (Contexto: consent)

**Archivo:** `src/context/consent/infrastructure/persistence/entity/visitor-consent-mongo.entity.ts`

| Campo         | Tipo                                       | Requerido | Default |
| ------------- | ------------------------------------------ | --------- | ------- |
| `id`          | string                                     | SI        | -       |
| `visitorId`   | string                                     | SI        | -       |
| `consentType` | enum: privacy_policy, marketing, analytics | SI        | -       |
| `status`      | enum: granted, revoked, expired            | SI        | -       |
| `version`     | string                                     | SI        | -       |
| `grantedAt`   | Date                                       | SI        | -       |
| `revokedAt`   | Date \| null                               | NO        | `null`  |
| `expiresAt`   | Date \| null                               | NO        | `null`  |
| `ipAddress`   | string                                     | SI        | -       |

**Indices:** `{ visitorId: 1, consentType: 1 }`, `{ visitorId: 1, status: 1 }`, `{ expiresAt: 1 }` (sparse, TTL candidato)

---

### 12. consent_audit_logs (Contexto: consent) 🔒 Inmutable

**Archivo:** `src/context/consent/infrastructure/persistence/entity/consent-audit-log-mongo.entity.ts`

| Campo            | Tipo                    | Requerido |
| ---------------- | ----------------------- | --------- |
| `id`             | string                  | SI        |
| `consentId`      | string                  | SI        |
| `visitorId`      | string                  | SI        |
| `actionType`     | string                  | SI        |
| `consentType`    | string                  | SI        |
| `consentVersion` | string                  | NO        |
| `ipAddress`      | string                  | NO        |
| `userAgent`      | string                  | NO        |
| `reason`         | string                  | NO        |
| `metadata`       | Record<string, unknown> | NO        |
| `timestamp`      | Date                    | SI        |

**Inmutabilidad:** Pre-hooks bloquean `findOneAndUpdate`, `updateOne`, `updateMany`

**Indices:** `{ visitorId: 1, timestamp: -1 }`, `{ consentId: 1, timestamp: -1 }`, `{ actionType: 1, timestamp: -1 }`

---

### 13. white_label_configs (Contexto: white-label)

**Archivo:** `src/context/white-label/infrastructure/schemas/white-label-config.schema.ts`

| Campo        | Tipo                                  | Requerido | Default   |
| ------------ | ------------------------------------- | --------- | --------- |
| `companyId`  | string                                | SI        | -         |
| `colors`     | WhiteLabelColorsSchema (embedded)     | NO        | `{}`      |
| `branding`   | WhiteLabelBrandingSchema (embedded)   | SI        | -         |
| `typography` | WhiteLabelTypographySchema (embedded) | NO        | `{}`      |
| `theme`      | enum: light, dark, system             | NO        | `'light'` |

**Colores por defecto:** primary `#007bff`, secondary `#6c757d`, tertiary `#17a2b8`, background `#ffffff`, surface `#f8f9fa`, text `#212529`

**Indice:** `{ companyId: 1 }` (unique)

---

### 14. llm_company_configs (Contexto: llm)

**Archivo:** `src/context/llm/infrastructure/schemas/llm-company-config.schema.ts`

| Campo                     | Tipo              | Requerido | Default                     |
| ------------------------- | ----------------- | --------- | --------------------------- |
| `companyId`               | string            | SI        | -                           |
| `aiAutoResponseEnabled`   | boolean           | NO        | `true`                      |
| `aiSuggestionsEnabled`    | boolean           | NO        | `true`                      |
| `aiRespondWithCommercial` | boolean           | NO        | `false`                     |
| `preferredProvider`       | string            | NO        | `'groq'`                    |
| `preferredModel`          | string            | NO        | `'llama-3.3-70b-versatile'` |
| `customSystemPrompt`      | string \| null    | NO        | `null`                      |
| `maxResponseTokens`       | number            | NO        | `500`                       |
| `temperature`             | number            | NO        | `0.7`                       |
| `responseDelayMs`         | number            | NO        | `1000`                      |
| `toolConfig`              | Object (embedded) | NO        | `null`                      |

**Sub-documento toolConfig:** `fetchPageEnabled`, `saveLeadContactEnabled`, `escalateToCommercialEnabled`, `allowedPaths`, `maxIterations`, `fetchTimeoutMs`, `cacheEnabled`, `cacheTtlSeconds`, `baseUrl`

**Indice:** `{ companyId: 1 }` (unique)

---

### 15. web_content_cache (Contexto: llm) ⏰ TTL

**Archivo:** `src/context/llm/infrastructure/schemas/web-content-cache.schema.ts`

| Campo          | Tipo    | Requerido | Default |
| -------------- | ------- | --------- | ------- |
| `url`          | string  | SI        | -       |
| `companyId`    | string  | SI        | -       |
| `content`      | string  | SI        | -       |
| `originalSize` | number  | SI        | -       |
| `truncated`    | boolean | NO        | `false` |
| `fetchTimeMs`  | number  | SI        | -       |
| `expiresAt`    | Date    | SI        | -       |

**Indice unico:** `{ url: 1, companyId: 1 }`
**Indice TTL:** `{ expiresAt: 1 }` con `expireAfterSeconds: 0` (auto-eliminacion)

---

## Redis (Cache y Presencia)

Redis se utiliza para datos efimeros de alta velocidad:

| Clave                      | Contexto         | Proposito                                | TTL           |
| -------------------------- | ---------------- | ---------------------------------------- | ------------- |
| `commercial:status:<id>`   | commercial       | Estado de conexion del comercial         | Session-based |
| `presence:chat:<chatId>`   | conversations-v2 | Presencia en chat (quien esta conectado) | Transient     |
| `typing:<chatId>:<userId>` | conversations-v2 | Indicadores de escritura                 | ~5s           |
| `visitor:session:<id>`     | visitors-v2      | Datos de sesion del visitante            | Session-based |

---

## Resumen de Indices

| Coleccion/Tabla         | Tipo       | Indices Totales | Indices Texto | TTL       |
| ----------------------- | ---------- | --------------- | ------------- | --------- |
| visitors_v2             | MongoDB    | 14              | NO            | NO        |
| chats_v2                | MongoDB    | 18              | SI            | NO        |
| messages_v2             | MongoDB    | 19              | SI            | NO        |
| assignment_rules        | MongoDB    | 5               | NO            | NO        |
| tracking_events_YYYY_MM | MongoDB    | 10              | NO            | Candidato |
| commercials             | MongoDB    | 5               | NO            | NO        |
| crm_company_configs     | MongoDB    | 4               | NO            | NO        |
| crm_sync_records        | MongoDB    | 5               | NO            | NO        |
| lead_contact_data       | MongoDB    | 4               | NO            | NO        |
| visitor_consents        | MongoDB    | 4               | NO            | Candidato |
| consent_audit_logs      | MongoDB    | 5               | NO            | NO        |
| white_label_configs     | MongoDB    | 2               | NO            | NO        |
| llm_company_configs     | MongoDB    | 1               | NO            | NO        |
| web_content_cache       | MongoDB    | 3               | NO            | SI        |
| companies               | PostgreSQL | 0               | N/A           | N/A       |
| company_sites           | PostgreSQL | FK              | N/A           | N/A       |
| user_account_entity     | PostgreSQL | 2 UNIQUE        | N/A           | N/A       |
| invites                 | PostgreSQL | 0               | N/A           | N/A       |
| api_key_entity          | PostgreSQL | 3 UNIQUE        | N/A           | N/A       |
| visitor_account_entity  | PostgreSQL | 1 UNIQUE + FK   | N/A           | N/A       |
| visitors (legacy)       | PostgreSQL | 0               | N/A           | N/A       |

**Total: ~99 indices** en MongoDB + 6 constraints UNIQUE en PostgreSQL

---

## Diagrama de Relaciones entre Contextos

```
companies (PG) ──1:N──> company_sites (PG)
    │
    ├── api_key_entity (PG) ──1:N──> visitor_account_entity (PG)
    │
    ├── user_account_entity (PG) [companyId]
    │
    ├── visitors_v2 (Mongo) [tenantId = companyId]
    │       │
    │       ├── chats_v2 (Mongo) [visitorId]
    │       │       └── messages_v2 (Mongo) [chatId]
    │       │
    │       ├── tracking_events (Mongo) [visitorId, tenantId]
    │       │
    │       ├── visitor_consents (Mongo) [visitorId]
    │       │       └── consent_audit_logs (Mongo) [consentId, visitorId]
    │       │
    │       └── lead_contact_data (Mongo) [visitorId, companyId]
    │
    ├── commercials (Mongo) [id = keycloakId del user]
    │
    ├── crm_company_configs (Mongo) [companyId]
    │       └── crm_sync_records (Mongo) [companyId, visitorId]
    │
    ├── assignment_rules (Mongo) [companyId]
    │
    ├── white_label_configs (Mongo) [companyId]
    │
    └── llm_company_configs (Mongo) [companyId]
            └── web_content_cache (Mongo) [companyId]
```

---

_Generado usando el workflow `document-project` de BMAD Method_
