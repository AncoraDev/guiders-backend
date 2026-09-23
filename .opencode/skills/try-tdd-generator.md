---
name: try-tdd-generator
description: Wrapper SOP for the @tdd-generator subagent with automatic fallback to manual test writing. Use this whenever you need to invoke @tdd-generator for a new story.
---

# try-tdd-generator — SOP for TDD RED phase

## Why this skill exists

> **Updated 2026-06-17 (Story AI-X)**: `@tdd-generator` subagent failure root cause confirmed at 95% confidence (H3 hypothesis — `bash.*: ask` permissions block the subagent from executing required commands). Story AI-X introduced a **deterministic script** as Pattern 0 that fully replaces the LLM subagent for known patterns. The LLM subagent is now kept only as a **fallback** (Pattern A) for novel patterns.

The fallback chain is:

- **Pattern 0 (NEW DEFAULT)**: `npm run generate:red-tests` — deterministic script, no LLM, no API cost, 100% reliable
- **Pattern A (fallback)**: `@tdd-generator` subagent — kept for novel patterns, but unreliable (3/3 invocations failed in Stories 2.1/2.2/2.3)
- **Pattern B/C/D (last resort)**: Manual test writing — only when Patterns 0 and A both fail

## When to use

ANY time you need failing tests for a new story. This is the **only** sanctioned entry point for TDD RED phase in this project.

## How to use (4 steps)

### Step 1: Try deterministic script (Pattern 0 — NEW DEFAULT)

```bash
npm run generate:red-tests -- _bmad-output/implementation-artifacts/<story-key>.md
```

**Expected output**: A test file is generated in `__tests__/` next to the source + a summary line:

```
✅ Generated test file: src/context/.../__tests__/<name>.spec.ts
   Pattern: CommandHandler
   ACs covered: 5/5
   AI-2 spec citations preserved: 3/5
```

**Supported patterns**: `CommandHandler`, `QueryHandler`, `EventHandler`, `Controller` (e2e).

If the story uses a different pattern (e.g., a Repository, a Service, a domain logic class) → proceed to **Step 2 (fallback to LLM subagent)**.

### Step 2: Verify RED phase (deterministic script output)

```bash
npm run test:unit -- <generated-spec-file-path>
```

**Expected output**: Tests FAIL (RED phase confirmed). The generated tests have `expect(true).toBe(false)` placeholders + TODO comments that force RED.

If tests PASS → something is wrong. Verify:
- The test file was generated correctly (check `__tests__/`)
- The source file exists at the path extracted by the script
- The pattern detection matched correctly (check the script output)

### Step 3: Fallback to LLM subagent (Pattern A — for novel patterns)

If Pattern 0 doesn't apply (story uses a non-standard pattern), call `@tdd-generator` with the story spec. Use `task` tool with:

```
subagent_type: "tdd-generator"
prompt: |
  <story context>
  <reference to .opencode/agents/tdd-generator.md for the full prompt structure>
```

**Expected output**: A list of `Files created (absolute paths)` followed by test counts per file, ending with a self-score.

### Step 4: Detect failure (LLM subagent)

Inspect the subagent's `task_result` for these **failure signals** (any one triggers fallback):

| Signal | Detection |
|--------|-----------|
| Empty output | `result === ''` or `result === null` or `result === undefined` |
| Empty tags | `result.trim() === '<output></output>'` |
| Missing files | The output does NOT list "Files created" or list them with 0 files |
| No test counts | The output does NOT mention "Test counts per file" or "X tests" |
| Self-score < 8 | The output mentions "score < 8" or "concerns" without files |
| No failure output | Running `npm run test:unit -- <path>` does NOT show failing tests (passes instead) |

If ANY of these signals is present, **immediately proceed to Step 5 (manual fallback)**. Do NOT retry the subagent — retrying has been observed to fail 3/3 times.

### Step 5: Manual fallback (Pattern B/C/D — last resort)

The dev agent (you, the main agent) writes the tests manually.

### Step 3: Fallback (manual test writing)

The dev agent (you, the main agent) writes the tests manually, following this **validated pattern** from Story 1.3, 2.1, and 2.2.

#### Pattern A: Unit test for a service with mocked dependencies

```typescript
// Path: src/context/<context>/<layer>/__tests__/<name>.spec.ts

import { ServiceUnderTest } from '../<name>';
import { Dependency } from '<path-to-dep>';
import { DEPENDENCY_SYMBOL } from '<path-to-symbol>';
import { ok, err } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

// CRITICAL (AI-3 from Story 2.1 retro): never use `instanceof BaseError`
// for error assertions. Use specific message or subclass.
class TestDomainError extends DomainError {
  constructor() {
    super('Test failure');
  }
}

describe('ServiceUnderTest - Story X.Y (unit)', () => {
  let service: ServiceUnderTest;
  let mockDep: jest.Mocked<Dependency>;

  beforeEach(() => {
    mockDep = {
      method1: jest.fn(),
      method2: jest.fn(),
    } as unknown as jest.Mocked<Dependency>;

    service = new ServiceUnderTest(mockDep);
  });

  describe('happy path', () => {
    it('debe retornar ok con resultado esperado', async () => {
      mockDep.method1.mockResolvedValue(ok({ data: 'test' }));

      const result = await service.doSomething();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual({ data: 'test' });
      }
    });
  });

  describe('error path', () => {
    it('debe retornar err con mensaje específico', async () => {
      mockDep.method1.mockResolvedValue(err(new TestDomainError()));

      const result = await service.doSomething();

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        // AI-3: specific message assertion
        expect(result.error.message).toContain('Test failure');
      }
    });
  });
});
```

#### Pattern B: E2E test (controller + guards + handlers)

```typescript
// Path: test/<name>.e2e-spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import * as request from 'supertest';
import { Controller } from '../src/context/...';
import { Handler } from '../src/context/...';
import { Guard, Request } from '../src/context/...';

// Mocks declared as `const` with jest.fn() (NOT reasignados in buildApp)
// Lesson from Story 2.1/2.2: `let` mocks lose reference after reassignment
const mockDep: jest.Mocked<Dependency> = {
  method: jest.fn(),
} as unknown as jest.Mocked<Dependency>;

class MockGuard {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    req.<auth_field> = { /* ... */ };
    return true;
  }
}

class RejectingGuard {
  canActivate(): boolean {
    throw new UnauthorizedException('Auth required');
  }
}

describe('POST /path - Story X.Y (e2e)', () => {
  let app: INestApplication;

  // CRITICAL (Story 1.3 + 2.1 pattern): buildApp BEFORE mockResolvedValue
  async function buildApp(guard: typeof MockGuard | typeof RejectingGuard, args: string[] = []): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      imports: [CqrsModule],
      controllers: [Controller],
      providers: [
        Handler,
        { provide: DEPENDENCY_SYMBOL, useValue: mockDep },
      ],
    })
      .overrideGuard(Guard)
      .useValue(args.length === 0 ? new RejectingGuard() : new MockGuard(args[0]))
      .compile();

    const testApp = moduleRef.createNestApplication();
    testApp.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await testApp.init();
    return testApp;
  }

  afterEach(async () => {
    jest.clearAllMocks();
    if (app) await app.close();
  });

  it('happy path', async () => {
    mockDep.method.mockResolvedValue(ok({}));  // SETUP mock BEFORE buildApp
    app = await buildApp(MockGuard, [SOME_VALUE]);

    const res = await request(app.getHttpServer())
      .post('/path')
      .send({ ... })
      .expect(200);

    expect(res.body).toEqual({ ... });
  });
});
```

#### Pattern C: InMemoryRedisClient (for Redis-backed services)

```typescript
class InMemoryRedisClient {
  public store = new Map<string, string>();
  public setLog: string[] = [];

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.store.get(key) ?? null);
  }

  set(key: string, value: string, options?: { EX?: number }): Promise<'OK' | null> {
    this.store.set(key, value);
    if (options?.EX !== undefined) {
      this.store.set(`${key}:__ttl`, String(options.EX));
    }
    return Promise.resolve('OK');
  }

  del(key: string): Promise<number> {
    const had = this.store.delete(key) ? 1 : 0;
    return Promise.resolve(had);
  }

  quit(): Promise<'OK'> {
    return Promise.resolve('OK');
  }
}
```

#### Pattern D: For InMemoryRedisClient with Lua (REFRESH_LUA atomic), see Story 1.2 `redis-embed-token.service.spec.ts`

### Step 4: Verify RED

After writing the tests:

1. Run the new test file: `npx jest --config ./jest-unit.json <path>`
2. Confirm it FAILS (RED): "Test Suites: 1 failed, 1 total" with the import error or missing module error
3. If tests PASS (GREEN accidentally), the test is wrong — fix the assertions until they fail for the right reason

### Step 5: Commit

```bash
git add <files>
git commit -m "test(<context>): Story X.Y — failing tests (RED phase)

Generated by try-tdd-generator fallback (subagent returned empty output).

Validates:
- AC1: <description>
- AC2: <description>
- ...

<count> unit tests in <suite1>
<count> e2e tests in <suite2>

Refs: <story spec path>"
```

## When to FIX the subagent instead of falling back

If `@tdd-generator` consistently fails (3+ consecutive stories), open a code review on `.opencode/agents/tdd-generator.md` and check:
- Is the prompt structure current?
- Is the model field still valid (anthropic/claude-sonnet-4-20250514)?
- Is the temperature (0.2) too low/high?
- Are the bash permissions too restrictive?

The expected solution is a **better subagent prompt**, not a permanent fallback.

## Reference: Story 2.2 fallout

- Story 2.1 first invocation: `<output></output>` (empty)
- Story 2.2 first invocation: `<output></output>` (empty)
- Story 2.2 second invocation (more specific prompt): `<output></output>` (empty)
- Both fell back to manual test writing
- Cost: ~30 min per story for manual fallback
- This skill consolidates the fallback pattern to reduce cost going forward

## Related

- Story 2.1 mini-retro: AI-1 action item (this skill is AI-1.5 — improved version)
- Story 2.2 mini-retro: confirms AI-1 priority
- `.opencode/agents/tdd-generator.md`: the subagent definition
- AGENTS.md section "TDD Strategy" + "Subagents Disponibles" (must be updated to reference this skill)

---

## Step 6: Spec citation check (AI-2) — for acceptance auditors

**When this applies**: NOT just for `@tdd-generator` — **also for any subagent that audits acceptance criteria** (e.g., a `code-review` PASS 3 layer, a custom `acceptance-auditor` agent, or a human reviewer following a review skill). The PR #111 review (2026-06-16) revealed that an acceptance auditor subagent **invented 3 ACs that did not exist** in the real spec, generating 3 false-positive issues (#112, #113, #114) that nearly blocked a merge unnecessarily.

### The rule

**Every AC in an audit report MUST include a literal spec citation** between quotes (`> "..."` or `**Spec quote**: "..."`).

| Situation | Correct action |
|-----------|----------------|
| AC matches spec + implementation matches spec | ✅ AUDIT PASS |
| AC matches spec + implementation DIFFERS from spec | 🐛 **REAL BUG** — quote the exact spec line that is violated |
| AC NOT in spec | ✨ **ENHANCEMENT**, not a bug — report in a separate "Enhancements (not bugs)" section, do NOT file as blocking issue |
| Auditor inverts AC without citation | ❌ **Anti-pattern** — reject the report, ask for reformulation |

**Prohibited**: inferring ACs from "best practices", "what should be", or "standard security". If the AC is not in the spec, it is an enhancement, period.

### Heuristic: `detectSpecCitationGap()`

To automate this check, the SOP defines a function (documented here, tested in `src/context/shared/dev-tools/try-tdd-generator/__tests__/try-tdd-generator.sop.spec.ts`):

```typescript
interface AuditReport {
  report: string;     // The auditor's output
  specAC: string[];   // The list of AC identifiers from the real spec (e.g. ["AC1", "AC2", "AC3"])
}

interface CitationGap {
  isGap: boolean;
  reasons: string[];
  uncitedACs: string[];     // ACs mentioned but without spec quote
  inventedACs: string[];    // ACs in report but NOT in spec
}

function detectSpecCitationGap(input: AuditReport): CitationGap {
  const reasons: string[] = [];
  const uncitedACs: string[] = [];
  const inventedACs: string[] = [];

  // 1. Find all AC identifiers in the report (e.g. "AC1", "AC3", "Story 1.3 AC5")
  const acPattern = /\b(?:Story\s+\d+\.\d+\s+)?AC\s*#?\s*(\d+)\b/gi;
  const mentionedACs = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = acPattern.exec(input.report)) !== null) {
    mentionedACs.add(`AC${match[1]}`);
  }

  // 2. For each mentioned AC, verify it has a spec citation nearby
  //    Citation patterns: > "..." (blockquote) OR **Spec**: "..." OR **Quote**: "..."
  for (const ac of mentionedACs) {
    const acRegex = new RegExp(`${ac.replace('AC', 'AC\\s*#?\\s*')}[^\\n]{0,500}`, 'i');
    const acSection = input.report.match(acRegex)?.[0] ?? '';
    const hasCitation = />\s*["']/.test(acSection) || /\*\*Spec[^:]*:\s*["']/.test(acSection) || /\*\*Quote\*\*:/.test(acSection);
    if (!hasCitation) {
      uncitedACs.push(ac);
      reasons.push(`${ac} mentioned without spec quote`);
    }
  }

  // 3. Check for ACs mentioned but NOT in the real spec
  for (const ac of mentionedACs) {
    if (!input.specAC.map(s => s.toUpperCase()).includes(ac.toUpperCase())) {
      inventedACs.push(ac);
      reasons.push(`${ac} is mentioned but NOT in the real spec — likely an enhancement, not a bug`);
    }
  }

  // 4. Detect "best practice" markers (heuristic for inferred ACs)
  const bestPracticeMarkers = [
    /should (also )?(validate|check|ensure)/i,
    /must (also )?(validate|check|ensure)/i,
    /security best practice/i,
    /standard (security|validation)/i,
  ];
  for (const marker of bestPracticeMarkers) {
    if (marker.test(input.report)) {
      reasons.push(`Report contains "best practice" marker (${marker.source}) — likely an inferred AC`);
    }
  }

  return {
    isGap: reasons.length > 0,
    reasons,
    uncitedACs,
    inventedACs,
  };
}
```

**Usage in the dev agent (main)**:

```typescript
import type { detectSpecCitationGap } from 'src/context/shared/dev-tools/try-tdd-generator/heuristics';

const auditorReport = `<subagent task_result>`;
const specACs = ['AC1', 'AC2', 'AC3', 'AC4', 'AC5']; // From the real spec

const gap = detectSpecCitationGap({ report: auditorReport, specAC: specACs });

if (gap.isGap) {
  console.warn('[AI-2] Audit report has citation gaps:');
  console.warn('  Uncited ACs:', gap.uncitedACs);
  console.warn('  Invented ACs:', gap.inventedACs);
  console.warn('  Reasons:', gap.reasons);
  // DO NOT trust the report — verify each AC against the spec manually
  // Or, for PASS 3 layer: re-validate each AC against _bmad-output/planning-artifacts/epics.md
}
```

### Example: false positive from PR #111 PASS 3

**Subagent reported** (FALSE):
> Story 1.3 AC5: Validates origin is in `embedAllowedOrigins`
> Story 1.3 AC3 / 1.4 AC3: response includes `refreshAfter` / `refreshedAt`
> Story 1.4 AC2/AC8: cross-check header-vs-body

**Real spec** (`_bmad-output/planning-artifacts/epics.md`):
- Story 1.3: AC1 (200 response shape), AC2 (embedEnabled=false), AC3 (userId not in company), AC4 (invalid API key), AC5 (companyId mismatch)
- Story 1.4: AC1 (200 response shape), AC2 (expired token), AC3 (different user)

`detectSpecCitationGap()` would flag:
- `Story 1.3 AC5` — EXISTS in spec, but the meaning is "companyId mismatch", not "validates origin" → invented meaning
- `Story 1.3 AC3 / 1.4 AC3: refreshAfter / refreshedAt` — AC3 EXISTS but its spec text is `{ token, expiresAt }`, not `refreshAfter` → invented field
- `Story 1.4 AC2/AC8` — AC2 EXISTS but it's about expired tokens, not body token mismatch; AC8 does NOT EXIST → invented entirely

### How to add to a code-review skill (if used in the future)

```yaml
# .opencode/skills/code-review/SKILL.md (hypothetical)

After PASS 3 (Acceptance Auditor) layer:
  1. Get the auditor's task_result
  2. Get the list of real ACs from the story spec
  3. Run `detectSpecCitationGap({ report, specAC: <real ACs> })`
  4. If `gap.isGap === true`:
     a. Reject the report and ask the auditor to cite the spec literally
     b. If auditor refuses, re-audit manually
  5. Only accept the report if all ACs have spec quotes AND match the real spec
```

### Reference

- AGENTS.md section AI-2: "Acceptance Auditors deben citar el spec text exacto"
- PR #111 review (2026-06-16): 3 false-positive issues (#112, #113, #114) closed
- 18 tests for `detectSubagentFailure()` + new tests for `detectSpecCitationGap()` in
  `src/context/shared/dev-tools/try-tdd-generator/__tests__/try-tdd-generator.sop.spec.ts`
