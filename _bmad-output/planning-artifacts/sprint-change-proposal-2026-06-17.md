# Sprint Change Proposal — Epic 2 retrospective findings applied to Epic 3-7

**Fecha**: 2026-06-17
**Trigger**: Epic 2 partial retrospective (`epic-2-retro-2026-06-17.md`)
**Status**: draft → pending user approval
**Scope**: **Moderate** (backlog reorganization needed)
**Handoff**: Product Owner + Developer agents

---

## 1. Issue Summary

Durante Epic 2 (Embed Session Lifecycle & Audit, 3/5 stories done), el equipo descubrió **8 lecciones sistémicas** que afectan Epic 3-7. Algunas requieren cambios estructurales (Epic 6 sin Story 2.6), otras son safeguards operacionales (AI-1.5, AI-2, AI-3, AI-4). Sin aplicar estas lecciones ahora, Epic 3-7 va a repetir los mismos problemas:

**Problemas confirmados durante Epic 2**:
1. `@tdd-generator` subagent retornó `<output></output>` 3/3 invocaciones (Stories 2.1, 2.2, 2.3)
2. PR #111 PASS 3 inventó 3 ACs que NO existían en el spec → 3 issues falsas cerradas
3. PR #115 PASS 1+2+3 encontraron 6 critical bugs + 1 hotfix que tests no detectaron
4. Tech debt se acumuló a 7 items (4 stories × ~2 items/story)
5. Story 2.6 (JWT strategy extension) está fuera de scope pero bloquea Epic 6

**Evidencia concreta**:
- PR #111: https://github.com/RogerPugaRuiz/guiders-backend/pull/111
- PR #115: https://github.com/RogerPugaRuiz/guiders-backend/pull/115
- Stories merged: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3 (7 stories)
- AI safeguards implementados: AI-1.5 (`try-tdd-generator`), AI-2 (spec citation), AI-4 (`extractAuditContext`)
- 4 subagent reviews ejecutados (PASS 1/2/3 + re-review)
- AI-3 aplicado consistentemente (assertions específicas, nunca `instanceof BaseError`)

---

## 2. Impact Analysis

### Epic Impact

| Epic | Original Scope | Lecciones aplicables | Cambios requeridos |
|------|----------------|---------------------|---------------------|
| **Epic 3** Cross-Frame postMessage | 3 stories (3.1-3.3) | L1 (subagent unreliable), L2 (spec citation), L3 (service-level tests), L6 (audit context helper) | Stories nuevos deben usar `extractAuditContext`, `tryPublish`. AI-1.5 wrapper activado desde el inicio |
| **Epic 4** Branding Application | 3 stories (4.1-4.3) | L6 (audit context) | Frontend only — usar helper si hay audit log de admin actions |
| **Epic 5** Branding Self-Service UI | 4 stories (5.1-5.4) | L1, L2 | Mismas safeguards que Epic 3 |
| **Epic 6** RBAC in Embed | 3 stories (6.1-6.3) | **L8 (Story 2.6 blocker)** + L1-L6 | ⚠️ **Bloqueado por Story 2.6**. Sin esa story, Story 6.3 (embed-error page) no funciona |
| **Epic 7** Documentation | 3 stories (7.1-7.3) | L8 (technical debt) | Story 7.2 (update AGENTS.md) debe documentar AI safeguards + audit log patterns aprendidos |

### Story Impact

**Stories que necesitan modificación**:

| Story | Cambio | Prioridad |
|-------|--------|-----------|
| **Story 2.6** (no existe formalmente) | **Crear**: `2-6-extend-jwtcookie-strategy-to-accept-opaque-session-ids` | CRITICAL — bloqueante para Epic 6 |
| **Story 2.4** (transparent refresh) | Mantener backlog. Marcar como "LeadCars polish, not MVP blocker" | LOW |
| **Story 2.5** (network loss recovery) | Mantener backlog. Marcar como "LeadCars polish, not MVP blocker" | LOW |
| **Story 7.2** (update AGENTS.md) | Expandir scope: documentar AI-1.5/AI-2/AI-3/AI-4 patterns + tryPublish helper + cascadeRevoke Lua pattern + extractAuditContext helper | MEDIUM |

**Stories nuevas a crear**:

| Story | Propósito | Epic destino |
|-------|-----------|--------------|
| `2-6-extend-jwtcookie-strategy-to-accept-opaque-session-ids` | Resuelve blocker de Epic 6 | Pre-Epic 6 (renumerar como 6.0) |
| `ai-x-replace-or-fix-tdd-generator-subagent` | Resuelve L1 — el subagente sigue roto | Pre-Epic 3 |
| `ai-y-extract-spec-citation-to-linter` | Previene ACs inventadas en reviews futuros | Pre-Epic 3 (low priority, AI-2 ya funciona) |

### Artifact Conflicts

| Artifact | Conflicto | Resolución |
|----------|-----------|------------|
| PRD | No conflicto | OK |
| Architecture | No conflicto estructural. Las decisiones documentadas (cascadeRevoke Lua, tryPublish, Symbol DI) son consistentes con Epic 2 implementation | OK |
| Epics | Story 2.6 debe renumerarse a Story 6.0 (pre-Epic 6) para claridad de dependencias | Mover |
| Sprint status | Story 2.4/2.5 deben marcarse explícitamente como "deferred to post-MVP" | Marcar en status |
| AGENTS.md (raíz) | Debe documentar las 4 AI safeguards como section crítica | Story 7.2 ampliada |

### Technical Impact

- **Bajo**: AI safeguards ya están implementados y commiteados. Epic 3-7 puede empezar inmediatamente usándolas.
- **Medio**: Story 2.6 (JWT strategy) requiere refactor del `JwtCookieStrategy` existente (en `auth-user/infrastructure/strategies/jwt-cookie.strategy.ts`). No hay rewrite completo, solo extensión.
- **Alto (mitigado)**: `@tdd-generator` sigue roto (3/3 invocaciones vacías). Wrapper AI-1.5 mitiga pero consume tiempo. Story AI-X propuesta.

---

## 3. Recommended Approach

**Opción seleccionada: Híbrido (Direct Adjustment + PRD MVP Review parcial)**

**Razones**:
1. **Direct Adjustment** para AI safeguards (ya implementados): Epic 3+ los aplica desde el inicio
2. **Direct Adjustment** para Story 2.6 → renumerar a 6.0: resueve el blocker de Epic 6 sin reestructurar el plan
3. **PRD MVP Review** para Stories 2.4/2.5: marcar como "post-MVP polish" en sprint-status
4. **Nueva story AI-X**: address el subagente roto. Sin esta story, cada Epic requerirá fallback manual (costo: ~30 min/story × 10 stories = 5h perdida)

**Effort estimate**:
- Story 6.0 (JWT strategy extension): ~2-3h (refactor + tests)
- Story AI-X (tdd-generator fix): ~2-4h (debug + re-prompt + iteration)
- Story 7.2 expanded (AGENTS.md updates): ~30 min
- Stories 2.4/2.5 status update: ~5 min

**Total effort**: ~5-8h spread across pre-Epic 3

**Risk assessment**: LOW
- AI safeguards: ya probados en producción (Epic 2)
- Story 6.0: refactor localizado, no afecta otros endpoints
- Story AI-X: low-risk (puede fallar sin bloquear el sprint)

**Timeline impact**:
- Epic 3 puede empezar DESPUÉS de Story 6.0 + Story AI-X
- Epic 3-5 independientes — pueden empezar en paralelo
- Epic 6 depende de Story 6.0 (no en paralelo)

---

## 4. Detailed Change Proposals

### Change 1: Sprint Status — Marcar Stories 2.4/2.5 como "post-MVP"

**Archivo**: `_bmad-output/implementation-artifacts/sprint-status.yaml`

**OLD**:
```yaml
  2-4-implement-transparent-token-refresh-in-the-iframe: backlog
  2-5-implement-network-loss-detection-and-recovery-ui: backlog
```

**NEW**:
```yaml
  # Epic 2.4 + 2.5 deferred to post-MVP "LeadCars polish" release.
  # These are UX completeness features (not security/correctness blockers).
  # MVP can ship with 8h hard session expiry + no explicit network-loss UI.
  2-4-implement-transparent-token-refresh-in-the-iframe: deferred-post-mvp
  2-5-implement-network-loss-detection-and-recovery-ui: deferred-post-mvp
```

**Rationale**: Stories 2.4 (transparent refresh) y 2.5 (network loss recovery) son UX completeness pero NO bloqueantes para LeadCars demo. El MVP funciona con session expiry de 8h (TTL Redis) y pérdida de conexión → re-auth manual.

---

### Change 2: Renumerar Story 2.6 → Story 6.0 (pre-Epic 6)

**Archivo**: `_bmad-output/implementation-artifacts/sprint-status.yaml`

**NEW** (Story 6.0 antes de Epic 6):
```yaml
  # Story 6.0 (renumerada de Story 2.6 fuera-de-scope) — JWT strategy extension
  # CRÍTICA: bloqueante para Epic 6 RBAC. Sin esto, el iframe no puede
  # usar la cookie contra endpoints Keycloak-protected.
  6-0-extend-jwtcookie-strategy-to-accept-opaque-session-ids: backlog
```

**Spec outline**:
- Modificar `JwtCookieStrategy` para que:
  - Si el cookie es un JWT válido → comportamiento actual (Keycloak)
  - Si el cookie es un session ID opaco (43 chars base64url) → lookup en Redis via `BFF_SESSION_SERVICE`, validar TTL, construir req.user
- Mantener backward compatibility (no breaking change para usuarios existentes)
- Tests: 8 unit tests + 4 e2e tests (incluyendo sesión expirada, formato inválido, session válida con user/companyId/roles correctos)

**Rationale**: Epic 6 RBAC depende de que el iframe pueda usar la cookie `access_token` contra endpoints `JwtCookieAuthGuard`. Sin esta extensión, Story 6.3 (embed-error page) no puede implementarse.

---

### Change 3: Crear Story AI-X (replace or fix `@tdd-generator`)

**NEW Story**: `ai-x-replace-or-fix-tdd-generator-subagent`

**Spec outline**:
- Investigar por qué `@tdd-generator` retorna `<output></output>` 3/3 veces
- Opciones:
  - **Opción A**: Re-prompt el subagente con mejores instrucciones + examples
  - **Opción B**: Reemplazar con un script determinístico (TS o Bash) que genere tests siguiendo Pattern A/B/C
  - **Opción C**: Eliminar el subagente y confiar en el dev agent (manual tests siempre)
- Acceptance criteria:
  - El nuevo approach genera tests válidos para 3 stories consecutivas sin output vacío
  - Story 2.1 (BFF session), Story 2.2 (audit log), Story 2.3 (logout) son los benchmarks

**Effort**: 2-4h. **Priority**: HIGH (cada story futura cuesta ~30 min fallback manual sin esto).

**Rationale**: 3 invocaciones consecutivas del subagente retornaron output vacío. AI-1.5 wrapper mitiga pero el subagente sigue roto. Sin fix, cada Epic acumula ~5h perdida.

---

### Change 4: Expandir Story 7.2 (update AGENTS.md)

**Archivo**: spec de Story 7.2

**OLD scope**:
> Update AGENTS.md of affected contexts

**NEW scope**:
> Update AGENTS.md of affected contexts with **AI safeguards patterns** learned from Epic 2:
> - AI-1.5: try-tdd-generator SOP + Pattern A/B/C fallback
> - AI-2: spec citation check (every AC must quote literal spec)
> - AI-3: assertions específicas (never `instanceof BaseError`)
> - AI-4: extractAuditContext helper usage in every new controller
> - tryPublish helper for every eventBus.publish call
> - cascadeRevoke pattern for cascading revocation (Lua atomic)
> - audit log patterns (EmbedTokenAuthenticatedEvent + failure event)
> - Tech debt discipline (close before new epic starts)

**Effort**: ~30 min.

---

### Change 5: Update AGENTS.md (root) — nueva sección AI safeguards

**Archivo**: `AGENTS.md` (root, no Epic 7)

**NEW section** (en la raíz):
```markdown
## AI Safeguards (MANDATORY desde Epic 2 retro)

Toda story DEBE aplicar estos patrones desde el inicio:

### AI-1.5: try-tdd-generator wrapper
- Subagente `@tdd-generator` es unreliable (3/3 invocaciones vacías en Epic 2)
- Usar Pattern A/B/C fallback documentado en `.opencode/skills/try-tdd-generator.md`
- ...

### AI-2: Spec citation check
- Cada AC en un audit report DEBE citar literalmente el spec entre comillas
- ACs sin cita = enhancement, no bug

### AI-3: Specific assertions
- Tests usan `message.toContain(...)` o `instanceof SpecificSubclass`
- NUNCA `instanceof BaseError`

### AI-4: extractAuditContext helper
- TODO nuevo controller DEBE usar `extractAuditContext(req)` (no duplicar)
- Helper: `src/context/shared/utils/audit-context.ts`

### tryPublish helper
- TODO `eventBus.publish()` DEBE estar envuelto en `tryPublish()`
- Helper: `src/context/shared/events/try-publish.ts`
```

**Effort**: ~10 min.

---

## 5. Implementation Handoff

### Change Scope Classification: **MODERATE**

Razones:
- 2 stories nuevas a crear (Story 6.0 + Story AI-X) → backlog reorganization
- 2 stories a modificar (7.2 expansion + AGENTS.md new section)
- Stories 2.4/2.5 status update → sprint tracking
- No requiere fundamental replan

### Handoff Plan

**Roles**:
- **Product Owner agent**: 
  - Crear Story 6.0 formal con spec completo (acceptance criteria + tasks)
  - Crear Story AI-X formal
  - Actualizar sprint-status con nuevos story keys
  - Marcar Stories 2.4/2.5 como deferred-post-mvp
- **Developer agent**:
  - Implementar Story 6.0 (JWT strategy extension)
  - Implementar Story AI-X (replace or fix tdd-generator)
  - Actualizar AGENTS.md raíz con sección AI safeguards (Change 5)
  - Expandir scope de Story 7.2 (Change 4)
- **Architect agent**: 
  - Validar que Story 6.0 no rompe backward compatibility de JwtCookieStrategy
  - (Opcional) Validar Story AI-X approach si es Opción A o B

### Sequencing

1. **Inmediato (pre-Epic 3)**:
   - Story AI-X (resuelve blocker operativo)
   - Story 6.0 (resuelve blocker funcional para Epic 6)
   - AGENTS.md update (Change 5)
   - Sprint-status update (Change 1)

2. **Antes de Epic 3 kickoff**:
   - Story AI-X done (otherwise fallback manual cada story)
   - Story 6.0 done (otherwise Epic 6 bloqueado)

3. **Durante Epic 7 Story 7.2**:
   - Expandir scope per Change 4

### Success Criteria

- Story 6.0 implementada: `JwtCookieStrategy` acepta JWT + session IDs opacos. Tests passing (8 unit + 4 e2e). Backward compat verificada.
- Story AI-X implementada: 3 stories consecutivas con tests generados sin output vacío
- AGENTS.md raíz tiene sección "AI Safeguards" prominente
- Sprint-status refleja correctamente:
  - 2-4, 2-5 = `deferred-post-mvp`
  - 6-0 = `backlog` (ready to start)
  - 6-1, 6-2, 6-3 = `backlog` (siguen blocked hasta 6-0 done)

---

## 6. Open Questions for User

1. **Story 6.0**: ¿Crear como `6-0-...` (pre-Epic 6) o como `2-6-...` y mover formalmente a Epic 6? El spec original de Story 2.1 (en `bff/AGENTS.md`) la menciona como "fuera de scope" → renumerar es más limpio.

2. **Story AI-X**: ¿Opción A (re-prompt), B (script), o C (eliminar)? Recomiendo **B** (script determinístico) porque es la más predecible.

3. **Stories 2.4/2.5**: ¿Deferir a "post-MVP" o eliminarlas del backlog? Recomiendo **deferir** (mantener en sprint-status pero marcado) por si LeadCars pide polish después del MVP.

4. **Epic 6** sin Story 6.0: ¿Aceptar el delay (no empezar Epic 6 hasta Story 6.0 done) o reordenar (empezar Epic 6 con Story 6.0 incluida)? Recomiendo **empezar Story 6.0 inmediatamente** (es < 1 día).

---

## 7. References

- Epic 2 partial retrospective: `_bmad-output/implementation-artifacts/epic-2-retro-2026-06-17.md`
- AI-1.5 SOP: `.opencode/skills/try-tdd-generator.md`
- AI-4 helper: `src/context/shared/utils/audit-context.ts`
- tryPublish helper: `src/context/shared/events/try-publish.ts`
- PR #115 (Story 2.3): https://github.com/RogerPugaRuiz/guiders-backend/pull/115
- BFF AGENTS.md (Known Limitation Story 2.6): `src/context/auth/bff/AGENTS.md`

---

## 8. Approval

**Pending user approval** before:
- Creating Story 6.0 and AI-X
- Modifying sprint-status.yaml
- Updating AGENTS.md

Once approved, route to:
- **Product Owner** for backlog reorganization
- **Developer** for implementation (Stories 6.0, AI-X, 7.2 expanded, AGENTS.md update)