# Auditoría de Ciberseguridad — Guiders Backend

**Fecha:** Abril 2026  
**Versión:** 1.0  
**Clasificación:** Confidencial  
**Metodología:** Análisis estático de código (SAST)  
**Alcance:** NestJS v11, DDD+CQRS, MongoDB, PostgreSQL, WebSockets

---

## Resumen Ejecutivo

Se realizó una auditoría completa de ciberseguridad del backend de Guiders, cubriendo seis áreas críticas:
autenticación/autorización, APIs HTTP, validación de inputs, configuración e infraestructura, WebSockets y persistencia.

### Resultados globales

| Severidad | Cantidad |
|-----------|----------|
| 🔴 CRÍTICA | 20 |
| 🟠 ALTA | 30 |
| 🟡 MEDIA | 34 |
| 🔵 BAJA | 14 |
| **TOTAL** | **98** |

### Áreas más críticas

1. **Credenciales reales expuestas** en `.env` y en código fuente (AWS, Resend, Groq)
2. **Aislamiento multi-tenant roto** en WebSockets: cualquier cliente puede acceder a datos de cualquier empresa
3. **Endpoints críticos sin autenticación**: creación de empresas, sync con Keycloak, estadísticas de tracking
4. **Logs que exponen secretos** en producción: `ENCRYPTION_KEY`, `GLOBAL_TOKEN_SECRET`, claves RSA privadas

> **Acción inmediata requerida:** Revocar las credenciales AWS, Resend y Groq listadas en este documento
> antes de continuar con cualquier deploy.

---

## Parte I — Autenticación y Autorización

### Hallazgos Críticos

#### AUTH-01 — Log de Claves Privadas RSA en Texto Plano

**Severidad:** 🔴 CRÍTICA  
**Archivo:** `src/context/auth/auth-visitor/infrastructure/services/auth-visitor-jwt.ts:69,71,101,103`

El servicio loguea la clave privada RSA descifrada completamente en texto plano. Cualquier sistema de
agregación de logs almacenará las claves RSA privadas, permitiendo a un atacante con acceso a los logs
firmar tokens arbitrarios para cualquier visitante o tenant.

```typescript
this.logger.log(`privateKey: ${privateKey}`); // ELIMINAR
```

**Solución:** Eliminar completamente estas líneas de log.

---

#### AUTH-02 — Endpoint de Creación de API Keys sin Autenticación

**Severidad:** 🔴 CRÍTICA  
**Archivo:** `src/context/auth/api-key/infrastructure/api-key.controller.ts:32-60`

`POST /api/api-keys/create` no tiene ningún guard. Cualquier usuario anónimo puede crear API Keys para
cualquier empresa del sistema.

**Solución:**
```typescript
@Post('create')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequiredRoles('admin', 'company_admin')
async createApiKey(...) {}
```

---

#### AUTH-03 — Secretos de Fallback Hardcodeados en Código Fuente

**Severidad:** 🔴 CRÍTICA  
**Archivos:**
- `src/context/auth/api-key/infrastructure/encrypt-adapter.ts:13-14`
- `src/main.ts:51,105`

`ENCRYPTION_KEY`, `COOKIE_SECRET` y `SESSION_SECRET` tienen valores hardcodeados en el código que se
activan si la variable de entorno no está definida. La `ENCRYPTION_KEY` es pública en el repositorio.

**Solución:** Lanzar error en arranque si los secretos no están configurados:
```typescript
const ENCRYPTION_KEY = this.configService.get<string>('ENCRYPTION_KEY');
if (!ENCRYPTION_KEY) throw new Error('ENCRYPTION_KEY es requerida');
```

---

#### AUTH-04 — Verificación JWT sin Validación de Algoritmo

**Severidad:** 🔴 CRÍTICA  
**Archivo:** `src/context/shared/infrastructure/token-verify.service.ts:101-103`

Los tokens se verifican sin especificar `algorithms: ['HS256']`, lo que en versiones antiguas de
`jsonwebtoken` permite el ataque de "algorithm confusion" con `alg: none`.

**Solución:**
```typescript
return this.jwtservice.verify(token, {
  secret: process.env.GLOBAL_TOKEN_SECRET,
  algorithms: ['HS256'],
});
```

---

#### AUTH-05 — Selección de Método de Verificación Basada en Payload No Verificado

**Severidad:** 🔴 CRÍTICA  
**Archivo:** `src/context/shared/infrastructure/token-verify.service.ts:44-103`

La decisión sobre qué método de verificación usar se basa en el payload **decodificado antes de verificar
la firma**. Un atacante puede crear un JWT con `role: []` para escapar de la verificación RS256.

**Solución:** Determinar el método de verificación por el `kid` del header JWT, no por los claims del payload.

---

### Hallazgos Altos

#### AUTH-06 — CSRF en Endpoint de Refresh Token

**Severidad:** 🟠 ALTA  
**Archivo:** `src/context/auth/bff/infrastructure/controllers/bff-auth.controller.ts:528-553`

El endpoint `POST /api/bff/auth/refresh` no tiene validación CSRF. El propio código tiene un comentario
`"(recomendado) valida CSRF header aquí"` que no fue implementado.

---

#### AUTH-07 — Cliente OIDC Público en BFF

**Severidad:** 🟠 ALTA  
**Archivo:** `src/context/auth/bff/infrastructure/services/oidc.service.ts:98`

`token_endpoint_auth_method: 'none'` significa que el BFF es un cliente público sin autenticación de
cliente ante Keycloak. Un BFF debería usar `client_secret_basic` o `private_key_jwt`.

---

#### AUTH-08 — PII y Datos Sensibles en Logs de Producción

**Severidad:** 🟠 ALTA  
**Archivo:** `src/context/auth/bff/infrastructure/controllers/bff-auth.controller.ts:20,76,514`

`console.log` con configuración de cookies y `logger.log` con email, roles y companyId en cada
petición a `/me`. Violación potencial del GDPR al retener datos personales en logs.

---

#### AUTH-09 — Expiración de Tokens sin Valor por Defecto Seguro

**Severidad:** 🟡 MEDIA  
**Archivo:** `src/context/auth/auth-visitor/infrastructure/services/auth-visitor-jwt.ts:82,135`

Si `ACCESS_TOKEN_EXPIRATION` o `REFRESH_TOKEN_EXPIRATION` no están definidas, `expiresIn` es
`undefined` y `@nestjs/jwt` crea tokens **sin expiración**.

**Solución:**
```typescript
expiresIn: this.configService.get('ACCESS_TOKEN_EXPIRATION') ?? '15m',
expiresIn: this.configService.get('REFRESH_TOKEN_EXPIRATION') ?? '7d',
```

---

#### AUTH-10 — MemoryStore como Fallback Silencioso en Producción

**Severidad:** 🟡 MEDIA  
**Archivo:** `src/main.ts:65-87`

Si Redis falla o no está configurado, la aplicación silenciosamente usa `MemoryStore`. Con múltiples
instancias, las sesiones PKCE fallan entre instancias. En producción debería lanzar un error.

---

#### AUTH-11 — Hashing de API Keys con SHA-256 sin Salt

**Severidad:** 🟡 MEDIA  
**Archivo:** `src/context/shared/infrastructure/sha-256-hash-strategy.ts`

Las API Keys se hashean con SHA-256 sin salt, sin iteraciones. Es vulnerable a rainbow tables para
API Keys cortas.

---

#### AUTH-12 — Fuga de Información en Mensajes de Error HTTP 500

**Severidad:** 🔵 BAJA  
**Archivo:** `src/context/auth/auth-visitor/infrastructure/auth-visitor.controller.ts:194`

```typescript
throw new HttpException(`Internal server error: ${error}`, 500);
```

Expone stack traces y detalles internos al cliente.

---

## Parte II — APIs HTTP y Exposición de Datos

### Hallazgos Críticos

#### HTTP-01 — Endpoint de Sync con Keycloak sin Autenticación

**Severidad:** 🔴 CRÍTICA  
**Archivo:** `src/context/auth/auth-user/infrastructure/controllers/auth-user.controller.ts:626-662`

`POST /api/user/auth/sync-with-keycloak` sin ningún guard. Cualquier cliente anónimo puede crear
usuarios con rol arbitrario y asociarlos a cualquier `companyId`.

---

#### HTTP-02 — Creación de Empresas sin Autenticación

**Severidad:** 🔴 CRÍTICA  
**Archivo:** `src/context/company/infrastructure/controllers/company.controller.ts:41-72`

`POST /api/company` es completamente público. Un atacante puede crear empresas ilimitadas y crear
cuentas de administrador sin restricción.

---

#### HTTP-03 — Ingestión de Eventos de Tracking sin Autenticación

**Severidad:** 🔴 CRÍTICA  
**Archivo:** `src/context/tracking-v2/infrastructure/controllers/tracking-v2.controller.ts:47-155`

`POST /api/tracking-v2/events` permite ingestar hasta 500 eventos por batch sin ningún guard. Un
atacante puede inyectar datos falsos en analytics de cualquier tenant o causar DoS por flooding.

---

### Hallazgos Altos

#### HTTP-04 — Swagger Expuesto sin Protección en Producción

**Severidad:** 🟠 ALTA  
**Archivo:** `src/main.ts:222`

`SwaggerModule.setup('docs', app, document)` se ejecuta incondicionalmente en todos los entornos,
exponiendo la documentación completa de todos los endpoints públicamente.

**Solución:**
```typescript
if (process.env.NODE_ENV !== 'production') {
  SwaggerModule.setup('docs', app, document);
}
```

---

#### HTTP-05 — Sin Headers de Seguridad HTTP (Helmet Ausente)

**Severidad:** 🟠 ALTA  
**Archivo:** `src/main.ts` (ausencia total)

No hay ninguna referencia a `helmet`. No se configuran `X-Content-Type-Options`, `X-Frame-Options`,
`Strict-Transport-Security`, `Content-Security-Policy`.

**Solución:**
```typescript
import helmet from 'helmet';
app.use(helmet());
```

---

#### HTTP-06 — Sin Rate Limiting en Endpoints Críticos

**Severidad:** 🟠 ALTA  
**Archivo:** `src/main.ts` y controladores de auth

No existe `ThrottlerGuard` configurado. Los endpoints de login, refresh, y registro de visitantes
son vulnerables a ataques de fuerza bruta.

**Solución:** Instalar `@nestjs/throttler` y aplicar límites por endpoint.

---

#### HTTP-07 — CORS Acepta Peticiones sin Header Origin

**Severidad:** 🟠 ALTA  
**Archivo:** `src/main.ts:185-188`

La lógica CORS permite acceso desde herramientas CLI (curl, scripts de servidor) que no envían
header `Origin`, eludiendo completamente la validación CORS.

---

#### HTTP-08 — Endpoint de Enumeración de Empresas por Dominio

**Severidad:** 🟠 ALTA  
**Archivo:** `src/context/company/infrastructure/controllers/company.controller.ts:110-138`

`GET /api/company/by-domain/:domain` es público y permite enumerar empresas del sistema,
obteniendo IDs internos para usar en ataques posteriores.

---

#### HTTP-09 — Estadísticas de Tracking sin Autenticación

**Severidad:** 🟠 ALTA  
**Archivo:** `src/context/tracking-v2/infrastructure/controllers/tracking-v2.controller.ts:161-227`

`GET /api/tracking-v2/stats/tenant/:tenantId` expone estadísticas completas de cualquier tenant sin autenticación.

---

### Hallazgos Medios

#### HTTP-10 — Paginación sin Límite Máximo

**Severidad:** 🟡 MEDIA  
**Archivos:** DTOs de paginación en múltiples contextos

Los campos `limit` tienen `@Min(1)` pero no `@Max()`. Un cliente puede solicitar `limit=999999`.

---

#### HTTP-11 — DTOs de Login sin Validadores

**Severidad:** 🟡 MEDIA  
**Archivo:** `src/context/auth/auth-user/infrastructure/dtos/auth-user.dto.ts:4-16`

`LoginRequestDto` no tiene `@IsEmail`, `@IsString`, `@MinLength`. Payloads malformados llegan a la
capa de dominio.

---

## Parte III — Validación de Inputs e Inyecciones

### Hallazgos Altos

#### INJ-01 — SQL Injection Potencial en CriteriaConverter

**Severidad:** 🟠 ALTA  
**Archivo:** `src/context/shared/infrastructure/criteria-converter/criteria-converter.ts:41-44`

El conversor interpola directamente `columnName`, `alias`, `limit` y `offset` en queries SQL sin
sanitización. Si estos valores provienen de input del usuario, permite SQL injection.

**Solución:** Aplicar whitelist estricta de nombres de campo permitidos antes de interpolar en SQL.

---

#### INJ-02 — ReDoS e Inyección `$regex` en MongoDB sin Escape

**Severidad:** 🟠 ALTA  
**Archivo:** `src/context/conversations-v2/infrastructure/persistence/impl/mongo-message.repository.impl.ts:276-283`

El parámetro `keyword` se pasa directamente a `$regex` sin escapar metacaracteres. Patrones como
`(a+)+` pueden causar DoS del servidor MongoDB.

**Solución:**
```typescript
private escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

---

#### INJ-03 — Campo `field` en Filtros Dinámicos sin Whitelist

**Severidad:** 🟠 ALTA  
**Archivo:** `src/context/visitors-v2/application/dtos/visitor-filters.dto.ts:~72`

`AdvancedFilterDto` acepta `field: string` con solo `@IsString()`. Un atacante puede enviar
`field: "$where"` o `field: "__proto__"` para manipular queries MongoDB.

**Solución:**
```typescript
@IsIn(['email', 'name', 'status', 'createdAt', 'currentUrl', 'country'])
field: string;
```

---

#### INJ-04 — Endpoint de Tracking sin Validación de UUID

**Severidad:** 🟠 ALTA  
**Archivo:** `src/context/tracking-v2/infrastructure/controllers/tracking-v2.controller.ts:~197-210`

`tenantId` se recibe como `string` sin `ParseUUIDPipe` y las fechas se convierten con `new Date(value)`
sin validación previa, produciendo `Invalid Date` que se propaga a MongoDB.

---

### Hallazgos Medios

#### INJ-05 — Parámetros de Ruta sin Validación UUID

**Severidad:** 🟡 MEDIA  
**Archivos:** Múltiples controladores en `conversations-v2` y `visitors-v2`

IDs recibidos como `@Param('x') x: string` sin `ParseUUIDPipe`, permitiendo valores malformados que
llegan hasta la persistencia.

---

#### INJ-06 — `additionalData` y `customFields` como `Record<string, any>`

**Severidad:** 🟡 MEDIA  
**Archivo:** `src/context/conversations-v2/application/dtos/create-chat-request.dto.ts:~51`

Acepta cualquier estructura de objeto incluyendo keys con nombres peligrosos. Si estos campos se
reflejan sin sanitización en el frontend, existe riesgo de XSS almacenado.

---

#### INJ-07 — Sin Límite de Longitud en Contenido de Mensajes

**Severidad:** 🟡 MEDIA  
**Archivo:** `src/context/conversations-v2/application/dtos/message-request.dto.ts:~29`

`content` solo tiene `@IsString()` sin `@MaxLength()`. Un atacante puede enviar mensajes de cientos
de megabytes saturando MongoDB.

---

#### INJ-08 — Sin Límite en Texto Enviado al LLM

**Severidad:** 🟡 MEDIA  
**Archivo:** `src/context/llm/application/dtos/improve-text.dto.ts:~18`

Sin `@MaxLength()`, un atacante puede generar costes económicos masivos enviando textos enormes al LLM.

---

#### INJ-09 — Path Traversal en Generación de Nombres de Archivo S3

**Severidad:** 🟡 MEDIA  
**Archivo:** `src/context/shared/infrastructure/services/s3-upload.service.ts:~39`

`path.extname(file.originalname)` usa el nombre original del cliente sin sanitizar. Puede resultar
en subida de archivos con extensiones peligrosas (`.php`, `.html`).

**Nota:** `white-label-file-upload.service.ts:146` ya implementa el patrón correcto — replicarlo.

---

## Parte IV — Configuración e Infraestructura

### Hallazgos Críticos

#### INFRA-01 — Credenciales AWS Reales Expuestas en `.env`

**Severidad:** 🔴 CRÍTICA  
**Archivo:** `.env:117-118`

```
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

**Acción inmediata:** Revocar en la consola de AWS IAM antes de cualquier otra acción.

---

#### INFRA-02 — API Key de Resend (Email) Real Expuesta

**Severidad:** 🔴 CRÍTICA  
**Archivo:** `.env:37`

**Acción inmediata:** Revocar en el panel de Resend.

---

#### INFRA-03 — API Key de Groq (LLM) Real Expuesta

**Severidad:** 🔴 CRÍTICA  
**Archivo:** `.env:149`

**Acción inmediata:** Revocar en `console.groq.com`.

---

#### INFRA-04 — Logging de Secretos Críticos en Producción

**Severidad:** 🔴 CRÍTICA  
**Archivo:** `src/app.module.ts:300-315`

```typescript
this.logger.log(`ENCRYPTION_KEY: ${ENCRYPTION_KEY}`);
this.logger.log(`GLOBAL_TOKEN_SECRET: ${GLOBAL_TOKEN_SECRET}`);
this.logger.log(`DATABASE_PASSWORD: ${DATABASE_PASSWORD}`);
```

Estos logs se ejecutan en **todos los entornos**. Cualquier sistema de logs tendrá estos secretos.

**Solución:** Eliminar completamente este bloque.

---

#### INFRA-05 — `.env.test` No Está en `.gitignore`

**Severidad:** 🔴 CRÍTICA  
**Archivo:** `.gitignore` (ausencia)

`.env.test` contiene `ENCRYPTION_KEY`, `KEYCLOAK_ADMIN_PASSWORD` y `KEYCLOAK_DB_PASSWORD` y no está
protegido por `.gitignore`.

**Solución:**
```gitignore
.env.test
.env.test.local
```

---

### Hallazgos Altos

#### INFRA-06 — Contraseñas Triviales en Todas las Bases de Datos

**Severidad:** 🟠 ALTA  
**Archivo:** `.env` (múltiples líneas)

| Servicio | Contraseña |
|----------|-----------|
| PostgreSQL | `postgres` |
| MongoDB root | `password` |
| MongoDB test | `admin123` |
| Keycloak admin | `admin123` |

---

#### INFRA-07 — `GLOBAL_TOKEN_SECRET` es un Placeholder

**Severidad:** 🟠 ALTA  
**Archivo:** `.env:32`

```
GLOBAL_TOKEN_SECRET=your_global_token_secret_here
```

Si llega a producción, cualquier atacante puede forjar tokens JWT válidos con rol ADMIN.

---

#### INFRA-08 — Puertos de BD Expuestos al Host en Docker

**Severidad:** 🟠 ALTA  
**Archivos:** `docker-compose.yml`, `docker-compose-prod.yml`

PostgreSQL, MongoDB y Redis tienen sus puertos mapeados al host. Si el servidor tiene IP pública,
las bases de datos son accesibles desde internet. Redis no tiene contraseña.

---

#### INFRA-09 — Vulnerabilidades HIGH en Dependencias

**Severidad:** 🟠 ALTA

| Paquete | Vulnerabilidad |
|---------|----------------|
| `@nestjs/microservices <=11.1.18` | DoS via recursive `handleData` |
| `@nestjs/core <=11.1.17` | Injection en componentes downstream |
| `axios 1.0.0–1.14.0` | SSRF via header injection |

**Solución:** `npm audit fix` + actualizar dependencias afectadas.

---

#### INFRA-10 — Imagen Node.js 18 EOL en Dockerfile

**Severidad:** 🟠 ALTA  
**Archivo:** `Dockerfile:4`

Node.js 18 alcanzó End of Life el 30 de abril de 2025 y ya no recibe parches de seguridad.
Además hay inconsistencia: CI/CD usa Node 20, producción usa Node 18.

**Solución:** `FROM node:22-slim`

---

## Parte V — WebSockets y Comunicación en Tiempo Real

### Hallazgos Críticos

#### WS-01 — Autenticación de Visitantes sin Verificación Criptográfica

**Severidad:** 🔴 CRÍTICA  
**Archivo:** `src/websocket/websocket.gateway.ts:249-287`

Un cliente puede conectar indicando cualquier `visitorId` sin ninguna verificación de que le pertenece.
Permite suplantar a cualquier visitante y recibir sus eventos en tiempo real.

---

#### WS-02 — `chat:join` sin Autorización — Cualquier Cliente Puede Espiar Cualquier Chat

**Severidad:** 🔴 CRÍTICA  
**Archivo:** `src/websocket/websocket.gateway.ts:388-442`

`chat:join` no verifica que el usuario sea participante del chat. Cualquier cliente puede unirse a
cualquier sala de chat y recibir todos los mensajes, incluyendo contenido sensible de otras empresas.

---

#### WS-03 — `tenant:join` sin Restricción — Acceso Cross-Tenant

**Severidad:** 🔴 CRÍTICA  
**Archivo:** `src/websocket/websocket.gateway.ts:613-667`

Cualquier cliente puede unirse a la sala de cualquier empresa, recibiendo en tiempo real la actividad
de todos sus visitantes y agentes. Violación crítica del aislamiento multi-tenant.

---

#### WS-04 — `visitor:join` sin Autorización

**Severidad:** 🔴 CRÍTICA  
**Archivo:** `src/websocket/websocket.gateway.ts:499-553`

Cualquier cliente puede unirse a la sala de presencia de cualquier visitante y monitorear su actividad.

---

### Hallazgos Altos

#### WS-05 — Sin Rate Limiting en WebSocket

**Severidad:** 🟠 ALTA  
**Archivo:** `src/websocket/websocket.gateway.ts` (todo el archivo)

No existe ningún mecanismo de limitación de tasa. Un atacante puede flood el servidor con eventos
`user:activity` que ejecutan consultas a Redis y MongoDB por cada mensaje.

---

#### WS-06 — Suplantación de Identidad en Typing Indicators

**Severidad:** 🟠 ALTA  
**Archivo:** `src/websocket/websocket.gateway.ts:931-1015`

Los eventos `typing:start`/`typing:stop` aceptan `userId` del cliente sin verificar que corresponde
al usuario autenticado. Permite hacer creer que otro usuario está escribiendo.

---

#### WS-07 — CORS de WebSocket con `origin: true`

**Severidad:** 🟠 ALTA  
**Archivo:** `src/websocket/websocket.gateway.ts:98-109`

El WebSocket acepta conexiones de cualquier origen, independientemente de la política CORS del
servidor HTTP. Con `credentials: true`, permite ataques Cross-Site WebSocket Hijacking (CSWSH).

---

#### WS-08 — `broadcast()` Público sin Restricciones

**Severidad:** 🟠 ALTA  
**Archivo:** `src/websocket/websocket.gateway.ts:1307-1311`

El método `broadcast()` es `public` y emite a **todos los clientes conectados** de todas las empresas.
Una llamada accidental puede filtrar datos sensibles masivamente.

---

### Hallazgos Medios

#### WS-09 — Sin Validación con class-validator en Payloads WebSocket

**Severidad:** 🟡 MEDIA  
Los eventos WS reciben datos con validación manual mínima (`if (!chatId)`), sin DTOs ni sanitización.
IDs de sala malformados podrían contener inyecciones.

---

#### WS-10 — Endpoint `test` de Pruebas Activo en Producción

**Severidad:** 🟡 MEDIA  
**Archivo:** `src/websocket/websocket.gateway.ts:893-914`

Handler `test` visible en producción, permite reconocimiento y eco de payloads sin sanitizar.

---

#### WS-11 — Health-Check Expone Uptime del Proceso

**Severidad:** 🟡 MEDIA  
**Archivo:** `src/websocket/websocket.gateway.ts:916-926`

Cualquier cliente anónimo puede sondear `health-check` y obtener `process.uptime()`, facilitando
reconocimiento de ventanas de reinicio.

---

#### WS-12 — Sin Límite de Salas por Cliente

**Severidad:** 🟡 MEDIA  
**Archivo:** `src/websocket/websocket.gateway.ts:410-413`

Un cliente puede unirse a un número ilimitado de salas, consumiendo memoria del servidor.

---

#### WS-13 — `TokenVerifyService` Inyectado como `@Optional()`

**Severidad:** 🟡 MEDIA  
**Archivo:** `src/websocket/websocket.gateway.ts:130-140`

Si `TokenVerifyService` no está disponible, el servidor opera sin autenticación silenciosamente.

---

## Parte VI — Persistencia y Bases de Datos

### Hallazgos Críticos

#### DB-01 — Sin Aislamiento Multi-Tenant en Chats (`companyId` Ausente)

**Severidad:** 🔴 CRÍTICA  
**Archivo:** `src/context/conversations-v2/infrastructure/persistence/impl/mongo-chat.repository.impl.ts:83-360`

El `ChatSchema` no tiene campo `companyId`. Todos los métodos (`findAll`, `getPendingQueue`,
`getAvailableChats`, etc.) operan sobre la colección global sin filtro de empresa. Un comercial de
empresa A puede ver conversaciones de empresa B.

**Solución:** Añadir `companyId` al schema e incluirlo como filtro obligatorio en todos los métodos.

---

#### DB-02 — `CommercialSchema` sin Campo `companyId`

**Severidad:** 🔴 CRÍTICA  
**Archivo:** `src/context/commercial/infrastructure/persistence/impl/mongo-commercial.repository.impl.ts`

El schema de comerciales no tiene `companyId`. `findAll()` y `match()` retornan comerciales de
**todas las empresas**. `findByFingerprintAndTenant` ignora el `tenantId` con prefijo `_`.

---

#### DB-03 — `synchronize: true` Activable en Producción

**Severidad:** 🔴 CRÍTICA  
**Archivo:** `src/app.module.ts:129-133`

`TYPEORM_SYNC=true` en producción puede eliminar columnas y truncar datos sin control.

**Solución:**
```typescript
if (nodeEnv === 'production' && TYPEORM_SYNC) {
  throw new Error('TYPEORM_SYNC no puede ser true en producción');
}
```

---

#### DB-04 — `markAsRead` sin Validación de Ownership

**Severidad:** 🔴 CRÍTICA  
**Archivo:** `src/context/conversations-v2/infrastructure/persistence/impl/mongo-message.repository.impl.ts:447-472`

`markAsRead` no verifica que los IDs de mensajes pertenecen al chat/empresa del solicitante.
Un atacante puede alterar el estado de mensajes de otras conversaciones.

---

### Hallazgos Altos

#### DB-05 — `findAll()` sin Filtro de Tenant en Múltiples Repositorios

**Severidad:** 🟠 ALTA  
Múltiples repositorios exponen todos los registros sin filtro de tenant: chats, visitantes,
comerciales, invitaciones, API keys.

---

#### DB-06 — `match()` en CommercialRepository Ignora el Criteria

**Severidad:** 🟠 ALTA  
**Archivo:** `src/context/commercial/infrastructure/persistence/impl/mongo-commercial.repository.impl.ts:~200`

```typescript
async match(__criteria: Criteria<Commercial>) {
  return await this.commercialModel.find(); // Ignora el criteria completamente
}
```

Cualquier query con filtros de seguridad creerá estar filtrando cuando en realidad no lo hace.

---

#### DB-07 — Consentimientos GDPR sin `companyId`

**Severidad:** 🟠 ALTA  
**Archivo:** `src/context/consent/infrastructure/persistence/entity/visitor-consent-mongo.entity.ts`

Los consentimientos GDPR no tienen `companyId`. `findExpiredConsents()` opera sobre consentimientos
de todos los tenants. Violación potencial del GDPR Art. 5 y Art. 32.

---

#### DB-08 — DNI Almacenado en Texto Plano

**Severidad:** 🟠 ALTA  
**Archivo:** `src/context/leads/infrastructure/persistence/schemas/lead-contact-data.schema.ts:35-38`

El campo `dni` (Documento Nacional de Identidad) se almacena sin cifrado. Bajo GDPR y LOPDGDD,
los datos identificativos directos requieren cifrado en reposo.

---

#### DB-09 — Race Condition en Numeración de Mensajes

**Severidad:** 🟠 ALTA  
**Archivo:** `src/context/conversations-v2/infrastructure/persistence/impl/mongo-message.repository.impl.ts:68-77`

`sequenceNumber` se calcula con `find` + `create` sin transacción atómica. Dos mensajes concurrentes
pueden asignarse el mismo número de secuencia.

---

#### DB-10 — IPs de Visitantes sin TTL ni Anonimización

**Severidad:** 🟠 ALTA  
**Archivo:** `src/context/visitors-v2/infrastructure/persistence/entity/visitor-v2-mongo.entity.ts:52-69`

Las IPs son datos personales bajo GDPR (Recital 30). No existe TTL ni proceso de anonimización.
Incumplimiento del principio de limitación de almacenamiento (Art. 5.1.e GDPR).

---

### Hallazgos Medios

#### DB-11 — Password en `UserAccountEntity` sin Cifrado Verificable

**Severidad:** 🟡 MEDIA  
No hay `@BeforeInsert`/`@BeforeUpdate` hooks visibles que garanticen el hashing de contraseñas.

---

#### DB-12 — Paginación en Memoria en TrackingEvent Repository

**Severidad:** 🟡 MEDIA  
Queries sobre múltiples colecciones sin `limit` se consolidan en memoria, pudiendo cargar millones
de documentos y causar OOM.

---

#### DB-13 — Logs con PII en Repositorios de Producción

**Severidad:** 🟡 MEDIA  
Fingerprints, session IDs y filtros MongoDB completos se loguean en nivel `log` (siempre activo)
en varios repositorios.

---

---

## Plan de Remediación Global

### Fase 0 — Acción Inmediata (HOY, antes de cualquier commit o deploy)

| # | Acción | Responsable |
|---|--------|-------------|
| 1 | Revocar `AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX` en consola AWS IAM | DevOps |
| 2 | Revocar `RESEND_API_KEY` en panel de Resend | DevOps |
| 3 | Revocar `GROQ_API_KEY` en `console.groq.com` | DevOps |
| 4 | Eliminar bloque de logging de secretos en `app.module.ts:300-315` | Dev |
| 5 | Eliminar logs de clave RSA privada en `auth-visitor-jwt.ts:69-71,101-103` | Dev |
| 6 | Añadir `.env.test` a `.gitignore` | Dev |

---

### Fase 1 — Sprint Inmediato (< 1 semana)

| ID | Hallazgo | Esfuerzo |
|----|----------|---------|
| AUTH-02 | Añadir guards a `POST /api-keys/create` | 1h |
| HTTP-01 | Añadir guards a `POST /user/auth/sync-with-keycloak` | 1h |
| HTTP-02 | Proteger creación de empresas | 2h |
| WS-02 | Autorización en `chat:join` | 4h |
| WS-03 | Restricción `tenant:join` al propio tenant | 2h |
| WS-04 | Restricción `visitor:join` | 2h |
| INJ-02 | `escapeRegex()` en `mongo-message.repository.impl.ts` | 1h |
| DB-03 | Bloquear `TYPEORM_SYNC=true` en producción | 1h |

---

### Fase 2 — Corto Plazo (2 semanas)

| ID | Hallazgo | Esfuerzo |
|----|----------|---------|
| AUTH-03 | Eliminar fallbacks hardcodeados de secretos | 2h |
| AUTH-04 | Añadir `algorithms: ['HS256']` en verificaciones JWT | 1h |
| AUTH-05 | Refactorizar selección de método de verificación por `kid` | 4h |
| HTTP-05 | Instalar y configurar Helmet | 1h |
| HTTP-06 | Implementar ThrottlerModule con rate limiting | 3h |
| HTTP-04 | Proteger Swagger en producción | 30min |
| WS-07 | Corregir CORS de WebSocket con lista blanca | 1h |
| WS-01 | Autenticación real de visitantes en WS | 8h |
| DB-01 | Añadir `companyId` al `ChatSchema` y métodos | 8h |
| DB-02 | Añadir `companyId` al `CommercialSchema` | 4h |

---

### Fase 3 — Medio Plazo (1 mes)

| ID | Hallazgo | Esfuerzo |
|----|----------|---------|
| INFRA-08 | Eliminar exposición de puertos BD en docker-compose prod | 2h |
| INFRA-09 | `npm audit fix` + actualizar dependencias vulnerables | 4h |
| INFRA-10 | Actualizar Dockerfile a Node.js 22 | 1h |
| WS-05 | Implementar rate limiting en WebSocket | 4h |
| WS-06 | Eliminar `userId` del cliente en typing events | 1h |
| DB-07 | Añadir `companyId` a consentimientos GDPR | 3h |
| DB-08 | Cifrar campo `dni` en MongoDB | 4h |
| DB-09 | Operación atómica para `sequenceNumber` | 3h |
| DB-10 | TTL index para IPs de visitantes (GDPR) | 2h |
| INJ-03 | Whitelist de `field` en `AdvancedFilterDto` | 1h |
| INJ-05 | `ParseUUIDPipe` en todos los controladores | 2h |

---

### Fase 4 — Largo Plazo (3 meses)

| ID | Hallazgo | Esfuerzo |
|----|----------|---------|
| AUTH-06 | Implementar validación CSRF en refresh | 4h |
| DB-05 | Auditar y añadir paginación en todos los `findAll()` | 8h |
| INJ-01 | Whitelist de columnas en `CriteriaConverter` | 6h |
| - | Implementar secret scanning en CI (truffleHog/git-secrets) | 4h |
| - | Adoptar un gestor de secretos (Vault / AWS Secrets Manager) | 16h |
| - | Tests de integración de aislamiento multi-tenant | 8h |
| - | Política de rotación periódica de credenciales (90 días) | 4h |

---

## Recomendaciones Arquitectónicas

1. **Gestor de secretos**: Ningún secreto real debe existir en el repositorio. Adoptar HashiCorp Vault,
   AWS Secrets Manager, o al mínimo GitHub Secrets con rotación periódica.

2. **Validación de configuración al arranque**: Usar `@nestjs/config` con `validationSchema` (Joi o Zod)
   que rechace valores inseguros o vacíos en producción.

3. **Secret scanning en CI**: Añadir `truffleHog` o GitHub Advanced Security Secret Scanning para
   prevenir futuros commits con credenciales.

4. **Tests de aislamiento multi-tenant**: Crear tests de integración que validen explícitamente que
   un usuario de empresa A no puede acceder a datos de empresa B.

5. **Auditoría dinámica (DAST)**: Este informe es un análisis estático. Se recomienda complementar
   con pruebas de penetración dinámicas para confirmar la explotabilidad de cada hallazgo en producción.

---

## Referencias para Generación de Historias BMad

Este documento puede usarse como input para el proceso de creación de historias. Cada hallazgo de
**Fase 0, 1 y 2** debería generar una historia o tarea técnica. Agrupaciones sugeridas:

- **Epic: Hardening de Autenticación** → AUTH-01 a AUTH-12
- **Epic: Protección de APIs** → HTTP-01 a HTTP-11 + INJ-01 a INJ-09
- **Epic: Seguridad WebSocket** → WS-01 a WS-13
- **Epic: Aislamiento Multi-Tenant** → DB-01, DB-02, DB-05, DB-06, DB-07
- **Epic: Compliance GDPR** → DB-07, DB-08, DB-10, DB-13, MEDIA-02
- **Epic: Infraestructura Segura** → INFRA-01 a INFRA-10, gestión de secretos

---

*Informe generado mediante análisis estático del código fuente — Abril 2026.*  
*Para generar historias de desarrollo a partir de este documento, usar el skill `bmad-create-epics-and-stories`.*
