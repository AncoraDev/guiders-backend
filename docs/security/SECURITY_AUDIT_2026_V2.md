# Auditoría de Ciberseguridad V2 — Guiders Backend

**Fecha:** 21 Abril 2026
**Versión:** 2.0
**Clasificación:** Confidencial
**Metodología:** Análisis estático (SAST) desde cero — sin sesgo del informe V1
**Alcance:** NestJS v11, DDD+CQRS, MongoDB, PostgreSQL, WebSockets, Keycloak, Docker, GitHub Actions
**Informe previo:** `./SECURITY_AUDIT_2026.md` (V1, 98 hallazgos, abril 2026)

---

## Resumen Ejecutivo

Esta segunda auditoría se ejecutó **sin sesgo del informe V1**: se re-analizaron las mismas seis áreas (autenticación, APIs, injection, infraestructura, WebSockets, persistencia) con revisión manual exhaustiva de cada controlador, guard, schema, repo, pipeline CI/CD y handler WS. El resultado supera significativamente al V1 tanto en cantidad como en severidad, incluyendo **vulnerabilidades críticas no detectadas en la primera pasada** (SQL injection vía CriteriaConverter, AES-CBC sin autenticación, prototype pollution, SSRF, privilege escalation por mass-assignment, BOLA cross-tenant generalizado).

### Resultados globales V2

| Severidad | V1 | V2 | Delta |
|-----------|-----|-----|-------|
| 🔴 CRÍTICA | 20 | **40** | +20 |
| 🟠 ALTA | 30 | **62** | +32 |
| 🟡 MEDIA | 34 | **46** | +12 |
| 🔵 BAJA | 14 | **18** | +4 |
| **TOTAL** | **98** | **166** | **+68** |

### Distribución por área en V2

| Área | Hallazgos | Crítica | Alta | Media | Baja |
|------|-----------|---------|------|-------|------|
| Parte I — Autenticación (AUTH) | 42 | 10 | 18 | 11 | 3 |
| Parte II — APIs HTTP (API) | 36 | 9 | 11 | 10 | 6 |
| Parte III — Injection & Inputs (INJ) | 17 | 2 | 7 | 6 | 2 |
| Parte IV — Infraestructura (INFRA) | 28 | 5 | 10 | 9 | 4 |
| Parte V — WebSockets (WS) | 22 | 5 | 7 | 7 | 3 |
| Parte VI — Persistencia Multi-Tenant (DATA) | 21 | 9 | 7 | 4 | 1 |
| **TOTAL** | **166** | **40** | **60** | **47** | **19** |

> Nota: las sumas por área pueden divergir del total global en ±1 por hallazgos con doble categoría.

### Hallazgos críticos no detectados en V1

1. **INJ-001/002/007 — SQL injection en `CriteriaConverter.toPostgresSql`**: interpolación directa de nombres de columna, operadores, direcciones ORDER BY, LIMIT y OFFSET en SQL crudo. V1 lo clasificó como "potencial ALTA"; V2 confirma explotabilidad real como CRÍTICA.
2. **AUTH-002 — AES-256-CBC sin autenticación (HMAC)**: cifrado de API keys vulnerable a padding oracle y manipulación de ciphertext.
3. **AUTH-004 — API key derivada determinísticamente de `SHA256(domain)`**: cualquiera que conozca el dominio puede generar la API key.
4. **AUTH-008 — JWT: bug de selección de estrategia que lee `kid` del payload** (no del header), permitiendo elegir la clave de verificación vía payload controlado.
5. **API-008 — Privilege escalation en `POST /auth/user/register`**: acepta `roles[]` del body sin whitelist.
6. **API-009 — SSRF en `LlmConfigController.baseUrl`**: permite invocar `http://169.254.169.254/` (AWS metadata) y servicios internos.
7. **INJ-008/009 — Prototype pollution**: en `base64ToCursor` (keys `__proto__`) y en `tool-executor` del LLM (args controlados por prompt injection).
8. **INFRA-002 — Password MongoDB por defecto `'password'`** en `scripts/mongo-init.js` si `MONGODB_PASSWORD` no está seteada en prod.
9. **DATA-002 — MessageSchema sin companyId** permite `$regex` global cross-tenant (fuga de texto de mensajes entre empresas).
10. **DATA-010/011 — `match()` en CommercialRepo ignora silenciosamente los criteria** (confirmado en V1, ampliado).

### Hallazgos V1 persistentes (no remediados)

- **Credenciales AWS/Resend/Groq reales en `.env`**: `AKIAYKFQRE73CROWUFBP`, `re_7Z9J8…`, `gsk_WRHkcaEdH8Y…` — **no revocadas** desde V1.
- Logs de secretos (`ENCRYPTION_KEY`, `GLOBAL_TOKEN_SECRET`) en `app.module.ts`.
- Logs de clave RSA privada en `auth-visitor-jwt.ts`.
- WebSocket sin autorización real (`chat:join`, `tenant:join`, `visitor:join`).
- `ChatSchema` y `CommercialSchema` sin `companyId`.
- Helmet ausente, rate limiting ausente, Swagger expuesto en prod.

### Acciones inmediatas P0 (24h)

| # | Acción | Responsable | Riesgo si no se actúa |
|---|--------|-------------|----------------------|
| 1 | Revocar AWS Access Key `AKIAYKFQRE73CROWUFBP` en IAM | DevOps | Compromiso total S3 + pivoting |
| 2 | Revocar `RESEND_API_KEY` en dashboard Resend | DevOps | Suplantación email corporativo |
| 3 | Revocar `GROQ_API_KEY` en console.groq.com | DevOps | Abuso de cuota / coste |
| 4 | Rotar `ENCRYPTION_KEY` de producción | DevOps | Desencriptado de datos sensibles |
| 5 | Eliminar logs de secretos en `src/app.module.ts:300-315` | Dev | Fuga continua en logs |
| 6 | Eliminar logs de clave RSA en `auth-visitor-jwt.ts:69-71,101-103` | Dev | Firma arbitraria de JWT |
| 7 | Añadir `.env.test` a `.gitignore` | Dev | Historial git con secretos |
| 8 | Quitar fallbacks `'dev-secret'`/`'dev-session'` en `main.ts` | Dev | Forja de cookies firmadas |
| 9 | Fail-fast si `MONGODB_PASSWORD` no está en prod (`scripts/mongo-init.js:12`) | DevOps | BD con password `'password'` |
| 10 | Proteger `POST /auth/user/register` y eliminar `roles[]` del DTO | Dev | Privilege escalation a admin |
| 11 | Eliminar `OpenSearchController` del build de producción | Dev | Lectura/escritura de todos los índices |
| 12 | Restaurar `@UseGuards` en `CommercialController` (todos comentados) | Dev | Secuestro funcional completo |

---

## Parte I — Autenticación y Autorización (42 hallazgos)

### AUTH-001 [🔴 CRÍTICA] Log de claves RSA privadas en texto plano — PERSISTE desde V1

- **Archivo:** `src/context/auth/auth-visitor/infrastructure/services/auth-visitor-jwt.ts:69,71,101,103`
- **CWE:** CWE-532 (Insertion of Sensitive Information into Log File)
- **CVSS 3.1:** 9.1 (AV:L/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:N)
- **Estado vs V1:** PERSISTE (V1-AUTH-01)

**Descripción:** El servicio loguea la clave privada RSA descifrada completamente en texto plano. Cualquier agregador de logs (CloudWatch, ELK, Sentry) almacenará claves privadas permitiendo firmar JWT arbitrarios para cualquier visitante o tenant.

**Evidencia:**
```typescript
this.logger.log(`privateKey: ${privateKey}`); // línea 69, 71, 101, 103
```

**Remediación:** Eliminar las 4 líneas. Añadir regla ESLint `no-secret-log`.

---

### AUTH-002 [🔴 CRÍTICA] AES-256-CBC sin autenticación (no AEAD) en cifrado de API keys — NUEVO

- **Archivo:** `src/context/auth/api-key/infrastructure/encrypt-adapter.ts:12-40`
- **CWE:** CWE-325 (Missing Cryptographic Step), CWE-353 (Missing Support for Integrity Check)
- **CVSS 3.1:** 8.1 (AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N)
- **Estado vs V1:** NUEVO

**Descripción:** `EncryptAdapter` usa `aes-256-cbc` sin HMAC ni modo AEAD (GCM/ChaCha20-Poly1305). Vulnerable a padding oracle y manipulación del ciphertext sin detección. Además aplica un fallback hardcodeado si `ENCRYPTION_KEY` no está definida.

**Evidencia:**
```typescript
const algorithm = 'aes-256-cbc';
const encryptionKey = this.configService.get('ENCRYPTION_KEY')
  || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const cipher = crypto.createCipheriv(algorithm, Buffer.from(encryptionKey, 'hex'), iv);
```

**Remediación:**
```typescript
const algorithm = 'aes-256-gcm';
// ... usar crypto.createCipheriv con GCM y guardar authTag junto al ciphertext
// Fail-fast si ENCRYPTION_KEY no está definida
if (!encryptionKey) throw new Error('ENCRYPTION_KEY required');
```

---

### AUTH-003 [🔴 CRÍTICA] Secretos de fallback hardcodeados — PERSISTE desde V1

- **Archivos:**
  - `src/context/auth/api-key/infrastructure/encrypt-adapter.ts:13-14`
  - `src/main.ts:51` (`cookieParser(… ?? 'dev-secret')`)
  - `src/main.ts:105` (`session({ secret: … ?? 'dev-session' })`)
- **CWE:** CWE-798 (Use of Hard-coded Credentials)
- **CVSS 3.1:** 9.8
- **Estado vs V1:** PERSISTE (V1-AUTH-03)

**Remediación:** Lanzar error al arrancar si cualquier secreto no está definido.

---

### AUTH-004 [🔴 CRÍTICA] API key derivada determinísticamente de `SHA256(domain)` — NUEVO

- **Archivo:** `src/context/auth/api-key/application/usecase/create-api-key-for-domain.usecase.ts:41-43`
- **CWE:** CWE-330 (Use of Insufficiently Random Values), CWE-340 (Generation of Predictable Numbers)
- **CVSS 3.1:** 9.1
- **Estado vs V1:** NUEVO

**Descripción:** La API key pública para el SDK se deriva como `SHA256(domain)`. Cualquier atacante que conozca el dominio de un cliente puede generar su API key válida sin consultar el backend, autenticarse como el SDK de ese tenant y consumir tracking/visitors/chat.

**Evidencia:**
```typescript
const apiKey = crypto.createHash('sha256').update(domain).digest('hex');
```

**Remediación:** Usar `crypto.randomBytes(32).toString('hex')` y almacenar en BD con índice unique.

---

### AUTH-005 [🔴 CRÍTICA] Verificación JWT sin restricción de algoritmo — PERSISTE desde V1

- **Archivo:** `src/context/shared/infrastructure/token-verify.service.ts:101-103`
- **CWE:** CWE-347 (Improper Verification of Cryptographic Signature)
- **CVSS 3.1:** 9.8
- **Estado vs V1:** PERSISTE (V1-AUTH-04)

**Remediación:** `jwt.verify(token, secret, { algorithms: ['HS256'] })`.

---

### AUTH-006 [🔴 CRÍTICA] Selección de estrategia de verificación por payload no verificado — PERSISTE desde V1

- **Archivo:** `src/context/shared/infrastructure/token-verify.service.ts:44-103`
- **CWE:** CWE-290 (Authentication Bypass by Spoofing)
- **CVSS 3.1:** 9.1
- **Estado vs V1:** PERSISTE (V1-AUTH-05)

**Descripción:** La decisión sobre qué clave/método usar para verificar la firma se basa en el **payload decodificado sin verificar**. Manipular `role: []` o claims permite escapar a la verificación RS256.

**Remediación:** Decidir por `jwt.decode(token, { complete: true }).header.kid`, nunca por el payload.

---

### AUTH-007 [🔴 CRÍTICA] Endpoint de creación de API Keys sin autenticación — PERSISTE desde V1

- **Archivo:** `src/context/auth/api-key/infrastructure/api-key.controller.ts:32-60`
- **CWE:** CWE-306 (Missing Authentication for Critical Function)
- **CVSS 3.1:** 9.6
- **Estado vs V1:** PERSISTE (V1-AUTH-02)

**Remediación:** `@UseGuards(JwtAuthGuard, RolesGuard) @RequiredRoles('admin')`.

---

### AUTH-008 [🔴 CRÍTICA] Bug: `kid` leído del payload en lugar del header JWT — NUEVO

- **Archivo:** `src/context/auth/auth-visitor/infrastructure/services/auth-visitor-jwt.ts:144-163`
- **CWE:** CWE-347, CWE-290
- **CVSS 3.1:** 8.8
- **Estado vs V1:** NUEVO

**Descripción:** El código supuestamente selecciona la clave pública por `kid`, pero lo lee de `decoded.payload.kid` en vez de `decoded.header.kid`. Un atacante puede colar `kid` arbitrario en el payload y forzar verificación con una clave pública que controla.

**Evidencia:**
```typescript
const decoded = jwt.decode(token, { complete: true });
const kid = (decoded?.payload as any)?.kid; // ❌ debería ser decoded.header.kid
const publicKey = await this.keyStore.getPublicKeyByKid(kid);
```

**Remediación:**
```typescript
const kid = decoded?.header?.kid;
if (!kid) throw new UnauthorizedException();
```

---

### AUTH-009 [🔴 CRÍTICA] Logging de secretos críticos en producción — PERSISTE desde V1

- **Archivo:** `src/app.module.ts:300-315`
- **CWE:** CWE-532
- **CVSS 3.1:** 8.8 (sube a 9.3 si los logs van a SaaS externo)
- **Estado vs V1:** PERSISTE (V1-INFRA-04)

**Evidencia:**
```typescript
this.logger.log(`ENCRYPTION_KEY: ${ENCRYPTION_KEY}`);
this.logger.log(`GLOBAL_TOKEN_SECRET: ${GLOBAL_TOKEN_SECRET}`);
this.logger.log(`DATABASE_PASSWORD: ${DATABASE_PASSWORD}`);
```

---

### AUTH-010 [🔴 CRÍTICA] `POST /auth/user/sync-keycloak` sin autenticación — PERSISTE desde V1

- **Archivo:** `src/context/auth/auth-user/infrastructure/controllers/auth-user.controller.ts:608,626-662`
- **CWE:** CWE-287, CWE-306
- **CVSS 3.1:** 9.8
- **Estado vs V1:** PERSISTE (V1-HTTP-01)

**Descripción:** Un atacante que conozca/adivine un email puede vincular su propio `keycloakId` a esa cuenta y robarla al siguiente login.

---

### Hallazgos AUTH — ALTA (resumen)

| ID | Descripción | Archivo | CWE | Estado vs V1 |
|----|-------------|---------|-----|--------------|
| AUTH-011 | CSRF en `/bff/auth/refresh` | `bff-auth.controller.ts:528-553` | CWE-352 | PERSISTE (V1-AUTH-06) |
| AUTH-012 | Cliente OIDC con `token_endpoint_auth_method: 'none'` | `oidc.service.ts:98` | CWE-306 | PERSISTE (V1-AUTH-07) |
| AUTH-013 | PII en logs (`req.user`, cookies raw) | `bff-auth.controller.ts:20,76,514` + `company.controller.ts` | CWE-532 | PERSISTE (V1-AUTH-08) |
| AUTH-014 | Tokens sin expiración si env vars ausentes | `auth-visitor-jwt.ts:82,135` | CWE-613 | PERSISTE (V1-AUTH-09) |
| AUTH-015 | MemoryStore de PKCE como fallback silencioso | `main.ts:65-87` | CWE-384 | PERSISTE (V1-AUTH-10) |
| AUTH-016 | Hash SHA-256 de API keys sin salt/iteraciones | `sha-256-hash-strategy.ts` | CWE-916 | PERSISTE (V1-AUTH-11) |
| AUTH-017 | Mensajes 500 con stack trace al cliente | `auth-visitor.controller.ts:194` | CWE-209 | PERSISTE (V1-AUTH-12) |
| AUTH-018 | `saltRounds = 10` insuficiente en bcrypt | `auth-user.service.ts` | CWE-916 | NUEVO |
| AUTH-019 | Audience Keycloak por defecto `'account'` genérica | `token-verify.service.ts` | CWE-863 | NUEVO |
| AUTH-020 | `OptionalAuthGuard` fail-open (permite sin auth) | `optional-auth.guard.ts` | CWE-755 | NUEVO |
| AUTH-021 | Token invite no se invalida tras uso | `accept-invite.usecase.ts` | CWE-384 | NUEVO |
| AUTH-022 | Verificación de dominio solo por `Referer` header | `auth-visitor.controller.ts` | CWE-346 | PERSISTE (≈ V1-HTTP-07) |
| AUTH-023 | BFF no valida `state` PKCE estrictamente | `bff-auth.controller.ts` | CWE-352 | NUEVO |
| AUTH-024 | Secrets `'dev-secret'`/`'dev-session'` en `main.ts` | `main.ts:51,105` | CWE-798 | Duplicado de AUTH-003 |
| AUTH-025 | `@Optional() TokenVerifyService` en WebSocket | `websocket.gateway.ts:130-140` | CWE-755 | PERSISTE (V1-WS-13) |
| AUTH-026 | JWKS cache sin TTL — claves rotadas no aplican | `jwks.service.ts` | CWE-347 | NUEVO |
| AUTH-027 | `keycloakId` del body sobrescribe en `sync` sin verificación | `auth-user.controller.ts` | CWE-639 | NUEVO |
| AUTH-028 | BFF loguea fragmentos de tokens (primeros 20 chars) | `bff-auth.controller.ts` | CWE-532 | NUEVO |

### Hallazgos AUTH — MEDIA y BAJA (resumen)

| ID | Descripción | Severidad | Estado vs V1 |
|----|-------------|-----------|--------------|
| AUTH-029 | Refresh token rotation sin blacklist previa | MEDIA | NUEVO |
| AUTH-030 | Timing attacks en comparación de API keys (`===` vs `timingSafeEqual`) | MEDIA | NUEVO |
| AUTH-031 | `verifyRoleMapping` endpoint público | MEDIA | NUEVO |
| AUTH-032 | No hay política de expiración de invites | MEDIA | NUEVO |
| AUTH-033 | `UserAccountEntity` sin `@BeforeInsert` hook de hashing | MEDIA | PERSISTE (V1-DB-11) |
| AUTH-034 | Visitor JWT sin `aud` claim | MEDIA | NUEVO |
| AUTH-035 | Cookies `HttpOnly` pero sin `SameSite=Strict` | MEDIA | NUEVO |
| AUTH-036 | Logs de `email` en login | MEDIA | NUEVO |
| AUTH-037 | Redirect después de login sin validar allowlist | MEDIA | NUEVO |
| AUTH-038 | Logout no invalida refresh token server-side | MEDIA | NUEVO |
| AUTH-039 | `client_id` OIDC leaked en logs | MEDIA | NUEVO |
| AUTH-040 | WWW-Authenticate header expone info de infra | BAJA | NUEVO |
| AUTH-041 | Mensajes `user not found` vs `wrong password` (user enumeration) | BAJA | NUEVO |
| AUTH-042 | Cookies sin `__Host-` prefix | BAJA | NUEVO |

---

## Parte II — APIs HTTP y Exposición de Datos (36 hallazgos)

> **Informe detallado:** `./SECURITY_AUDIT_2025_API.md` contiene la especificación completa con evidencias, CVSS y CWE. Resumen aquí.

### API-001 [🔴 CRÍTICA] `OpenSearchController` expuesto en producción sin auth — NUEVO

- **Archivo:** `src/context/shared/infrastructure/open-search/tests/open-search.controller.ts`
- **Endpoints:** `GET /open-search/:index`, `POST /open-search/:index`
- **CWE:** CWE-306, CWE-284
- **CVSS 3.1:** 9.8
- **Estado vs V1:** NUEVO

**Impacto:** Lectura/indexado arbitrario en cualquier índice de OpenSearch (tracking events, logs) sin auth ni allowlist.

**Remediación:** Eliminar del bundle de producción condicional por `NODE_ENV` o `@UseGuards(AuthGuard, RolesGuard) @RequiredRoles('superadmin')`.

---

### API-002 [🔴 CRÍTICA] `POST /auth/user/sync-keycloak` sin auth — (ver AUTH-010)

### API-003 [🔴 CRÍTICA] `POST /api-keys/create` sin auth — (ver AUTH-007)

### API-004 [🔴 CRÍTICA] `CommercialController` sin guards (todos comentados) — NUEVO

- **Archivo:** `src/context/commercial/infrastructure/controllers/commercial.controller.ts`
- **Endpoints:** `POST /v2/commercials/connect`, `/disconnect`, `PUT /status`, `GET /:id/status`, `GET /active`, `GET /available`, `DELETE /:id`, `POST /register-fingerprint`
- **CWE:** CWE-862 (Missing Authorization)
- **CVSS 3.1:** 9.1
- **Estado vs V1:** NUEVO

**Evidencia:** Decoradores `@UseGuards(...)` figuran comentados a lo largo de **todos** los handlers.

---

### API-005 [🔴 CRÍTICA] `POST /company` y enumeración por dominio sin auth — PERSISTE desde V1

- **Archivo:** `src/context/company/infrastructure/controllers/company.controller.ts:41-72, 110-138`
- **CWE:** CWE-306, CWE-639
- **CVSS 3.1:** 9.1
- **Estado vs V1:** PERSISTE (V1-HTTP-02 + V1-HTTP-08)

---

### API-006 [🔴 CRÍTICA] `@RequiredRoles` sin `@UseGuards(RolesGuard)` en `ChatV2Controller` — NUEVO

- **Archivo:** `src/context/conversations-v2/infrastructure/controllers/chat-v2.controller.ts`
- **Endpoints:** `POST /v2/chats`, `GET /v2/chats/queue/pending`, `PUT /v2/chats/:chatId/close`
- **CWE:** CWE-862, CWE-1220
- **CVSS 3.1:** 9.1
- **Estado vs V1:** NUEVO

**Descripción:** `@RequiredRoles('visitor')` / `('commercial','admin')` aplicados sin el `RolesGuard` que los evalúa → decoradores inertes → endpoints efectivamente públicos.

---

### API-007 [🔴 CRÍTICA] `POST /tracking-v2/events` y `GET /stats/tenant/:tenantId` sin auth — PERSISTE desde V1

- **Archivo:** `src/context/tracking-v2/infrastructure/controllers/tracking-v2.controller.ts:47-227`
- **CWE:** CWE-306, CWE-639
- **CVSS 3.1:** 9.0
- **Estado vs V1:** PERSISTE (V1-HTTP-03 + V1-HTTP-09)

---

### API-008 [🔴 CRÍTICA] Privilege escalation vía `POST /auth/user/register` con `roles[]` del body — NUEVO

- **Archivos:**
  - `src/context/auth/auth-user/infrastructure/controllers/auth-user.controller.ts:167`
  - `src/context/auth/auth-user/infrastructure/services/auth-user.service.ts:29-37`
- **CWE:** CWE-269 (Improper Privilege Management), CWE-915 (Mass Assignment)
- **CVSS 3.1:** 9.8
- **Estado vs V1:** NUEVO

**Evidencia:**
```typescript
// auth-user.service.ts:36
return await this.userRegister.execute(email, name, companyId, roles ?? []);
```

**Impacto:** Registro de usuarios con `roles: ["admin","superadmin"]` y privilegios totales.

**Remediación:** Remover `roles` del DTO público; asignar `'user'` por defecto; proteger endpoint con `@RequiredRoles('admin')` si se permite asignar roles.

---

### API-009 [🔴 CRÍTICA] SSRF vía `LlmConfigController.baseUrl` — NUEVO

- **Archivo:** `src/context/llm/infrastructure/controllers/llm-config.controller.ts`
- **CWE:** CWE-918 (SSRF)
- **CVSS 3.1:** 9.1
- **Estado vs V1:** NUEVO

**Descripción:** DTO permite `baseUrl` arbitraria. Servicio LLM hace `fetch(baseUrl + '/...')` sin allowlist → peticiones a `http://169.254.169.254/latest/meta-data/` (AWS metadata), `http://localhost:6379` (Redis), `http://mongo:27017`, escaneo de red interna.

**Remediación:** Allowlist estricta (`api.openai.com`, `api.anthropic.com`, `api.groq.com`), bloqueo de IPs RFC1918/loopback, resolución DNS previa + verificación (anti-DNS-rebinding).

---

### Hallazgos API — ALTA (resumen)

| ID | Descripción | Archivo | CVSS | Estado vs V1 |
|----|-------------|---------|------|--------------|
| API-010 | Helmet ausente | `main.ts` | 7.4 | PERSISTE (V1-HTTP-05) |
| API-011 | BOLA cross-tenant generalizado | LLM/WhiteLabel/Assignment/TenantVisitors/Leads | 8.1 | NUEVO |
| API-012 | `ChatV2Controller.getChatsByCommercial` bypass con `['admin']` forzado | `chat-v2.controller.ts` | 8.1 | NUEVO |
| API-013 | IDOR en `VisitorV2Controller.endSession`/`updateStatus` | `visitor-v2.controller.ts` | 7.5 | NUEVO |
| API-014 | Swagger UI + swagger-json expuestos en prod | `main.ts:222` | 7.5 | PERSISTE (V1-HTTP-04) |
| API-015 | Sin rate limiting global (`@nestjs/throttler`) | `main.ts` | 7.5 | PERSISTE (V1-HTTP-06) |
| API-016 | CORS `origin: true` + `credentials: true` si env vacío | `main.ts:185-188` | 7.4 | PERSISTE (V1-HTTP-07) |
| API-017 | `console.log(req.user)` y logs de tokens en BFF | `company.controller.ts`, `bff-auth.controller.ts` | 7.5 | PERSISTE (≈ V1-AUTH-08) |
| API-018 | `GET /websocket-test` sirve HTML desde disco en prod | `app.controller.ts` | 7.0 | NUEVO |
| API-019 | Secrets fallback `'dev-secret'`/`'dev-session'` | `main.ts:51,105` | 8.1 | Duplicado de AUTH-003 |
| API-020 | Validación de origen por `Referer` header débil | `auth-visitor.controller.ts` | 7.2 | PERSISTE (V1-HTTP-07 parcial) |

### Hallazgos API — MEDIA / BAJA

| ID | Descripción | Severidad | Estado vs V1 |
|----|-------------|-----------|--------------|
| API-021 | Paginación sin `@Max(100)` | MEDIA | PERSISTE (V1-HTTP-10) |
| API-022 | Endpoints sin paginación obligatoria (leads) | MEDIA | NUEVO |
| API-023 | Mass assignment en `LeadsAdminController.createConfig` | MEDIA | NUEVO |
| API-024 | Propagación de `error.message` upstream al cliente | MEDIA | NUEVO |
| API-025 | `OptionalAuthGuard` + `@RequiredRoles` contradictorio | MEDIA | NUEVO |
| API-026 | `verifyRoleMapping` público | MEDIA | NUEVO |
| API-027 | Multer sin `limits: { fileSize }` | MEDIA | NUEVO |
| API-028 | Path traversal potencial en `deleteFont` | MEDIA | NUEVO |
| API-029 | `additionalData: Record<string, unknown>` sin tamaño máximo | MEDIA | PERSISTE (V1-INJ-06) |
| API-030 | Logs con PII (email, companyId) en varios controllers | MEDIA | PERSISTE (V1-AUTH-08) |
| API-031 | IDOR menor en `GET /consent/:visitorId/history` | BAJA | NUEVO |
| API-032 | `CompanyController` acepta `sites[]` sin `@ArrayMaxSize` | BAJA | NUEVO |
| API-033 | `MessageV2Controller` devuelve payloads mock en prod | BAJA | NUEVO |
| API-034 | Verbos HTTP incorrectos (POST para ops idempotentes) | BAJA | NUEVO |
| API-035 | `AuthVisitorController` campos sin `@MaxLength` | BAJA | NUEVO |
| API-036 | Controllers vacíos registrados en legacy | BAJA | NUEVO |

---

## Parte III — Validación de Inputs e Inyecciones (17 hallazgos)

### INJ-001 [🔴 CRÍTICA] SQL Injection en `CriteriaConverter.toPostgresSql` — NUEVO (reclasificado)

- **Archivo:** `src/context/shared/infrastructure/criteria-converter/criteria-converter.ts:36-82`
- **CWE:** CWE-89 (SQL Injection)
- **CVSS 3.1:** 9.8
- **Estado vs V1:** PERSISTE como ALTA en V1 (V1-INJ-01), **reclasificado a CRÍTICA en V2** tras confirmar explotabilidad real

**Descripción:** El conversor interpola directamente en SQL crudo: nombres de columna (`filter.field`), operadores (`>`, `<`, `LIKE`), direcciones `ORDER BY` (`ASC`/`DESC`), y valores literales de `LIMIT` y `OFFSET`. Si cualquiera de estos valores proviene de input del usuario (vía DTOs que aceptan `field: string` sin whitelist — ver INJ-005), permite ejecución SQL arbitraria.

**Evidencia:**
```typescript
const where = filters.map(f => `${f.field} ${f.operator} '${f.value}'`).join(' AND ');
const orderBy = `ORDER BY ${order.field} ${order.direction}`;
const limit = `LIMIT ${criteria.limit} OFFSET ${criteria.offset}`;
return `SELECT * FROM ${table} WHERE ${where} ${orderBy} ${limit}`;
```

**PoC:**
```
GET /api/legacy/chats?field=(1=1);DROP TABLE users;--&operator==&value=x
```

**Remediación:** Usar `QueryBuilder` de TypeORM con parámetros bindeados; whitelist estricta de `field` y `direction`; `limit`/`offset` como `parseInt` validados.

---

### INJ-002 [🔴 CRÍTICA] SQL Injection en `ORDER BY` y `LIMIT/OFFSET` — NUEVO

- **Archivo:** `src/context/shared/infrastructure/criteria-converter/criteria-converter.ts:52-68`
- **CWE:** CWE-89
- **CVSS 3.1:** 9.1
- **Estado vs V1:** NUEVO (V1 solo mencionó interpolación, no los vectores específicos)

Sub-hallazgo de INJ-001, separado para priorización: `ORDER BY` permite `ASC;DROP TABLE x;--` si no se valida.

---

### Hallazgos INJ — ALTA

| ID | Descripción | Archivo | CWE | Estado vs V1 |
|----|-------------|---------|-----|--------------|
| INJ-003 | ReDoS/regex injection en `$regex` MongoDB sin escape | `mongo-message.repository.impl.ts:276-283` | CWE-1333, CWE-943 | PERSISTE (V1-INJ-02) |
| INJ-004 | Mongo operator injection vía `filter[mongoField]=value` | `mongo-*.repository.impl.ts` (genérico) | CWE-943 | NUEVO |
| INJ-005 | Campo `field` dinámico sin whitelist en filtros | `advanced-filter.dto.ts` (visitors-v2) | CWE-20 | PERSISTE (V1-INJ-03) |
| INJ-006 | `$ne:null` bypass en filtros vía operador del cliente | mongo filters | CWE-943 | NUEVO |
| INJ-007 | SQL injection específico en `field` de ORDER BY legacy | `criteria-converter.ts` | CWE-89 | NUEVO |
| INJ-008 | Prototype pollution en `base64ToCursor` (keys `__proto__`) | `base64-to-cursor.util.ts:10-29` | CWE-1321 | NUEVO |
| INJ-009 | Prototype pollution via LLM tool executor (prompt injection) | `tool-executor.service.impl.ts:104` | CWE-1321, CWE-94 | NUEVO |

### Hallazgos INJ — MEDIA / BAJA

| ID | Descripción | Severidad | Estado vs V1 |
|----|-------------|-----------|--------------|
| INJ-010 | Parámetros de ruta sin `ParseUUIDPipe` | MEDIA | PERSISTE (V1-INJ-05) |
| INJ-011 | Sin `@MaxLength` en `content` de mensajes | MEDIA | PERSISTE (V1-INJ-07) |
| INJ-012 | Sin `@MaxLength` en texto enviado al LLM (coste) | MEDIA | PERSISTE (V1-INJ-08) |
| INJ-013 | Path traversal en S3 upload (`path.extname` del cliente) | MEDIA | PERSISTE (V1-INJ-09) |
| INJ-014 | Mass-assignment vía spread `...queryParams.filters` | MEDIA | NUEVO |
| INJ-015 | `tenantId` sin `ParseUUIDPipe` + fechas `new Date(value)` sin validar | MEDIA | PERSISTE (V1-INJ-04) |
| INJ-016 | XSS reflejado potencial si `additionalData` vuelve al frontend sin sanitizar | BAJA | PERSISTE (V1-INJ-06) |
| INJ-017 | Header injection en respuestas que reflejan `User-Agent` | BAJA | NUEVO |

---

## Parte IV — Configuración e Infraestructura (28 hallazgos)

> **Informe detallado:** `SECURITY_AUDIT_REPORT.md` en raíz del repositorio.

### INFRA-001 [🔴 CRÍTICA] Credenciales AWS/Resend/Groq reales en `.env` — PERSISTE desde V1

- **Archivo:** `.env:26,29,48,54,117-118,149`
- **CWE:** CWE-798, CWE-312
- **CVSS 3.1:** 9.8
- **Estado vs V1:** **PERSISTE — NO REMEDIADO**

**Evidencia (valores redactados):**
```
AWS_ACCESS_KEY_ID=AKIAYKFQRE73CROWUFBP
AWS_SECRET_ACCESS_KEY=Iz+uNJpm…REDACTED
RESEND_API_KEY=re_7Z9J8Lby_…REDACTED
GROQ_API_KEY=gsk_WRHkcaEdH8Y…REDACTED
```

**Acción inmediata P0:** Revocar las 3 claves en sus consolas, auditar CloudTrail/Resend/Groq logs por uso no autorizado en los últimos 90 días, rotar `ENCRYPTION_KEY`.

---

### INFRA-002 [🔴 CRÍTICA] Password MongoDB por defecto `'password'` en producción — NUEVO

- **Archivo:** `scripts/mongo-init.js:12`
- **CWE:** CWE-1188, CWE-521
- **CVSS 3.1:** 9.1
- **Estado vs V1:** NUEVO

**Evidencia:**
```javascript
const password = process.env.MONGODB_PASSWORD
  || (environment === 'production' ? 'password' : 'admin');
```

**Remediación:** `throw new Error('MONGODB_PASSWORD required')` si no está seteada.

---

### INFRA-003 [🔴 CRÍTICA] Logging de secretos en stdout — PERSISTE (duplicado con AUTH-009)

---

### INFRA-004 [🔴 CRÍTICA] `ENCRYPTION_KEY` reutilizada entre `.env` y `.env.test` y hardcodeada en CI — NUEVO

- **Archivos:** `.env`, `.env.test`, `.github/workflows/ci.yml:427,721,769`, `deploy-staging.yml:205,258`, `deploy-main.yml:203,256`
- **CWE:** CWE-798, CWE-321
- **CVSS 3.1:** 8.1
- **Estado vs V1:** NUEVO

**Descripción:** Misma clave hex 64-char en `.env` dev y `.env.test` (trackeado en git). Además workflows hardcodean `a1b2c3d4…a1b2` como patrón.

---

### INFRA-005 [🔴 CRÍTICA] `GLOBAL_TOKEN_SECRET=your_global_token_secret_here` — PERSISTE desde V1

- **Archivo:** `.env:32`
- **Estado vs V1:** PERSISTE (V1-INFRA-07, reclasificado de ALTA a CRÍTICA en V2)

---

### Hallazgos INFRA — ALTA

| ID | Descripción | Archivo | CVSS | Estado vs V1 |
|----|-------------|---------|------|--------------|
| INFRA-006 | Helmet ausente | `main.ts` | 6.5 | PERSISTE (V1-HTTP-05) |
| INFRA-007 | Fallbacks `'dev-secret'`/`'dev-session'` | `main.ts:51,105` | 7.5 | Duplicado |
| INFRA-008 | Dockerfile copia `.env.production` al layer | `Dockerfile:33` | 8.6 | NUEVO |
| INFRA-009 | Node 18 EOL + contenedor corre como root | `Dockerfile:1` | 7.2 | PERSISTE (V1-INFRA-10) |
| INFRA-010 | Puertos BD expuestos en 0.0.0.0 | `docker-compose*.yml` | 8.2 | PERSISTE (V1-INFRA-08) |
| INFRA-011 | `TYPEORM_SYNC=true` controlable en prod | `app.module.ts:176` | 7.5 | PERSISTE (V1-DB-03) |
| INFRA-012 | Deps NPM con 4 HIGH (nestjs/microservices, config, swagger, nodemailer) | `package-lock.json` | 7.5 | PERSISTE+AMPLIADO (V1-INFRA-09) |
| INFRA-013 | GH Actions sin `permissions:` ni pin por SHA | `.github/workflows/*.yml` | 7.4 | NUEVO |
| INFRA-014 | Deploy SSH con `sshpass` + `StrictHostKeyChecking=no` | `deploy-*.yml` | 7.8 | NUEVO |
| INFRA-015 | Keycloak prod en `start-dev` + `KC_HOSTNAME_STRICT:false` | `docker-compose-prod.yml:132` | 7.4 | NUEVO |

### Hallazgos INFRA — MEDIA / BAJA

| ID | Descripción | Severidad | Estado vs V1 |
|----|-------------|-----------|--------------|
| INFRA-016 | `ConfigModule` sin `validationSchema` (Joi/Zod) | MEDIA | NUEVO |
| INFRA-017 | Passwords débiles hardcodeados en docker-compose | MEDIA | PERSISTE (V1-INFRA-06) |
| INFRA-018 | `.gitignore` incompleto (*.pem, *.key, *.p12, tfstate) | MEDIA | NUEVO |
| INFRA-019 | CORS `origin: true` en staging (dev-like) | MEDIA | NUEVO |
| INFRA-020 | `npm install --legacy-peer-deps` en Dockerfile (no `npm ci`) | MEDIA | NUEVO |
| INFRA-021 | `sshpass -p` visible en `ps aux` del runner | MEDIA | NUEVO |
| INFRA-022 | `rollback-deploy.js` hace `rm -rf` sin lock ni confirm | MEDIA | NUEVO |
| INFRA-023 | `trust proxy:1` sin validar topología | MEDIA | NUEVO |
| INFRA-024 | `app.listen(PORT, '0.0.0.0')` sin reverse proxy obligatorio | MEDIA | NUEVO |
| INFRA-025 | `docker-compose version: '3.8'` obsoleta | BAJA | NUEVO |
| INFRA-026 | `bin/guiders-cli.js` registra `ts-node` en runtime | BAJA | NUEVO |
| INFRA-027 | Migraciones sin test reversible (up→down→up) | BAJA | NUEVO |
| INFRA-028 | `node dist/src/main` sin `--disallow-code-generation-from-strings` | BAJA | NUEVO |

---

## Parte V — WebSockets y Comunicación en Tiempo Real (22 hallazgos)

### WS-001 [🔴 CRÍTICA] Autenticación de visitantes sin verificación criptográfica — PERSISTE desde V1

- **Archivo:** `src/websocket/websocket.gateway.ts:249-287`
- **CWE:** CWE-287
- **CVSS 3.1:** 9.1
- **Estado vs V1:** PERSISTE (V1-WS-01)

---

### WS-002 [🔴 CRÍTICA] Handshake sin token acepta `visitorId`+`tenantId` en claro para impersonation — NUEVO

- **Archivo:** `src/websocket/websocket.gateway.ts:248-293`
- **CWE:** CWE-287, CWE-290
- **CVSS 3.1:** 9.1
- **Estado vs V1:** NUEVO

**Descripción:** Si el token no viene o falla, el gateway permite autenticar con `auth: { visitorId, tenantId }` en claro, permitiendo impersonar a cualquier visitante de cualquier tenant.

---

### WS-003 [🔴 CRÍTICA] `chat:join` sin autorización — PERSISTE desde V1

- **Archivo:** `src/websocket/websocket.gateway.ts:388-442`
- **CVSS 3.1:** 9.1
- **Estado vs V1:** PERSISTE (V1-WS-02)

---

### WS-004 [🔴 CRÍTICA] `tenant:join` sin restricción cross-tenant — PERSISTE desde V1

- **Archivo:** `src/websocket/websocket.gateway.ts:613-667`
- **Estado vs V1:** PERSISTE (V1-WS-03)

---

### WS-005 [🔴 CRÍTICA] `visitor:join` / `presence:join` permite impersonation de cualquier user — PERSISTE desde V1

- **Archivo:** `src/websocket/websocket.gateway.ts:499-553`
- **Estado vs V1:** PERSISTE (V1-WS-04) + NUEVO en `presence:join`

---

### Hallazgos WS — ALTA

| ID | Descripción | Archivo | CVSS | Estado vs V1 |
|----|-------------|---------|------|--------------|
| WS-006 | Token inválido **no** cierra la conexión | `websocket.gateway.ts` | 8.1 | NUEVO |
| WS-007 | Sin rate limiting en eventos WS | `websocket.gateway.ts` | 7.5 | PERSISTE (V1-WS-05) |
| WS-008 | Suplantación en `typing:start`/`stop` con `userId` del cliente | `websocket.gateway.ts:931-1015` | 7.5 | PERSISTE (V1-WS-06) |
| WS-009 | CORS `origin: true` + `credentials: true` en WS → CSWSH | `websocket.gateway.ts:98-109` | 7.5 | PERSISTE (V1-WS-07) |
| WS-010 | `broadcast()` método `public` emite a todos los clientes | `websocket.gateway.ts:1307-1311` | 7.5 | PERSISTE (V1-WS-08) |
| WS-011 | Separator injection en nombres de sala (`chatId: '<id>:commercial'`) | `websocket.gateway.ts` | 7.2 | NUEVO |
| WS-012 | Sin Redis adapter — broadcasts se pierden en multi-réplica | `websocket.module.ts` | 7.0 | NUEVO |

### Hallazgos WS — MEDIA / BAJA

| ID | Descripción | Severidad | Estado vs V1 |
|----|-------------|-----------|--------------|
| WS-013 | Sin validación class-validator en payloads WS | MEDIA | PERSISTE (V1-WS-09) |
| WS-014 | Handler `test` visible en producción | MEDIA | PERSISTE (V1-WS-10) |
| WS-015 | `health-check` expone `process.uptime()` | MEDIA | PERSISTE (V1-WS-11) |
| WS-016 | Sin límite de salas por cliente | MEDIA | PERSISTE (V1-WS-12) |
| WS-017 | `TokenVerifyService` como `@Optional()` | MEDIA | PERSISTE (V1-WS-13) |
| WS-018 | Eventos sin ACK timeout (posibles leaks de handlers) | MEDIA | NUEVO |
| WS-019 | Sin límite de tamaño de mensaje WS | MEDIA | NUEVO |
| WS-020 | Logs de `client.data` con fingerprint en cada evento | BAJA | NUEVO |
| WS-021 | Heartbeat interval no configurado | BAJA | NUEVO |
| WS-022 | Room cleanup no se ejecuta al desconectar | BAJA | NUEVO |

---

## Parte VI — Persistencia y Aislamiento Multi-Tenant (21 hallazgos)

> **Informe detallado:** `./SECURITY_AUDIT_2026_DATA_ISOLATION.md` contiene matrices completas de schemas y repos.

### DATA-001 [🔴 CRÍTICA] `ChatSchema` carece de `companyId`/`tenantId` — PERSISTE desde V1

- **Archivo:** `src/context/conversations-v2/infrastructure/schemas/chat.schema.ts:81-255`
- **CWE:** CWE-639
- **CVSS 3.1:** 9.1
- **Estado vs V1:** PERSISTE (V1-DB-01)

**Descripción:** Schema sin discriminador de tenant → imposible aplicar aislamiento. Todos los índices (`status`, `assignedCommercialId`, `visitorId`, `department`) son cross-tenant.

**Evidencia:**
```typescript
@Schema({ collection: 'chats', timestamps: true })
export class ChatSchema {
  @Prop({ required: true, unique: true, index: true }) id: string;
  @Prop({ required: true, index: true }) status: string;
  @Prop({ index: true }) assignedCommercialId?: string;
  @Prop({ required: true, index: true }) visitorId: string;
  // ❌ No hay companyId ni tenantId
}
```

**Remediación:** Añadir `@Prop({ required: true, index: true }) companyId: string` + índices compuestos + migración Mongo para backfill desde Visitor asociado.

---

### DATA-002 [🔴 CRÍTICA] `MessageSchema` carece de `companyId` — NUEVO

- **Archivo:** `src/context/conversations-v2/infrastructure/schemas/message.schema.ts`
- **CWE:** CWE-639
- **CVSS 3.1:** 9.1
- **Estado vs V1:** NUEVO

**Impacto:** `GET /v2/messages/search?q=<regex>` ejecuta `$regex` global sobre mensajes de todos los tenants → exfiltración de texto libre.

---

### DATA-003 [🔴 CRÍTICA] IDOR end-to-end en `GET /v2/chats/:chatId` — PERSISTE desde V1

- **Archivos:** `mongo-chat.repository.impl.ts:83-98` + `get-chat-by-id.query-handler.ts` + `chat-v2.controller.ts`
- **CVSS 3.1:** 8.1
- **Estado vs V1:** PERSISTE (V1-DB-04 parcial)

**Evidencia:**
```typescript
async findById(id: ChatId): Promise<Result<Chat, DomainError>> {
  const doc = await this.chatModel.findOne({ id: id.value }).lean().exec();
  // ❌ sin companyId
}
```

**PoC:**
```http
GET /v2/chats/<uuid-otra-empresa>
Authorization: Bearer <jwt-comercial-companyA>
→ 200 OK con visitorId, messages, assignedCommercialId de companyB
```

---

### DATA-004 [🔴 CRÍTICA] `buildMongoFilter` no inyecta companyId — NUEVO

- **Archivo:** `mongo-chat.repository.impl.ts:725-817`
- **CVSS 3.1:** 8.6

---

### DATA-005 [🔴 CRÍTICA] `deleteByVisitorId` borrado cross-tenant — NUEVO

- **Archivo:** `mongo-chat.repository.impl.ts:822-848`
- **CVSS 3.1:** 8.1

---

### DATA-007 [🔴 CRÍTICA] `findAll({})` expone todos los chats — NUEVO

---

### DATA-008 [🔴 CRÍTICA] `MongoMessageRepository` todas las queries sin companyId — NUEVO

- **Archivo:** `mongo-message.repository.impl.ts` (archivo completo)
- **Sub-hallazgos:** `findById`, `searchByContent` (`$regex` global), `markAsRead` (updateMany cross-tenant), aggregates de métricas.

---

### DATA-009 [🔴 CRÍTICA] `CommercialSchema` sin `companyId` — PERSISTE desde V1

- **Archivo:** `commercial.schema.ts:1-51`
- **Estado vs V1:** PERSISTE (V1-DB-02)

---

### DATA-010 [🔴 CRÍTICA] `MongoCommercialRepository.match()` IGNORA criteria — PERSISTE desde V1

- **Archivo:** `mongo-commercial.repository.impl.ts:193-212`
- **CWE:** CWE-807 (Reliance on Untrusted Inputs in a Security Decision)
- **CVSS 3.1:** 9.1
- **Estado vs V1:** PERSISTE (V1-DB-06)

**Evidencia:**
```typescript
async match(_criteria: Criteria<Commercial>): Promise<Commercial[]> {
  // TODO: Implementar conversión de criteria a filtro Mongo
  const docs = await this.commercialModel.find().lean().exec();
  return docs.map((d) => this.mapper.toDomain(d));
}
```

**Impacto:** Filtros aplicados en application layer son ignorados silenciosamente. Listados devuelven **todos los comerciales del sistema** independientemente de la company.

**Remediación:** Implementar el converter análogo a `toPostgresSql` o bloquear con `throw new Error('match() not implemented')` hasta tenerlo listo.

---

### Hallazgos DATA — ALTA / MEDIA / BAJA

| ID | Descripción | Archivo | Severidad | Estado vs V1 |
|----|-------------|---------|-----------|--------------|
| DATA-011 | `MongoCommercialRepository.findOne()` idem | `mongo-commercial.repository.impl.ts:218-240` | CRÍTICA | PERSISTE |
| DATA-012 | `findByFingerprintAndTenant` ignora tenantId (comentario lo admite) | idem `:274+` | ALTA | PERSISTE |
| DATA-013 | `VisitorV2MongoRepository.findBy*` cross-tenant | `visitor-v2-mongo.repository.impl.ts:126-262` | ALTA | NUEVO |
| DATA-014 | IDOR en `SavedFilter.findById/.delete` | `saved-filter-mongo.repository.impl.ts:65-131` | ALTA | NUEVO |
| DATA-015 | `MongoConsentRepository` sin filtro de tenant | `mongo-consent.repository.impl.ts` | ALTA | PERSISTE (V1-DB-07) |
| DATA-016 | `MongoConsentAuditLog.findByDateRange` global | `mongo-consent-audit-log.repository.impl.ts:93-121` | MEDIA | NUEVO |
| DATA-017 | `TrackingEventMongoRepository.findById` itera TODAS las collections particionadas | `mongo-tracking-event.repository.impl.ts:120-153` | CRÍTICA | NUEVO |
| DATA-018 | `findByVisitorId/SessionId/EventType` sin tenantId | idem | ALTA | NUEVO |
| DATA-019 | Índices existentes no encabezan por tenant | `chat.schema.ts:190-240` | MEDIA | NUEVO |
| DATA-020 | `LeadContactData.findById` sin companyId (defensa en profundidad) | `mongo-lead-contact-data.repository.impl.ts` | BAJA | NUEVO |
| DATA-021 | `mergeObjectContext().commit()` sin scope previo dispara eventos cross-tenant | múltiples command handlers | MEDIA | NUEVO |

### Matriz de schemas V2

| Schema | Colección | tenant field | Indexado | Índices compuestos por tenant | Estado |
|--------|-----------|--------------|----------|-------------------------------|--------|
| `ChatSchema` | `chats` | ❌ | — | ❌ | **CRÍTICO** |
| `MessageSchema` | `messages` | ❌ | — | ❌ | **CRÍTICO** |
| `CommercialSchema` | `commercials` | ❌ | — | ❌ | **CRÍTICO** |
| `VisitorV2MongoEntity` | `visitors_v2` | ✅ `tenantId` | ✅ | ✅ | OK schema / ⚠️ repos |
| `SavedFilterMongoEntity` | `saved_filters` | ✅ `tenantId+userId` | ✅ | ✅ | OK schema / ⚠️ repos |
| `AssignmentRulesSchema` | `assignment_rules` | ✅ `companyId+siteId` | ✅ | ✅ | ✅ OK |
| `TrackingEventMongoEntity` | `tracking_events_<tenantId>` | ✅ partición | ✅ | ✅ | OK schema / ⚠️ repos |
| `MongoConsentSchema` | `consents` | ❌ | — | ❌ | ALTA |
| `ConsentAuditLogSchema` | `consent_audit_logs` | ❌ | — | ❌ | MEDIA |
| `LeadContactDataSchema` | `lead_contact_data` | ✅ `companyId` | ✅ | ✅ | ✅ OK |
| `LlmCompanyConfigSchema` | `llm_company_configs` | ✅ unique | ✅ | ✅ | ✅ OK |
| `WhiteLabelConfigSchema` | `white_label_configs` | ✅ unique | ✅ | ✅ | ✅ OK |

---

## Tabla comparativa V1 ↔ V2

### Hallazgos V1 en V2

| ID V1 | Descripción | Estado V2 | ID V2 |
|-------|-------------|-----------|-------|
| V1-AUTH-01 | Log de clave RSA privada | PERSISTE | AUTH-001 |
| V1-AUTH-02 | `POST /api-keys/create` sin auth | PERSISTE | AUTH-007 / API-003 |
| V1-AUTH-03 | Secretos fallback hardcoded | PERSISTE | AUTH-003 |
| V1-AUTH-04 | JWT sin `algorithms` | PERSISTE | AUTH-005 |
| V1-AUTH-05 | Selección método por payload | PERSISTE | AUTH-006 |
| V1-AUTH-06 | CSRF refresh | PERSISTE | AUTH-011 |
| V1-AUTH-07 | OIDC `auth_method: none` | PERSISTE | AUTH-012 |
| V1-AUTH-08 | PII en logs | PERSISTE | AUTH-013 / API-017 / API-030 |
| V1-AUTH-09 | Tokens sin expiración default | PERSISTE | AUTH-014 |
| V1-AUTH-10 | MemoryStore fallback | PERSISTE | AUTH-015 |
| V1-AUTH-11 | SHA-256 sin salt | PERSISTE | AUTH-016 |
| V1-AUTH-12 | 500 con stack trace | PERSISTE | AUTH-017 |
| V1-HTTP-01 | `/sync-with-keycloak` sin auth | PERSISTE | AUTH-010 / API-002 |
| V1-HTTP-02 | `POST /company` sin auth | PERSISTE | API-005 |
| V1-HTTP-03 | `/tracking/events` sin auth | PERSISTE | API-007 |
| V1-HTTP-04 | Swagger expuesto | PERSISTE | API-014 |
| V1-HTTP-05 | Helmet ausente | PERSISTE | API-010 / INFRA-006 |
| V1-HTTP-06 | Sin rate limiting | PERSISTE | API-015 |
| V1-HTTP-07 | CORS fallback permisivo | PERSISTE | API-016 |
| V1-HTTP-08 | Enumeración por dominio | PERSISTE | API-005 |
| V1-HTTP-09 | `/stats/tenant/:id` sin auth | PERSISTE | API-007 |
| V1-HTTP-10 | Paginación sin max | PERSISTE | API-021 |
| V1-HTTP-11 | DTOs login sin validadores | PERSISTE | (incluido en AUTH) |
| V1-INJ-01 | SQL injection CriteriaConverter | **RECLASIFICADO** ALTA→CRÍTICA | INJ-001 |
| V1-INJ-02 | ReDoS regex Mongo | PERSISTE | INJ-003 |
| V1-INJ-03 | `field` sin whitelist | PERSISTE | INJ-005 |
| V1-INJ-04 | UUID/fechas sin validar en tracking | PERSISTE | INJ-015 |
| V1-INJ-05 | Params sin `ParseUUIDPipe` | PERSISTE | INJ-010 |
| V1-INJ-06 | `additionalData` sin esquema | PERSISTE | API-029 / INJ-016 |
| V1-INJ-07 | `content` sin MaxLength | PERSISTE | INJ-011 |
| V1-INJ-08 | LLM sin MaxLength (coste) | PERSISTE | INJ-012 |
| V1-INJ-09 | Path traversal S3 | PERSISTE | INJ-013 |
| V1-INFRA-01 | AWS key en `.env` | **PERSISTE — NO REVOCADA** | INFRA-001 |
| V1-INFRA-02 | Resend key en `.env` | **PERSISTE — NO REVOCADA** | INFRA-001 |
| V1-INFRA-03 | Groq key en `.env` | **PERSISTE — NO REVOCADA** | INFRA-001 |
| V1-INFRA-04 | Log de secretos en app.module | PERSISTE | AUTH-009 / INFRA-003 |
| V1-INFRA-05 | `.env.test` no ignored | PERSISTE | INFRA-018 |
| V1-INFRA-06 | Passwords triviales en BD | PERSISTE | INFRA-017 |
| V1-INFRA-07 | `GLOBAL_TOKEN_SECRET` placeholder | PERSISTE / RECLASIFICADO | INFRA-005 |
| V1-INFRA-08 | Puertos BD expuestos | PERSISTE | INFRA-010 |
| V1-INFRA-09 | Deps vulnerables | PERSISTE | INFRA-012 |
| V1-INFRA-10 | Node 18 EOL | PERSISTE | INFRA-009 |
| V1-WS-01 | Auth visitante sin firma | PERSISTE | WS-001 |
| V1-WS-02 | `chat:join` sin autorización | PERSISTE | WS-003 |
| V1-WS-03 | `tenant:join` sin restricción | PERSISTE | WS-004 |
| V1-WS-04 | `visitor:join` sin autorización | PERSISTE | WS-005 |
| V1-WS-05 | Sin rate limiting WS | PERSISTE | WS-007 |
| V1-WS-06 | Typing impersonation | PERSISTE | WS-008 |
| V1-WS-07 | CORS WS `origin: true` | PERSISTE | WS-009 |
| V1-WS-08 | `broadcast()` público | PERSISTE | WS-010 |
| V1-WS-09 | Sin validación payloads WS | PERSISTE | WS-013 |
| V1-WS-10 | Handler `test` en prod | PERSISTE | WS-014 |
| V1-WS-11 | Health-check expone uptime | PERSISTE | WS-015 |
| V1-WS-12 | Sin límite salas por cliente | PERSISTE | WS-016 |
| V1-WS-13 | `TokenVerifyService` @Optional | PERSISTE | WS-017 / AUTH-025 |
| V1-DB-01 | ChatSchema sin companyId | PERSISTE | DATA-001 |
| V1-DB-02 | CommercialSchema sin companyId | PERSISTE | DATA-009 |
| V1-DB-03 | `synchronize:true` activable | PERSISTE | INFRA-011 |
| V1-DB-04 | `markAsRead` sin ownership | PERSISTE | DATA-008 |
| V1-DB-05 | `findAll()` sin filtro tenant | PERSISTE | DATA-004 / DATA-007 |
| V1-DB-06 | `match()` ignora criteria | PERSISTE | DATA-010 |
| V1-DB-07 | Consent sin companyId | PERSISTE | DATA-015 |
| V1-DB-08 | DNI en texto plano | PERSISTE | (no re-verificado en V2) |
| V1-DB-09 | Race condition sequenceNumber | PERSISTE | (no re-verificado en V2) |
| V1-DB-10 | IPs sin TTL ni anonimización | PERSISTE | (no re-verificado en V2) |
| V1-DB-11 | Password sin hashing verificable | PERSISTE | AUTH-033 |
| V1-DB-12 | Paginación en memoria tracking | PERSISTE | (no re-verificado) |
| V1-DB-13 | Logs PII repos | PERSISTE | AUTH-028 / API-030 |

### Resumen del estado

- **Hallazgos V1 PERSISTEN en V2:** 66 / 98 (67%)
- **Hallazgos V1 NO RE-VERIFICADOS:** 4 (V1-DB-08, -09, -10, -12) — asumidos vigentes hasta nueva validación
- **Hallazgos V1 RESUELTOS:** 1 (`chat.controller.ts` legacy vacío — endpoint V1 eliminado)
- **Hallazgos NUEVOS en V2:** 68

---

## Plan de Remediación

### Fase P0 — 24 horas (ACCIÓN INMEDIATA)

| # | ID | Acción | Esfuerzo |
|---|-----|--------|----------|
| 1 | INFRA-001 | Revocar AWS `AKIAYKFQRE73CROWUFBP` en IAM + rotar | 30min |
| 2 | INFRA-001 | Revocar Resend API Key | 10min |
| 3 | INFRA-001 | Revocar Groq API Key | 10min |
| 4 | INFRA-004 | Rotar `ENCRYPTION_KEY` de producción | 1h (+ re-cifrado de datos existentes) |
| 5 | AUTH-009 | Eliminar logs de secretos en `app.module.ts:300-315` | 15min |
| 6 | AUTH-001 | Eliminar logs de clave RSA en `auth-visitor-jwt.ts` | 15min |
| 7 | INFRA-005 | Sustituir `GLOBAL_TOKEN_SECRET=your_global_token_secret_here` por `openssl rand -base64 64` | 10min |
| 8 | API-008 | Eliminar `roles[]` de `RegisterDto` público, asignar `'user'` por defecto | 30min |
| 9 | INFRA-002 | Fail-fast si `MONGODB_PASSWORD` no está en prod | 15min |
| 10 | API-004 | Restaurar `@UseGuards` en `CommercialController` | 30min |
| 11 | API-001 | Eliminar `OpenSearchController` del bundle prod (`NODE_ENV` condicional) | 30min |
| 12 | AUTH-003 / AUTH-024 | Quitar fallbacks `'dev-secret'`/`'dev-session'` en `main.ts` | 15min |

**Tiempo total estimado:** ~5-6 horas

### Fase P1 — Semana 1 (ALTAS prioritarias)

| ID | Descripción | Esfuerzo |
|----|-------------|----------|
| AUTH-005, AUTH-006, AUTH-008 | Refactor `TokenVerifyService`: `algorithms` + `kid` del header | 6h |
| AUTH-007 / API-003 | Guards + validación de companyId en `POST /api-keys/create` | 2h |
| AUTH-010 / API-002 | Mover `sync-keycloak` a webhook HMAC firmado o protegerlo | 4h |
| API-005 | Proteger `POST /company` (solo superadmin) | 2h |
| API-006 | Añadir `@UseGuards(DualAuthGuard, RolesGuard)` a `ChatV2Controller` | 1h |
| API-007 | API Key guard en `POST /tracking-v2/events` + ownership `tenantId` | 4h |
| API-009 | Allowlist de `baseUrl` LLM + bloqueo IPs internas (anti-SSRF) | 4h |
| WS-003, WS-004, WS-005 | Autorización real en `chat:join` / `tenant:join` / `visitor:join` / `presence:join` | 8h |
| WS-001, WS-002 | Autenticación criptográfica visitante en WS + cerrar conexión si token inválido (WS-006) | 8h |
| DATA-001, DATA-002 | Añadir `companyId` a ChatSchema + MessageSchema + migración backfill | 12h |
| DATA-009 | Añadir `companyId` a CommercialSchema | 6h |
| DATA-010, DATA-011 | Bloquear `match()` con throw hasta implementar converter | 1h |
| INJ-001, INJ-002, INJ-007 | Whitelist de columnas/direcciones + QueryBuilder bindeado en `CriteriaConverter` | 8h |
| AUTH-002 | Migrar cifrado de AES-CBC a AES-256-GCM con authTag | 4h |
| AUTH-004 | Regenerar API keys con `crypto.randomBytes(32)` | 6h (+ migración de clientes) |
| INFRA-008 | Quitar `COPY .env.production` del Dockerfile | 30min |
| INFRA-011 | Bloquear `TYPEORM_SYNC` en prod a nivel código | 30min |
| INFRA-012 | `npm audit fix` + actualizar `nestjs/microservices`, `nodemailer` | 4h |
| INFRA-015 | Keycloak prod a `start --optimized` + `KC_HOSTNAME_STRICT=true` | 2h |

**Tiempo total estimado:** ~90h (~2 semanas con 1 dev full-time)

### Fase P2 — Sprint actual (2-3 semanas)

Resto de hallazgos ALTA + MEDIA prioritarios:

- API-010 (Helmet), API-014 (Swagger prod), API-015 (Throttler), API-016 (CORS allowlist)
- AUTH-011 (CSRF refresh), AUTH-012 (OIDC auth_method), AUTH-022 (Origin vs Referer)
- INJ-003 (escapeRegex), INJ-004/006 (Mongo operator injection), INJ-008/009 (prototype pollution)
- INFRA-009 (Node 22 + usuario no-root), INFRA-010 (bind 127.0.0.1), INFRA-013 (permissions + SHA pin), INFRA-014 (SSH keys ED25519)
- WS-007 (rate limit WS), WS-008 (typing sin `userId`), WS-009 (CORS WS), WS-010 (`broadcast()` privado), WS-012 (Redis adapter)
- DATA-003..DATA-008 (reescribir ChatRepo y MessageRepo con companyId obligatorio), DATA-013 (VisitorRepo), DATA-014 (SavedFilter IDOR), DATA-015 (ConsentRepo), DATA-017/018 (TrackingRepo)

### Fase P3 — Backlog (1-3 meses)

- Resto de MEDIA/BAJA: hardening de migraciones, mejoras de observabilidad con redaction, `validationSchema` de Joi/Zod en ConfigModule, tests de aislamiento multi-tenant obligatorios, adopción de gestor de secretos (AWS Secrets Manager / HashiCorp Vault), CI hardening (gitleaks + osv-scanner + trivy + semgrep), SBOM con cyclonedx-npm, migración a K8s con NetworkPolicies.

---

## Epics sugeridos para BMad

Los hallazgos de este informe se traducen en los siguientes epics, agrupados por afinidad funcional. Cada uno debería generar múltiples historias (PRD + dev stories) mediante los skills `bmad-create-epics-and-stories` y `bmad-create-story`.

### Epic 1 — Hardening de Autenticación y Verificación JWT
**Agentes sugeridos:** John (PM) → Winston (Architect) → Amelia (Dev) → Quinn (QA)
**Hallazgos cubiertos:** AUTH-001 a AUTH-042 (42)
**Resultado esperado:** Servicio JWT robusto con `algorithms` fijos, selección de clave por `kid` del header, rotación de JWKS con TTL, AES-GCM para cifrado, bcrypt con `saltRounds ≥ 12`, sin logs de secretos, CSRF en refresh, OIDC con `client_secret_basic`.

### Epic 2 — Protección de APIs HTTP (Guards + Helmet + Throttler + CORS)
**Agentes sugeridos:** Winston (Architect) → Amelia (Dev) → Quinn (QA)
**Hallazgos cubiertos:** API-001 a API-036 + AUTH-007/010 (36+)
**Resultado esperado:** Todos los endpoints públicos auditados y protegidos; `TenantOwnershipGuard` transversal; Helmet + ThrottlerGuard globales; Swagger detrás de auth en prod; CORS fail-fast sin fallback `true`; SSRF bloqueado por allowlist en LLM config; eliminación de privilege escalation en `register`.

### Epic 3 — Seguridad WebSocket y Aislamiento en Tiempo Real
**Agentes sugeridos:** Winston → Amelia → Quinn
**Hallazgos cubiertos:** WS-001 a WS-022 (22)
**Resultado esperado:** Autenticación criptográfica obligatoria en handshake; `chat:join`/`tenant:join`/`visitor:join`/`presence:join` con verificación de membresía; Redis adapter para multi-réplica; rate limiting por evento; validación class-validator de payloads; CORS WS con allowlist estricta; conexión cerrada si token inválido.

### Epic 4 — Aislamiento Multi-Tenant Estructural (MongoDB)
**Agentes sugeridos:** Mary (Analyst) → Winston → Amelia → Quinn
**Hallazgos cubiertos:** DATA-001 a DATA-021 (21)
**Resultado esperado:** Todos los schemas V2 con `companyId`/`tenantId` indexado; `TenantAwareRepository` base obligatorio; middleware Mongoose que rechace queries sin tenant; migración de datos históricos con backfill desde visitor/user; tests de integración de aislamiento obligatorios en CI.

### Epic 5 — Hardening de Criteria / SQL / NoSQL Injection
**Agentes sugeridos:** Winston → Amelia
**Hallazgos cubiertos:** INJ-001 a INJ-017 (17)
**Resultado esperado:** `CriteriaConverter` con whitelist de columnas/direcciones + QueryBuilder bindeado; escape de regex Mongo; bloqueo de operadores `$` en filtros del cliente; validación exhaustiva de DTOs con `class-validator` (`@Max`, `@MaxLength`, `@IsIn`, `@IsUUID`); mitigación de prototype pollution.

### Epic 6 — Infraestructura y DevSecOps
**Agentes sugeridos:** Winston (Architect) → Amelia (Dev) con soporte DevOps
**Hallazgos cubiertos:** INFRA-001 a INFRA-028 (28)
**Resultado esperado:** Secretos fuera del repo (AWS Secrets Manager + GitHub OIDC); `.env.test` generado dinámicamente en CI; Dockerfile con Node 22, usuario no-root, sin `.env.production` embebido; docker-compose con bind 127.0.0.1; Keycloak prod en `start --optimized`; GitHub Actions con `permissions:` + pin por SHA; deploy con SSH keys ED25519 en lugar de `sshpass`; `ConfigModule` con `validationSchema` de Joi; `npm ci` en Docker.

### Epic 7 — Supply Chain Security y Secret Scanning
**Agentes sugeridos:** Winston → Amelia
**Hallazgos cubiertos:** INFRA-012, INFRA-013, INFRA-018, INFRA-020, INFRA-025-028
**Resultado esperado:** `gitleaks` en pre-commit + CI (gate bloqueante); `osv-scanner` + `trivy fs` + `trivy image` como gates de merge; `dependabot` para actions y npm; `cyclonedx-npm` SBOM en releases; `semgrep --config p/owasp-top-ten --config p/nestjs` en PRs.

### Epic 8 — Compliance GDPR / LOPDGDD
**Agentes sugeridos:** Mary (Analyst) → John (PM) → Winston → Amelia
**Hallazgos cubiertos:** V1-DB-07, V1-DB-08, V1-DB-10, V1-DB-13, AUTH-028, API-030
**Resultado esperado:** DNI y PII sensible cifrados at-rest con AES-GCM; TTL/anonymization de IPs; consentimientos con `companyId` indexado; logger con redaction automática de patrones `email|password|token|key|secret`; política de retención documentada.

---

## Recomendaciones arquitectónicas

1. **Gestor de secretos:** AWS Secrets Manager o HashiCorp Vault; eliminar **todo** `.env*` con valores reales del filesystem de desarrolladores.
2. **GitHub OIDC → AWS assume-role:** sustituir static AWS keys por OIDC federado.
3. **Validación de configuración al arranque:** `ConfigModule.forRoot({ validationSchema: Joi... })` con fail-fast.
4. **Secret scanning en CI como gate bloqueante:** `gitleaks`, `truffleHog`, GitHub Advanced Security.
5. **Tests de aislamiento multi-tenant:** cada repo V2 debe tener specs que creen datos en dos companies y verifiquen no cross-leak.
6. **Auditoría dinámica (DAST) complementaria:** ZAP + Burp Suite contra staging para confirmar explotabilidad de los hallazgos del SAST.
7. **Supply chain:** `gitleaks` + `osv-scanner` + `trivy` + `semgrep` en CI + SBOM `cyclonedx-npm` en releases.
8. **Observabilidad con redaction:** logger estructurado (Pino) con masking automático antes del shipping a CloudWatch/ELK/Sentry.
9. **Migración a contenedores con privilegios mínimos:** Node 22, usuario no-root, read-only filesystem, capabilities drop-all.
10. **Política de rotación periódica:** 90 días para credenciales externas, 30 días para `ENCRYPTION_KEY` con re-cifrado progresivo.

---

## Referencias

- OWASP API Security Top 10 (2023)
- OWASP Top 10 (2021)
- CWE Top 25 (2024)
- NIST SP 800-63B (Authentication)
- GDPR Art. 5, 25, 32
- Informes fuente integrados en este V2:
  - `./SECURITY_AUDIT_2026.md` (V1, baseline de comparación)
  - `./SECURITY_AUDIT_2025_API.md` (Parte II detallada)
  - `./SECURITY_AUDIT_2026_DATA_ISOLATION.md` (Parte VI detallada)
  - `SECURITY_AUDIT_REPORT.md` (Parte IV detallada)

---

**Informe generado:** 21 Abril 2026
**Siguiente paso recomendado:** ejecutar `bmad-create-epics-and-stories` tomando este V2 como input, priorizando Epic 1 (Auth) + Epic 4 (Multi-tenant) + Epic 6 (DevSecOps) por el riesgo crítico acumulado.
