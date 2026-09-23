---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - /Users/rogerpugaruiz/Proyectos/guiders-backend/_bmad-output/planning-artifacts/prd.md
  - /Users/rogerpugaruiz/Proyectos/guiders-backend/project-context.md
  - /Users/rogerpugaruiz/Proyectos/guiders-backend/_bmad-output/brainstorming/brainstorming-session-2026-06-12-1425.md
workflowType: 'architecture'
project_name: 'guiders-backend'
user_name: 'Rogerpugaruiz'
date: '2026-06-12'
lastStep: 8
status: 'complete'
completedAt: '2026-06-12'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:** 40 FRs distribuidos en 10 capability areas.

Las FRs se agrupan en 5 ejes arquitectónicos principales:

1. **Auth cross-frame** (FR1–FR10, FR28–FR31): 14 FRs que definen el handshake `postMessage`, tokens opacos, refresh silencioso, y lifecycle. Implicación arquitectónica: nuevo mecanismo de auth paralelo al BFF existente, que NO usa cookies cross-domain. Requiere cliente Redis compartido con el BFF y un nuevo módulo de tokens embed.

2. **Branding dinámico** (FR11–FR15, FR33, FR37): 7 FRs que aplican branding por tenant. Implicación: extender `white_label_configs` con 2 campos nuevos (`embedEnabled`, `embedAllowedOrigins`); reusar `WhiteLabelFileUploadService` para S3. El branding se aplica al admin Angular vía CSS variables en HTML wrapper, antes de Angular boot.

3. **RBAC en embed** (FR16–FR20): 5 FRs que filtran el sidebar y restringen rutas. Implicación: refactor de `sidebarItems` en `apps/admin/src/app/app.ts` de hardcoded a `computed()`; nuevo `EmbedGuard` en Angular; verificación de rol ya existente en backend vía `@Roles()` se mantiene como defensa en profundidad.

4. **Multi-tenant isolation** (FR21–FR24): 4 FRs de aislamiento y gating por empresa. Implicación: la validación de `companyId` ya existe en `IntegrationApiKeyGuard`; el embed reusa este patrón. No nuevo modelo de tenant.

5. **Integración con infra existente** (FR32–FR37): 6 FRs que reusan módulos existentes (auth, white-label, company). Implicación: NO crear nuevos módulos ni agregados. Es un feature que extiende lo existente.

4 FRs adicionales de soporte: FR25–FR27 (auditoría) y FR38–FR40 (documentación).

**Non-Functional Requirements:** 32 NFRs en 7 categorías. Los que más impactan arquitectura:

- **NFR-P1 a P6 (Performance):** < 3s iframe load, < 500ms handshake, < 200ms embed/start, < 100ms refresh, < 500ms HTML wrapper. Implicación: cache en memoria del proceso (TTL 60s) para `white_label_configs`; inline CSS en `<head>` del HTML wrapper antes de Angular boot; uso de cache de assets Angular.
- **NFR-S1 a S10 (Security):** tokens opacos 256-bit, origin verification estricta, TTL 8h, validación de companyId en API key, sin elevación de privilegios, assets en S3, retention 12 meses, Redis autenticado, headers de seguridad. Implicación: nuevo `EmbedTokenService` con cliente Redis dedicado; `EmbedAuthenticateHandler` reusa `IntegrationApiKeyGuard`; nuevo `EmbedTokenAuthenticatedEvent` con campos GDPR-compliant.
- **NFR-SC1 a SC4 (Scalability):** 50+ clientes B2B × 100 usuarios. Implicación: namespace en Redis (`embed:*`); cache-aside para `white_label_configs`; negligible footprint en Redis por TTL natural.
- **NFR-A1 a A5 (Accessibility):** WCAG AA en branding, navegación por teclado, `aria-label`, `title` para screen readers. Implicación: validación de contraste en color picker; página `/embed/error` accesible.
- **NFR-I1 a I5 (Integration):** reusar guards, repository, eventos versionados, mismo proceso NestJS, mismos assets Angular. Implicación: bundle Angular compartido entre standalone y embed; contrato `postMessage` con prefijo `v1:`.
- **NFR-R1 a R4 (Reliability):** SLA 99.5%, fallback de branding si MongoDB no responde, retry. Implicación: timeout 1s para MongoDB; branding por defecto en cache; API Key guard loggea cada llamada.
- **NFR-M1 a M5 (Maintainability):** seguir patrones existentes del proyecto. Implicación: DDD/CQRS, Result pattern, Symbol tokens, V2 contexts, UUIDs reales en tests, Jest en español.

**Scale & Complexity:**

- **Primary domain:** web SaaS B2B con iframe cross-frame
- **Complexity level:** medium (brownfield, 12 must-haves MVP, 40 FRs, 32 NFRs)
- **Architectural components:** 2 nuevos servicios backend + 1 nuevo controller + 1 nuevo event + 1 schema MongoDB update + 5 nuevos componentes/guards/services Angular + 1 nuevo feature lib + 1 nuevo shared types lib

### Technical Constraints & Dependencies

**Stack obligatorio (de `project-context.md`):**

- TypeScript ES2021, NestJS v11, MongoDB (Mongoose), Result pattern, CQRS con `@nestjs/cqrs`, eventos con `apply()` + `commit()`, V2 contexts para código nuevo
- Frontend: Angular standalone components, signals, Nx workspace, Jest con `describe` en español
- Inyección de dependencias por `Symbol` token, nunca clase directa
- Tests con `Uuid.random().value`, no strings fake
- Mappers en infrastructure, nunca exponer ORM entities

**Módulos existentes a reusar (sin modificarlos estructuralmente):**

- `auth/integration-api-key` — `IntegrationApiKeyGuard` para validar API Key
- `auth/bff` — `OidcService` para sesiones BFF
- `white-label` — `MongoWhiteLabelConfigRepositoryImpl`, `WhiteLabelFileUploadService`, controller
- `company` — `IUserRepository`, `FindUserByKeycloakIdQuery`
- `user_account_entity` (PostgreSQL) — sin cambios

**Módulos a extender (con cambios menores):**

- `white_label_configs` (MongoDB) — añadir 2 campos
- `IWhiteLabelConfigRepository` — métodos nuevos para `embedEnabled` / `embedAllowedOrigins`
- `WhiteLabelConfig` value object — incluir campos nuevos en primitivos
- `main.ts` — añadir orígenes de CORS
- `apps/admin/src/app/app.ts` — sidebar `computed()`, detección `isEmbedMode`
- `apps/admin/src/app/app.routes.ts` — rutas `/embed/*` y `/branding`

**Dependencias externas:**

- Redis: ya existe (cliente BFF), reusar con namespace `embed:*`
- S3: ya existe (`WhiteLabelFileUploadService`), reusar para branding
- MongoDB: ya existe, reusar
- No nuevas dependencias npm (todo lo necesario está en `@nestjs/cqrs`, Mongoose, Angular core)

### Cross-Cutting Concerns Identified

1. **Multi-tenant isolation** — afecta TODA query embed. Patrón a replicar: validar `companyId` en guard, pasar a repository, filtrar en query. Tests de integración obligatorios.

2. **Token lifecycle** — afecta endpoints embed, refresh, y bootstrap del iframe. Decisión arquitectónica: tokens opacos (NO JWT) por simplicidad y reducción de superficie de ataque.

3. **Origin verification** — afecta el listener de `postMessage` en el iframe. Decisión: rechazo silencioso de orígenes no listados, sin enviar mensaje de error al potential attacker.

4. **Branding application timing** — afecta el HTML wrapper y el bootstrap de Angular. Decisión: inline CSS en `<head>` ANTES de `<script src="...">` para evitar flash de Guiders.

5. **Role-based UI filtering** — afecta sidebar (Angular) y validación de rutas (Angular `EmbedGuard` + backend `RolesGuard` ya existente). Doble defensa.

6. **Audit logging** — afecta `EmbedTokenAuthenticated` event con campos GDPR. Decisión: cada auth emite evento con `companyId`, `userId`, `origin`, `timestamp`, `ipAddress`, `userAgent`.

7. **Cross-domain security** — afecta CORS, CSP `frame-ancestors`, y headers de seguridad en `/embed/start`. Decisión: lista de orígenes por tenant en `embedAllowedOrigins`.

8. **Session refresh transparency** — afecta el flujo de refresh del token. Decisión: `setTimeout` cancelable para no interrumpir operaciones críticas.

### Resumen de complejidad arquitectónica

| Aspecto | Complejidad | Razón |
|---|---|---|
| Multi-tenant | Alta | Validación estricta en TODA capa, sin leaks cross-companyId |
| Auth cross-frame | Alta | Nuevo mecanismo, no es OAuth estándar, requiere origin verification |
| Branding application | Media | Reusa módulo existente, pero requiere inline CSS pre-Angular |
| RBAC filtering | Baja-Media | Patrón ya existe, se extiende a UI (sidebar) + ruta (EmbedGuard) |
| Audit logging | Baja | Reusa patrón de eventos del proyecto |
| Scalability | Media | Redis con namespace, cache en memoria, footprint negligible |
| Accessibility | Baja | WCAG AA ya en standalone, se mantiene en embed |
| Reliability | Baja | Fallback de branding si MongoDB no responde, retry exponencial en cliente |
| Maintainability | Baja | Sigue patrones existentes |
