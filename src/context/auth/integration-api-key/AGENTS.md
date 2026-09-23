# AGENTS.md - Integration API Key Context

API Key management for **server-to-server** B2B integrations (e.g., LeadCars
backend calling Guiders embed endpoints). Different from `api-key/` (widget,
RSA/JWKS) — this subdomain is for REST/HTTP integrations.

**Parent documentation**: [Root AGENTS.md](../../AGENTS.md) | **Related**: [Auth Context](../AGENTS.md)

## Context Overview

The Integration API Key context handles:

- **API key management** for B2B integrators: create, list, revoke
- **Embed token service** for iframe-based integrations (Story 1.2+)
- Per-tenant API keys (each key belongs to a `companyId`)
- Token format: `gdr_live_<32hex>` / `gdr_test_<32hex>`, SHA-256 hash stored

This context is used by external backends (e.g., LeadCars) to authenticate
HTTP calls to Guiders' embed endpoints. The `IntegrationApiKeyGuard`
validates the `X-Api-Key` header and binds the request to a tenant.

## Embed Token Service (Story 1.2)

The `EmbedTokenService` issues, validates, refreshes, and revokes **opaque
256-bit tokens** for the B2B embed flow. Tokens are NOT JWTs — they are
random bytes stored in Redis with a server-side TTL.

### Key Schema

| Operation | Redis Key | Value | TTL |
|-----------|-----------|-------|-----|
| `createToken` | `SET embed:token:<token>` | `{"userId":"...","companyId":"...","roles":[...],"createdAt":"...","refreshedAt?":"..."}` | `EX 28800` (8h, sliding) |
| `validateToken` | `GET embed:token:<token>` | (JSON string) | — |
| `refreshToken` | `EVAL` Lua script (atomic `GETDEL + SET EX`) | new JSON | new: `EX 28800` |
| `revokeToken` | `DEL embed:token:<token>` | — | — |

### Public API

```typescript
// Injection
constructor(
  @Inject(EMBED_TOKEN_SERVICE) private readonly embedTokens: IEmbedTokenService,
) {}

// Issue token (called by Story 1.3 from POST /v2/integration/embed/start)
const result = await embedTokens.createToken(companyId, userId, roles);
if (result.isOk()) {
  const { token, expiresAt } = result.unwrap();
  // Send to client iframe
}

// Validate (called by Story 1.3 + 2.1 BFF session)
const data = await embedTokens.validateToken(token);
if (data.isOk()) {
  // data.value: { userId, companyId, roles, createdAt, refreshedAt? }
}

// Refresh (called by Story 1.4 from POST /v2/integration/embed/refresh)
const refreshed = await embedTokens.refreshToken(token);

// Revoke (called by Story 2.3 logout flow)
await embedTokens.revokeToken(token);
```

### Error Types

| Error | Cause | HTTP equivalent (caller) |
|-------|-------|--------------------------|
| `EmbedTokenInvalidFormatError` | Token not base64url of 43 chars | 400 Bad Request |
| `EmbedTokenNotFoundError` | Token doesn't exist or expired in Redis | 401 Unauthorized |
| `EmbedTokenCorruptedError` | Stored JSON doesn't match `EmbedTokenData` shape | 500 Internal Server Error (incident) |
| `EmbedTokenError` | Generic: Redis failure, input validation, collision | 500 / 503 |

### Security Properties (NFR-S1 to S4, S10)

- **NFR-S1 (256-bit tokens):** `crypto.randomBytes(32).toString('base64url')`
  → 43 chars, ~256 bits entropy. NOT `Math.random()`, NOT `Date.now()`.
- **NFR-S2 (Namespace):** All keys prefixed with `embed:token:`. Isolated
  from BFF sessions (`bff:*`) and visitor connections (`visitor:*`).
- **NFR-S3 (8h TTL):** Hard-coded `EX 28800` in code. Sliding window —
  refresh resets TTL. User can stay logged in forever by refreshing
  every 7h59m (standard "remember me" pattern).
- **NFR-S4 (No PII in token):** Token = opaque 43 chars. All PII
  (`userId`, `companyId`, `roles`) lives in the Redis value, server-side.
- **NFR-S10 (Redis authenticated):** Reuses existing `REDIS_URL` with
  credentials from env. `socket.connectTimeout: 5000` for resilience.

### Atomic Refresh (F2 from code review)

`refreshToken` uses a Lua script (`EVAL`) for atomicity:

```lua
local oldVal = redis.call('GET', KEYS[1])
if not oldVal then return -1 end  -- not found
local newExists = redis.call('EXISTS', KEYS[2])
if newExists == 1 then return -2 end  -- collision (256-bit: prob ~0)
redis.call('DEL', KEYS[1])
redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[2])
return 1
```

This eliminates the race window where two parallel `refreshToken` calls
on the same `oldToken` would create two orphan new tokens. Either both
succeed atomically, or both fail and the caller retries.

### Input Validation

`createToken`/`refreshToken` validate inputs:
- `companyId`/`userId`: non-empty, ≤ 256 chars
- `roles`: non-empty array, ≤ 64 elements, each string ≤ 256 chars
- JSON value: ≤ 8KB serialized

`validateToken`/`refreshToken`/`revokeToken` reject tokens that don't
match `/^[A-Za-z0-9_-]{43}$/`. Invalid tokens return
`EmbedTokenInvalidFormatError` (NOT `NotFoundError` — caller sent garbage).

### Created vs Refreshed Timestamps

- `createdAt`: **preserved across refreshes** (original session start)
- `refreshedAt`: added on first refresh, updated on subsequent ones

Use `createdAt` for "session age since first login" analytics. Use
`refreshedAt` for "last activity" tracking.

### Multi-tenant Isolation

The `companyId` lives in the Redis value (NOT in the token). This means:
- Tokens are globally unique (no collision risk across tenants)
- `validateToken` returns the `companyId` so callers (Story 1.3) can
  enforce that the API key's `companyId` matches the token's
  `companyId` before trusting it
- Revocation is global (a token cannot be "tenant-scoped" revoked)

### Out of Scope (deferred to other stories)

- **Story 1.3:** HTTP endpoint `POST /v2/integration/embed/start` — uses
  `createToken` after validating API key + tenant isolation
- **Story 1.4:** `POST /v2/integration/embed/refresh` — uses `refreshToken`
- **Story 2.1:** `POST /embed/authenticate-session` — converts token to
  BFF session cookie via `validateToken`. **DONE** — see
  `../bff/AGENTS.md#bff-session-from-embed-token-story-21` for the
  full flow (BFF session is stored in Redis under `bff:session:*` with
  `embedTokenRef` for traceability)
- **Story 2.2:** `EmbedTokenAuthenticatedEvent` emission (audit log) —
  wraps `createToken` calls
- **Story 2.3:** Logout flow calls `revokeToken`
- **Story 2.4:** Rate limiting via `embed:refresh:<userId>` key — not
  this service's concern; called by Story 1.4

## Module Registration

```typescript
@Module({
  providers: [
    {
      provide: EMBED_TOKEN_SERVICE,
      useClass: RedisEmbedTokenService,
    },
    // ... other providers
  ],
  exports: [
    IntegrationApiKeyGuard,
    INTEGRATION_API_KEY_REPOSITORY,
    EMBED_TOKEN_SERVICE, // <-- for Stories 1.3+ to inject
  ],
})
export class IntegrationApiKeyModule {}
```

**Note:** `RedisEmbedTokenService` is NOT exported by class name. Other
modules must use the `EMBED_TOKEN_SERVICE` Symbol with `@Inject()`. This
prevents accidental class-based DI that could create a second instance
with its own Redis connection.

## Testing Strategy

### Unit Tests (with InMemoryRedisClient)

```bash
npm run test:unit -- src/context/auth/integration-api-key/**/*.spec.ts
```

Tests use an `InMemoryRedisClient` mock (in the test file) that simulates
`get`, `set`, `del`, `eval` (with REFRESH_LUA logic), `multi`, `expire`,
`connect`, `quit`. No external Redis dependency.

### Integration Tests (real Redis)

If integration tests are added later, use:
- `redis-memory-server` package (npm) for ephemeral Redis instances
- Verify Lua script compatibility (Redis 6.0+)
- Test connection recovery on `client.on('error')` events

## Related Documentation

- [Root AGENTS.md](../../AGENTS.md) - Architecture overview
- [Auth Context](../AGENTS.md) - Parent auth context
- [Architecture Document](../../../../_bmad-output/planning-artifacts/architecture.md) - NFR-S1 to S4, S10 definitions
- [Embed PRD](../../../../_bmad-output/planning-artifacts/prd.md) - Product requirements
