# AGENTS.md - BFF Context

Backend-for-Frontend (BFF) layer for the Guiders backend. Handles
session management, OIDC callbacks, and the embed iframe session
endpoint.

**Parent documentation**: [Root AGENTS.md](../../AGENTS.md) | **Related**: [Auth Context](../AGENTS.md)

## Context Overview

The BFF context is responsible for:

- **OIDC login/refresh/logout flows** for console and admin apps
- **Session cookie management** (HttpOnly, Secure, SameSite=Lax)
- **Embed iframe session establishment** (Story 2.1)

This context is **shared between console and admin apps** and acts as
the trusted intermediary between the browser and the Guiders backend.

## Directory Structure

```
src/context/auth/bff/
├── domain/
│   ├── value-objects/
│   │   └── bff-session-data.ts        # BffSessionData interface, key prefix, TTL
│   ├── services/
│   │   └── bff-session.service.ts     # IBffSessionService interface, BFF_SESSION_SERVICE Symbol
│   └── errors/
│       └── bff-session.errors.ts      # 6 error classes (BffSession*, EmbedBodyTokenMismatch)
├── application/
│   └── commands/
│       ├── authenticate-embed-session.command.ts
│       └── authenticate-embed-session.command-handler.ts
├── infrastructure/
│   ├── controllers/
│   │   ├── bff-auth.controller.ts     # OIDC login/refresh/logout (existing)
│   │   └── embed-session.controller.ts # POST /embed/authenticate-session (Story 2.1)
│   ├── services/
│   │   ├── oidc.service.ts            # OIDC client (existing)
│   │   └── redis-bff-session.service.ts # Redis impl of IBffSessionService
│   ├── cookie-helper.ts               # readCookieEnv() - shared by BFF + embed controllers
│   └── bff.module.ts                  # Module wiring
```

## BFF Session from Embed Token (Story 2.1)

Story 2.1 added `POST /embed/authenticate-session` which converts an
embed token (validated against Redis via `EmbedTokenService.validateToken`)
into a BFF session cookie that the iframe can use for subsequent
authenticated requests.

### Endpoint

```
POST /embed/authenticate-session
Headers:
  Authorization: Bearer <embed-token>     # required (validated by EmbedTokenGuard)
Body (optional):
  userId?: string (UUID v4)              # defense-in-depth: must match token
  companyId?: string (UUID v4)            # defense-in-depth: must match token

Response 200:
  { "sessionEstablished": true, "expiresAt": "2026-06-12T22:32:00.000Z" }
Set-Cookie:
  access_token=<43-char base64url sessionId>
    HttpOnly
    Secure  (per COOKIE_SECURE env var, or NODE_ENV=production)
    SameSite=Lax
    Path=/  (per COOKIE_PATH env var, default '/')
    Max-Age=28800  (8h, mirror of Redis TTL)

Response 401 EMBED_TOKEN_MISSING    # Authorization header missing
Response 401 EMBED_TOKEN_INVALID    # format bad or content corrupted
Response 401 EMBED_TOKEN_EXPIRED    # token not in Redis
Response 403 EMBED_BODY_TOKEN_MISMATCH  # body userId/companyId != token
Response 503 EMBED_SERVICE_UNAVAILABLE   # Redis down
```

### Why cookie name is `access_token` (NOT `embed_session`)

The existing `JwtCookieStrategy` (`auth-user/infrastructure/strategies/jwt-cookie.strategy.ts:38`)
extracts the JWT from the `access_token` cookie. By reusing this name,
we keep the door open for the strategy to accept BOTH JWTs (from
Keycloak) and opaque session IDs (from this service) — which is the
goal of Story 2.6 (out of this epic).

### Redis Schema

| Operation  | Redis Key             | Value                                                       | TTL       |
|------------|-----------------------|-------------------------------------------------------------|-----------|
| `createSession` | `bff:session:<sessionId>` | `{userId, companyId, roles[], createdAt, embedTokenRef, expiresAt}` | `EX 28800` (8h) |
| `getSession`    | `bff:session:<sessionId>` | (read-only)                                                  | —         |
| `revokeSession` | `bff:session:<sessionId>` | —                                                           | —         |

- Key prefix: `bff:session:` (isolated from `embed:token:`, `bff:auth:*`, `visitor:*`)
- Session ID: 256-bit base64url (43 chars), same generator as embed tokens
- `embedTokenRef`: stores the embed token that created the session, for
  traceability and cascading revocation (Story 2.3 logout flow)
- `createdAt`: preserved from the embed token (not refreshed — represents
  the original login time)

### Multi-tenant Isolation

- The session data is keyed by opaque sessionId (not companyId), so
  sessions are globally unique
- `getSession`/`revokeSession` take a sessionId only — multi-tenant
  isolation is implicit (you can only have a sessionId if you have the
  cookie)
- Future Story 2.6 must validate `companyId` from session data against
  the requesting API key (defense-in-depth)

### Module Wiring

```typescript
// src/context/auth/bff/infrastructure/bff.module.ts
@Module({
  imports: [
    HttpModule,
    PassportModule.register({ defaultStrategy: 'jwt-cookie' }),
    // Reuses EMBED_TOKEN_SERVICE + EmbedTokenGuard from IntegrationApiKeyModule
    IntegrationApiKeyModule,
  ],
  controllers: [BffController, EmbedSessionController],
  providers: [
    JwtCookieStrategy,
    JwtCookieAuthGuard,
    OidcService,
    AuthenticateEmbedSessionCommandHandler,
    {
      provide: BFF_SESSION_SERVICE,
      useClass: RedisBffSessionService,
    },
  ],
  exports: [
    JwtCookieAuthGuard,
    OidcService,
    BFF_SESSION_SERVICE,
    AuthenticateEmbedSessionCommandHandler,
  ],
})
export class BFFModule {}
```

The `BFF_SESSION_SERVICE` is exported so Story 2.3 (logout) and Story 2.6
(JWT strategy extension) can inject it.

## Logout Flow (Story 2.3)

Story 2.3 added `POST /bff/auth/logout/embed` which performs **cascading revocation**:
1. Lee la BFF session de Redis (`bff:session:<sessionId>`)
2. Borra la BFF session
3. Borra el embed token padre (`embed:token:<embedTokenRef>`)
4. Emite evento de auditoría (success/failure) al `EmbedTokenAuthenticatedEvent` bus
5. Limpia la cookie `access_token`

### Endpoint

```
POST /bff/auth/logout/embed
Headers:
  Cookie: access_token=<43-char base64url sessionId>  # required

Response 200:
  {
    "loggedOut": true,
    "sessionId": "...",
    "embedTokenRevoked": true | false,
    "cascadingResult": "success" | "partial"
  }

Response 401 EMBED_SESSION_NOT_FOUND  # no cookie or invalid sessionId
Response 503 EMBED_SERVICE_UNAVAILABLE  # Redis down
```

### Cascading Result

| `cascadingResult` | Meaning |
|-------------------|---------|
| `success` | Ambos Redis DELs retornaron 1 (caso normal) |
| `partial` | BFF session borrada, embed token ya no existía (race condition con refresh/revoke previo) — se considera OK pero se registra en audit |
| `not_found` | La BFF session no existía al momento del logout (idempotencia — segunda llamada) — retorna 401 + audit |

### Por qué path `/logout/embed` y no `/logout`

El path `GET /bff/auth/logout` ya existe para OIDC/Keycloak redirect. Story 2.3 usa `POST /bff/auth/logout/embed` porque el iframe hace logout programático (no redirect a Keycloak).

### Idempotencia

Llamar logout N veces es seguro:
- 1ª llamada: borra session + token, retorna 200 con `cascadingResult: 'success'`
- 2ª-ésima llamada: session ya no existe, retorna 401 con audit log entry `EMBED_SESSION_NOT_FOUND`

### Multi-tenant Isolation

La revocación es por-`embedTokenRef`, no por-user. Si el mismo user tiene 2 sesiones embed activas (e.g., 2 navegadores), logout en uno NO afecta al otro.

### Known Limitation (Story 2.6 will fix)

`JwtCookieStrategy` currently tries to verify the session ID (43 base64url
chars) as a JWT against Keycloak JWKS and returns 401. The iframe can
obtain the cookie via this endpoint, but it CANNOT use it against
endpoints protected by `JwtCookieAuthGuard` until Story 2.6 ships. The
expected ship order is:

1. Story 2.1 (THIS STORY) — sets the cookie
2. Story 2.6 — extends `JwtCookieStrategy` to accept BOTH JWTs and
   opaque session IDs (validates against `BFF_SESSION_SERVICE.getSession`)

The LeadCars integration is BLOCKED on Story 2.6 if the iframe needs
to make admin route calls. For pure embed token usage (e.g., to call
`/v2/integration/embed/refresh` from Story 1.4), the iframe still uses
the `Authorization: Bearer <token>` header and is unaffected by this
limitation.

### Testing Strategy

```bash
npm run test:unit -- src/context/auth/bff/**/*.spec.ts
npm run test:e2e -- test/embed-authenticate-session.e2e-spec.ts
```

Unit tests use `InMemoryRedisClient` mock (defined locally in
`redis-bff-session.service.spec.ts`). E2E tests mock
`EmbedTokenGuard`, `IEmbedTokenService`, and `IBffSessionService` —
no real Redis required.

### Out of Scope (deferred to other stories)

- **Story 2.2:** `EmbedTokenAuthenticatedEvent` — audit log of successful
  authentications (MongoDB persistence)
- **Story 2.3:** `revokeSession` is called from the logout flow when the
  parent window signals close
- **Story 2.6:** Extend `JwtCookieStrategy` to accept opaque session IDs
  (the cookie currently cannot be used against Keycloak-protected endpoints)

## Related Documentation

- [Root AGENTS.md](../../AGENTS.md) — Architecture overview
- [Auth Context](../AGENTS.md) — Parent context
- [Integration API Key Context](../integration-api-key/AGENTS.md) — EmbedTokenService, EmbedTokenGuard
- [Shared Context](../../shared/AGENTS.md) — Result pattern, DomainError
- [Embed Architecture](../../../../_bmad-output/planning-artifacts/architecture.md) — NFR-S1 to S4, S10
- [Embed PRD](../../../../_bmad-output/planning-artifacts/prd.md) — FR9 (BFF session from embed token)
- [Story 2.1](../../../../_bmad-output/implementation-artifacts/2-1-implement-post-embed-authenticate-session-to-create-bff-session-from-token.md) — Full implementation spec
