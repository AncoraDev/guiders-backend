# AGENTS.md - White Label Context

White-label customization for platform white-labeling and branding per company.

**Parent documentation**: [Root AGENTS.md](../../AGENTS.md) | **Related**: [Company](../company/AGENTS.md)

## Context Overview

The White Label context handles:

- Custom branding per company (logos, colors, domain)
- Email template customization
- UI theme customization
- Compliance and legal document management
- Custom domain hosting
- Feature customization per plan
- **Embed configuration for B2B integrators** (iframe + postMessage)

This context enables full white-label deployment of the platform.

## Embed Configuration (B2B Integrators)

Story 1.1 introduced two new fields on `white_label_configs` to support
embedding the Guiders admin console inside a B2B integrator's product
(LeadCars-style integration) via iframe + postMessage.

### Schema Fields

| Field                 | Type        | Default | Description |
|-----------------------|-------------|---------|-------------|
| `embedEnabled`        | `boolean`   | `false` | Per-tenant feature flag. When `false`, the integration-api-key guard rejects embed token issuance for the company. Only Guiders superadmins can toggle. |
| `embedAllowedOrigins` | `string[]`  | `[]`    | Allowlist of origins validated **strictly by exact match** against `event.origin` in the postMessage handshake. Format: `https://host[:port]` (no path, query, fragment, or wildcard). Max 50 entries, 2048 chars each. |

### Business Rules

- **Cross-field validation**: `embedEnabled=true` REQUIRES `embedAllowedOrigins` to have at least one entry. The DTO rejects the request with 400 otherwise. This prevents the inconsistent state where the feature flag is on but no origins are allowed.
- **Strict origin matching**: At runtime, `event.origin` must match exactly one of the strings in `embedAllowedOrigins` (case-sensitive host comparison). DNS normalization, lowercase host, and Punycode/IDN conversion are **out of scope** for this story.
- **Backwards compatibility**: Documents created before this field existed are read with safe defaults (`false` / `[]`) via `??` in the repository mapper. On the next write, the document is patched in place.
- **No wildcard origins**: `*` is explicitly rejected. The use case is per-tenant B2B, not public SaaS.

### Integration Points

- **integration-api-key** (Story 1.2+): the `POST /v2/integration/embed/start` endpoint will read these fields to gate token issuance. If `embedEnabled=false`, the request is rejected with 403.
- **company**: each white-label config is scoped to a `companyId`; multi-tenant isolation enforced by the repository's `findByCompanyId` (no cross-tenant queries).

### Validation Chain

When a superadmin PATCHes `v2/companies/:companyId/white-label`:

1. DTO `class-validator`:
   - `embedEnabled` must be a boolean (rejects `"true"`, `1`, etc.)
   - `embedAllowedOrigins` items must match `/^https:\/\/[^/?#\s]+(:\d+)?$/`
   - `embedAllowedOrigins.length` between 0 and 50
   - Each origin item must be non-empty and ≤ 2048 chars
2. Cross-field: `embedEnabled=true` → at least 1 origin
3. Value object `WhiteLabelConfig.create()` enforces defensive copy of the array
4. Repository `$set` writes to MongoDB with `$setOnInsert` defaults for brand-new docs

### Future Stories

- Story 1.2: `EmbedTokenService` will issue opaque tokens (256-bit base64url) in Redis with namespace `embed:*`
- Story 1.3: `POST /v2/integration/embed/start` reads these fields
- Story 3.x: postMessage handshake in the frontend uses `embedAllowedOrigins` for `event.origin` verification

## Integration Points

| Context          | Purpose                   | Method         |
| ---------------- | ------------------------- | -------------- |
| company          | Company branding settings | Load branding  |
| auth             | Login page theming        | Custom UI      |
| conversations-v2 | Chat widget branding      | Custom styling |

## Testing Strategy

### Unit Tests

```bash
npm run test:unit -- src/context/white-label/**/*.spec.ts
```

### Integration Tests

```bash
npm run test:int -- src/context/white-label/**/*.spec.ts
```

## Related Documentation

- [Company Context](../company/AGENTS.md) - Company settings
- [Root AGENTS.md](../../AGENTS.md) - Architecture overview
