---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - /Users/rogerpugaruiz/Proyectos/guiders-backend/_bmad-output/planning-artifacts/prd.md
  - /Users/rogerpugaruiz/Proyectos/guiders-backend/_bmad-output/planning-artifacts/architecture.md
  - /Users/rogerpugaruiz/Proyectos/guiders-backend/_bmad-output/brainstorming/brainstorming-session-2026-06-12-1425.md
---

# guiders-backend - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for **Guiders Embed** (white-label B2B feature for guiders-backend), decomposing the requirements from the PRD and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

**FR1:** LeadCars (su backend) can request a short-lived embed token for a specific user, authenticated via their existing Integration API Key.
**FR2:** LeadCars can request a token refresh for an active session before the current token expires, without re-authenticating.
**FR3:** The system can revoke an embed token (logout, suspicious activity, or admin action).
**FR4:** The system can validate an embed token in real-time and return the associated user identity and permissions.
**FR5:** A token can only be used to authenticate the user it was issued for; tokens are not transferable between users.
**FR6:** The Guiders iframe can signal to the parent (LeadCars frontend) that it is ready to receive authentication.
**FR7:** The parent can send authentication credentials to the iframe via cross-frame messaging, including the embed token and target user identity.
**FR8:** The iframe can verify that the message origin matches a pre-configured allowlist for the tenant before accepting the credentials.
**FR9:** The iframe can establish a BFF session internally upon successful credential validation, without requiring cross-domain cookies.
**FR10:** The parent can send a logout signal to the iframe, and the iframe can terminate the BFF session in response.
**FR11:** The system can apply tenant-specific branding (colors, logo, favicon, typography) to the embedded admin panel.
**FR12:** An admin of a tenant can configure their branding via the embedded admin panel, including uploading logo and favicon files and selecting color values and font families.
**FR13:** Branding changes take effect immediately for new embed sessions without requiring a code deployment.
**FR14:** The system can validate that uploaded branding assets (logos, fonts) meet file size and format constraints before accepting them.
**FR15:** The system can validate that color values selected by the admin meet WCAG AA contrast requirements for accessibility.
**FR16:** A user authenticated via embed can access only the routes and actions permitted by their role within the embed context.
**FR17:** A user with the `commercial` role sees a navigation sidebar containing only their permitted areas (dashboard, visitors, leads).
**FR18:** A user with the `supervisor` role sees a navigation sidebar with their permitted areas, including chat assignment and assignment rules.
**FR19:** A user with the `admin` role sees the full navigation sidebar for their tenant, including user management, integrations, branding, and AI configuration.
**FR20:** The embed can prevent direct URL access to tenant-internal routes (e.g. user profile settings, LeadCars CRM configuration) by returning an access-denied response in embed mode.
**FR21:** A user authenticated via embed can only access data belonging to their own tenant; cross-tenant data access is blocked at all layers.
**FR22:** A superadmin of Guiders HQ can enable or disable the embed feature for a specific tenant via configuration.
**FR23:** A superadmin of Guiders HQ can configure the allowed origin URLs (parent domains) for each tenant's embed.
**FR24:** When the embed is disabled for a tenant, token requests for that tenant are rejected.
**FR25:** The system can log every successful embed authentication event with the tenant ID, user ID, origin URL, timestamp, IP address, and user agent.
**FR26:** The system can log every failed embed authentication attempt (invalid token, origin mismatch, unknown user) with diagnostic context.
**FR27:** A support user of Guiders HQ can query the audit log by tenant ID, user ID, or time range to investigate incidents.
**FR28:** The Guiders iframe can detect when the parent window is closed or navigates away, and can terminate the BFF session in response.
**FR29:** The Guiders iframe can detect when the network connection is lost and can display a recovery UI to the user.
**FR30:** The Guiders iframe can detect when a session is about to expire and can automatically refresh the token in the background, without user-visible interruption.
**FR31:** The Guiders iframe can display a user-friendly error state when authentication fails, with a retry action.
**FR32:** LeadCars can use their existing Integration API Key (already used for lead synchronization) to authenticate embed token requests; no new credential type is required.
**FR33:** The system can read existing `white_label_configs` to apply branding; no separate branding configuration is required for embed.
**FR34:** The system can read existing user accounts from `user_account_entity` to authenticate embed users; no separate user store is required for embed.
**FR35:** The Guiders admin panel can detect when it is running in embed mode (inside an iframe) versus standalone mode.
**FR36:** The Guiders admin panel can hide its standalone navigation chrome (sidebar, top bar, footer) when running in embed mode.
**FR37:** The Guiders admin panel can apply the tenant's branding CSS variables before the Angular application boots, to prevent visual flash of the unbranded state.
**FR38:** LeadCars (their developers) can read a documentation guide explaining how to integrate the embed iframe in their frontend, in less than 5 minutes.
**FR39:** The documentation guide can include a minimal working code example for the integration.
**FR40:** The documentation guide can include a description of the cross-frame messaging contract (event names, payload schemas, version compatibility).

### NonFunctional Requirements

**NFR-P1:** El iframe del embed debe cargar completamente (HTML wrapper + CSS inline + Angular boot) en menos de 3 segundos (p50) en una conexión broadband típica.
**NFR-P2:** El handshake `postMessage` desde `guiders:v1:ready` hasta que la sesión BFF está activa y el dashboard es visible debe completarse en menos de 500ms (p95).
**NFR-P3:** El endpoint `POST /v2/integration/embed/start` debe responder en menos de 200ms (p95), incluyendo consulta a MongoDB y escritura a Redis.
**NFR-P4:** El endpoint `POST /v2/integration/embed/refresh` debe responder en menos de 100ms (p95), porque se llama cada 30 minutos y no debe interrumpir al usuario.
**NFR-P5:** El endpoint `GET /embed/start` debe responder en menos de 500ms (p95), incluyendo lectura de `white_label_configs` (con cache), generación de HTML wrapper, y bootstrap de postMessage.
**NFR-P6:** La aplicación Angular del admin, una vez cargada, debe tener interacciones (cambio de ruta, click en botón) por debajo de 100ms de respuesta.
**NFR-S1:** Todos los tokens embed son opacos (cadenas aleatorias criptográficas de 256 bits mínimo), NO JWT firmados. La información del usuario se consulta DESPUÉS de validar el token.
**NFR-S2:** La verificación de `event.origin` en el listener de `postMessage` es estricta: debe matchear EXACTAMENTE uno de los orígenes en `embedAllowedOrigins` para la `companyId`. Cualquier mismatch resulta en rechazo silencioso.
**NFR-S3:** Los tokens embed tienen un TTL máximo de 8 horas. El refresh silencioso cada 30 minutos es la única forma de extender la sesión.
**NFR-S4:** El endpoint `POST /v2/integration/embed/start` valida que el `IntegrationApiKey` pertenece a la `companyId` solicitada. Si no, devuelve 403. (Reusa el patrón de `IntegrationApiKeyGuard` existente.)
**NFR-S5:** El endpoint `POST /v2/integration/embed/start` valida que el `userId` solicitado existe y pertenece a la `companyId`. Si no, devuelve 403.
**NFR-S6:** Ningún endpoint de Guiders HQ (panel superadmin, multi-tenant) es accesible con un token embed. Los handlers de embed validan explícitamente que el contexto es embed antes de proceder.
**NFR-S7:** Los assets de branding (logos, favicons, fuentes) se sirven desde S3 con `Content-Type` correcto, no desde el backend. Esto previene que un cliente suba un archivo malicioso y lo sirva como HTML.
**NFR-S8:** Los logs de auditoría con datos personales (`ipAddress`, `userAgent`) tienen retención de 12 meses, alineado con la práctica actual de Guiders para logs de auth. Después se eliminan automáticamente.
**NFR-S9:** Los tokens embed se almacenan en Redis con `requirepass` configurado (Redis autenticado). El acceso a Redis está restringido a la red interna de Guiders.
**NFR-S10:** El endpoint `GET /embed/start` aplica headers de seguridad: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` (porque el wrapper no debe ser embebido en otro nivel), `Referrer-Policy: strict-origin-when-cross-origin`.
**NFR-SC1:** El sistema debe soportar 50+ clientes B2B simultáneos en producción (target a 12 meses). Cada cliente puede tener hasta 100 usuarios concurrentes.
**NFR-SC2:** La carga del endpoint `POST /v2/integration/embed/start` no debe degradar el rendimiento del endpoint regular de login BFF. Se aíslan via namespace en Redis.
**NFR-SC3:** El HTML wrapper `/embed/start` se sirve desde el mismo proceso NestJS, no requiere infraestructura separada. El cache de `white_label_configs` (TTL 60s) en memoria del proceso reduce la carga en MongoDB a 1 query por minuto por `companyId` activa.
**NFR-SC4:** El número de tokens embed activos en Redis está limitado por el TTL (8h) y la rotación natural. Un cliente B2B con 100 usuarios × 1 token activo = 100 entries en Redis, negligible.
**NFR-A1:** El color picker del feature `/branding` valida que las combinaciones primary/background y secondary/text cumplen WCAG AA contrast (4.5:1 para texto, 3:1 para UI).
**NFR-A2:** La página `/embed/error` es navegable por teclado (Tab, Enter, Esc). El botón "Reintentar" es focusable y tiene `aria-label` descriptivo.
**NFR-A3:** El iframe tiene `title` descriptivo para lectores de pantalla: "Guiders Admin - {brandName}".
**NFR-A4:** El admin Guiders ya cumple WCAG 2.1 AA en standalone mode (auditoría previa). El modo embed NO debe degradar la accesibilidad existente.
**NFR-A5:** El handshake `postMessage` no depende de UI; usuarios con screen readers experimentan el mismo flujo que usuarios visuales.
**NFR-I1:** El endpoint `POST /v2/integration/embed/start` reusa el `IntegrationApiKeyGuard` existente. No se añade un nuevo tipo de guard.
**NFR-I2:** El servicio de branding reusa el `IWhiteLabelConfigRepository` existente. No se añade un nuevo repositorio.
**NFR-I3:** El handshake `postMessage` usa eventos versionados con prefijo (`guiders:v1:ready`, `guiders:v1:event`, `leadcars:v1:auth`, `leadcars:v1:logout`). Cambios incompatibles requieren bump de versión (`v2`).
**NFR-I4:** El endpoint `GET /embed/start` se sirve desde el mismo proceso NestJS. No requiere NGINX adicional ni configuración especial más allá de CORS.
**NFR-I5:** El bootstrap de Angular desde el HTML wrapper usa los mismos assets (bundles JS, chunks lazy-loaded) que el admin standalone. No se construye un bundle separado.
**NFR-R1:** El endpoint `POST /v2/integration/embed/start` tiene un SLA de 99.5% uptime (alineado con el resto de endpoints de Guiders).
**NFR-R2:** Si Redis está temporalmente no disponible, el endpoint `POST /v2/integration/embed/refresh` devuelve 503 con mensaje "Servicio temporalmente no disponible, reintentar". El iframe muestra la pantalla de error con botón "Reintentar".
**NFR-R3:** El HTML wrapper `/embed/start` es estático (no requiere DB) excepto para el branding. Si MongoDB no responde en menos de 1s, el wrapper se sirve con branding por defecto (paleta azul Guiders) y el BrandingService lo reemplaza cuando MongoDB responda.
**NFR-R4:** El cliente frontend de LeadCars puede implementar su propio retry/backoff al llamar a `POST /v2/integration/embed/start`. El endpoint no impone rate limit estricto en MVP, pero el API Key guard loggea cada llamada para detectar abuse.
**NFR-M1:** El código nuevo sigue los patrones existentes en `guiders-backend`: DDD/CQRS, Result pattern, V2 contexts (MongoDB), Symbol tokens para DI, `Uuid.random().value` en tests.
**NFR-M2:** El código nuevo en `guiders-frontend` sigue los patrones existentes: Angular standalone components, signals, Nx workspace structure, Jest con `describe` en español.
**NFR-M3:** El handshake `postMessage` está documentado en `docs/leadcar/embed-integration.md` con ejemplos de código en JS y TS.
**NFR-M4:** El campo `embedEnabled` y `embedAllowedOrigins` se documentan en el AGENTS.md del contexto `white-label`.
**NFR-M5:** Los tests unitarios, integración y e2e siguen la convención de nombres del proyecto: `<archivo>.spec.ts` para unit, `<archivo>.int-spec.ts` para integration.
**NFR-CO1:** Los logs de auditoría cumplen GDPR/LOPDGDD: solo datos necesarios para operación, retención 12 meses, eliminación automática.
**NFR-CO2:** El handler de auth embed no captura datos de visitantes web, solo procesa el handshake. Por tanto, NO requiere opt-in de consentimiento del visitante final.
**NFR-CO3:** El cliente B2B (LeadCars) sigue siendo responsable del tratamiento de los datos que sincroniza con su CRM (LeadCars CRM). El contrato B2B debe documentar esta separación de responsabilidades.

### Additional Requirements

**From Architecture (24 decisions, summarized):**

- **A1:** Token opaque stored in Redis with namespace `embed:*`. Key pattern: `embed:token:<token>` (TTL 8h) and `embed:refresh:<userId>` (TTL 30min). Value: JSON with `{ userId, companyId, roles, createdAt }`. (D1, D5)
- **A2:** Extend `white_label_configs` MongoDB schema with 2 new fields: `embedEnabled: boolean` and `embedAllowedOrigins: string[]`. (D2)
- **A3:** Cache `white_label_configs` in process memory with TTL 60s (cache-aside). No Redis for this cache. (D3)
- **A4:** Reuse existing `IntegrationApiKeyGuard` for embed auth. No new guard. (D7)
- **A5:** BFF session established internally from iframe. Cookie attributes: `HttpOnly`, `Secure`, `SameSite=Lax` (NOT `None` — iframe is same-origin with Guiders backend). (D9)
- **A6:** CORS in `main.ts`: add `https://app.leadcars.com` and `https://www.leadcars.com` to `origin[]` with `credentials: true`. (D10)
- **A7:** Security headers on `/embed/start`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, CSP with `frame-ancestors <embedAllowedOrigins>`. (D10)
- **A8:** postMessage events versioned with prefix `v1:`: `guiders:v1:ready`, `leadcars:v1:auth`, `leadcars:v1:logout`. Breaking changes require `v2:`. (D12)
- **A9:** Origin verification strict: `event.origin === <one of embedAllowedOrigins>`. Silent rejection (no error message to potential attacker). (D2, NFR-S2)
- **A10:** Inline CSS in `<head>` of HTML wrapper BEFORE `<script src="...">` of Angular to prevent branding flash. (D18)
- **A11:** Reuse Angular standalone bundle (no separate bundle for embed). Branding via CSS variables that `var(--gds-color-primary, #007bff)` already exists. (D19)
- **A12:** `postMessage` listener uses silent rejection (NOT error response) for invalid origins. (NFR-S2)
- **A13:** Token refresh transparent: `setTimeout` cancelable, doesn't interrupt user operations. (D5, FR30)
- **A14:** Audit log persisted in MongoDB with 12-month retention, GDPR-compliant fields. (FR25, NFR-S8, NFR-CO1)
- **A15:** No new infrastructure: same NestJS process, same Redis, same MongoDB. Just add CORS origins to `main.ts`. (D21)
- **A16:** Frontend routes `/embed/*` registered with `EmbedGuard`. Restricted routes return 403 (not 404). (FR20, AC19, AC22)
- **A17:** Use `Uuid.random().value` in tests, NEVER fake strings. (Project Context rule, NFR-M1)
- **A18:** Use `Symbol` tokens for DI, NEVER direct class injection. (Project Context rule, NFR-M1)
- **A19:** Follow DDD/CQRS strictly: commands go in `application/commands/`, events in `domain/events/`, controllers in `infrastructure/controllers/`. (Project Context rule)
- **A20:** Always call `aggregate.commit()` after `save()` to publish domain events. (Project Context rule, NFR-M1)
- **A21:** Token generation uses Node.js native `crypto.randomBytes(32).toString('base64url')` — no external crypto library. (D5)
- **A22:** EmbedTokenAuthenticatedEvent handler persists to MongoDB `embed_token_audit_log` collection. (FR25, validation gap)
- **A23:** `getDefaults` endpoint already returns brand defaults; reuse for fallback when MongoDB is slow. (D3, NFR-R3)
- **A24:** The `/branding` UI is a new lib `libs/admin/features/white-label/` to avoid coupling with other admin features.

### UX Design Requirements

UX Design document does not exist for this project. UX is inline in the PRD (User Journeys section with 4 personas and edge cases) and will be implemented through the components defined in the Architecture.

### FR Coverage Map

| FR | Epic | Brief description |
|---|---|---|
| FR1 | E1: Embed Token Issuance | LeadCars backend requests embed token via API key |
| FR2 | E1: Embed Token Issuance | Token refresh before expiration |
| FR3 | E2: Embed Session Lifecycle | Token revocation on logout/suspicious activity |
| FR4 | E2: Embed Session Lifecycle | Token validation returns user identity |
| FR5 | E1: Embed Token Issuance | Tokens non-transferable between users |
| FR6 | E3: Cross-Frame Auth Handshake | Iframe signals ready to parent |
| FR7 | E3: Cross-Frame Auth Handshake | Parent sends credentials to iframe |
| FR8 | E3: Cross-Frame Auth Handshake | Iframe verifies origin against allowlist |
| FR9 | E2: Embed Session Lifecycle | Iframe establishes BFF session internally |
| FR10 | E2: Embed Session Lifecycle | Parent logout propagates to iframe |
| FR11 | E4: White-Label Branding | Apply tenant branding to admin |
| FR12 | E5: Branding Self-Service | Admin configures branding via UI |
| FR13 | E5: Branding Self-Service | Branding changes effective immediately |
| FR14 | E5: Branding Self-Service | Validate branding asset constraints |
| FR15 | E5: Branding Self-Service | WCAG AA contrast validation |
| FR16 | E6: Role-Based Access in Embed | Role-based access control in embed context |
| FR17 | E6: Role-Based Access in Embed | Commercial role sees limited sidebar |
| FR18 | E6: Role-Based Access in Embed | Supervisor role sees assignment features |
| FR19 | E6: Role-Based Access in Embed | Admin role sees full sidebar |
| FR20 | E6: Role-Based Access in Embed | Restricted routes return 403 |
| FR21 | E1: Embed Token Issuance | Multi-tenant isolation (companyId validation) |
| FR22 | E1: Embed Token Issuance | Superadmin can enable/disable embed per tenant |
| FR23 | E1: Embed Token Issuance | Superadmin configures allowed origins per tenant |
| FR24 | E1: Embed Token Issuance | Token requests rejected when embed disabled |
| FR25 | E2: Embed Session Lifecycle | Audit log of successful auth |
| FR26 | E2: Embed Session Lifecycle | Audit log of failed auth attempts |
| FR27 | E2: Embed Session Lifecycle | Support can query audit log |
| FR28 | E2: Embed Session Lifecycle | Detect parent close, terminate BFF session |
| FR29 | E2: Embed Session Lifecycle | Network loss recovery UI |
| FR30 | E2: Embed Session Lifecycle | Transparent token refresh |
| FR31 | E2: Embed Session Lifecycle | User-friendly error state with retry |
| FR32 | E1: Embed Token Issuance | Reuse existing Integration API Key |
| FR33 | E4: White-Label Branding | Reuse existing white_label_configs |
| FR34 | E1: Embed Token Issuance | Reuse existing user accounts |
| FR35 | E3: Cross-Frame Auth Handshake | Detect embed vs standalone mode |
| FR36 | E3: Cross-Frame Auth Handshake | Hide chrome in embed mode |
| FR37 | E4: White-Label Branding | Branding CSS applied pre-Angular boot |
| FR38 | E7: Documentation & Onboarding | Integration guide (5 min read) |
| FR39 | E7: Documentation & Onboarding | Code example in docs |
| FR40 | E7: Documentation & Onboarding | postMessage contract documentation |

## Epic List

### Epic 1: Embed Token Issuance & Multi-Tenant Gating

**User Outcome:** LeadCars backend can request short-lived embed tokens for their users, authenticated via existing Integration API Key. The system enforces that the embed is enabled for the tenant and the user belongs to that tenant.

**Standalone capability:** LeadCars can request tokens even before any embed UI is built. The endpoint is fully testable via curl. No dependencies on frontend.

**FRs covered:** FR1, FR2, FR5, FR21, FR22, FR23, FR24, FR32, FR34

**Implementation Notes:**
- Reuses existing `IntegrationApiKeyGuard` (no new guard)
- Extends `white_label_configs` schema with `embedEnabled` + `embedAllowedOrigins`
- Tokens are opaque (256-bit base64url), stored in Redis with namespace `embed:*`
- TTL: 8h for tokens, 30min for refresh keys
- Returns 403 with code `EMBED_DISABLED_FOR_TENANT` if embed is disabled

### Epic 2: Embed Session Lifecycle & Audit

**User Outcome:** Once a token is issued, the iframe can establish a BFF session internally, refresh tokens transparently, terminate on logout/network issues, and produce a complete audit trail for Guiders support to investigate incidents.

**Standalone capability:** Backend endpoints for token validation, refresh, and audit log query work independently. Frontend can be tested via curl + browser dev tools. Depends on E1 for token issuance.

**FRs covered:** FR3, FR4, FR9, FR10, FR25, FR26, FR27, FR28, FR29, FR30, FR31

**Implementation Notes:**
- Cookie session: `HttpOnly`, `Secure`, `SameSite=Lax` (NOT `None` — same-origin with Guiders backend)
- `EmbedTokenAuthenticated` event persisted to MongoDB `embed_token_audit_log` collection
- 12-month retention on logs (GDPR/LOPDGDD compliant)
- Token refresh via `setTimeout` cancelable to not interrupt user operations

### Epic 3: Cross-Frame Auth Handshake (postMessage)

**User Outcome:** LeadCars frontend can mount an iframe in their application, communicate authentication credentials via `postMessage`, and the iframe can verify the origin and establish a BFF session without requiring cross-domain cookies.

**Standalone capability:** The full handshake protocol works between iframe and parent. LeadCars frontend can be tested with a mock parent. Depends on E1 (tokens) and E2 (BFF session).

**FRs covered:** FR6, FR7, FR8, FR35, FR36

**Implementation Notes:**
- Events versioned: `guiders:v1:ready`, `leadcars:v1:auth`, `leadcars:v1:logout`
- Origin verification: strict `event.origin` match against `embedAllowedOrigins`
- Silent rejection of invalid origins (no error response to potential attacker)
- Chrome (sidebar, top bar, footer) hidden in embed mode via `isEmbedMode` signal

### Epic 4: White-Label Branding Application

**User Outcome:** When the iframe loads, the tenant's branding (colors, logo, favicon, typography) is applied automatically — before the Angular application boots, so the user never sees the unbranded Guiders interface.

**Standalone capability:** Branding is applied via inline CSS in the HTML wrapper, then verified and enhanced by Angular after boot. Can be tested by viewing `/embed/start` with different `companyId` params.

**FRs covered:** FR11, FR33, FR37

**Implementation Notes:**
- Inline CSS in `<head>` of `/embed/start` HTML wrapper BEFORE `<script src="...">`
- `BrandingService` (Angular) reads `white_label_configs` and applies CSS variables
- Cache in process memory (TTL 60s) to avoid MongoDB query on each request
- Fallback to default Guiders branding if MongoDB doesn't respond within 1s

### Epic 5: Branding Self-Service UI

**User Outcome:** An admin of a tenant can configure their own branding via a `/branding` page in the admin panel — uploading logo, favicon, fonts, and selecting color values — without contacting Guiders HQ.

**Standalone capability:** The `/branding` feature works as an isolated lib (`libs/admin/features/white-label/`) with its own data-access service. Admin can save and see previews. Depends on E4 (branding infrastructure exists).

**FRs covered:** FR12, FR13, FR14, FR15

**Implementation Notes:**
- Uses existing `WhiteLabelConfigController` endpoints for save/load
- File upload via existing `WhiteLabelFileUploadService` (S3)
- WCAG AA contrast validation on color picker
- Live preview of branding changes before save

### Epic 6: Role-Based Access Control in Embed

**User Outcome:** When a user authenticates via embed, the sidebar and routes are filtered based on their role. A commercial sees only their work area; a supervisor sees team management; an admin sees everything. Direct URL access to restricted routes returns 403.

**Standalone capability:** Sidebar computed signal can be tested in admin standalone mode (where it shows everything). EmbedGuard can be tested in embed mode with mock roles. Depends on E3 (embed mode detection).

**FRs covered:** FR16, FR17, FR18, FR19, FR20

**Implementation Notes:**
- `sidebarItems` in `apps/admin/src/app/app.ts:61-132` changes from `signal` to `computed` that evaluates `currentUser()?.roles`
- New `EmbedGuard` in Angular; returns 403 for `/embed/settings/profile` and `/embed/integrations/leadcars`
- Double defense: frontend `EmbedGuard` + backend `RolesGuard` already in place
- Restricted routes hidden from sidebar (not 404 — no info leak)

### Epic 7: Documentation & Onboarding

**User Outcome:** LeadCars developers can integrate the embed in less than 5 minutes by reading a concise documentation guide with code examples and the postMessage contract.

**Standalone capability:** Documentation is a static doc file, independent of code. Can be reviewed without running anything. Depends on E1-E6 (documentation reflects the implementation).

**FRs covered:** FR38, FR39, FR40

**Implementation Notes:**
- `docs/leadcar/embed-integration.md` with minimal working code example
- postMessage contract documented with event names, payload schemas, version compatibility
- Update AGENTS.md of `auth`, `white-label`, `company` contexts to reflect embed changes

---

## Epic 1: Embed Token Issuance & Multi-Tenant Gating

Enable LeadCars backend to request short-lived embed tokens for their users, with strict multi-tenant isolation enforced server-side.

### Story 1.1: Extend white_label_configs schema for embed

As a Guiders backend developer,
I want to add `embedEnabled` and `embedAllowedOrigins` fields to the `white_label_configs` MongoDB schema,
So that the embed feature can be enabled per tenant with a controlled origin allowlist.

**Acceptance Criteria:**

**Given** an existing `white_label_configs` collection in MongoDB
**When** the schema is updated and the application is deployed
**Then** new documents can be saved with `embedEnabled: boolean` and `embedAllowedOrigins: string[]` fields
**And** existing documents default to `embedEnabled: false` and `embedAllowedOrigins: []`
**And** the value object `WhiteLabelConfig` includes the new fields in `toPrimitives()` and `fromPrimitives()`
**And** the MongoDB repository mapper correctly serializes/deserializes the new fields

### Story 1.2: Implement opaque token generation in EmbedTokenService

As a backend service,
I want a `EmbedTokenService` that generates cryptographically random opaque tokens and stores them in Redis with namespace `embed:*`,
So that the embed auth flow has a secure, revocable token mechanism without JWT signing overhead.

**Acceptance Criteria:**

**Given** a `companyId`, `userId`, and `roles`
**When** `EmbedTokenService.createToken(companyId, userId, roles)` is called
**Then** it generates a 256-bit random token using `crypto.randomBytes(32).toString('base64url')`
**And** it stores in Redis: `SET embed:token:<token> '{"userId":"...","companyId":"...","roles":[...],"createdAt":"..."}' EX 28800`
**And** it returns `{ token, expiresAt: ISOString }`
**And** the token format is URL-safe (no `+`, `/`, `=` characters)

**Given** a token stored in Redis
**When** `EmbedTokenService.validateToken(token)` is called
**Then** it returns `{ userId, companyId, roles, createdAt }` if the token exists
**And** it returns `err(EmbedTokenNotFoundError)` if the token does not exist or is expired

**Given** a refresh request
**When** `EmbedTokenService.refreshToken(oldToken)` is called
**Then** it generates a new token
**And** it stores the new token in Redis
**And** it deletes the old token
**And** it returns the new `{ token, expiresAt }`

**Given** a token
**When** `EmbedTokenService.revokeToken(token)` is called
**Then** it deletes the token from Redis
**And** subsequent `validateToken` calls return `err(EmbedTokenNotFoundError)`

### Story 1.3: Create CreateEmbedTokenCommand + POST /v2/integration/embed/start endpoint

As a LeadCars backend system,
I want to POST to `/v2/integration/embed/start` with my Integration API Key and a target user ID,
So that I receive an embed token to authenticate that user in my frontend iframe.

**Acceptance Criteria:**

**Given** a valid `X-Api-Key` header for a tenant where `embedEnabled=true`
**And** a request body `{ "userId": "<uuid>", "companyId": "<uuid>" }` where userId belongs to companyId
**When** `POST /v2/integration/embed/start` is called
**Then** the response is `200 OK` with `{ "token": "opaque-base64url", "expiresAt": "2026-06-12T22:32:00.000Z" }`
**And** an `EmbedTokenAuthenticated` event is emitted with `{ companyId, userId, origin: null, timestamp, ipAddress, userAgent }`

**Given** a valid API key but `embedEnabled=false` for the tenant
**When** the endpoint is called
**Then** the response is `403 Forbidden` with code `EMBED_DISABLED_FOR_TENANT`

**Given** a valid API key but `userId` does not belong to `companyId`
**When** the endpoint is called
**Then** the response is `403 Forbidden` with code `EMBED_USER_NOT_IN_TENANT`

**Given** an invalid or missing `X-Api-Key`
**When** the endpoint is called
**Then** the response is `401 Unauthorized`

**Given** the API key's `companyId` does not match the request body's `companyId`
**When** the endpoint is called
**Then** the response is `403 Forbidden` with code `EMBED_TENANT_MISMATCH`

### Story 1.4: Create RefreshEmbedTokenCommand + POST /v2/integration/embed/refresh endpoint

As a LeadCars frontend iframe,
I want to POST to `/v2/integration/embed/refresh` with my current token before it expires,
So that the user's session can be extended without re-authenticating.

**Acceptance Criteria:**

**Given** a valid embed token in `Authorization: Bearer <token>` header
**When** `POST /v2/integration/embed/refresh` is called
**Then** the response is `200 OK` with `{ "token": "new-opaque-base64url", "expiresAt": "..." }`
**And** the old token is deleted from Redis
**And** the new token is stored with TTL 8h

**Given** an expired or invalid token
**When** the endpoint is called
**Then** the response is `401 Unauthorized` with code `EMBED_TOKEN_EXPIRED` or `EMBED_TOKEN_INVALID`

**Given** a request to refresh a token that was issued for a different user
**When** the endpoint is called
**Then** the response is `403 Forbidden` with code `EMBED_TOKEN_USER_MISMATCH`

---

## Epic 2: Embed Session Lifecycle & Audit

Provide a complete session lifecycle for embed users (BFF session, transparent refresh, logout propagation, audit trail) with GDPR-compliant audit logging.

### Story 2.1: Implement POST /embed/authenticate-session to create BFF session from token

As an embed iframe after receiving a valid token,
I want to POST to `/embed/authenticate-session` with the token and receive a BFF session cookie,
So that the iframe can navigate the admin routes without needing the token for every request.

**Acceptance Criteria:**

**Given** a valid embed token in `Authorization: Bearer <token>` header
**And** a request body `{ "companyId": "<uuid>", "userId": "<uuid>" }` matching the token
**When** `POST /embed/authenticate-session` is called
**Then** the response is `200 OK` with `{ "sessionEstablished": true, "expiresAt": "..." }`
**And** a BFF session cookie is set with attributes: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`
**And** the cookie name follows the existing BFF pattern (`console_session` or similar)

**Given** an expired or invalid token
**When** the endpoint is called
**Then** the response is `401 Unauthorized`
**And** no cookie is set

### Story 2.2: Implement EmbedTokenAuthenticated event and audit log persistence

As a Guiders support user investigating a ticket,
I want every embed authentication event (success or failure) to be persisted with tenant ID, user ID, origin, timestamp, IP, and user agent,
So that I can trace issues and detect abuse.

**Acceptance Criteria:**

**Given** a successful embed authentication (any endpoint that validates a token)
**When** the auth completes
**Then** an `EmbedTokenAuthenticatedEvent` is emitted with all fields: `companyId`, `userId`, `origin`, `timestamp`, `ipAddress`, `userAgent`
**And** a `PersistEmbedTokenAuthenticatedEventHandler` writes the event to MongoDB collection `embed_token_audit_log`
**And** the document has TTL index of 12 months (auto-deletion after retention period)

**Given** a failed embed authentication attempt (invalid token, origin mismatch, unknown user)
**When** the attempt occurs
**Then** a similar event is emitted with `result: "failure"` and `failureReason: <code>`
**And** the failure event is persisted to the same collection

**Given** the audit log collection
**When** queried by `companyId`, `userId`, or time range
**Then** the query returns matching events in chronological order

### Story 2.3: Implement token revocation on logout from parent

As a LeadCars frontend when the user logs out of their application,
I want to send a `postMessage('leadcars:v1:logout')` to the Guiders iframe,
So that the iframe can clean up its BFF session and terminate the embed context.

**Acceptance Criteria:**

**Given** an active embed iframe with a valid BFF session
**When** the parent sends `postMessage({ type: 'leadcars:v1:logout' }, 'https://app.guiders.es')`
**And** the `event.origin` matches an allowed origin for the tenant
**Then** the iframe calls `POST /bff/auth/logout` (existing endpoint) to clear the BFF session cookie
**And** the iframe navigates to `/embed/login` showing a "Session closed" message with a retry button

**Given** the parent window is closed while the iframe is active
**When** the iframe detects the parent unload event
**Then** the iframe calls `POST /bff/auth/logout` to clear the BFF session
**And** the iframe shows a neutral "Connection lost" UI

### Story 2.4: Implement transparent token refresh in the iframe

As an embed user working for 8 hours in the iframe,
I want the iframe to refresh my token automatically every 30 minutes without interrupting me,
So that I don't get logged out mid-task.

**Acceptance Criteria:**

**Given** an active embed session with a token issued more than 7.5 hours ago
**When** the next request to Guiders backend is made
**Then** the `EmbedBootstrapService` calls `POST /v2/integration/embed/refresh` BEFORE the request
**And** the new token is stored in `sessionStorage` (or in-memory signal)
**And** the request proceeds with the new token

**Given** the iframe is in the middle of a user-initiated operation (e.g., sending a chat message)
**When** the refresh timer fires
**Then** the refresh is deferred until the current operation completes
**And** the user does not see any indication of the refresh

**Given** the refresh fails (e.g., network error, 401)
**When** the iframe is using the iframe
**Then** the iframe shows `/embed/error` with a "Reintentar" button
**And** the retry button re-attempts the refresh

### Story 2.5: Implement network loss detection and recovery UI

As an embed user whose internet connection drops temporarily,
I want to see a clear recovery message instead of a broken interface,
So that I know what's happening and what to do.

**Acceptance Criteria:**

**Given** an active embed iframe
**When** the network connection is lost (`navigator.onLine === false` or fetch fails repeatedly)
**Then** the iframe shows a network-lost UI with: "Sin conexión a internet", "Reconectando...", and a "Reintentar" button
**And** the iframe polls connectivity every 5 seconds

**Given** the network connection is restored
**When** the iframe detects it
**Then** the iframe re-establishes the session silently (re-refreshes token if needed)
**And** the user is taken back to the last route they were on

---

## Epic 3: Cross-Frame Auth Handshake (postMessage)

Enable a LeadCars frontend to mount the Guiders iframe and complete authentication via a secure, versioned `postMessage` protocol with strict origin verification.

### Story 3.1: Implement EmbedBootstrapService with versioned postMessage protocol

As an embed iframe when it loads,
I want to send `postMessage('guiders:v1:ready')` to the parent and listen for `leadcars:v1:auth` from the parent,
So that we can complete the authentication handshake without any cross-domain cookies.

**Acceptance Criteria:**

**Given** the embed iframe is loaded
**When** Angular bootstrap completes
**Then** the `EmbedBootstrapService` calls `window.parent.postMessage({ type: 'guiders:v1:ready', payload: { version: '1.0.0' } }, '*')`
**And** the service registers a `window.addEventListener('message', ...)` listener

**Given** a `postMessage` event arrives with `type: 'leadcars:v1:auth'`
**And** `event.origin` matches one of `embedAllowedOrigins` for the tenant
**When** the listener fires
**Then** the service extracts `payload.token` and `payload.userId`
**And** it calls `POST /embed/authenticate-session` with the token
**And** on success, it navigates to `/embed/dashboard` (or the configured initial path)

**Given** a `postMessage` event arrives with `type: 'leadcars:v1:auth'`
**And** `event.origin` does NOT match any allowed origin
**When** the listener fires
**Then** the service silently rejects the message (no error response, no UI feedback)
**And** the service logs a warning to the console for debugging

**Given** a `postMessage` event arrives with a `type` that is not recognized
**When** the listener fires
**Then** the service silently ignores it (no error, no processing)

### Story 3.2: Implement embed mode detection and chrome hiding

As an embed user inside an iframe,
I want to NOT see the standalone Guiders navigation chrome (sidebar, top bar, footer),
So that the interface feels integrated with the parent application.

**Acceptance Criteria:**

**Given** the admin application loads
**When** the `App` component initializes
**Then** it detects embed mode by: `window.self !== window.top` OR query param `?embed=true`
**And** it sets the `isEmbedMode` signal accordingly
**And** it persists `isEmbedMode` in `localStorage` as `guiders:embedMode=true` for subsequent navigations

**Given** `isEmbedMode === true`
**When** the app renders
**Then** the sidebar (left navigation) is hidden via `*ngIf` or signal
**And** the top bar with "Guiders" logo is hidden
**And** the footer is hidden
**And** only `<router-outlet>` content is visible

**Given** `isEmbedMode === true`
**When** the user navigates to `/embed/dashboard` or any `/embed/*` route
**Then** the route resolves correctly
**And** the embed-specific layouts apply

**Given** the user is in standalone mode (not in iframe)
**When** the app loads
**Then** the sidebar, top bar, and footer are visible (normal Guiders admin)
**And** `isEmbedMode === false`

### Story 3.3: Add CORS origins for embed clients in main.ts

As a backend configuration,
I want `main.ts` to allow CORS requests from the configured embed client origins,
So that the iframe can make cross-origin requests with credentials.

**Acceptance Criteria:**

**Given** the application starts
**When** CORS middleware is initialized
**Then** the `origin` array includes:
- `https://app.leadcars.com`
- `https://www.leadcars.com`
- Any other origin in `EMBED_ALLOWED_DEFAULT_ORIGINS` env var (comma-separated)

**And** the `credentials: true` option is set (so cookies can be sent)
**And** the `allowedHeaders` includes: `Content-Type`, `Authorization`, `X-Api-Key`

**Given** a request from a non-allowed origin
**When** the CORS middleware checks it
**Then** the request is rejected with CORS error

---

## Epic 4: White-Label Branding Application

Apply the tenant's branding (colors, logo, favicon, typography) to the embedded admin panel before the Angular application boots, eliminating the flash of unbranded content.

### Story 4.1: Implement GET /embed/start HTML wrapper with inline branding CSS

As a LeadCars frontend when mounting the iframe,
I want `GET /embed/start?company=<id>` to return an HTML page with the tenant's branding applied as inline CSS in the `<head>`,
So that the user never sees the unbranded Guiders interface.

**Acceptance Criteria:**

**Given** a request to `GET /embed/start?company=leadcars-uuid`
**When** the controller handles the request
**Then** it reads `white_label_configs` for the companyId (with cache, TTL 60s)
**And** it generates an HTML page with:
- `<!DOCTYPE html>`
- `<html lang="es">`
- `<head>` with `<title>Guiders Admin - {brandName}</title>`
- `<style>:root { --gds-color-primary: {primary}; --gds-color-secondary: {secondary}; ... --gds-logo-url: url('{logoUrl}'); }</style>` (inlined, before scripts)
- `<script src="...">` (Angular bundles, same as admin standalone)
- `<body>` with `<admin-root></admin-root>`

**And** security headers are set: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`
**And** `Content-Security-Policy` includes `frame-ancestors {comma-separated embedAllowedOrigins}`

**Given** MongoDB is slow or unavailable (> 1s)
**When** the controller tries to read `white_label_configs`
**Then** it falls back to default Guiders branding (blue palette) after 1s timeout
**And** the response is still served (not delayed)

**Given** the companyId in the query doesn't exist or has `embedEnabled=false`
**When** the controller handles the request
**Then** it returns 403 with explanation

### Story 4.2: Implement BrandingService in Angular to enhance branding after boot

As an embed iframe after Angular boots,
I want a `BrandingService` that re-applies branding (in case the inline CSS was insufficient) and provides reactive branding config to components,
So that the branding is consistent and reactive throughout the session.

**Acceptance Criteria:**

**Given** the Angular app boots in embed mode
**When** the `BrandingService` initializes
**Then** it calls `GET /v2/companies/:companyId/white-label` to get the full branding config
**And** it stores the config in a `signal<WhiteLabelConfig>`
**And** it applies CSS variables via `document.documentElement.style.setProperty('--gds-color-primary', ...)` etc.
**And** it sets the document title to `Guiders Admin - {brandName}`
**And** it sets the favicon via `<link rel="icon" href="...">`

**Given** the branding config changes (e.g., admin updates it)
**When** the new config arrives
**Then** the signal updates reactively
**And** components that depend on `brandingConfig` re-render

**Given** the branding service fails to load the config
**When** the GET request fails
**Then** the service falls back to the inline CSS already applied
**And** logs a warning

### Story 4.3: Implement in-process cache for white_label_configs

As a backend service handling many embed requests,
I want to cache `white_label_configs` reads in process memory with a 60-second TTL,
So that we don't hit MongoDB on every iframe load.

**Acceptance Criteria:**

**Given** the `WhiteLabelConfigService` (or equivalent) is called for a `companyId`
**When** the config is requested
**Then** it first checks the in-memory cache: `Map<companyId, { config, expiresAt }>`
**And** if a valid (non-expired) entry exists, it returns the cached config
**And** if no entry or expired, it queries MongoDB and caches the result with `expiresAt = now + 60s`

**Given** the cache is populated for 100 tenants
**When** a request comes in
**Then** no MongoDB query is made (cache hit)
**And** the response time is < 5ms for the cache lookup

**Given** an admin updates the branding via `PATCH /v2/companies/:id/white-label`
**When** the update is persisted
**Then** the cache entry for that `companyId` is invalidated (deleted from the map)
**And** the next read refreshes the cache from MongoDB

---

## Epic 5: Branding Self-Service UI

Provide a self-service `/branding` page in the admin panel where tenant admins can configure their own branding without contacting Guiders HQ.

### Story 5.1: Create libs/admin/features/white-label lib skeleton

As an Angular Nx workspace maintainer,
I want a new lib `libs/admin/features/white-label/` with its own routing, data-access, and components,
So that the branding feature is isolated and doesn't couple with other admin features.

**Acceptance Criteria:**

**Given** the Nx workspace
**When** the lib is generated via `nx g @nx/angular:lib admin/features/white-label`
**Then** the lib is created with `project.json`, `tsconfig.json`, `src/index.ts`, `src/lib/`
**And** the lib is registered in `tsconfig.base.json` with path alias `@guiders-frontend/admin/features/white-label`

**Given** the admin app
**When** the lib is imported
**Then** `import { whiteLabelRoutes } from '@guiders-frontend/admin/features/white-label'` works
**And** the routes are lazy-loaded via `loadChildren` in `apps/admin/src/app/app.routes.ts`

### Story 5.2: Implement WhiteLabelService for branding CRUD

As a frontend service,
I want a `WhiteLabelService` that consumes the existing `/v2/companies/:companyId/white-label*` endpoints,
So that the UI can load, save, and upload branding assets.

**Acceptance Criteria:**

**Given** a `companyId` from `UserService.currentUser()`
**When** `WhiteLabelService.getConfig(companyId)` is called
**Then** it calls `GET /v2/companies/:companyId/white-label`
**And** returns the `WhiteLabelConfigDto`

**Given** a partial config (colors, brandName)
**When** `WhiteLabelService.updateConfig(companyId, partialConfig)` is called
**Then** it calls `PATCH /v2/companies/:companyId/white-label`
**And** returns the updated `WhiteLabelConfigDto`

**Given** a logo file
**When** `WhiteLabelService.uploadLogo(companyId, file)` is called
**Then** it calls `POST /v2/companies/:companyId/white-label/logo` (multipart/form-data)
**And** returns `{ url: 'https://s3...' }`

**Given** a favicon file
**When** `WhiteLabelService.uploadFavicon(companyId, file)` is called
**Then** it calls `POST /v2/companies/:companyId/white-label/favicon`
**And** returns `{ url: 'https://s3...' }`

**Given** a font file
**When** `WhiteLabelService.uploadFont(companyId, file)` is called
**Then** it calls `POST /v2/companies/:companyId/white-label/font`
**And** returns the font metadata

### Story 5.3: Implement white-label-config UI component

As an admin of LeadCars,
I want a `/branding` page with tabs for colors, logo, favicon, and fonts,
So that I can configure my company's branding through a visual interface.

**Acceptance Criteria:**

**Given** the admin navigates to `/branding`
**When** the page loads
**Then** it shows 4 tabs: "Colores", "Logo", "Favicon", "Fuentes"
**And** it loads the current config via `WhiteLabelService.getConfig(companyId)`
**And** it pre-fills the form with current values

**Given** the user is on the "Colores" tab
**When** they change a color via the color picker
**Then** a live preview shows: the new primary color applied to a sample button
**And** WCAG AA contrast is calculated between primary/background and secondary/text
**And** if contrast fails, a warning is shown: "Contraste insuficiente para WCAG AA"

**Given** the user is on the "Logo" tab
**When** they drag-and-drop or upload a PNG/JPEG file
**Then** a preview is shown
**And** on save, the file is uploaded via `WhiteLabelService.uploadLogo`
**And** the success message shows the new URL

**Given** the user clicks "Guardar" on any tab
**When** the form is submitted
**Then** `WhiteLabelService.updateConfig` is called
**And** a success toast appears: "Branding actualizado correctamente"

**Given** the file is too large (> 2MB) or wrong format
**When** the user tries to upload
**Then** an inline error appears: "Archivo inválido. Máximo 2MB, formato PNG/JPEG/SVG"

### Story 5.4: Add /branding route to admin app and ensure RBAC visibility

As an admin of LeadCars,
I want to see "Marca Blanca" in my sidebar and access `/branding`,
So that I can configure my branding from the admin.

**Acceptance Criteria:**

**Given** the admin app routes (`apps/admin/src/app/app.routes.ts`)
**When** updated
**Then** a new route is added: `{ path: 'branding', loadChildren: () => import('@guiders-frontend/admin/features/white-label').then(m => m.whiteLabelRoutes), canActivate: [adminGuard] }`

**Given** the sidebar items in `apps/admin/src/app/app.ts`
**When** the sidebar renders
**Then** "Marca Blanca" appears in the sidebar ONLY for users with `admin` or `superadmin` role
**And** clicking it navigates to `/branding`

**Given** a user without `admin` role
**When** they navigate manually to `/branding`
**Then** the `adminGuard` redirects them to `/dashboard` (or shows 403)

---

## Epic 6: Role-Based Access Control in Embed

Filter the embed sidebar and routes based on the authenticated user's role, with defense in depth between frontend `EmbedGuard` and backend `RolesGuard`.

### Story 6.1: Refactor sidebarItems to computed signal filtered by roles

As an embed user,
I want the sidebar to show only the sections I have permission to access,
So that I don't see menus I can't use.

**Acceptance Criteria:**

**Given** the current `App` component in `apps/admin/src/app/app.ts:61-132`
**When** the sidebar items are refactored
**Then** they change from `signal<SidebarItem[]>(...)` to `computed<SidebarItem[]>(...)`
**And** the computed signal evaluates `currentUser()?.roles` to filter items

**Given** a user with role `commercial`
**When** the sidebar renders
**Then** it shows: Dashboard, Visitors, Leads (Lista, Sync Records)
**And** it does NOT show: Users, Integrations, AI, Branding, Settings

**Given** a user with role `supervisor`
**When** the sidebar renders
**Then** it shows: Dashboard, Visitors, Leads (Lista, Sync Records), and Assignment Rules (if route exists)
**And** it does NOT show: Users, Integrations, AI, Branding, Settings

**Given** a user with role `admin`
**When** the sidebar renders
**Then** it shows: Dashboard, Users, Integrations (API Keys, Sites), Leads, AI, Branding
**And** it does NOT show: Settings > Profile, Integrations > LeadCars CRM (these are hidden even for admin)

**Given** the sidebar item structure
**When** the data is inspected
**Then** each `SidebarItem` has an `allowedRoles: string[]` field
**And** the filter function checks if any of the user's roles is in `allowedRoles`

### Story 6.2: Implement EmbedGuard for restricted routes

As an embed user,
I want direct URL access to restricted routes to return 403 (not 404),
So that I'm not tempted to access internal areas but also don't get confused by mysterious 404s.

**Acceptance Criteria:**

**Given** the Angular routing for `/embed/*`
**When** routes are configured
**Then** each route has `canActivate: [embedGuard]`

**Given** a user with role `commercial` navigates to `/embed/branding`
**When** the `EmbedGuard` checks
**Then** it detects that `branding` route requires `admin` role (per the route's `data: { requiredRoles: ['admin'] }`)
**And** it redirects to `/embed/error?reason=insufficient_role`
**And** the `/embed/error` page shows: "No tienes permiso para acceder a esta sección" with a "Volver al Dashboard" button

**Given** a user with role `commercial` navigates to `/embed/settings/profile`
**When** the `EmbedGuard` checks
**Then** the route is recognized as restricted in embed mode
**And** it redirects to `/embed/error?reason=restricted_in_embed`
**And** the page shows: "Esta sección no está disponible en modo embebido"

**Given** a user with role `commercial` navigates to `/embed/integrations/leadcars`
**When** the `EmbedGuard` checks
**Then** the route is recognized as restricted in embed mode (LeadCars CRM config is internal to LeadCars)
**And** it redirects to `/embed/error?reason=restricted_in_embed`

### Story 6.3: Implement /embed/error page with retry and accessibility

As an embed user when something goes wrong,
I want a clear error page with a retry button and proper accessibility,
So that I can recover or contact support.

**Acceptance Criteria:**

**Given** the `/embed/error` route is reached with a `?reason=<code>` query param
**When** the error page renders
**Then** it shows a user-friendly error message based on the reason:
- `insufficient_role`: "No tienes permiso para acceder a esta sección"
- `restricted_in_embed`: "Esta sección no está disponible en modo embebido"
- `network_error`: "Error de conexión. Por favor, verifica tu internet"
- `auth_failed`: "No se pudo verificar tu identidad. Por favor, intenta de nuevo"
- `unknown`: "Ha ocurrido un error inesperado"

**And** a "Volver al Dashboard" button is shown (when applicable)
**And** a "Reintentar" button is shown for retryable errors
**And** the page is keyboard-navigable (Tab, Enter, Esc work)
**And** the buttons have `aria-label` descriptive
**And** the page has `role="alert"` for screen readers

---

## Epic 7: Documentation & Onboarding

Provide a concise integration guide for LeadCars developers to integrate the embed in their frontend in less than 5 minutes.

### Story 7.1: Write docs/leadcar/embed-integration.md

As a LeadCars developer,
I want a clear documentation guide at `docs/leadcar/embed-integration.md` with a minimal code example,
So that I can integrate the embed iframe in less than 5 minutes.

**Acceptance Criteria:**

**Given** the docs file
**When** a developer reads it
**Then** it has these sections (in this order):
1. **Overview** (1 paragraph: what Guiders Embed is, who it's for)
2. **Quick Start** (3-5 lines of HTML: `<iframe src="https://app.guiders.es/embed/start?company=...">`)
3. **Authentication handshake** (code example: parent sends `postMessage('leadcars:v1:auth', { token, userId })`, iframe sends `guiders:v1:ready`)
4. **Events** (table of all postMessage events with name, direction, payload schema)
5. **Errors** (table of error codes: `EMBED_TOKEN_EXPIRED`, `EMBED_USER_NOT_IN_TENANT`, etc.)
6. **Limitations** (what the embed does NOT support)
7. **Support** (link to support channel)

**And** the doc is written in English (international audience) with code comments in English
**And** it includes a complete working HTML+JS example that can be copy-pasted

**And** it has a note: "Do not log the embed token in your backend. Tokens are sensitive credentials."

### Story 7.2: Update AGENTS.md of affected contexts

As a future developer reading the codebase,
I want the AGENTS.md files of the `auth`, `white-label`, and `company` contexts to reflect the embed changes,
So that I understand how the embed integrates with each context.

**Acceptance Criteria:**

**Given** `src/context/auth/AGENTS.md`
**When** updated
**Then** it includes a section "Embed Integration" explaining:
- `EmbedTokenService` is a new service in the integration-api-key subdomain
- Tokens are opaque (NOT JWT), stored in Redis with namespace `embed:*`
- New endpoints: `POST /v2/integration/embed/start`, `POST /v2/integration/embed/refresh`, `POST /embed/authenticate-session`
- Reuses `IntegrationApiKeyGuard` for auth

**Given** `src/context/white-label/AGENTS.md`
**When** updated
**Then** it includes a section "Embed Support" explaining:
- The schema now has `embedEnabled` and `embedAllowedOrigins` fields
- These fields are validated by the embed endpoints
- A superadmin can update them via `PATCH /v2/companies/:id/white-label` (extended)

**Given** `src/context/company/AGENTS.md` (if exists)
**When** updated
**Then** it includes a note that `embedAllowedOrigins` is per-company configuration

### Story 7.3: Write e2e Playwright test for the full embed flow

As a QA engineer,
I want an end-to-end test that simulates a LeadCars frontend mounting the iframe and a user authenticating,
So that we can verify the complete flow works before go-live.

**Acceptance Criteria:**

**Given** a Playwright test in `apps/admin-e2e/src/embed/leadcars-embed.spec.ts`
**When** the test runs
**Then** it follows this scenario:
1. Spin up a mock LeadCars parent page (served by nginx in the test setup)
2. The parent page mounts the iframe: `<iframe src="https://app.guiders.es/embed/start?company=leadcars&user=u_123">`
3. The parent listens for `guiders:v1:ready` and responds with `leadcars:v1:auth` containing a real token (obtained via API call to `/v2/integration/embed/start`)
4. Wait for the iframe to navigate to `/embed/dashboard`
5. Assert: the iframe shows the LeadCars logo in the header
6. Assert: the iframe sidebar shows only the items for the user's role
7. Assert: navigating to `/embed/branding` as a commercial user shows `/embed/error`

**And** the test mocks the parent iframe communication (using Playwright's `frameLocator` API)
**And** the test runs in CI as part of the e2e suite
