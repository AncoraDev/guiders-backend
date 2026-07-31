# Security Audit 2026 — Data Isolation & Multi-Tenant Persistence

**Alcance**: Auditoría exhaustiva del aislamiento multi-tenant y capa de persistencia (MongoDB/Mongoose + PostgreSQL/TypeORM) en los 10 contextos activos del backend Guiders.

**Fecha**: 2026-04-21
**Severidad máxima detectada**: CRÍTICA
**Hallazgos totales**: 21

---

## Resumen

La auditoría ha identificado **fallos sistémicos de aislamiento multi-tenant** en contextos críticos del sistema. Los contextos **`conversations-v2`** y **`commercial`** carecen por completo del campo `companyId`/`tenantId` en sus esquemas Mongo, lo que hace estructuralmente imposible aplicar filtros de tenant y expone todos los endpoints relacionados a **IDOR cross-tenant horizontal**.

### Distribución por severidad

| Severidad | Cantidad | Contextos afectados |
| --- | --- | --- |
| CRÍTICA | 9 | conversations-v2, commercial, tracking-v2 |
| ALTA | 7 | conversations-v2, commercial, visitors-v2, consent |
| MEDIA | 4 | visitors-v2, consent, tracking-v2 |
| BAJA | 1 | leads |

### Contextos vulnerables vs seguros

| Contexto | Estado | Notas |
| --- | --- | --- |
| `conversations-v2` | ❌ CRÍTICO | Sin `companyId` en ChatSchema ni MessageSchema |
| `commercial` | ❌ CRÍTICO | Sin tenancy + `match()` ignora criteria |
| `tracking-v2` | ⚠️ PARCIAL | Schema correcto, repos con fugas |
| `visitors-v2` | ⚠️ PARCIAL | Schema correcto, `findBy*` cross-tenant |
| `consent` | ⚠️ PARCIAL | Sin tenant; filtra solo por visitorId |
| `leads` | ✅ SEGURO | companyId indexado + filtrado correcto |
| `llm` | ✅ SEGURO | companyId unique + índices compuestos |
| `white-label` | ✅ SEGURO | companyId unique + filtrado correcto |
| `company` | ✅ N/A | Contexto raíz (propietario del tenant) |
| `auth` | ✅ N/A | Gestiona identidad |

### Estado vs auditoría V1

- **4 hallazgos PERSISTEN** desde la migración V1→V2 (ChatSchema sin companyId, CommercialSchema sin companyId, `match()` que ignora criteria, IDOR en GetChatById).
- **1 hallazgo RESUELTO**: IDOR V1 en `chat.controller.ts` legacy (archivo vacío, endpoint eliminado).
- **16 hallazgos NUEVOS** detectados en V2.

---

## Hallazgos detallados

---

### DATA-001 — `ChatSchema` carece de `companyId` / `tenantId`

- **Severidad**: CRÍTICA
- **Archivo**: `src/context/conversations-v2/infrastructure/schemas/chat.schema.ts:81-255`
- **CWE**: CWE-639 (Authorization Bypass Through User-Controlled Key)
- **CVSS 3.1**: 9.1 (`AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:N`)
- **Estado vs V1**: **PERSISTE**

#### Descripción

El schema principal de chats V2 no define el campo `companyId` ni ningún otro discriminador de tenant. Esto hace **estructuralmente imposible** aplicar filtros de aislamiento en los repositorios descendientes. Todos los índices (`status`, `assignedCommercialId`, `visitorId`, `department`) son cross-tenant.

#### Evidencia

```typescript
// chat.schema.ts:81-120 (extracto)
@Schema({ collection: 'chats', timestamps: true })
export class ChatSchema {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true, index: true })
  status: string;

  @Prop({ index: true })
  assignedCommercialId?: string;

  @Prop({ required: true, index: true })
  visitorId: string;

  @Prop({ index: true })
  department?: string;
  // ❌ No hay companyId ni tenantId
}
```

#### Impacto

Cualquier comercial autenticado puede leer, listar, reasignar o borrar chats de **cualquier empresa** del sistema. Fuga masiva de conversaciones y PII entre clientes.

#### Remediación

1. Añadir `@Prop({ required: true, index: true }) companyId: string` al schema.
2. Crear índice compuesto `{ companyId: 1, status: 1 }`, `{ companyId: 1, visitorId: 1 }`, `{ companyId: 1, assignedCommercialId: 1 }`.
3. Migración Mongo para backfillear companyId desde el Visitor asociado.
4. Reconstruir todos los repos para inyectar companyId en cada filtro.

---

### DATA-002 — `MessageSchema` carece de `companyId`

- **Severidad**: CRÍTICA
- **Archivo**: `src/context/conversations-v2/infrastructure/schemas/message.schema.ts`
- **CWE**: CWE-639
- **CVSS 3.1**: 9.1 (`AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:N`)
- **Estado vs V1**: **NUEVO** (V1 no tenía mensajes V2)

#### Descripción

`MessageSchema` solo indexa por `chatId`. Sin `companyId` el endpoint `GET /v2/messages/search?q=<regex>` ejecuta un `$regex` global sobre todos los mensajes del sistema.

#### Impacto

Búsqueda de texto libre cross-tenant. Un atacante puede exfiltrar credenciales, PII o secretos filtrados por usuarios de otros clientes.

#### Remediación

Idéntica a DATA-001. Además, añadir `{ companyId: 1, content: 'text' }` como text index compuesto.

---

### DATA-003 — IDOR end-to-end en `GET /v2/chats/:chatId`

- **Severidad**: CRÍTICA
- **Archivos**:
  - `src/context/conversations-v2/infrastructure/persistence/impl/mongo-chat.repository.impl.ts:83-98`
  - `src/context/conversations-v2/application/queries/get-chat-by-id.query-handler.ts`
  - `src/context/conversations-v2/infrastructure/controllers/chat-v2.controller.ts`
- **CWE**: CWE-639
- **CVSS 3.1**: 8.1 (`AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N`)
- **Estado vs V1**: **PERSISTE** (mismo patrón que V1 `getChatById`)

#### Descripción

`findById(chatId)` resuelve únicamente por UUID sin validar que el chat pertenezca a la company del usuario autenticado. El query handler tampoco inyecta el `companyId` del JWT.

#### Evidencia

```typescript
// mongo-chat.repository.impl.ts:83-98
async findById(id: ChatId): Promise<Result<Chat, DomainError>> {
  const doc = await this.chatModel.findOne({ id: id.value }).lean().exec();
  if (!doc) return err(new ChatNotFoundError(id.value));
  return ok(this.mapper.toDomain(doc));
}
```

#### PoC

```http
GET /v2/chats/<uuid-de-otra-company> HTTP/1.1
Authorization: Bearer <jwt-comercial-companyA>
→ 200 OK { visitorId, messages, assignedCommercialId, ... }
```

#### Remediación

```typescript
async findById(id: ChatId, companyId: CompanyId): Promise<Result<Chat, DomainError>> {
  const doc = await this.chatModel
    .findOne({ id: id.value, companyId: companyId.value })
    .lean().exec();
  ...
}
```

Propagar `companyId` desde `@CurrentUser()` → query → handler → repo.

---

### DATA-004 — `MongoChatRepository.buildMongoFilter` no inyecta companyId

- **Severidad**: CRÍTICA
- **Archivo**: `src/context/conversations-v2/infrastructure/persistence/impl/mongo-chat.repository.impl.ts:725-817`
- **CWE**: CWE-639
- **CVSS 3.1**: 8.6 (`AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:N/A:N`)
- **Estado vs V1**: NUEVO

#### Descripción

El constructor de filtros a partir de `Criteria` convierte filtros de dominio a MongoQuery pero nunca añade un filtro implícito de tenant. Todos los listados paginados (`findByCriteria`, `findAll`, búsquedas de comerciales) son cross-tenant.

#### Remediación

Añadir un **injector obligatorio de tenant** en el método, rechazando ejecuciones sin companyId. Considerar un wrapper `TenantAwareRepository` que envuelva todas las operaciones.

---

### DATA-005 — `deleteByVisitorId` borrado cross-tenant

- **Severidad**: CRÍTICA
- **Archivo**: `src/context/conversations-v2/infrastructure/persistence/impl/mongo-chat.repository.impl.ts:822-848`
- **CWE**: CWE-284 (Improper Access Control)
- **CVSS 3.1**: 8.1 (`AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:H`)

#### Evidencia

```typescript
async deleteByVisitorId(visitorId: VisitorId): Promise<Result<void, DomainError>> {
  await this.chatModel.deleteMany({ visitorId: visitorId.value }).exec();
  return okVoid();
}
```

#### Impacto

El endpoint `DELETE /v2/chats/visitor/:visitorId/clear` permite a un comercial destruir chats de homónimos (colisión de visitorIds) o, conocido el visitorId, borrar masivamente historial de otra company.

#### Remediación

`deleteMany({ visitorId: visitorId.value, companyId: companyId.value })`.

---

### DATA-006 — `countByVisitorIds` aggregate sin companyId

- **Severidad**: ALTA
- **Archivo**: `src/context/conversations-v2/infrastructure/persistence/impl/mongo-chat.repository.impl.ts:853-879`
- **CWE**: CWE-200
- **CVSS 3.1**: 6.5 (`AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N`)

#### Descripción

Aggregate `$match` sobre `visitorId ∈ [...]` sin tenant. Permite enumerar cuántos chats tiene cada visitor en **cualquier** company.

---

### DATA-007 — `findAll({})` expone todos los chats

- **Severidad**: CRÍTICA
- **Archivo**: `src/context/conversations-v2/infrastructure/persistence/impl/mongo-chat.repository.impl.ts:103-115`
- **CWE**: CWE-639
- **CVSS 3.1**: 7.5 (`AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N`)

```typescript
async findAll(): Promise<Chat[]> {
  const docs = await this.chatModel.find({}).lean().exec();
  ...
}
```

---

### DATA-008 — `MongoMessageRepository`: todas las queries sin companyId

- **Severidad**: CRÍTICA
- **Archivo**: `src/context/conversations-v2/infrastructure/persistence/impl/mongo-message.repository.impl.ts` (todo el archivo)
- **CWE**: CWE-639
- **CVSS 3.1**: 9.1 (`AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:N`)

#### Sub-hallazgos

- `findById(messageId)` — IDOR mensaje individual.
- `searchByContent(query)` — `$regex` global cross-tenant sobre `content`.
- `markAsRead({ chatId, userId })` — `updateMany` sin companyId → puede marcar como leídos mensajes de chats de otras empresas conocido el chatId.
- Aggregates de métricas (`countByStatus`, etc.) globales.

#### Remediación

Reescribir repo completo con companyId obligatorio + índice text compuesto.

---

### DATA-009 — `CommercialSchema` sin `companyId`/`tenantId`

- **Severidad**: CRÍTICA
- **Archivo**: `src/context/commercial/infrastructure/persistence/schemas/commercial.schema.ts:1-51`
- **CWE**: CWE-639
- **CVSS 3.1**: 8.8 (`AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N`)
- **Estado vs V1**: **PERSISTE**

#### Descripción

El schema de comerciales no modela tenant. Los comerciales son recursos globales, permitiendo enumeración/listado cross-company de la plantilla comercial de la competencia.

---

### DATA-010 — `MongoCommercialRepository.match()` IGNORA criteria

- **Severidad**: CRÍTICA
- **Archivo**: `src/context/commercial/infrastructure/persistence/impl/mongo-commercial.repository.impl.ts:193-212`
- **CWE**: CWE-807 (Reliance on Untrusted Inputs in a Security Decision)
- **CVSS 3.1**: 9.1 (`AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:N`)
- **Estado vs V1**: **PERSISTE**

#### Evidencia

```typescript
async match(_criteria: Criteria<Commercial>): Promise<Commercial[]> {
  // TODO: Implementar conversión de criteria a filtro Mongo
  const docs = await this.commercialModel.find().lean().exec();
  return docs.map((d) => this.mapper.toDomain(d));
}
```

#### Impacto

Cualquier listado filtrado (por departamento, rol, disponibilidad) devuelve **todos los comerciales del sistema**. Los filtros aplicados en application layer son ignorados silenciosamente.

#### Remediación

Implementar el converter Mongo análogo a `toPostgresSql` o migrar a librería `@nestjs-query`. Bloquear el método con `throw` hasta estar implementado para evitar fugas silenciosas.

---

### DATA-011 — `findOne()` de Commercial idem

- **Severidad**: CRÍTICA
- **Archivo**: `src/context/commercial/infrastructure/persistence/impl/mongo-commercial.repository.impl.ts:218-240`
- **CWE**: CWE-807
- **CVSS 3.1**: 7.5

Mismo patrón que DATA-010 pero aplicado a `findOne`, devolviendo el primer comercial arbitrario.

---

### DATA-012 — `findByFingerprintAndTenant` ignora tenantId

- **Severidad**: ALTA
- **Archivo**: `src/context/commercial/infrastructure/persistence/impl/mongo-commercial.repository.impl.ts:274+`
- **CWE**: CWE-1220 (Insufficient Granularity of Access Control)
- **CVSS 3.1**: 7.5

#### Evidencia

```typescript
async findByFingerprintAndTenant(fingerprint: string, _tenantId: string) {
  // Por ahora ignora tenantId
  return this.commercialModel.findOne({ fingerprint }).lean().exec();
}
```

El comentario admite la vulnerabilidad explícitamente.

---

### DATA-013 — `VisitorV2MongoRepository.findBy*` cross-tenant

- **Severidad**: ALTA
- **Archivos**:
  - `src/context/visitors-v2/infrastructure/persistence/impl/visitor-v2-mongo.repository.impl.ts:126-145` (`findById`)
  - Ídem `:203-226` (`findByFingerprint`)
  - Ídem `:228-262` (`findBySessionId`)
- **CWE**: CWE-639
- **CVSS 3.1**: 7.5

#### Descripción

El schema `VisitorV2MongoEntity` SÍ tiene `tenantId` indexado correctamente, pero los lookups por identificadores primarios/fingerprint/session omiten el filtro. Un atacante con un fingerprint conocido puede pivotar entre tenants.

#### Remediación

Firmar los métodos con `tenantId` obligatorio:

```typescript
findByFingerprint(fingerprint: string, tenantId: TenantId): Promise<Result<Visitor, DomainError>>
```

---

### DATA-014 — IDOR en `SavedFilter.findById` / `.delete`

- **Severidad**: ALTA
- **Archivo**: `src/context/visitors-v2/infrastructure/persistence/impl/saved-filter-mongo.repository.impl.ts:65-80, 110-131`
- **CWE**: CWE-639
- **CVSS 3.1**: 7.1 (`AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:L/A:N`)
- **Estado vs V1**: **NUEVO**

#### Descripción

`SavedFilterMongoEntity` tiene tenantId + userId indexados, pero los métodos `findById` y `delete` aceptan solo el `filterId` y no validan ownership. Permite leer y **borrar filtros guardados de otros usuarios / tenants**.

#### PoC

```http
DELETE /v2/saved-filters/<otro-filter-id> HTTP/1.1
Authorization: Bearer <jwt-userA>
→ 204 No Content
```

#### Remediación

Añadir `{ _id, userId, tenantId }` como filtro obligatorio.

---

### DATA-015 — `MongoConsentRepository` sin filtro de tenant

- **Severidad**: ALTA
- **Archivo**: `src/context/consent/infrastructure/persistence/impl/mongo-consent.repository.impl.ts`
- **CWE**: CWE-200
- **CVSS 3.1**: 6.5

#### Descripción

Filtra por `visitorId` pero nunca por tenant. `findExpiredConsents`, `findExpiringConsents` son globales, lo que es relevante para jobs programados y endpoints admin. Dado que los visitorId son UUIDs no predecibles, la severidad se limita a ALTA, pero cualquier `visitorId` filtrado expone el consentimiento.

---

### DATA-016 — `MongoConsentAuditLogRepository.findByDateRange` global

- **Severidad**: MEDIA
- **Archivo**: `src/context/consent/infrastructure/persistence/impl/mongo-consent-audit-log.repository.impl.ts:93-121`
- **CWE**: CWE-200
- **CVSS 3.1**: 5.3

#### Descripción

Búsqueda por rango temporal sin tenant. Un endpoint admin que liste audits podría filtrar por fechas de otra empresa.

---

### DATA-017 — `TrackingEventMongoRepository.findById` cross-tenant

- **Severidad**: CRÍTICA
- **Archivo**: `src/context/tracking-v2/infrastructure/persistence/impl/mongo-tracking-event.repository.impl.ts:120-153`
- **CWE**: CWE-639
- **CVSS 3.1**: 8.1

#### Descripción

La collection está **particionada** por tenant (`tracking_events_<tenantId>`). Sin embargo, `findById` itera **todas las collections** buscando el evento hasta encontrarlo, saltándose el aislamiento lógico del sharding por tenant.

#### Evidencia

```typescript
async findById(id: string): Promise<TrackingEvent | null> {
  const collections = await this.connection.db.listCollections({ name: /^tracking_events_/ }).toArray();
  for (const coll of collections) {
    const doc = await this.connection.collection(coll.name).findOne({ id });
    if (doc) return this.mapper.toDomain(doc);
  }
  return null;
}
```

#### Remediación

Exigir `tenantId` en la firma y abrir únicamente la collection `tracking_events_${tenantId}`.

---

### DATA-018 — `findByVisitorId` / `findBySessionId` / `findByEventType` sin tenant

- **Severidad**: ALTA
- **Archivo**: `src/context/tracking-v2/infrastructure/persistence/impl/mongo-tracking-event.repository.impl.ts`
- **CWE**: CWE-200
- **CVSS 3.1**: 7.5

Mismo patrón que DATA-017 en métodos auxiliares: escanean todas las collections particionadas.

---

### DATA-019 — Índices existentes no encabezan por tenant (performance + seguridad)

- **Severidad**: MEDIA
- **Archivo**: `src/context/conversations-v2/infrastructure/schemas/chat.schema.ts:190-240`
- **CWE**: CWE-400 (Resource Exhaustion)
- **CVSS 3.1**: 4.3

#### Descripción

Incluso si se añade `companyId` a posteriori (DATA-001), los índices actuales no lo tienen como primer campo. Tras la remediación es obligatorio que **todos los índices compuestos comiencen por `companyId`** para evitar COLLSCAN y garantizar aislamiento a nivel de ejecutor.

---

### DATA-020 — Falta validación de companyId en `LeadContactData.findById`

- **Severidad**: BAJA
- **Archivo**: `src/context/leads/infrastructure/persistence/impl/mongo-lead-contact-data.repository.impl.ts`
- **CWE**: CWE-639
- **CVSS 3.1**: 3.7

#### Descripción

Los 3 repos de Leads filtran correctamente en listados, pero `findById` resuelve por ID sin validar companyId. Mitigado porque los endpoints son admin-scoped, pero defensa en profundidad lo desaconseja.

#### Remediación

Añadir `companyId` obligatorio a la firma por consistencia con el resto del contexto.

---

### DATA-021 — `mergeObjectContext().commit()` sin scope previo

- **Severidad**: MEDIA
- **Archivos**: Varios command handlers en `conversations-v2` y `commercial`.
- **CWE**: CWE-732
- **CVSS 3.1**: 5.3

#### Descripción

Dado que las lecturas previas (`findById`) son cross-tenant (DATA-003, DATA-008), los comandos que hacen `findById` → mutación → `save` → `commit` pueden mutar y emitir eventos sobre aggregates de otras empresas. El `commit()` publica domain events cross-tenant que pueden disparar notificaciones WebSocket dirigidas a salas de otra company.

#### Remediación

Resolver primero DATA-001..DATA-011. Luego verificar que todos los handlers reciben `companyId` del JWT antes del `findById`.

---

## Matriz de schemas

| Schema | Colección | `companyId`/`tenantId` | Indexado | Índices compuestos empiezan por tenant | Estado |
| --- | --- | --- | --- | --- | --- |
| `ChatSchema` | `chats` | ❌ NO | N/A | ❌ NO | **CRÍTICO** |
| `MessageSchema` | `messages` | ❌ NO | N/A | ❌ NO | **CRÍTICO** |
| `CommercialSchema` | `commercials` | ❌ NO | N/A | ❌ NO | **CRÍTICO** |
| `VisitorV2MongoEntity` | `visitors_v2` | ✅ `tenantId` | ✅ | ✅ `{tenantId, fingerprint}` | OK schema |
| `SavedFilterMongoEntity` | `saved_filters` | ✅ `tenantId`+`userId` | ✅ | ✅ | OK schema |
| `AssignmentRulesSchema` | `assignment_rules` | ✅ `companyId`+`siteId` | ✅ | ✅ | ✅ OK |
| `TrackingEventMongoEntity` | `tracking_events_<tenantId>` | ✅ `tenantId`+`siteId` | ✅ partición | ✅ | OK schema |
| `MongoConsentSchema` | `consents` | ❌ (solo visitorId) | N/A | ❌ | ALTA |
| `ConsentAuditLogSchema` | `consent_audit_logs` | ❌ | N/A | ❌ | MEDIA |
| `LeadContactDataSchema` | `lead_contact_data` | ✅ `companyId` | ✅ | ✅ `{visitorId, companyId}` unique | ✅ OK |
| `CrmCompanyConfigSchema` | `crm_company_configs` | ✅ `companyId` | ✅ unique | ✅ | ✅ OK |
| `CrmSyncRecordSchema` | `crm_sync_records` | ✅ `companyId` | ✅ | ✅ | ✅ OK |
| `LlmCompanyConfigSchema` | `llm_company_configs` | ✅ `companyId` unique | ✅ | ✅ | ✅ OK |
| `WebContentCacheSchema` | `web_content_cache` | ✅ `companyId` | ✅ | ✅ `{url, companyId}` unique | ✅ OK |
| `WhiteLabelConfigSchema` | `white_label_configs` | ✅ `companyId` unique | ✅ | ✅ | ✅ OK |

---

## Matriz de repos (métodos vs filtro tenant aplicado)

Leyenda: ✅ filtro aplicado • ❌ filtro ausente • ⚠️ parcial/condicional • N/A no aplica

### `conversations-v2`

| Método | MongoChat | MongoMessage | AssignmentRules |
| --- | --- | --- | --- |
| `findById` | ❌ | ❌ | ✅ |
| `findAll` | ❌ | ❌ | ✅ |
| `findByCriteria` | ❌ | ❌ | ✅ |
| `save` | N/A (no leak) | N/A | ✅ |
| `deleteByVisitorId` / `deleteMany` | ❌ | ❌ | ✅ |
| `searchByContent` | — | ❌ (global regex) | — |
| `markAsRead` (updateMany) | — | ❌ | — |
| `countByVisitorIds` / aggregates | ❌ | ❌ | ✅ |

### `commercial`

| Método | Mongo filter aplica |
| --- | --- |
| `match(criteria)` | ❌ IGNORA criteria |
| `findOne(criteria)` | ❌ IGNORA criteria |
| `findById` | ❌ |
| `findByFingerprintAndTenant` | ❌ (ignora tenantId explícitamente) |
| `save` | N/A |

### `visitors-v2`

| Método | Visitor | SavedFilter |
| --- | --- | --- |
| `findById` | ❌ | ❌ |
| `findByFingerprint` | ❌ | — |
| `findBySessionId` | ❌ | — |
| `findByUserId` | — | ✅ |
| `delete` | ⚠️ | ❌ |
| `findByCriteria` | ✅ | ✅ |

### `tracking-v2`

| Método | Filtro tenant |
| --- | --- |
| `findById` | ❌ (itera todas las collections) |
| `findByVisitorId` | ❌ |
| `findBySessionId` | ❌ |
| `findByEventType` | ❌ |
| `save` | ✅ (escribe en collection particionada correcta) |
| Aggregates de métricas | ⚠️ |

### `consent`

| Método | Consent | AuditLog |
| --- | --- | --- |
| `findByVisitorId` | ⚠️ (solo visitorId) | ⚠️ |
| `findExpired` | ❌ | — |
| `findExpiring` | ❌ | — |
| `findByDateRange` | — | ❌ |

### `leads`

| Método | LeadContact | CrmConfig | CrmSync |
| --- | --- | --- | --- |
| `findById` | ⚠️ (sin companyId) | ✅ | ✅ |
| `findByCompany` | ✅ | ✅ | ✅ |
| `save` | ✅ | ✅ | ✅ |
| `delete` | ✅ | ✅ | ✅ |

### `llm`

| Método | LlmConfig | WebCache |
| --- | --- | --- |
| `findByCompany` | ✅ | ✅ |
| `upsert` | ✅ `findOneAndUpdate` con companyId | ✅ |
| TTL cleanup | N/A | ✅ índice TTL |

### `white-label`

| Método | Filtro |
| --- | --- |
| `findByCompany` | ✅ |
| `upsert` | ✅ |

---

## Recomendaciones transversales

1. **Introducir `TenantAwareRepository` base**: wrapper obligatorio que exige `companyId`/`tenantId` en constructor y lo inyecta en todos los filtros. Fallo duro (throw) si falta.
2. **Middleware Mongoose**: `pre('find')`, `pre('findOne')`, `pre('updateMany')`, `pre('deleteMany')` que valide la presencia de `companyId` en el query y rechace ejecuciones sin él.
3. **Tests de aislamiento multi-tenant obligatorios**: cada repo V2 debe tener al menos un spec que cree datos en dos companies y verifique que los métodos no cruzan datos.
4. **Rotar índices**: todos los compuestos deben empezar por `companyId`/`tenantId`.
5. **Auditar command handlers**: propagar `companyId` del JWT desde controller hasta repo sin excepciones.
6. **Eliminar el TODO de `CriteriaConverter` para Mongo**: implementar o bloquear `match()` con throw hasta que exista.
7. **Revisión de endpoints admin/globales**: los jobs de expiración de consents y sync records deben iterar por company, no globalmente.

---

## Apéndice A — Endpoints vulnerables confirmados

| Endpoint | Vulnerabilidad | Severidad |
| --- | --- | --- |
| `GET /v2/chats/:chatId` | IDOR (DATA-003) | CRÍTICA |
| `GET /v2/chats` (listados) | Cross-tenant (DATA-004) | CRÍTICA |
| `DELETE /v2/chats/visitor/:visitorId/clear` | Borrado cross-tenant (DATA-005) | CRÍTICA |
| `PUT /v2/chats/:chatId/assign/:commercialId` | IDOR + reasignación (DATA-003 + DATA-009) | CRÍTICA |
| `GET /v2/messages/:messageId` | IDOR (DATA-008) | CRÍTICA |
| `GET /v2/messages/search?q=` | Fuga texto completo (DATA-008) | CRÍTICA |
| `POST /v2/messages/read` | `updateMany` cross-tenant (DATA-008) | ALTA |
| `GET /commercials` (listados) | match() ignora criteria (DATA-010) | CRÍTICA |
| `GET /v2/saved-filters/:id` / `DELETE` | IDOR (DATA-014) | ALTA |
| `GET /v2/visitors/by-fingerprint/:fp` | Cross-tenant (DATA-013) | ALTA |
| `GET /v2/tracking-events/:id` | Cross-tenant (DATA-017) | CRÍTICA |

---

## Apéndice B — Comparativa V1 vs V2

| Hallazgo V1 | Estado en V2 | Hallazgo V2 relacionado |
| --- | --- | --- |
| ChatSchema sin companyId | **PERSISTE** | DATA-001 |
| CommercialSchema sin companyId | **PERSISTE** | DATA-009 |
| `CriteriaConverter.match()` ignora criteria | **PERSISTE** (en `MongoCommercialRepo`) | DATA-010, DATA-011 |
| IDOR `getChatById` (V1 controller) | **RESUELTO** (controller vacío) + **PERSISTE** en V2 | DATA-003 |

---

**Fin del informe.**
