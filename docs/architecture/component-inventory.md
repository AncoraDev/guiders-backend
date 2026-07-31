# Guiders Backend - Inventario de Componentes

**Fecha:** 2026-04-01

---

## Resumen

El sistema esta organizado en **15 bounded contexts** siguiendo Domain-Driven Design, con un total aproximado de **903 archivos TypeScript**, **18 agregados**, **56 command handlers** (+ 6 usecases), **42 query handlers**, **25 controllers** y **36 event handlers**. Cada contexto sigue una estructura uniforme de tres capas: `domain/`, `application/`, `infrastructure/`.

---

## Tabla Resumen

| Contexto           | Archivos | Agregados | Commands | Queries | Controllers | Eventos | Estado |
| ------------------ | -------- | --------- | -------- | ------- | ----------- | ------- | ------ |
| auth/api-key       | ~30      | 1         | 3\*      | 0       | 2           | 1       | Activo |
| auth/auth-user     | ~80      | 2         | 5        | 5       | 1           | 6       | Activo |
| auth/auth-visitor  | ~45      | 1         | 3\*      | 0       | 1           | 0       | Activo |
| auth/bff           | ~22      | 0         | 0        | 0       | 1           | 0       | Activo |
| company            | 54       | 3         | 2        | 4       | 1           | 0       | Activo |
| shared             | 63       | 0         | 0        | 0       | 0           | 1       | Activo |
| conversations-v2   | 165      | 2         | 13       | 8       | 4           | 10      | Activo |
| visitors-v2        | 143      | 3         | 12       | 16      | 5           | 6       | Activo |
| tracking-v2        | 38       | 1         | 1        | 1       | 1           | 0       | Activo |
| leads              | 36       | 0         | 3        | 0       | 2           | 2       | Activo |
| llm                | 43       | 0         | 4        | 0       | 2           | 1       | Activo |
| lead-scoring       | 6        | 0         | 0        | 0       | 0           | 0       | Activo |
| commercial         | 48       | 1         | 6        | 5       | 1           | 4       | Activo |
| white-label        | 9        | 1         | 0        | 0       | 1           | 0       | Activo |
| consent            | 55       | 2         | 4        | 2       | 1           | 5       | Activo |
| conversations (V1) | 1        | 0         | 0        | 0       | 1           | 0       | Legacy |
| visitors (V1)      | 66       | 1         | 6        | 1       | 1           | 0       | Legacy |
| **TOTALES**        | **~903** | **18**    | **56+6** | **42**  | **25**      | **36**  |        |

> \* Los contextos `api-key` y `auth-visitor` usan el patron usecase en lugar de command handlers CQRS.

---

## Detalle por Bounded Context

---

### 1. auth/api-key

**Responsabilidad:** Gestion de API keys RSA-4096 para autenticacion de visitantes por empresa.

**Agregados:**

- `api-key.ts` - Modelo de dominio de la API key

**Usecases (en lugar de Commands):**

- `create-api-key-for-domain.usecase.ts` - Crear API key para un dominio
- `get-api-keys-by-company-id.usecase.ts` - Listar keys por empresa
- `get-all-api-keys.usecase.ts` - Listar todas las keys

**Controllers:**

- `api-key.controller.ts` - CRUD de API keys
- `jwks.controller.ts` - Endpoint JWKS para verificacion de claves publicas

**Eventos:**

- `create-api-key-on-company-created-event.handler.ts` - Crea key automaticamente al crear empresa

---

### 2. auth/auth-user

**Responsabilidad:** Autenticacion y gestion de cuentas de usuario (agentes comerciales y administradores).

**Agregados:**

- `user-account.aggregate.ts` - Cuenta de usuario con roles y permisos
- `invite.aggregate.ts` - Invitaciones para nuevos usuarios

**Command Handlers:**

- `accept-invite-command.handler.ts` - Aceptar invitacion
- `create-invite-command.handler.ts` - Crear invitacion
- `link-user-with-keycloak-command.handler.ts` - Vincular con Keycloak
- `sync-user-with-keycloak-command.handler.ts` - Sincronizar datos de Keycloak
- `update-user-avatar-command.handler.ts` - Actualizar avatar (S3)

**Query Handlers:**

- `find-user-by-keycloak-id.query-handler.ts` - Buscar por ID de Keycloak
- `find-users-by-company-id.query-handler.ts` - Listar usuarios de empresa
- `verify-role-mapping.query-handler.ts` - Verificar mapeo de roles
- `find-user-by-id.query-handler.ts` - Buscar por ID
- `find-one-user-by-id.query-handler.ts` - Buscar uno por ID (read model)

**Usecases adicionales:**

- `refresh-token.usecase.ts` - Renovar JWT
- `user-login.usecase.ts` - Login con credenciales
- `user-register.usecase.ts` - Registro de usuario

**Controllers:**

- `auth-user.controller.ts` - Endpoints de autenticacion y gestion de usuarios

**Eventos (6):**

- Propagacion a comerciales (avatar, nombre)
- Creacion automatica de superadmin, admin e invitaciones al crear empresa

---

### 3. auth/auth-visitor

**Responsabilidad:** Autenticacion de visitantes anonimos mediante API key de la empresa.

**Agregados:**

- `visitor-account.aggregate.ts` - Cuenta de visitante con tokens JWT

**Usecases:**

- `register-visitor.usecase.ts` - Registro anonimo con API key
- `generate-visitor-tokens.usecase.ts` - Generar par de tokens
- `refresh-visitor-token.usecase.ts` - Renovar token de visitante

**Controllers:**

- `auth-visitor.controller.ts` - Registro y refresh de visitantes

---

### 4. auth/bff

**Responsabilidad:** Backend For Frontend - proxy de autenticacion OIDC/PKCE con Keycloak usando cookies HTTP-only.

**Controllers:**

- `bff-auth.controller.ts` - Login, callback, logout, refresh, me, user-info

> Nota: No tiene capa de dominio propia. Orquesta llamadas a Keycloak y devuelve cookies seguras.

---

### 5. company

**Responsabilidad:** Gestion de empresas multi-tenant con sitios web asociados.

**Agregados:**

- `company.aggregate.ts` - Empresa con dominio y configuracion
- `admin.entity.ts` - Administrador de la empresa
- `site.ts` - Sitio web asociado a la empresa

**Command Handlers:**

- `create-company-command.handler.ts` - Crear empresa
- `create-company-with-admin-command.handler.ts` - Crear empresa con administrador

**Query Handlers:**

- `get-company-by-id.query-handler.ts` - Obtener empresa por ID
- `get-company-sites.query-handler.ts` - Listar sitios de empresa
- `resolve-site-by-host.query-handler.ts` - Resolver sitio por hostname
- `find-company-by-domain.query-handler.ts` - Buscar empresa por dominio

**Controllers:**

- `company.controller.ts` - CRUD de empresas y sitios

---

### 6. shared

**Responsabilidad:** Utilidades compartidas, patrones base y servicios transversales.

**Patron Result:**

- `result.ts` - Implementacion de `Result<T, E>`, `ok()`, `err()`, `okVoid()`
- `domain.error.ts` - Clase base para errores de dominio

**Value Objects Base:**

- `uuid.ts`, `email.ts`, `created-at.ts`, `updated-at.ts`, `typing-status.ts`
- `primitive-value-object.ts` - Clase base para value objects primitivos
- `uuid-value-object.ts` - Clase base para IDs tipo UUID

**Patron Criteria:**

- `criteria.ts` - Query builder tipo-seguro
- `criteria-builder.ts` - Builder fluido para criterios
- `criteria-converter.ts` - Conversion a queries MongoDB/PostgreSQL

**Guards de Autenticacion:**

- `auth.guard.ts` - Guard JWT Bearer
- `role.guard.ts` - Guard de roles
- `dual-auth.guard.ts` - Guard que acepta JWT Bearer o BFF cookie
- `jwt-cookie-auth.guard.ts` - Guard para cookies HTTP-only
- `optional-auth.guard.ts` - Guard opcional (no falla si no hay token)

**Servicios de Infraestructura:**

- `s3-upload.service.ts` - Upload de archivos a AWS S3
- `token-verify.service.ts` - Verificacion de tokens JWT
- `visitor-session-auth.service.ts` - Autenticacion de sesiones de visitante
- `bff-session-auth.service.ts` - Autenticacion de sesiones BFF

**Email Senders (5 implementaciones):**

- `resend-email-sender.service.ts` - Produccion (Resend API)
- `sendgrid-email-sender.service.ts` - Alternativa (SendGrid)
- `smtp-email-sender.service.ts` - SMTP generico
- `ethereal-email-sender.service.ts` - Desarrollo (Ethereal.email)
- `mock-email-sender.service.ts` - Tests

**Scheduler:**

- `presence-inactivity.scheduler.ts` - Desconexion automatica por inactividad

---

### 7. conversations-v2 (MongoDB)

**Responsabilidad:** Sistema de chat en tiempo real entre visitantes y agentes comerciales.

**Agregados:**

- `chat.aggregate.ts` - Conversacion con estado, participantes y metadata
- `message.aggregate.ts` - Mensaje individual con contenido y sender

**Command Handlers (13):**

- Envio de mensajes, creacion de chats, asignacion de agentes
- Auto-asignacion round-robin, cola de espera
- Indicadores de escritura (start/stop typing)
- Marcado de mensajes como leidos
- Solicitud de agente, reglas de asignacion

**Query Handlers (8):**

- Mensajes de chat, chats con filtros, chat por ID
- Mensajes no leidos, cola pendiente
- Chats pendientes de visitante, presencia, reglas de asignacion

**Controllers:**

- `chat-v2.controller.ts` - Operaciones de chat
- `message-v2.controller.ts` - Operaciones de mensajes
- `presence.controller.ts` - Presencia en chats
- `assignment-rules.controller.ts` - Reglas de asignacion

**Eventos (10):**

- Notificaciones WebSocket para mensajes, chats, typing, asignacion
- Actualizacion de chat al enviar mensaje
- Procesamiento de auto-asignacion

---

### 8. visitors-v2 (MongoDB + Redis)

**Responsabilidad:** Tracking y gestion de visitantes web con sesiones y presencia en tiempo real.

**Agregados:**

- `visitor-v2.aggregate.ts` - Visitante con lifecycle state machine
- `session.entity.ts` - Sesion activa del visitante
- `saved-filter.aggregate.ts` - Filtros guardados por agentes

**Command Handlers (12):**

- Identificacion, actividad de sesion, limpieza de sesiones expiradas
- Filtros guardados (CRUD), fin de sesion
- Estados de conexion (online/offline/chatting)
- Resolucion de sitio, acciones de chat

**Query Handlers (16):**

- Busqueda avanzada de visitantes, visitantes por tenant/sitio
- Visitantes online/chatting, actividad, pagina actual
- Chats pendientes, filtros guardados
- Visitantes con chats no asignados/en cola

**Controllers:**

- `visitor-v2.controller.ts` - Operaciones de visitante
- `tenant-visitors.controller.ts` - Visitantes por tenant
- `sites.controller.ts` - Gestion de sitios
- `site-visitors.controller.ts` - Visitantes por sitio
- `tenant-visitor-management.controller.ts` - Gestion administrativa

**Eventos (6):**

- Cambios de conexion, marcado como interno por fingerprint
- Notificacion de cambio de pagina, presencia, high intent

---

### 9. tracking-v2 (MongoDB particionado)

**Responsabilidad:** Ingesta de alto rendimiento de eventos de tracking con particionamiento mensual.

**Agregados:**

- `tracking-event.aggregate.ts` - Evento de tracking individual

**Command Handlers:**

- `ingest-tracking-events.command-handler.ts` - Ingesta batch con buffering

**Query Handlers:**

- `get-event-stats-by-tenant.query-handler.ts` - Estadisticas por tenant

**Controllers:**

- `tracking-v2.controller.ts` - Endpoint de ingesta

**Servicios de Dominio:**

- `event-throttling.domain-service.ts` - Throttling de eventos duplicados
- `event-aggregation.domain-service.ts` - Agregacion de eventos

**Schedulers:**

- `buffer-flush.scheduler.ts` - Flush periodico del buffer en memoria
- `partition-maintenance.scheduler.ts` - Creacion automatica de particiones mensuales

---

### 10. leads (MongoDB)

**Responsabilidad:** Gestion de leads y sincronizacion con CRM externo (LeadCars).

**Command Handlers:**

- `save-lead-contact-data-command.handler.ts` - Guardar datos de contacto
- `sync-chat-to-crm-command.handler.ts` - Sincronizar chat a CRM
- `sync-lead-to-crm-command.handler.ts` - Sincronizar lead a CRM

**Controllers:**

- `leads-admin.controller.ts` - Administracion de leads
- `leads-contact.controller.ts` - Datos de contacto

**Eventos:**

- `sync-chat-on-chat-closed.event-handler.ts` - Sync automatico al cerrar chat
- `sync-lead-on-lifecycle-changed.event-handler.ts` - Sync al cambiar lifecycle

---

### 11. llm (MongoDB)

**Responsabilidad:** Integracion con modelos de lenguaje (Groq) para auto-respuestas y asistencia de IA.

**Command Handlers:**

- `generate-suggestion.command-handler.ts` - Generar sugerencia de respuesta
- `generate-ai-response.command-handler.ts` - Generar respuesta automatica
- `improve-text.command-handler.ts` - Mejorar texto con IA
- `notify-commercial-command.handler.ts` - Notificar a agente sobre respuesta IA

**Controllers:**

- `llm-suggestions.controller.ts` - Sugerencias de IA
- `llm-config.controller.ts` - Configuracion del LLM

**Servicios de Dominio:**

- `tool-executor.service.ts` - Ejecucion de tools del LLM
- `llm-context-builder.service.ts` - Construccion de contexto para prompts
- `llm-provider.service.ts` - Abstraccion del proveedor LLM (Groq)

**Eventos:**

- `send-ai-response-on-message-sent.event-handler.ts` - Auto-respuesta al recibir mensaje

---

### 12. lead-scoring (Sin persistencia)

**Responsabilidad:** Calificacion automatica de visitantes basada en comportamiento (hot/warm/cold).

**Componentes:**

- `lead-scoring.service.ts` - Interfaz del servicio de scoring (dominio)
- `lead-scoring.service.impl.ts` - Implementacion del algoritmo
- `lead-score.ts` - Value object con el resultado del scoring

> Nota: Contexto de calculo puro. No tiene persistencia propia, opera sobre datos de tracking y visitantes.

---

### 13. commercial (MongoDB + Redis)

**Responsabilidad:** Gestion de agentes comerciales, presencia y disponibilidad.

**Agregados:**

- `commercial.aggregate.ts` - Agente comercial con estado de conexion

**Command Handlers (6):**

- Conexion/desconexion, cambio de estado, fingerprint
- Heartbeat, actualizacion de actividad

**Query Handlers (5):**

- Por ID, estado de conexion, online, disponibles, disponibilidad por sitio

**Controllers:**

- `commercial.controller.ts` - Gestion de agentes

**Eventos (4):**

- Presencia, creacion de API key, logging de actividad, metricas de desconexion

---

### 14. white-label (MongoDB + S3)

**Responsabilidad:** Personalizacion visual del widget de chat por empresa.

**Agregados:**

- `white-label-config.ts` - Configuracion de marca (colores, logos, fuentes)

**Controllers:**

- `white-label-config.controller.ts` - CRUD de configuracion visual

---

### 15. consent (MongoDB)

**Responsabilidad:** Gestion de consentimiento GDPR con auditoria completa.

**Agregados:**

- `visitor-consent.aggregate.ts` - Consentimiento del visitante con estado
- `consent-audit-log.aggregate.ts` - Log de auditoria inmutable con hash

**Command Handlers (4):**

- Registrar, renovar, revocar, denegar consentimiento

**Query Handlers (2):**

- Historial de consentimiento, logs de auditoria

**Controllers:**

- `consent.controller.ts` - Gestion de consentimiento

**Eventos (5):**

- Logging automatico de cada cambio de estado del consentimiento

---

## Contextos Legacy (V1 - PostgreSQL)

### conversations (Legacy)

**Estado:** Deprecado - Solo queda un controller vacio como wrapper.

- `chat.controller.ts` - Controller minimo sin funcionalidad

### visitors (Legacy)

**Estado:** Deprecado - Funcionalidad migrada a visitors-v2.

**Agregados:**

- `visitor.aggregate.ts` - Visitante legacy con campos basicos

**Command Handlers (6):** Operaciones CRUD basicas sobre visitante
**Query Handlers (1):** Busqueda por ID
**Controllers:** `visitor.controller.ts`

---

## Componente Transversal: WebSocket Gateway

El gateway WebSocket centralizado (`src/websocket/websocket.gateway.ts`, ~1312 lineas) gestiona toda la comunicacion en tiempo real:

**Eventos entrantes (cliente → servidor):**

- `chat:send-message` - Enviar mensaje
- `chat:start-typing` / `chat:stop-typing` - Indicadores de escritura
- `presence:heartbeat` - Heartbeat de presencia
- `visitor:page-change` - Cambio de pagina del visitante

**Eventos salientes (servidor → cliente):**

- `chat:message` - Nuevo mensaje
- `chat:created` - Chat creado
- `chat:typing` - Estado de escritura
- `chat:assigned` - Chat asignado
- `presence:update` - Actualizacion de presencia
- `visitor:high-intent` - Visitante con alta intencion

**Rooms:**

- `company:{id}` - Sala por empresa
- `chat:{id}` - Sala por conversacion
- `visitor:{id}` - Sala por visitante

---

_Generado usando el workflow `document-project` del metodo BMAD_
