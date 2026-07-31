# Guiders Backend - Contratos de API

**Fecha:** 2026-04-23
**Total de endpoints REST:** ~148
**Eventos WebSocket:** 13
**Controladores:** 26

## Resumen Ejecutivo

Catalogo completo de todos los endpoints HTTP REST y eventos WebSocket del backend Guiders. La API esta organizada por contextos acotados (bounded contexts) siguiendo la arquitectura DDD. La autenticacion utiliza tres mecanismos: JWT Bearer (usuarios internos), cookies BFF HttpOnly (frontends SPA), y API Keys RSA 4096 (visitantes del widget).

---

## 1. Auth - Usuarios (`user/auth`)

**Controlador:** `auth-user.controller.ts`
**Autenticacion:** JWT Bearer (excepto login/register)
**Prefijo:** `/user/auth`

| Metodo | Ruta                             | Descripcion                                | Auth                    |
| ------ | -------------------------------- | ------------------------------------------ | ----------------------- |
| POST   | `/user/auth/login`               | Inicio de sesion (credenciales o Keycloak) | Publico                 |
| POST   | `/user/auth/register`            | Registro de nuevo usuario                  | Publico                 |
| POST   | `/user/auth/refresh`             | Renovar token de acceso                    | Publico (refresh token) |
| POST   | `/user/auth/logout`              | Cerrar sesion                              | JWT Bearer              |
| GET    | `/user/auth/validate`            | Validar token actual                       | JWT Bearer              |
| POST   | `/user/auth/accept-invite`       | Aceptar invitacion a empresa               | Publico (token invite)  |
| GET    | `/user/auth/company-users`       | Listar usuarios de la empresa              | JWT Bearer              |
| GET    | `/user/auth/me`                  | Obtener perfil del usuario actual          | JWT Bearer              |
| GET    | `/user/auth/:keycloakId`         | Obtener usuario por Keycloak ID            | JWT Bearer              |
| POST   | `/user/auth/sync-with-keycloak`  | Sincronizar usuario con Keycloak           | JWT Bearer              |
| POST   | `/user/auth/verify-role-mapping` | Verificar mapeo de roles                   | JWT Bearer              |
| POST   | `/user/auth/:keycloakId/avatar`  | Subir avatar de usuario                    | JWT Bearer              |
| DELETE | `/user/auth/:keycloakId/avatar`  | Eliminar avatar de usuario                 | JWT Bearer              |

---

## 2. Auth - BFF (`bff/auth`)

**Controlador:** `bff-auth.controller.ts`
**Autenticacion:** Cookies HttpOnly (OIDC/PKCE con Keycloak)
**Prefijo:** `/bff/auth`

| Metodo | Ruta                      | Descripcion                                 | Auth                 |
| ------ | ------------------------- | ------------------------------------------- | -------------------- |
| GET    | `/bff/auth/login`         | Iniciar flujo OIDC (app por defecto)        | Publico              |
| GET    | `/bff/auth/login/:app`    | Iniciar flujo OIDC para app especifica      | Publico              |
| GET    | `/bff/auth/callback/:app` | Callback OAuth2 de Keycloak                 | Publico (code+state) |
| GET    | `/bff/auth/me`            | Obtener sesion BFF actual (app por defecto) | Cookie BFF           |
| GET    | `/bff/auth/me/:app`       | Obtener sesion BFF para app especifica      | Cookie BFF           |
| POST   | `/bff/auth/refresh`       | Renovar sesion BFF (app por defecto)        | Cookie BFF           |
| POST   | `/bff/auth/refresh/:app`  | Renovar sesion BFF para app especifica      | Cookie BFF           |
| GET    | `/bff/auth/logout`        | Cerrar sesion BFF (app por defecto)         | Cookie BFF           |
| GET    | `/bff/auth/logout/:app`   | Cerrar sesion BFF para app especifica       | Cookie BFF           |

---

## 3. Auth - Visitantes (`pixel`)

**Controlador:** `auth-visitor.controller.ts`
**Autenticacion:** API Key (RSA 4096)
**Prefijo:** `/pixel`

| Metodo | Ruta                   | Descripcion                      | Auth    |
| ------ | ---------------------- | -------------------------------- | ------- |
| POST   | `/pixel/token`         | Obtener token JWT de visitante   | API Key |
| POST   | `/pixel/register`      | Registrar nuevo visitante        | API Key |
| POST   | `/pixel/token/refresh` | Renovar token de visitante       | API Key |
| GET    | `/pixel/metadata`      | Obtener metadata del pixel/sitio | API Key |

---

## 4. Auth - API Keys (`api-keys`)

**Controlador:** `api-key.controller.ts`
**Autenticacion:** JWT Bearer (admin)
**Prefijo:** `/api-keys`

| Metodo | Ruta                | Descripcion                               | Auth       |
| ------ | ------------------- | ----------------------------------------- | ---------- |
| POST   | `/api-keys/create`  | Crear nueva API Key (genera par RSA 4096) | JWT Bearer |
| GET    | `/api-keys/company` | Listar API Keys de la empresa             | JWT Bearer |

---

## 5. Auth - JWKS (`jwks`)

**Controlador:** `jwks.controller.ts`
**Autenticacion:** Publico
**Prefijo:** `/jwks`

| Metodo | Ruta    | Descripcion                  | Auth    |
| ------ | ------- | ---------------------------- | ------- |
| GET    | `/jwks` | Obtener claves publicas JWKS | Publico |

---

## 6. Company

**Controlador:** `company.controller.ts`
**Autenticacion:** JWT Bearer
**Prefijo:** `/` (raiz)

| Metodo | Ruta                          | Descripcion                        | Auth            |
| ------ | ----------------------------- | ---------------------------------- | --------------- |
| POST   | `/company`                    | Crear nueva empresa                | JWT Bearer      |
| POST   | `/sites/resolve`              | Resolver sitio por dominio         | Publico/API Key |
| GET    | `/company/by-domain/:domain`  | Obtener empresa por dominio        | JWT Bearer      |
| GET    | `/companies/:companyId/sites` | Listar sitios de una empresa       | JWT Bearer      |
| GET    | `/me/company`                 | Obtener empresa del usuario actual | JWT Bearer      |

---

## 7. Conversations V2 - Chats (`v2/chats`)

**Controlador:** `chat-v2.controller.ts`
**Autenticacion:** JWT Bearer / Visitante JWT
**Prefijo:** `/v2/chats`

| Metodo | Ruta                                         | Descripcion                             | Auth               |
| ------ | -------------------------------------------- | --------------------------------------- | ------------------ |
| POST   | `/v2/chats`                                  | Crear nuevo chat                        | JWT Bearer/Visitor |
| POST   | `/v2/chats/with-message`                     | Crear chat con mensaje inicial          | JWT Bearer/Visitor |
| GET    | `/v2/chats`                                  | Listar chats (con filtros y paginacion) | JWT Bearer         |
| GET    | `/v2/chats/response-time-stats`              | Estadisticas de tiempo de respuesta     | JWT Bearer         |
| GET    | `/v2/chats/commercial/:commercialId`         | Listar chats de un comercial            | JWT Bearer         |
| GET    | `/v2/chats/:chatId`                          | Obtener chat por ID                     | JWT Bearer/Visitor |
| GET    | `/v2/chats/visitor/:visitorId`               | Listar chats de un visitante            | JWT Bearer/Visitor |
| GET    | `/v2/chats/visitor/:visitorId/my-chat`       | Obtener chat activo del visitante       | Visitor JWT        |
| GET    | `/v2/chats/queue/pending`                    | Obtener chats en cola pendiente         | JWT Bearer         |
| GET    | `/v2/chats/metrics/commercial/:commercialId` | Metricas de un comercial                | JWT Bearer         |
| PUT    | `/v2/chats/:chatId/assign/:commercialId`     | Asignar chat a comercial                | JWT Bearer         |
| POST   | `/v2/chats/:chatId/request-agent`            | Solicitar agente humano (escalado IA)   | Visitor JWT        |
| PUT    | `/v2/chats/:chatId/view-open`                | Marcar chat como visto/abierto          | JWT Bearer         |
| PUT    | `/v2/chats/:chatId/view-close`               | Cerrar vista del chat                   | JWT Bearer         |
| PUT    | `/v2/chats/:chatId/close`                    | Cerrar chat                             | JWT Bearer         |
| DELETE | `/v2/chats/visitor/:visitorId/clear`         | Limpiar chats de un visitante           | JWT Bearer         |
| GET    | `/v2/chats/visitor/:visitorId/pending`       | Obtener chats pendientes del visitante  | JWT Bearer/Visitor |

---

## 8. Conversations V2 - Mensajes (`v2/messages`)

**Controlador:** `message-v2.controller.ts`
**Autenticacion:** JWT Bearer / Visitante JWT
**Prefijo:** `/v2/messages`

| Metodo | Ruta                               | Descripcion                       | Auth               |
| ------ | ---------------------------------- | --------------------------------- | ------------------ |
| POST   | `/v2/messages`                     | Enviar mensaje                    | JWT Bearer/Visitor |
| GET    | `/v2/messages/chat/:chatId`        | Listar mensajes de un chat        | JWT Bearer/Visitor |
| GET    | `/v2/messages/:messageId`          | Obtener mensaje por ID            | JWT Bearer/Visitor |
| PUT    | `/v2/messages/mark-as-read`        | Marcar mensajes como leidos       | JWT Bearer/Visitor |
| GET    | `/v2/messages/chat/:chatId/unread` | Obtener conteo de no leidos       | JWT Bearer/Visitor |
| GET    | `/v2/messages/search`              | Buscar mensajes (texto completo)  | JWT Bearer         |
| GET    | `/v2/messages/chat/:chatId/stats`  | Estadisticas de mensajes del chat | JWT Bearer         |
| GET    | `/v2/messages/metrics`             | Metricas globales de mensajes     | JWT Bearer         |
| GET    | `/v2/messages/attachments`         | Listar adjuntos                   | JWT Bearer         |

---

## 9. Conversations V2 - Reglas de Asignacion (`v2/assignment-rules`)

**Controlador:** `assignment-rules.controller.ts`
**Autenticacion:** JWT Bearer
**Prefijo:** `/v2/assignment-rules`

| Metodo | Ruta                       | Descripcion                 | Auth       |
| ------ | -------------------------- | --------------------------- | ---------- |
| POST   | `/v2/assignment-rules`     | Crear regla de asignacion   | JWT Bearer |
| GET    | `/v2/assignment-rules`     | Listar reglas de asignacion | JWT Bearer |
| GET    | `/v2/assignment-rules/:id` | Obtener regla por ID        | JWT Bearer |
| PUT    | `/v2/assignment-rules/:id` | Actualizar regla            | JWT Bearer |
| DELETE | `/v2/assignment-rules/:id` | Eliminar regla              | JWT Bearer |

> **Nota:** Los endpoints exactos dependen de la implementacion del controlador CRUD.

---

## 10. Conversations V2 - Presencia (`presence`)

**Controlador:** `presence.controller.ts`
**Autenticacion:** JWT Bearer / Visitante JWT
**Prefijo:** `/presence`

| Metodo | Ruta                                  | Descripcion                  | Auth               |
| ------ | ------------------------------------- | ---------------------------- | ------------------ |
| GET    | `/presence/chat/:chatId`              | Obtener presencia en un chat | JWT Bearer/Visitor |
| POST   | `/presence/chat/:chatId/typing/start` | Indicar que esta escribiendo | JWT Bearer/Visitor |
| POST   | `/presence/chat/:chatId/typing/stop`  | Dejar de escribir            | JWT Bearer/Visitor |

---

## 11. Visitors V2 - Visitantes (`visitors`)

**Controlador:** `visitor-v2.controller.ts`
**Autenticacion:** Visitante JWT
**Prefijo:** `/visitors`

| Metodo | Ruta                                | Descripcion                               | Auth        |
| ------ | ----------------------------------- | ----------------------------------------- | ----------- |
| POST   | `/visitors/identify`                | Identificar/crear visitante (fingerprint) | Visitor JWT |
| POST   | `/visitors/session/end`             | Finalizar sesion activa                   | Visitor JWT |
| PUT    | `/visitors/status`                  | Actualizar estado de conexion             | Visitor JWT |
| GET    | `/visitors/:visitorId/current-page` | Obtener pagina actual del visitante       | Visitor JWT |
| GET    | `/visitors/:visitorId/activity`     | Obtener actividad reciente                | Visitor JWT |
| GET    | `/visitors/:visitorId/site`         | Obtener sitio del visitante               | Visitor JWT |

---

## 12. Visitors V2 - Tenant Visitors (`tenant-visitors`)

**Controlador:** `tenant-visitors.controller.ts`
**Autenticacion:** JWT Bearer
**Prefijo:** `/tenant-visitors`

| Metodo | Ruta                                                          | Descripcion                      | Auth       |
| ------ | ------------------------------------------------------------- | -------------------------------- | ---------- |
| GET    | `/tenant-visitors/:tenantId/visitors`                         | Listar visitantes del tenant     | JWT Bearer |
| GET    | `/tenant-visitors/:tenantId/visitors/unassigned-chats`        | Visitantes con chats sin asignar | JWT Bearer |
| GET    | `/tenant-visitors/:tenantId/visitors/queued-chats`            | Visitantes con chats en cola     | JWT Bearer |
| POST   | `/tenant-visitors/:tenantId/visitors/search`                  | Buscar visitantes (Criteria)     | JWT Bearer |
| GET    | `/tenant-visitors/:tenantId/visitors/filters/quick`           | Obtener filtros rapidos          | JWT Bearer |
| GET    | `/tenant-visitors/:tenantId/visitors/filters/saved`           | Listar filtros guardados         | JWT Bearer |
| POST   | `/tenant-visitors/:tenantId/visitors/filters/saved`           | Crear filtro guardado            | JWT Bearer |
| DELETE | `/tenant-visitors/:tenantId/visitors/filters/saved/:filterId` | Eliminar filtro guardado         | JWT Bearer |

---

## 13. Visitors V2 - Sites (`sites`)

**Controlador:** `sites.controller.ts`
**Autenticacion:** API Key
**Prefijo:** `/sites`

| Metodo | Ruta             | Descripcion                | Auth    |
| ------ | ---------------- | -------------------------- | ------- |
| POST   | `/sites/resolve` | Resolver sitio por dominio | API Key |

---

## 14. Visitors V2 - Site Visitors (`site-visitors`)

**Controlador:** `site-visitors.controller.ts`
**Autenticacion:** JWT Bearer
**Prefijo:** `/site-visitors`

| Metodo | Ruta                                               | Descripcion                      | Auth       |
| ------ | -------------------------------------------------- | -------------------------------- | ---------- |
| GET    | `/site-visitors/:siteId/visitors`                  | Listar visitantes del sitio      | JWT Bearer |
| GET    | `/site-visitors/:siteId/visitors/unassigned-chats` | Visitantes con chats sin asignar | JWT Bearer |
| GET    | `/site-visitors/:siteId/visitors/queued-chats`     | Visitantes con chats en cola     | JWT Bearer |

---

## 15. Tracking V2 (`tracking-v2`)

**Controlador:** `tracking-v2.controller.ts`
**Autenticacion:** Visitante JWT / JWT Bearer
**Prefijo:** `/tracking-v2`

| Metodo | Ruta                                  | Descripcion                          | Auth        |
| ------ | ------------------------------------- | ------------------------------------ | ----------- |
| POST   | `/tracking-v2/events`                 | Ingestar evento(s) de tracking       | Visitor JWT |
| GET    | `/tracking-v2/stats/tenant/:tenantId` | Estadisticas de tracking del tenant  | JWT Bearer  |
| GET    | `/tracking-v2/health`                 | Health check del sistema de tracking | Publico     |

---

## 16. Commercial (`v2/commercials`)

**Controlador:** `commercial.controller.ts`
**Autenticacion:** JWT Bearer
**Prefijo:** `/v2/commercials`

| Metodo | Ruta                                   | Descripcion                          | Auth       |
| ------ | -------------------------------------- | ------------------------------------ | ---------- |
| POST   | `/v2/commercials/connect`              | Conectar comercial (fijar presencia) | JWT Bearer |
| POST   | `/v2/commercials/disconnect`           | Desconectar comercial                | JWT Bearer |
| PUT    | `/v2/commercials/status`               | Actualizar estado del comercial      | JWT Bearer |
| GET    | `/v2/commercials/:id/status`           | Obtener estado de un comercial       | JWT Bearer |
| GET    | `/v2/commercials/active`               | Listar comerciales activos           | JWT Bearer |
| GET    | `/v2/commercials/available`            | Listar comerciales disponibles       | JWT Bearer |
| POST   | `/v2/commercials/availability`         | Configurar disponibilidad            | JWT Bearer |
| DELETE | `/v2/commercials/:id`                  | Eliminar comercial                   | JWT Bearer |
| POST   | `/v2/commercials/register-fingerprint` | Registrar fingerprint de dispositivo | JWT Bearer |

---

## 17. LLM - Sugerencias (`v2/llm`)

**Controlador:** `llm-suggestions.controller.ts`
**Autenticacion:** JWT Bearer
**Prefijo:** `/v2/llm`

| Metodo | Ruta                  | Descripcion                        | Auth       |
| ------ | --------------------- | ---------------------------------- | ---------- |
| POST   | `/v2/llm/suggestions` | Obtener sugerencia de respuesta IA | JWT Bearer |
| POST   | `/v2/llm/improve`     | Mejorar texto con IA               | JWT Bearer |

---

## 18. LLM - Configuracion (`v2/llm/config`)

**Controlador:** `llm-config.controller.ts`
**Autenticacion:** JWT Bearer
**Prefijo:** `/v2/llm/config`

| Metodo | Ruta                        | Descripcion                          | Auth       |
| ------ | --------------------------- | ------------------------------------ | ---------- |
| GET    | `/v2/llm/config/providers`  | Listar proveedores LLM disponibles   | JWT Bearer |
| GET    | `/v2/llm/config/:companyId` | Obtener configuracion LLM de empresa | JWT Bearer |
| POST   | `/v2/llm/config`            | Crear configuracion LLM              | JWT Bearer |
| PATCH  | `/v2/llm/config/:companyId` | Actualizar configuracion LLM         | JWT Bearer |
| DELETE | `/v2/llm/config/:companyId` | Eliminar configuracion LLM           | JWT Bearer |

---

## 19. Leads - Contactos (`leads`)

**Controlador:** `leads-contact.controller.ts`
**Autenticacion:** JWT Bearer / Visitante JWT
**Prefijo:** `/leads`

| Metodo | Ruta                             | Descripcion                        | Auth               |
| ------ | -------------------------------- | ---------------------------------- | ------------------ |
| POST   | `/leads/contact-data/:visitorId` | Guardar datos de contacto del lead | JWT Bearer/Visitor |
| GET    | `/leads/contact-data/:visitorId` | Obtener datos de contacto del lead | JWT Bearer         |
| GET    | `/leads/contact-data`            | Listar todos los datos de contacto | JWT Bearer         |

---

## 20. Leads - Admin (`v1/leads/admin`)

**Controlador:** `leads-admin.controller.ts`
**Autenticacion:** JWT Bearer (admin)
**Prefijo:** `/v1/leads/admin`

| Metodo | Ruta                                                 | Descripcion                        | Auth       |
| ------ | ---------------------------------------------------- | ---------------------------------- | ---------- |
| POST   | `/v1/leads/admin/config`                             | Crear configuracion CRM            | JWT Bearer |
| GET    | `/v1/leads/admin/config`                             | Listar configuraciones CRM         | JWT Bearer |
| GET    | `/v1/leads/admin/config/:id`                         | Obtener configuracion CRM por ID   | JWT Bearer |
| PUT    | `/v1/leads/admin/config/:id`                         | Actualizar configuracion CRM       | JWT Bearer |
| DELETE | `/v1/leads/admin/config/:id`                         | Eliminar configuracion CRM         | JWT Bearer |
| POST   | `/v1/leads/admin/config/:configId/test`              | Probar conexion CRM                | JWT Bearer |
| POST   | `/v1/leads/admin/test-connection`                    | Probar conexion CRM directa        | JWT Bearer |
| GET    | `/v1/leads/admin/sync-records/failed`                | Listar registros de sync fallidos  | JWT Bearer |
| GET    | `/v1/leads/admin/sync-records/visitor/:visitorId`    | Registros sync de un visitante     | JWT Bearer |
| GET    | `/v1/leads/admin/sync-records`                       | Listar todos los registros de sync | JWT Bearer |
| GET    | `/v1/leads/admin/leadcars/concesionarios`            | Listar concesionarios LeadCars     | JWT Bearer |
| GET    | `/v1/leads/admin/leadcars/sedes/:concesionarioId`    | Listar sedes de concesionario      | JWT Bearer |
| GET    | `/v1/leads/admin/leadcars/campanas/:concesionarioId` | Listar campanas del concesionario  | JWT Bearer |
| GET    | `/v1/leads/admin/leadcars/tipos`                     | Listar tipos de lead LeadCars      | JWT Bearer |
| GET    | `/v1/leads/admin/supported-crms`                     | Listar CRMs soportados             | JWT Bearer |

---

## 21. White Label (`v2/companies/:companyId/white-label`)

**Controlador:** `white-label-config.controller.ts`
**Autenticacion:** JWT Bearer
**Prefijo:** `/v2/companies/:companyId/white-label`

| Metodo | Ruta                                                  | Descripcion                     | Auth       |
| ------ | ----------------------------------------------------- | ------------------------------- | ---------- |
| GET    | `/v2/companies/:companyId/white-label/defaults`       | Obtener valores por defecto     | JWT Bearer |
| GET    | `/v2/companies/:companyId/white-label`                | Obtener configuracion actual    | JWT Bearer |
| PATCH  | `/v2/companies/:companyId/white-label`                | Actualizar configuracion        | JWT Bearer |
| DELETE | `/v2/companies/:companyId/white-label`                | Resetear configuracion          | JWT Bearer |
| POST   | `/v2/companies/:companyId/white-label/logo`           | Subir logo (S3)                 | JWT Bearer |
| DELETE | `/v2/companies/:companyId/white-label/logo`           | Eliminar logo                   | JWT Bearer |
| POST   | `/v2/companies/:companyId/white-label/favicon`        | Subir favicon (S3)              | JWT Bearer |
| DELETE | `/v2/companies/:companyId/white-label/favicon`        | Eliminar favicon                | JWT Bearer |
| POST   | `/v2/companies/:companyId/white-label/font`           | Subir fuente personalizada (S3) | JWT Bearer |
| DELETE | `/v2/companies/:companyId/white-label/font/:fileName` | Eliminar fuente especifica      | JWT Bearer |
| DELETE | `/v2/companies/:companyId/white-label/fonts`          | Eliminar todas las fuentes      | JWT Bearer |

---

## 22. Consent (`consents`)

**Controlador:** `consent.controller.ts`
**Autenticacion:** Visitante JWT / JWT Bearer
**Prefijo:** `/consents`

| Metodo | Ruta                                       | Descripcion                           | Auth               |
| ------ | ------------------------------------------ | ------------------------------------- | ------------------ |
| POST   | `/consents/revoke`                         | Revocar consentimiento                | Visitor JWT        |
| POST   | `/consents/renew`                          | Renovar consentimiento                | Visitor JWT        |
| GET    | `/consents/visitors/:visitorId`            | Obtener consentimientos del visitante | JWT Bearer/Visitor |
| GET    | `/consents/visitors/:visitorId/audit-logs` | Obtener logs de auditoria             | JWT Bearer         |

---

## 23. Visitors V1 Legacy (`visitor`)

**Controlador:** `visitor.controller.ts` (Legacy - Deprecated)
**Autenticacion:** JWT Bearer
**Prefijo:** `/visitor`

> **Nota:** Este controlador es legacy y esta en proceso de deprecacion. Los endpoints V2 lo reemplazan.

---

## 24. App Root

**Controlador:** `app.controller.ts`
**Prefijo:** `/`

| Metodo | Ruta | Descripcion                   | Auth    |
| ------ | ---- | ----------------------------- | ------- |
| GET    | `/`  | Health check / info de la API | Publico |

---

## 25. Open Search (Test)

**Controlador:** `open-search.controller.ts`
**Prefijo:** `/open-search`

> Controlador de testing para OpenSearch. No forma parte de la API de produccion.

---

## WebSocket Gateway (Socket.IO)

**Gateway:** `websocket.gateway.ts`
**Puerto:** Mismo servidor HTTP (upgrade)
**Namespace:** `/` (root)
**Autenticacion:** JWT en handshake (`auth.token`)

### Eventos de Subscripcion (Cliente → Servidor)

| Evento           | Descripcion                    | Payload                 |
| ---------------- | ------------------------------ | ----------------------- |
| `chat:join`      | Unirse a sala de chat          | `{ chatId: string }`    |
| `chat:leave`     | Abandonar sala de chat         | `{ chatId: string }`    |
| `visitor:join`   | Unirse a sala de visitante     | `{ visitorId: string }` |
| `visitor:leave`  | Abandonar sala de visitante    | `{ visitorId: string }` |
| `tenant:join`    | Unirse a sala del tenant       | `{ tenantId: string }`  |
| `tenant:leave`   | Abandonar sala del tenant      | `{ tenantId: string }`  |
| `presence:join`  | Unirse a canal de presencia    | `{ chatId: string }`    |
| `presence:leave` | Abandonar canal de presencia   | `{ chatId: string }`    |
| `typing:start`   | Indicar que esta escribiendo   | `{ chatId: string }`    |
| `typing:stop`    | Dejar de escribir              | `{ chatId: string }`    |
| `user:activity`  | Reportar actividad del usuario | `{ type: string }`      |
| `test`           | Evento de prueba               | `any`                   |
| `health-check`   | Verificacion de salud          | `void`                  |

### Eventos Emitidos (Servidor → Cliente)

| Evento                      | Descripcion                       | Emitido cuando                   |
| --------------------------- | --------------------------------- | -------------------------------- |
| `chat:message:new`          | Nuevo mensaje en el chat          | Se envia un mensaje              |
| `chat:created`              | Nuevo chat creado                 | Se crea un chat                  |
| `chat:updated`              | Chat actualizado                  | Cambio de estado/asignacion      |
| `chat:closed`               | Chat cerrado                      | Se cierra un chat                |
| `visitor:updated`           | Visitante actualizado             | Cambio de estado/datos           |
| `visitor:status:changed`    | Cambio de estado de visitante     | online/away/offline              |
| `typing:indicator`          | Indicador de escritura            | Alguien escribe/deja de escribir |
| `presence:update`           | Actualizacion de presencia        | Cambio en sala de presencia      |
| `commercial:status:changed` | Cambio de estado de comercial     | Conexion/desconexion             |
| `unread:count:updated`      | Contador de no leidos actualizado | Nuevo mensaje no leido           |

---

## Patrones de Autenticacion

### 1. JWT Bearer (Usuarios internos)

- Header: `Authorization: Bearer <token>`
- Emitido por: Keycloak o endpoint `/user/auth/login`
- Roles: admin, commercial, viewer
- Guard: `JwtAuthGuard`

### 2. BFF Cookies (Frontends SPA)

- Cookie: `bff_access_token_<app>` (HttpOnly, Secure, SameSite=Lax)
- Flujo: OIDC Authorization Code + PKCE con Keycloak
- Guard: `BffAuthGuard`

### 3. API Key / Visitor JWT (Widget)

- Header: `x-api-key: <api-key>` para registro inicial
- Header: `Authorization: Bearer <visitor-token>` para operaciones posteriores
- Token firmado con RSA 4096 (clave privada del API Key)
- Guard: `VisitorAuthGuard`

---

## Patrones de Respuesta

### Respuesta exitosa

```json
{
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

### Respuesta de error (Result Pattern)

```json
{
  "statusCode": 400,
  "message": "Descripcion del error en espanol",
  "error": "DomainErrorClassName"
}
```

---

_Generado usando el workflow `document-project` de BMAD Method_
