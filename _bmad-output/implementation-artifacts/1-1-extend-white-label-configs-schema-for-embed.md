# Story 1.1: Extend white_label_configs schema for embed

Status: done

## Story

As a Guiders backend developer,
I want to add `embedEnabled` and `embedAllowedOrigins` fields to the `white_label_configs` MongoDB schema,
So that the embed feature can be enabled per tenant with a controlled origin allowlist.

## Acceptance Criteria

1. **Given** an existing `white_label_configs` collection in MongoDB
   **When** the schema is updated and the application is deployed
   **Then** new documents can be saved with `embedEnabled: boolean` and `embedAllowedOrigins: string[]` fields
   **And** existing documents default to `embedEnabled: false` and `embedAllowedOrigins: []`
   **And** the value object `WhiteLabelConfig` includes the new fields in `toPrimitives()` and `fromPrimitives()`
   **And** the MongoDB repository mapper correctly serializes/deserializes the new fields

## Tasks / Subtasks

- [x] Task 1: Update `WhiteLabelConfigSchema` (Mongoose) with new fields
  - [x] Subtask 1.1: Add `embedEnabled: { type: Boolean, default: false }`
  - [x] Subtask 1.2: Add `embedAllowedOrigins: { type: [String], default: [] }`
- [x] Task 2: Update `WhiteLabelConfig` value object (domain layer)
  - [x] Subtask 2.1: Add fields to constructor parameters and private readonly properties
  - [x] Subtask 2.2: Add to `WhiteLabelConfigPrimitives` interface
  - [x] Subtask 2.3: Add to `toPrimitives()` output
  - [x] Subtask 2.4: Add to `fromPrimitives()` and `create()` factory methods with defaults
- [x] Task 3: Update `MongoWhiteLabelConfigRepositoryImpl` mapper
  - [x] Subtask 3.1: Add field extraction in `findByCompanyId` with defaults
- [x] Task 4: Update `WhiteLabelConfigController` (PATCH /v2/companies/:id/white-label) to accept new fields
  - [x] Subtask 4.1: Add to `UpdateWhiteLabelConfigDto` if not present
- [x] Task 5: Write unit tests
  - [x] Subtask 5.1: `white-label-config.spec.ts` — verify toPrimitives/fromPrimitives roundtrip includes new fields
  - [x] Subtask 5.2: `mongo-white-label-config.repository.impl.spec.ts` (or int-spec) — verify mapper handles missing fields with defaults

## Dev Notes

### Architecture Patterns to Follow

- **DDD/CQRS:** Repository pattern, value objects, immutable aggregates
- **Result Pattern:** `Promise<Result<T, E>>` in repositories, never throw for business errors
- **Symbol Token DI:** Inject repositories via `@Inject(WHITE_LABEL_CONFIG_REPOSITORY)`, never by class
- **Mappers in Infrastructure:** Never expose ORM entities outside the persistence layer
- **Tests with `Uuid.random().value`:** NEVER fake strings
- **Describe in Spanish:** Convention for test descriptions
- **Apply event via `aggregate.apply()` + `commit()` after save** (not relevant for this story, no events emitted)

### Source Tree Components to Touch

**Modify existing files (no new files in this story):**

- `src/context/white-label/infrastructure/schemas/white-label-config.schema.ts` — Mongoose schema
- `src/context/white-label/domain/entities/white-label-config.ts` — value object
- `src/context/white-label/infrastructure/persistence/mongo-white-label-config.repository.impl.ts` — repository mapper
- `src/context/white-label/application/dtos/white-label-config.dto.ts` — DTO for PATCH endpoint (verify fields are present)
- `src/context/white-label/infrastructure/controllers/white-label-config.controller.ts` — controller (only if DTO needs extension)
- `src/context/white-label/AGENTS.md` — document new fields (NFR-M4)

**Test files (modify or create):**

- `src/context/white-label/domain/entities/__tests__/white-label-config.spec.ts` (verify exists, add tests)
- `src/context/white-label/infrastructure/persistence/mongo-white-label-config.repository.int-spec.ts` (verify exists, add tests for new fields)

### Project Structure Notes

- All changes are extensions of existing components, no new files required
- Schema fields default to safe values (`embedEnabled: false`, `embedAllowedOrigins: []`) to ensure backward compatibility with existing tenants
- This story does NOT add API endpoints (only extends schema and domain)
- Future stories (1.3, 2.2) will read these fields; this story is pure data model foundation

### Testing Standards

- **Unit tests:** SQLite in-memory for value object tests
- **Integration tests:** MongoDB Memory Server for repository tests
- **Test naming:** `<file>.spec.ts` for unit, `<file>.int-spec.ts` for integration
- **Coverage targets:** Default Jest coverage thresholds (project-wide config)
- **Use `Uuid.random().value` for IDs in tests, NEVER hardcoded strings**

## References

- PRD: `_bmad-output/planning-artifacts/prd.md` Section "SaaS B2B Specific Requirements → Tenant Model" — describes `embedEnabled` and `embedAllowedOrigins` schema extensions
- PRD: FR22, FR23 — functional requirements for these fields
- Architecture: `_bmad-output/planning-artifacts/architecture.md` Decision D2 — extends `white_label_configs` with these fields
- Architecture: Decision D4 — NO new tables/collections; reuse existing
- Architecture: Decision A2 — same as PRD
- Project Context: `project-context.md` — DDD/CQRS patterns, Result pattern, Symbol tokens, Uuid.random()
- Existing schema: `src/context/white-label/infrastructure/schemas/white-label-config.schema.ts` — base structure
- Existing value object: `src/context/white-label/domain/entities/white-label-config.ts` — base structure

## Dev Agent Record

### Agent Model Used

MiniMax-M3 (MiniMax Coding Plan)

### Debug Log References

- Ningún error de compilación tras aplicar los cambios
- Test inicial: 5 tests fallaron en RED phase (faltan campos `embedEnabled`, `embedAllowedOrigins`, `embed` en `update()`)
- Tras implementar campos: 7/7 tests PASS en white-label
- Suite completa de unit tests: 192 suites passed, 1638 tests passed, 0 regressions

### Completion Notes List

- **Schema:** añadidos `embedEnabled: boolean (default false)` y `embedAllowedOrigins: string[] (default [])` con defaults seguros para backward compat
- **Value Object:** constructor, `WhiteLabelConfigPrimitives`, `toPrimitives()`, `fromPrimitives()`, `create()` y `createDefault()` actualizados con los nuevos campos
- **Repository:** `findOneAndUpdate` y `findByCompanyId` mapper actualizados para escribir/leer los nuevos campos con defaults (`?? false` y `?? []`)
- **DTO:** `UpdateWhiteLabelConfigDto` y `WhiteLabelConfigResponseDto` actualizados con `@IsBoolean()` y `@IsArray() @IsString({each:true})` validators
- **Controller:** PATCH `/v2/companies/:companyId/white-label` ahora acepta `embedEnabled` y `embedAllowedOrigins`
- **Tests:** 5 nuevos tests del value object + 2 nuevos tests del mapper = 7 tests, todos passing
- **Backward compat:** documentos legacy sin los nuevos campos se mapean con defaults (false / []) sin error
- **Regresión:** 0 regresiones en suite completa de unit tests (1638/1638 passing)

### File List

- `src/context/white-label/domain/entities/white-label-config.ts` (modified)
- `src/context/white-label/domain/entities/__tests__/white-label-config.spec.ts` (new)
- `src/context/white-label/infrastructure/schemas/white-label-config.schema.ts` (modified)
- `src/context/white-label/infrastructure/persistence/mongo-white-label-config.repository.impl.ts` (modified)
- `src/context/white-label/infrastructure/persistence/__tests__/mongo-white-label-config.repository.mapper.spec.ts` (new)
- `src/context/white-label/application/dtos/white-label-config.dto.ts` (modified)
- `src/context/white-label/infrastructure/controllers/white-label-config.controller.ts` (modified)

### Change Log

- 2026-06-12 14:35 — Story implementada con TDD. Story 1.1 completada, status: review.
