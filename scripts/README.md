# Scripts

Utility scripts for the Guiders Backend project.

## `generate-red-tests.ts`

**Purpose**: Deterministically generate RED phase test files from story specs.

**Why**: Replaces the unreliable `@tdd-generator` LLM subagent (which returned empty output 3/3 times in Stories 2.1, 2.2, 2.3 due to `bash.*: ask` permission issues). See `notes/tdd-generator-failure-analysis.md` for root cause analysis.

**Usage**:

```bash
# Generate test file for a story
npm run generate:red-tests -- _bmad-output/implementation-artifacts/2-1-implement-post-embed-authenticate-session.md

# Overwrite existing test file
npm run generate:red-tests -- <story-file> --force

# Run the generator's own tests
npm run generate:red-tests:tests

# Show help
npm run generate:red-tests -- --help
```

**Output**:

```
✅ Generated test file: src/context/.../__tests__/<name>.spec.ts
   Pattern: CommandHandler
   ACs covered: 5/5
   AI-2 spec citations preserved: 3/5
```

**Supported patterns**:

| Pattern | Detection | Output template |
|---------|-----------|-----------------|
| `CommandHandler` | Story mentions `CommandHandler` or `@CommandHandler` | Standard unit test (mocks repo, tests happy/error path) |
| `QueryHandler` | Story mentions `QueryHandler` or `@QueryHandler` | Read-only test (mocks repo, tests ok/err) |
| `EventHandler` | Story mentions `EventHandler` or `@EventsHandler` | Event persistence test (mocks repo, asserts save called) |
| `Controller` | Story mentions `Controller` or `@Controller` | E2E test (mocks guards, uses supertest) |

Default pattern: `CommandHandler` (most common in this project).

**Adding a new pattern**:

1. Add the pattern name to `Story['pattern']` type union in `generate-red-tests.ts`
2. Add detection logic in `detectPattern()`
3. Add a template function (e.g., `generateRepositoryTest()`)
4. Add a test case in `scripts/__tests__/generate-red-tests.spec.ts`
5. Update this README

**AI-2 spec citation preservation**:

When an AC has a `> "..."` citation in the story, the generator preserves it in the test file header as a comment. This allows future acceptance auditors to find the spec citation by greping the test file.

Example:

```markdown
### AC1: Validación de origin
> "The system must validate the origin is in embedAllowedOrigins"
```

Generates:

```typescript
/**
 * AI-2 spec citations (citas literales del spec):
 *   - AC1: "The system must validate the origin is in embedAllowedOrigins"
 */
```

**Debugging failures**:

If the generator fails:

1. Check the story file has at least one `### AC{N}: {title}` line
2. Check the story has a line matching `src/context/.../*.ts` in the Tasks section (used to derive source file path)
3. Check the pattern detector matches: `npm run generate:red-tests -- <story-file>` will print the detected pattern
4. Use `--force` to overwrite an existing test file if you want to regenerate

**Limitations**:

- The generator creates **placeholder** test bodies (with `expect(true).toBe(false)` to force RED). The dev agent must **replace the placeholders** with real assertions during GREEN phase.
- For complex ACs (e.g., multi-step workflows, async coordination), the generator may not produce a complete test. Use Pattern A (LLM subagent) or manual writing.
- The generator does NOT validate the implementation. It's a starting point, not a complete test suite.

## Other scripts

See `scripts/` directory for other utility scripts (API doc generation, OpenAPI generation, validation, etc.).
