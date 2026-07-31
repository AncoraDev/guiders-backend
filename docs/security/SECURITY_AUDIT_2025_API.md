# Auditoría de Seguridad API — Guiders Backend (NestJS v11)

**Fecha**: 2026-04-21  
**Alcance**: Controllers HTTP REST, configuración global (`main.ts`), guards, DTOs, uploads, CORS/Helmet, rate limiting, Swagger, manejo de errores, logs.  
**Metodología**: Revisión manual de 27 controllers + configuración global, sin dependencia de informes previos.

## Resumen ejecutivo

| Severidad   | Cantidad |
| ----------- | -------- |
| CRÍTICA     | 9        |
| ALTA        | 11       |
| MEDIA       | 10       |
| BAJA        | 6        |
| **Total**   | **36**   |

**Conclusiones clave**:
- 9 endpoints críticos totalmente públicos que deberían requerir autenticación, incluidos `POST /auth/user/sync-keycloak`, `POST /api-keys/create`, `OpenSearchController` completo, y todo `CommercialController`.
- Ausencia total de **Helmet** y **rate limiting** (`@nestjs/throttler`) a nivel global.
- Swagger (`/docs`, `/docs-json`) expuesto sin autenticación incluso en producción.
- Múltiples BOLA/IDOR por no cruzar `companyId`/`tenantId` de path con `req.user.companyId`.
- Vector de **privilege escalation** en `POST /auth/user/register` (acepta `roles` del body sin filtrar).
- CORS con fallback `origin: true` + `credentials: true` si `CORS_ALLOWED_ORIGINS` está vacío.

---

## 1. Hallazgos CRÍTICOS (CVSS 9.0–10.0)

### API-001 [CRÍTICA] `OpenSearchController` expuesto en producción sin autenticación
- **Archivo**: `src/context/shared/infrastructure/open-search/tests/open-search.controller.ts`
- **Endpoints**: `GET /open-search/:index`, `POST /open-search/:index`
- **Descripción**: Controller marcado como “tests” pero registrado en el bundle de producción, sin `@UseGuards`. Permite a cualquiera indexar documentos arbitrarios y leer cualquier índice de OpenSearch.
- **Impacto**: Fuga total de datos almacenados (tracking events, logs) y contaminación de índices (envenenamiento de analíticas).
- **Evidencia**: Ruta `/open-search` sin guards ni rol; decoradores `@Post(':index')` y `@Get(':index')` libres.
- **Remediación**: (a) Eliminar el controller del build de producción, condicional por `NODE_ENV`; o (b) `@UseGuards(AuthGuard, RolesGuard) @RequiredRoles('superadmin')` + allowlist de índices.
- **CVSS**: 9.8 (AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H)
- **CWE**: CWE-306 (Missing Authentication), CWE-284.

### API-002 [CRÍTICA] `POST /auth/user/sync-keycloak` sin autenticación permite account takeover
- **Archivo**: `src/context/auth/auth-user/infrastructure/controllers/auth-user.controller.ts:608`
- **Endpoint**: `POST /auth/user/sync-keycloak`
- **Descripción**: Endpoint para vincular un `keycloakId` a un email/companyId/roles; no tiene `@UseGuards` ni validación de origen.
- **Impacto**: Un atacante que conozca/adivine un email puede crear un vínculo con su propio `keycloakId`, robando la cuenta al siguiente inicio de sesión vía Keycloak.
- **Evidencia**: método `syncWithKeycloak` sin decorador de auth; acepta `email`, `companyId`, `roles[]` del body.
- **Remediación**: Requerir un token interno de Keycloak (m2m) o mover el sync a un webhook firmado HMAC verificado; en ningún caso permitir invocación pública.
- **CVSS**: 9.8 (AV:N/AC:L/PR:N/UI:N/C:H/I:H/A:H)
- **CWE**: CWE-287 (Improper Authentication), CWE-306.

### API-003 [CRÍTICA] `POST /api-keys/create` sin autenticación
- **Archivo**: `src/context/auth/api-key/infrastructure/api-key.controller.ts`
- **Endpoint**: `POST /api-keys/create`
- **Descripción**: Endpoint para crear API Keys no tiene `@UseGuards`. Acepta `domain` y `companyId` en el body.
- **Impacto**: Cualquiera genera claves API válidas para cualquier empresa y dominio, permitiendo autenticar el SDK como otro tenant y acceder a su tracking/visitors/chat.
- **Evidencia**: controlador `ApiKeyController` con `@Post('create')` sin guards.
- **Remediación**: `@UseGuards(AuthGuard, RolesGuard) @RequiredRoles('admin','superadmin')` + validar `createDto.companyId === req.user.companyId` (o permitir sólo `superadmin` para companyId arbitrario).
- **CVSS**: 9.6
- **CWE**: CWE-306.

### API-004 [CRÍTICA] `CommercialController` enteramente sin guards (todos comentados)
- **Archivo**: `src/context/commercial/infrastructure/controllers/commercial.controller.ts`
- **Endpoints**: `POST /v2/commercials/connect`, `/disconnect`, `PUT /v2/commercials/status`, `GET /v2/commercials/:id/status`, `GET /v2/commercials/active`, `GET /v2/commercials/available`, `DELETE /v2/commercials/:id`, `POST /v2/commercials/register-fingerprint`.
- **Descripción**: Los decoradores `@UseGuards(...)` figuran comentados en todos los métodos. Endpoints totalmente públicos.
- **Impacto**: Cualquiera desconecta/elimina comerciales, cambia estados de presencia, y registra fingerprints arbitrarios — secuestro funcional completo del subsistema comercial.
- **Evidencia**: archivo del controller con líneas `// @UseGuards(...)` a lo largo de todos los handlers.
- **Remediación**: Restaurar `@UseGuards(AuthGuard, RolesGuard) @RequiredRoles('commercial','admin')` y validar `commercialId === req.user.id` donde aplique.
- **CVSS**: 9.1
- **CWE**: CWE-862 (Missing Authorization), CWE-306.

### API-005 [CRÍTICA] `POST /company` y sub-rutas sin autenticación
- **Archivo**: `src/context/company/infrastructure/controllers/company.controller.ts`
- **Endpoints**: `POST /company`, `POST /sites/resolve`, `GET /company/by-domain/:domain`.
- **Descripción**: `POST /company` crea una empresa y su admin sin auth. `POST /sites/resolve` y `GET /company/by-domain/:domain` permiten enumeración de tenants.
- **Impacto**: Creación ilimitada de empresas (abuso, DoS de almacenamiento, contaminación de datos). Enumeración de dominios de clientes.
- **Evidencia**: handlers sin `@UseGuards`; `GET /companies/:companyId/sites` tiene `DualAuthGuard` pero no valida que `companyId === req.user.companyId`.
- **Remediación**: `POST /company` sólo para `superadmin` autenticado. Mover enumeración a endpoint privado o restringir a dominio del solicitante. Validar ownership en `:companyId/sites`.
- **CVSS**: 9.1
- **CWE**: CWE-306, CWE-639 (IDOR).

### API-006 [CRÍTICA] `POST /v2/chats` y `PUT /v2/chats/:chatId/close` con `@RequiredRoles` pero sin `@UseGuards`
- **Archivo**: `src/context/conversations-v2/infrastructure/controllers/chat-v2.controller.ts`
- **Endpoints**: `POST /v2/chats`, `GET /v2/chats/queue/pending`, `PUT /v2/chats/:chatId/close`.
- **Descripción**: Los handlers declaran `@RequiredRoles(...)` pero no tienen `@UseGuards(AuthGuard, RolesGuard)`. Los decoradores `@RequiredRoles` sin `RolesGuard` son inertes → endpoints efectivamente públicos.
- **Impacto**: Cualquiera crea chats arbitrarios, consulta la cola pendiente (datos de visitantes de cualquier empresa) y cierra conversaciones de terceros.
- **Evidencia**: `chat-v2.controller.ts` métodos con `@RequiredRoles('visitor')` / `@RequiredRoles('commercial','admin')` sin `@UseGuards`.
- **Remediación**: Añadir `@UseGuards(DualAuthGuard, RolesGuard)` a nivel de clase y revisar todos los métodos que declaren `@RequiredRoles`.
- **CVSS**: 9.1
- **CWE**: CWE-862, CWE-1220 (Insufficient Granularity of Access Control).

### API-007 [CRÍTICA] `POST /tracking-v2/events` y `GET /tracking-v2/stats/tenant/:tenantId` sin autenticación
- **Archivo**: `src/context/tracking-v2/infrastructure/controllers/tracking-v2.controller.ts`
- **Endpoints**: `POST /api/tracking-v2/events` (hasta 500 eventos por request), `GET /api/tracking-v2/stats/tenant/:tenantId`, `GET /api/tracking-v2/health`.
- **Descripción**: Sin `@UseGuards`. El body acepta `tenantId`/`siteId` arbitrarios y el GET de stats no valida ownership.
- **Impacto**: (a) Envenenamiento de analíticas cross-tenant (inyectar millones de eventos falsos). (b) Fuga de métricas privadas de cualquier empresa (volumen de tráfico, comportamiento de usuarios).
- **Evidencia**: `TrackingV2Controller` sin guards y sin validación de tenantId vs auth.
- **Remediación**: Añadir API Key guard (similar a visitor auth) en `POST /events` con binding `apiKey.companyId === body.tenantId`. Restringir `GET /stats` con `@UseGuards(DualAuthGuard, RolesGuard)` + verificación de ownership.
- **CVSS**: 9.0
- **CWE**: CWE-306, CWE-639.

### API-008 [CRÍTICA] Privilege escalation vía `POST /auth/user/register` aceptando `roles` del body
- **Archivos**:
  - `src/context/auth/auth-user/infrastructure/controllers/auth-user.controller.ts:167`
  - `src/context/auth/auth-user/infrastructure/services/auth-user.service.ts:29-37`
- **Endpoint**: `POST /auth/user/register`
- **Descripción**: El controller pasa `body.roles` a `AuthUserService.register` y el service lo envía sin filtrar al `UserRegisterUseCase`. No hay whitelist ni validación de que el caller tenga permiso para asignar esos roles; el propio endpoint no tiene `@UseGuards`.
- **Impacto**: Un atacante registra un usuario con `roles: ["admin","superadmin"]` y obtiene privilegios totales.
- **Evidencia**:
  ```ts
  // auth-user.service.ts:36
  return await this.userRegister.execute(email, name, companyId, roles ?? []);
  ```
- **Remediación**: (a) Remover `roles` del DTO público y asignar rol por defecto `user`; (b) Proteger el endpoint con `@UseGuards(AuthGuard, RolesGuard) @RequiredRoles('admin')` y validar roles contra whitelist; (c) Rechazar `superadmin` salvo caller `superadmin`.
- **CVSS**: 9.8
- **CWE**: CWE-269 (Improper Privilege Management), CWE-915 (Mass Assignment).

### API-009 [CRÍTICA] SSRF vía `LlmConfigController` sin validación de `baseUrl`
- **Archivo**: `src/context/llm/infrastructure/controllers/llm-config.controller.ts`
- **Endpoints**: `POST /v2/llm/config/:companyId`, `PUT /v2/llm/config/:companyId`.
- **Descripción**: El DTO permite configurar `baseUrl` arbitraria. El servicio LLM usa `fetch` con esta URL para invocar tools. No hay allowlist de dominios ni bloqueo de IPs privadas/metadata.
- **Impacto**: Servidor realiza peticiones a `http://169.254.169.254/` (metadata AWS/GCP), `http://localhost:*` (servicios internos, Redis, Mongo), escaneo de red interna.
- **Evidencia**: `LlmConfigController.createConfig/updateConfig` acepta `baseUrl` sin validación; además BOLA cross-tenant (ver API-011).
- **Remediación**: Allowlist estricta de dominios (`api.openai.com`, `api.anthropic.com`, etc.), bloquear IPs RFC1918 y loopback, resolver DNS previamente y verificar (defensa contra DNS rebinding).
- **CVSS**: 9.1
- **CWE**: CWE-918 (SSRF).

---

## 2. Hallazgos ALTOS (CVSS 7.0–8.9)

### API-010 [ALTA] Ausencia total de Helmet — falta CSP, HSTS, X-Frame-Options
- **Archivo**: `src/main.ts`
- **Descripción**: No se importa ni aplica `helmet()`. La app carece de headers de seguridad básicos.
- **Impacto**: MITM sin HSTS, clickjacking sin `X-Frame-Options`, XSS sin `Content-Security-Policy`.
- **Evidencia**: `main.ts` — ninguna referencia a `helmet`.
- **Remediación**: `npm i helmet` y `app.use(helmet({ contentSecurityPolicy: {...} }))`.
- **CVSS**: 7.4
- **CWE**: CWE-693 (Protection Mechanism Failure), CWE-1021.

### API-011 [ALTA] BOLA cross-tenant: `LlmConfigController`, `WhiteLabelConfigController`, `AssignmentRulesController`, `TenantVisitorsController`, `LeadsContactController`
- **Archivos**:
  - `src/context/llm/infrastructure/controllers/llm-config.controller.ts`
  - `src/context/white-label/infrastructure/controllers/white-label-config.controller.ts`
  - `src/context/conversations-v2/infrastructure/controllers/assignment-rules.controller.ts`
  - `src/context/visitors-v2/infrastructure/controllers/tenant-visitors.controller.ts`
  - `src/context/leads/infrastructure/controllers/leads-contact.controller.ts`
- **Endpoints**: todos los que reciben `:companyId` / `:tenantId` / `:visitorId` en path o body y **no validan** contra `req.user.companyId`.
- **Descripción**: Aunque los guards de auth están presentes, falta el check de ownership. Admin de empresa A puede operar sobre empresa B.
- **Impacto**: Fuga y modificación de configuraciones de LLM, branding, reglas de asignación, datos de visitantes y leads entre tenants.
- **Remediación**: Implementar un `TenantOwnershipGuard` que compare `params.companyId ?? body.companyId` con `req.user.companyId`, salvo `superadmin`.
- **CVSS**: 8.1
- **CWE**: CWE-639, CWE-284.

### API-012 [ALTA] `ChatV2Controller.getChatsByCommercial` bypass de autorización
- **Archivo**: `src/context/conversations-v2/infrastructure/controllers/chat-v2.controller.ts`
- **Endpoint**: `GET /v2/chats/commercial/:commercialId`
- **Descripción**: Usa `OptionalAuthGuard` y fuerza `userRoles: ['admin']` para bypassear filtros, permitiendo que cualquier `commercial` lea chats de cualquier otro comercial.
- **Impacto**: Fuga de conversaciones entre comerciales (datos personales, estrategia comercial).
- **Remediación**: Cambiar a `DualAuthGuard + RolesGuard` obligatorio; si el caller es `commercial`, forzar `commercialId === req.user.id`.
- **CVSS**: 8.1
- **CWE**: CWE-639, CWE-863.

### API-013 [ALTA] IDOR en `VisitorV2Controller.endSession` y `updateStatus`
- **Archivo**: `src/context/visitors-v2/infrastructure/controllers/visitor-v2.controller.ts`
- **Endpoints**: `POST /visitors/session/end`, `POST /visitors/status`.
- **Descripción**: Reciben `sessionId`/`visitorId` del body sin validar propiedad ni token; sin guards.
- **Impacto**: Cualquiera cierra sesiones de visitantes en curso (interrumpe chats en vivo) o cambia estado a offline.
- **Remediación**: Requerir `VisitorAuthGuard` y comparar `visitorId === req.visitor.id`.
- **CVSS**: 7.5
- **CWE**: CWE-639.

### API-014 [ALTA] Swagger UI y swagger JSON expuestos en producción sin auth
- **Archivo**: `src/main.ts`
- **Endpoints**: `GET /docs`, `GET /docs-json`.
- **Descripción**: `SwaggerModule.setup` se ejecuta incondicionalmente.
- **Impacto**: Mapeo completo de la superficie API (facilita enumeración y explotación).
- **Remediación**: Condicional `if (process.env.NODE_ENV !== 'production')` o proteger con basic auth.
- **CVSS**: 7.5
- **CWE**: CWE-200 (Information Exposure).

### API-015 [ALTA] Ausencia de rate limiting global (`@nestjs/throttler`)
- **Archivo**: `src/main.ts`, ausencia en `AppModule`.
- **Descripción**: No hay `ThrottlerModule` ni `ThrottlerGuard` global. Endpoints de auth (login, register, refresh), tracking (500 eventos/req) y file upload no tienen límites.
- **Impacto**: Brute force de credenciales, DoS por flood de eventos, abuso de uploads.
- **Remediación**: Configurar `ThrottlerModule.forRoot({ ttl: 60, limit: 100 })` global y límites específicos (10/min en `/auth/*`).
- **CVSS**: 7.5
- **CWE**: CWE-307 (Improper Restriction of Excessive Authentication Attempts), CWE-770.

### API-016 [ALTA] CORS permisivo con credenciales cuando `CORS_ALLOWED_ORIGINS` está vacío
- **Archivo**: `src/main.ts`
- **Descripción**: Si la variable `CORS_ALLOWED_ORIGINS` no está definida o está vacía, el fallback pasa `origin: true` con `credentials: true`, reflejando el `Origin` del atacante.
- **Impacto**: CSRF con credenciales posible desde cualquier origen; cookies de sesión enviables desde sitios maliciosos.
- **Evidencia**: lógica `const allowed = process.env.CORS_ALLOWED_ORIGINS?.split(',').filter(Boolean); app.enableCors({ origin: allowed?.length ? allowed : true, credentials: true });`
- **Remediación**: Fallar fast si la lista está vacía en producción (`throw`) o usar lista mínima segura (no `true`).
- **CVSS**: 7.4
- **CWE**: CWE-942 (Overly Permissive CORS), CWE-346.

### API-017 [ALTA] `console.log(req.user)` en `CompanyController.getMyCompany` + logs de tokens en BFF
- **Archivos**:
  - `src/context/company/infrastructure/controllers/company.controller.ts` (getMyCompany)
  - `src/context/auth/bff/infrastructure/controllers/bff-auth.controller.ts`
- **Descripción**: El BFF loguea cookies raw (`JSON.stringify(req.cookies)`), fragmentos de tokens, y el controller de company imprime el objeto `user` completo (incluye email, roles, companyId).
- **Impacto**: Exposición de PII y credenciales en logs centralizados (CloudWatch/ELK); riesgo si logs se comparten o se filtran.
- **Remediación**: Reemplazar por logger estructurado con redaction (nunca loguear cookies completas ni `req.user`).
- **CVSS**: 7.5
- **CWE**: CWE-532 (Insertion of Sensitive Information into Log File).

### API-018 [ALTA] `GET /` (AppController) expone `websocket-test` HTML desde disco en producción
- **Archivo**: `src/app.controller.ts`
- **Endpoint**: `GET /websocket-test`.
- **Descripción**: Handler lee y sirve un archivo HTML de test. En producción no debería existir.
- **Impacto**: Superficie adicional; si el archivo contiene tokens/URLs internas es filtración. Potencial path traversal si se generaliza en el futuro.
- **Remediación**: Deshabilitar por `NODE_ENV` y mover a entorno de desarrollo.
- **CVSS**: 7.0
- **CWE**: CWE-489 (Active Debug Code).

### API-019 [ALTA] Secrets por defecto `'dev-secret'` y `'dev-session'` en `main.ts`
- **Archivo**: `src/main.ts`
- **Descripción**: `cookieParser(process.env.COOKIE_SECRET ?? 'dev-secret')` y `session({ secret: process.env.SESSION_SECRET ?? 'dev-session' })`. Si la variable no está definida, usa el secreto por defecto.
- **Impacto**: Firma de cookies predecible → forja de cookies signadas y secuestro de sesión.
- **Remediación**: Lanzar error al arrancar si la variable no está definida en producción.
- **CVSS**: 8.1
- **CWE**: CWE-798 (Use of Hard-coded Credentials), CWE-1188.

### API-020 [ALTA] Validación insuficiente de `AuthVisitorController.register/token` (origin sólo por referer)
- **Archivo**: `src/context/auth/auth-visitor/infrastructure/auth-visitor.controller.ts`
- **Descripción**: La validación de dominio se basa en `req.headers.referer` (hostname). El header referer puede ser omitido o falsificado desde clientes no-navegador; además el binding apiKey→dominio es débil si el apiKey se filtra.
- **Impacto**: Un atacante con una apiKey filtrada puede generar tokens de visitante arbitrarios desde cualquier origen.
- **Remediación**: Verificación estricta Origin (no Referer), rotación regular de apiKeys, scope apiKey por dominio y IP, rate limit agresivo.
- **CVSS**: 7.2
- **CWE**: CWE-346 (Origin Validation Error).

---

## 3. Hallazgos MEDIOS (CVSS 4.0–6.9)

### API-021 [MEDIA] DTOs de paginación sin `@Max(100)` — DoS por `limit` grande
- **Archivo**: `src/context/visitors-v2/application/dtos/site-visitors-query.dto.ts` (y similares en leads, tenant-visitors)
- **Descripción**: Los DTOs declaran `@Min(1)` pero no `@Max(100)` pese a documentarlo en `@ApiProperty({ maximum: 100 })`. El `ValidationPipe` no infiere el max desde Swagger.
- **Impacto**: Consulta con `limit=100000000` sobrecarga MongoDB/Postgres.
- **Remediación**: Añadir `@Max(100)` en los tres DTOs (`SiteVisitorsQueryDto`, `SiteVisitorsUnassignedChatsQueryDto`, `SiteVisitorsQueuedChatsQueryDto`) y resto de queries.
- **CVSS**: 6.5
- **CWE**: CWE-770 (Allocation of Resources Without Limits).

### API-022 [MEDIA] Endpoints sin paginación (`listContactData`, `getSyncRecords`, `getFailedSyncRecords`)
- **Archivos**:
  - `src/context/leads/infrastructure/controllers/leads-contact.controller.ts`
  - `src/context/leads/infrastructure/controllers/leads-admin.controller.ts`
- **Descripción**: Devuelven colecciones enteras sin `limit/offset`.
- **Impacto**: Respuestas de MBs, time-out, memoria.
- **Remediación**: Añadir paginación obligatoria con max 100.
- **CVSS**: 5.3
- **CWE**: CWE-770.

### API-023 [MEDIA] Mass assignment en `LeadsAdminController.createConfig`
- **Archivo**: `src/context/leads/infrastructure/controllers/leads-admin.controller.ts`
- **Descripción**: `dto.config as unknown as Record<string, unknown>` omite validación por campo; se persiste directamente.
- **Impacto**: Inyección de propiedades inesperadas (flags internos, overrides).
- **Remediación**: Tipar `config` con DTO anidado validado por `class-validator` + `@ValidateNested()`.
- **CVSS**: 5.9
- **CWE**: CWE-915.

### API-024 [MEDIA] Propagación de `error.message` en `TrackingV2Controller` y `LeadsAdminController`
- **Descripción**: Bloques catch hacen `throw new BadRequestException(error.message)` con mensajes de DB/HTTP upstream.
- **Impacto**: Fuga de detalles internos (nombres de colecciones, stack parcial, URLs de LeadCars).
- **Remediación**: Mensajes genéricos al cliente + log interno con el error completo.
- **CVSS**: 5.3
- **CWE**: CWE-209 (Generation of Error Message Containing Sensitive Information).

### API-025 [MEDIA] `OptionalAuthGuard` combinado con `@RequiredRoles` es contradictorio en `MessageV2Controller` y `ChatV2Controller.getByVisitor`
- **Descripción**: `OptionalAuthGuard` permite requests sin auth; `@RequiredRoles` se evalúa contra un `req.user` que puede ser undefined → comportamiento impredecible (posiblemente permite acceso sin rol).
- **Impacto**: Bypass de restricción de roles dependiendo del orden de guards.
- **Remediación**: Revisar lógica: usar `AuthGuard` cuando se requieran roles, o ramificar explícitamente en el handler.
- **CVSS**: 6.5
- **CWE**: CWE-863.

### API-026 [MEDIA] `AuthUserController.verifyRoleMapping` sin auth
- **Archivo**: `src/context/auth/auth-user/infrastructure/controllers/auth-user.controller.ts`
- **Descripción**: Endpoint público que devuelve mapeo de roles → información estructural de autorización.
- **Impacto**: Facilita reconocimiento y diseño de ataques de privilegios.
- **Remediación**: `@UseGuards(AuthGuard, RolesGuard) @RequiredRoles('admin')`.
- **CVSS**: 5.3
- **CWE**: CWE-200.

### API-027 [MEDIA] Uploads sin `limits` en Multer (`WhiteLabelConfigController`, `AuthUserController.uploadAvatar`)
- **Descripción**: `FileInterceptor('file')` sin `{ limits: { fileSize, files } }`. La validación de tamaño existe en `WhiteLabelFileUploadService` pero tras haber buffereado el archivo completo en memoria.
- **Impacto**: DoS de memoria al subir archivos gigantes (Express parsea 2GB antes de rechazar).
- **Remediación**: `FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } })`.
- **CVSS**: 5.3
- **CWE**: CWE-770.

### API-028 [MEDIA] `WhiteLabelConfigController.deleteFont` acepta `fileName` sin sanitizar (path traversal potencial)
- **Archivo**: `src/context/white-label/infrastructure/controllers/white-label-config.controller.ts`
- **Endpoint**: `DELETE /v2/companies/:companyId/white-label/font/:fileName`
- **Descripción**: El nombre de archivo se usa para construir URL de S3 a eliminar; si en algún path se concatena con prefijo de carpeta sin escapar, `..` podría salir del prefix.
- **Impacto**: Borrado arbitrario dentro del bucket.
- **Remediación**: Validar `fileName` con regex `^[a-zA-Z0-9_\-\.]+$`; mejor aún, resolver la URL real desde la config y eliminar por ID.
- **CVSS**: 5.3
- **CWE**: CWE-22 (Path Traversal).

### API-029 [MEDIA] `ChatV2Controller.visitorInfoDto.additionalData: Record<string, unknown>` sin límites
- **Descripción**: Campo libre sin `@MaxLength` ni límite de profundidad/tamaño.
- **Impacto**: NoSQL injection en Mongo si se usa sin sanitizar; bloat del documento.
- **Remediación**: Definir esquema tipado, tamaño máx en bytes, rechazar operadores `$`.
- **CVSS**: 5.3
- **CWE**: CWE-20.

### API-030 [MEDIA] Logs con PII en `ChatV2Controller` y `AuthUserController.me`
- **Descripción**: `logger.log` imprime `user.id`, `companyId`, `email`, filtros de búsqueda.
- **Impacto**: PII acumulado en logs (GDPR).
- **Remediación**: Logger con redaction de `email`, `keycloakId`; nivel debug sólo en desarrollo.
- **CVSS**: 4.3
- **CWE**: CWE-532.

---

## 4. Hallazgos BAJOS (CVSS 0.1–3.9)

### API-031 [BAJA] `ConsentController`: IDOR menor en lectura de historial de consent por visitor
- **Descripción**: `GET /consent/:visitorId/history` valida roles pero no que el visitor pertenezca a la empresa del caller.
- **Remediación**: Añadir check de `companyId` del visitor.
- **CVSS**: 3.7
- **CWE**: CWE-639.

### API-032 [BAJA] `CompanyController` acepta `sites[]` sin límite
- **Descripción**: Array sin `@ArrayMaxSize`.
- **Remediación**: `@ArrayMaxSize(50)`.
- **CVSS**: 3.5
- **CWE**: CWE-770.

### API-033 [BAJA] `MessageV2Controller` devuelve datos mock hardcoded
- **Descripción**: Algunos endpoints devuelven payload de ejemplo en producción.
- **Impacto**: Información engañosa; potencial ruta dead code explotable.
- **Remediación**: Remover mocks o protegerlos por flag `NODE_ENV`.
- **CVSS**: 3.1
- **CWE**: CWE-489.

### API-034 [BAJA] Verbos HTTP incorrectos (`POST` para operaciones idempotentes) en varios controllers
- **Descripción**: Endpoints como `/visitors/status` usan POST donde PATCH/PUT serían idempotentes.
- **Impacto**: No explotable directamente; degrada caching y semántica REST.
- **Remediación**: Ajustar a verbos correctos.
- **CVSS**: 1.5
- **CWE**: N/A.

### API-035 [BAJA] `body.client` y `body.userAgent` en `AuthVisitorController` sin longitud máxima
- **Descripción**: Sin `@MaxLength`, posibles cadenas enormes loggeadas.
- **Remediación**: `@MaxLength(512)`.
- **CVSS**: 3.1
- **CWE**: CWE-20.

### API-036 [BAJA] Archivos de controller vacíos detectados en legacy
- **Archivos**: `src/context/conversations/chat/infrastructure/chat.controller.ts` (0 líneas), `src/context/visitors-v2/infrastructure/controllers/tenant-visitor-management.controller.ts` (vacío).
- **Impacto**: No explotable; indica deuda técnica y posible registro accidental a futuro.
- **Remediación**: Eliminar archivos vacíos o completar/retirar del módulo.
- **CVSS**: 0.5
- **CWE**: CWE-1164.

---

## 5. Plan de remediación recomendado (orden)

1. **Sprint 0 — hotfix (CRÍTICAS)**
   - API-001, API-002, API-003, API-004, API-008: añadir/restaurar guards y eliminar `OpenSearchController` de producción.
   - API-009: allowlist de `baseUrl` en LLM config.
   - API-007: proteger `/tracking-v2/*` con API Key binding.
   - API-005, API-006: guards en `CompanyController` y `ChatV2Controller`.

2. **Sprint 1 — hardening global (ALTAS)**
   - Añadir **Helmet** (API-010), **Throttler** (API-015), cerrar **Swagger** en prod (API-014), endurecer **CORS** (API-016).
   - Implementar `TenantOwnershipGuard` y aplicarlo transversalmente (API-011, API-012).
   - Fail-fast en secrets por defecto (API-019).
   - Limpiar logs PII (API-017, API-030).

3. **Sprint 2 — validación y DoS (MEDIAS/BAJAS)**
   - Límites Multer, `@Max(100)` en paginaciones, paginación obligatoria, mass assignment, sanitización de `fileName`, verbos HTTP.

## 6. Controllers revisados (27/27)

AppController, LeadsAdminController, LeadsContactController, TrackingV2Controller, ChatV2Controller, MessageV2Controller, PresenceController, AssignmentRulesController, VisitorV2Controller, TenantVisitorsController, SitesController, SiteVisitorsController, WhiteLabelConfigController, LlmSuggestionsController, LlmConfigController, CompanyController, CommercialController, BffController, AuthUserController, AuthVisitorController, JwksController, ApiKeyController, ConsentController, VisitorController (legacy), OpenSearchController, + 2 archivos vacíos.

## 7. Referencias

- OWASP API Security Top 10 (2023): API1 BOLA, API2 Broken Auth, API3 Object Property, API5 BFLA, API7 SSRF, API8 Security Misconfiguration, API9 Improper Inventory, API10 Unsafe Consumption.
- CWE Top 25.
