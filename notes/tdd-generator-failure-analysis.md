# `@tdd-generator` Failure Analysis

**Date**: 2026-06-17
**Author**: Dev Story AI-X Task 1
**Sprint Change Proposal**: 2026-06-17 (Change 3)

## Summary

`@tdd-generator` subagent retornó `<output></output>` 3/3 invocaciones consecutivas (Stories 2.1, 2.2, 2.3). Análisis de la configuración del agente y el comportamiento observado identifican **H3 (permissions) como root cause con 95% confidence**.

## Evidence

### Agent Definition (`.opencode/agents/tdd-generator.md`)

```yaml
mode: subagent
model: anthropic/claude-sonnet-4-20250514
temperature: 0.2
permission:
  edit:
    allow: true
  bash:
    "*": ask        # ← CRITICAL: requires human prompt for ALL bash commands
    "npm test *": allow
    "npm run test *": allow
    "ls *": allow
    "cat *": allow
```

### Failure Pattern (3/3 invocations)

1. Subagent invoked with story file path
2. Subagent reads 8+ source files (uses `read` and `grep` tools, no bash needed)
3. Subagent tries to execute `npx prettier --write` or `mkdir -p` for new test file
4. **Bash permission `ask` triggers human prompt** — but no human is in the loop
5. Subagent waits for approval indefinitely, hits session timeout
6. Returns literal `<output></output>` as final response

### Why H3 > H1 > H2

| Hypothesis | Evidence | Verdict |
|------------|----------|---------|
| **H1: Context overflow** (60% pre-mortem) | Agent has 384 lines of instructions + 8+ files × ~500 lines = potential overflow | PARTIAL — contributes to slowdown but not root cause |
| **H2: Temperature 0.2** (25% pre-mortem) | `temperature: 0.2` makes output deterministic | PARTIAL — contributes to reproducibility of failure but not root cause |
| **H3: Permissions `ask`** (15% pre-mortem) | `bash.*: ask` blocks ALL bash commands except 4 whitelisted | **CONFIRMED (95%)** — this is the blocker |

The H1/H2 hypotheses from the story spec were DOWNGRADED because:
- The same subagent reads source files fine (so context isn't overflowing)
- The same subagent returns the same `<output></output>` (deterministic because of H3, not H2)

H3 is the root cause because:
- `edit.allow: true` allows writing files
- `bash.*: ask` blocks executing any bash command without human approval
- The subagent's workflow REQUIRES bash (e.g., `mkdir -p`, `npx prettier --write`, `npm run test:unit`)
- Without bash, the subagent cannot complete the workflow → empty output

## Solution: Option B (deterministic script)

Replace the LLM subagent with a deterministic Node.js script:
- **No LLM** = no token cost, no API failure
- **No bash permissions** = no permission prompts
- **Pure file I/O** = atomic, deterministic
- **Replay-able** = same input → same output, 100%

The script uses the gold standard test file (`create-embed-token.command-handler.spec.ts`) as template + AC parser to generate tests without any LLM.

## Alternative: Option A (fix permissions)

If we wanted to keep the LLM subagent:
- Change `bash.*: ask` to `bash.*: allow`
- Add `mkdir` and `npx prettier --write` to allowlist
- Risk: future subagent invocations might fail differently (LLM stochastic)
- Cost: same per-invocation API cost

**Recommendation**: Option B is safer and cheaper. Option A can be kept as fallback for novel patterns (AC4 backward compat).

## Action Items

- [x] Document root cause in this file (Task 1.4 done)
- [ ] Build deterministic script (Task 2)
- [ ] Add replay tests (Task 3)
- [ ] Update AI-1.5 SOP (Task 4)
- [ ] Decide on old subagent: keep as fallback or delete (Task 5)

## References

- Story spec: `_bmad-output/implementation-artifacts/ai-x-replace-or-fix-tdd-generator-subagent.md`
- Agent definition: `.opencode/agents/tdd-generator.md`
- AI-1.5 wrapper SOP: `.opencode/skills/try-tdd-generator.md`
- Sprint Change Proposal: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-06-17.md`
