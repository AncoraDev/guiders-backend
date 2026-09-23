/**
 * Tests del SOP try-tdd-generator (AI-1.5 retro Story 2.2).
 *
 * El SOP es procedural (es un documento .md), pero la parte testeable
 * es la función `detectSubagentFailure()` que el dev agent (o un
 * futuro script automatizado) usa para decidir si el output del
 * subagente @tdd-generator es válido.
 *
 * Esta función NO se importa desde el SOP — está duplicada aquí
 * como un test del comportamiento esperado. Si el SOP cambia, este
 * test DEBE actualizarse.
 *
 * Story 2.1 + 2.2 retrometrics: subagent returned empty 2/2 times.
 * These heuristics must catch:
 *   - `<output></output>` (literal empty tags)
 *   - null/undefined/empty string
 *   - Output without "Files created" section
 *   - Output with self-score < 8
 *   - "FAILURE" markers from the subagent
 *
 * If ANY heuristic returns true, the dev agent MUST fall back to
 * manual test writing (Pattern A/B/C from the SOP).
 */

import { describe, it, expect } from '@jest/globals';

interface SubagentResult {
  task_result: string | null | undefined;
}

interface FailureCheck {
  isFailure: boolean;
  reason: string;
}

/**
 * Pure function: detects if @tdd-generator subagent output indicates
 * a failure that should trigger the manual fallback.
 *
 * IMPORTANT: This function is documented in
 * `.opencode/skills/try-tdd-generator.md` Step 2.
 * If you change the heuristics here, update the SOP document.
 */
function detectSubagentFailure(result: SubagentResult): FailureCheck {
  const output = result.task_result;

  // Signal 1: empty / null / undefined
  if (output === null || output === undefined) {
    return { isFailure: true, reason: 'task_result is null or undefined' };
  }

  if (typeof output !== 'string') {
    return { isFailure: true, reason: 'task_result is not a string' };
  }

  if (output.trim() === '') {
    return { isFailure: true, reason: 'task_result is empty string' };
  }

  // Signal 2: empty tags (the observed failure mode in Story 2.1 + 2.2)
  if (output.trim() === '<output></output>') {
    return { isFailure: true, reason: 'task_result is <output></output>' };
  }

  // Signal 3: missing "Files created" section
  if (!output.toLowerCase().includes('files created')) {
    return {
      isFailure: true,
      reason: 'output does not include "Files created" section',
    };
  }

  // Signal 4: zero files created
  if (/files created.*0 files|0 files created/i.test(output)) {
    return {
      isFailure: true,
      reason: 'output reports 0 files created',
    };
  }

  // Signal 5: explicit FAILURE marker
  if (/\bFAILURE\b.*\bsubagent\b|empty output.*subagent/i.test(output)) {
    return { isFailure: true, reason: 'output contains FAILURE marker' };
  }

  // Signal 6: self-score < 8 (subagent self-evaluates)
  if (/score[:\s]+([0-7](\.\d+)?)\s*\/\s*10/i.test(output)) {
    return {
      isFailure: true,
      reason: 'output self-score is < 8',
    };
  }

  return { isFailure: false, reason: 'output looks valid' };
}

describe('try-tdd-generator SOP — detectSubagentFailure()', () => {
  describe('empty / null / undefined inputs', () => {
    it('debe detectar null', () => {
      const result = detectSubagentFailure({ task_result: null });
      expect(result.isFailure).toBe(true);
      expect(result.reason).toContain('null');
    });

    it('debe detectar undefined', () => {
      const result = detectSubagentFailure({ task_result: undefined });
      expect(result.isFailure).toBe(true);
      expect(result.reason).toContain('null');
    });

    it('debe detectar string vacío', () => {
      const result = detectSubagentFailure({ task_result: '' });
      expect(result.isFailure).toBe(true);
      expect(result.reason).toContain('empty');
    });

    it('debe detectar whitespace-only string', () => {
      const result = detectSubagentFailure({ task_result: '   \n\t  ' });
      expect(result.isFailure).toBe(true);
    });

    it('debe detectar el caso observed "<output></output>"', () => {
      // This is the EXACT failure pattern observed in Story 2.1 and 2.2.
      const result = detectSubagentFailure({
        task_result: '<output></output>',
      });
      expect(result.isFailure).toBe(true);
      expect(result.reason).toContain('<output></output>');
    });

    it('debe detectar "<output></output>" con whitespace', () => {
      const result = detectSubagentFailure({
        task_result: '  \n  <output></output>  \n  ',
      });
      expect(result.isFailure).toBe(true);
    });
  });

  describe('missing required sections', () => {
    it('debe fallar si no menciona "Files created"', () => {
      const result = detectSubagentFailure({
        task_result: 'I generated the tests successfully. Score: 9/10',
      });
      expect(result.isFailure).toBe(true);
      expect(result.reason).toContain('Files created');
    });

    it('debe fallar si "Files created" pero 0 files', () => {
      const result = detectSubagentFailure({
        task_result:
          'Files created: 0 files created. Test counts per file: none. Score: 9/10',
      });
      expect(result.isFailure).toBe(true);
      expect(result.reason).toContain('0 files');
    });

    it('debe aceptar "1 file" (singular)', () => {
      const result = detectSubagentFailure({
        task_result:
          'Files created:\n- /path/to/file.ts\n\n1 test in the suite. Score: 9/10',
      });
      expect(result.isFailure).toBe(false);
    });

    it('debe aceptar "3 files" (plural)', () => {
      const result = detectSubagentFailure({
        task_result:
          'Files created (3 files):\n- /a.ts\n- /b.ts\n- /c.ts\n\nTest counts: 5+10+8 = 23 tests. Score: 9/10',
      });
      expect(result.isFailure).toBe(false);
    });
  });

  describe('self-score detection', () => {
    it('debe fallar si score = 5/10', () => {
      const result = detectSubagentFailure({
        task_result: 'Files created: 1 file. Score: 5/10 — concerns about X',
      });
      expect(result.isFailure).toBe(true);
      expect(result.reason).toContain('self-score');
    });

    it('debe fallar si score = 7.5/10', () => {
      const result = detectSubagentFailure({
        task_result: 'Files created: 1 file. Score: 7.5/10 — minor concerns',
      });
      expect(result.isFailure).toBe(true);
    });

    it('debe aceptar score = 8/10', () => {
      const result = detectSubagentFailure({
        task_result: 'Files created: 1 file. Score: 8/10',
      });
      expect(result.isFailure).toBe(false);
    });

    it('debe aceptar score = 9/10', () => {
      const result = detectSubagentFailure({
        task_result: 'Files created: 1 file. Score: 9/10',
      });
      expect(result.isFailure).toBe(false);
    });

    it('debe aceptar score = 10/10', () => {
      const result = detectSubagentFailure({
        task_result: 'Files created: 1 file. Score: 10/10',
      });
      expect(result.isFailure).toBe(false);
    });
  });

  describe('FAILURE markers', () => {
    it('debe detectar "FAILURE" + "subagent" explícito', () => {
      const result = detectSubagentFailure({
        task_result:
          'FAILURE: subagent returned empty output. Could not generate tests.',
      });
      expect(result.isFailure).toBe(true);
    });
  });

  describe('valid outputs (sanity checks)', () => {
    it('debe aceptar output mínimo válido', () => {
      const result = detectSubagentFailure({
        task_result: 'Files created:\n- /path/file.ts\n\nTests: 5. Score: 9/10',
      });
      expect(result.isFailure).toBe(false);
      expect(result.reason).toContain('valid');
    });

    it('debe aceptar output con detalles completos', () => {
      const result = detectSubagentFailure({
        task_result: `
          # Story 2.3 — Token Revocation

          Files created (3 files):
          - /Users/.../command-handler.spec.ts
          - /Users/.../controller.spec.ts
          - /Users/.../integration.spec.ts

          Test counts per file:
          - command-handler.spec.ts: 8 tests
          - controller.spec.ts: 5 tests
          - integration.spec.ts: 3 tests

          Self-score: 9/10
        `,
      });
      expect(result.isFailure).toBe(false);
    });
  });
});

/**
 * Tests de la heurística AI-2 (spec citation check).
 *
 * El subagente PASS 3 del review de PR #111 inventó 3 ACs que NO existían
 * en el spec real. Esta función detecta:
 *   - ACs mencionados sin cita literal del spec
 *   - ACs que el auditor dice existir pero NO están en el spec (invented)
 *   - Markers de "best practice" (indicio de AC inferido)
 *
 * Si retorna isGap=true, el dev agent (o el orquestador de review) DEBE
 * rechazar el reporte y pedir reformulación con citas literales.
 *
 * Refs:
 *  - .opencode/skills/try-tdd-generator.md Step 6
 *  - AGENTS.md sección AI-2
 *  - PR #111 review (2026-06-16)
 */

interface AuditReport {
  report: string;
  specACs: string[];
}

interface CitationGap {
  isGap: boolean;
  reasons: string[];
  uncitedACs: string[];
  inventedACs: string[];
}

function detectSpecCitationGap(input: AuditReport): CitationGap {
  const reasons: string[] = [];
  const uncitedACs: string[] = [];
  const inventedACs: string[] = [];

  // 1. Find all AC identifiers in the report
  const acPattern = /\b(?:Story\s+\d+\.\d+\s+)?AC\s*#?\s*(\d+)\b/gi;
  const mentionedACs = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = acPattern.exec(input.report)) !== null) {
    mentionedACs.add(`AC${match[1]}`);
  }

  // 2. For each mentioned AC, verify it has a spec citation nearby
  for (const ac of mentionedACs) {
    const acNumber = ac.replace('AC', '');
    // Capture from the AC line until the next AC line OR 800 chars, whichever comes first
    const acRegex = new RegExp(
      `AC\\s*#?\\s*${acNumber}[\\s\\S]{0,800}?(?=\\n\\s*(?:AC|Story)|$)`,
      'i',
    );
    const acSection = input.report.match(acRegex)?.[0] ?? '';
    const hasCitation =
      />\s*["']/.test(acSection) ||
      /\*\*Spec[^:]*:\s*["']/i.test(acSection) ||
      /\*\*Quote\*\*:/i.test(acSection);
    if (!hasCitation) {
      uncitedACs.push(ac);
      reasons.push(`${ac} mentioned without spec quote`);
    }
  }

  // 3. Check for ACs mentioned but NOT in the real spec
  const normalizedSpecACs = input.specACs.map((s) =>
    s.toUpperCase().replace(/\s+/g, ''),
  );
  for (const ac of mentionedACs) {
    const normalized = ac.toUpperCase().replace(/\s+/g, '');
    if (!normalizedSpecACs.includes(normalized)) {
      inventedACs.push(ac);
      reasons.push(
        `${ac} is mentioned but NOT in the real spec — likely an enhancement, not a bug`,
      );
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
      reasons.push(
        `Report contains "best practice" marker (${marker.source}) — likely an inferred AC`,
      );
    }
  }

  return {
    isGap: reasons.length > 0,
    reasons,
    uncitedACs,
    inventedACs,
  };
}

describe('try-tdd-generator SOP — detectSpecCitationGap() (AI-2)', () => {
  const STORY_1_3_SPEC_ACS = ['AC1', 'AC2', 'AC3', 'AC4', 'AC5'];

  describe('AC with spec citation (PASS)', () => {
    it('debe aceptar AC con blockquote citation', () => {
      const report = `
        # Audit report
        Story 1.3 AC1: response shape
        > "the response is 200 OK with { token, expiresAt }"
        Implementation matches.
      `;
      const gap = detectSpecCitationGap({
        report,
        specACs: STORY_1_3_SPEC_ACS,
      });
      expect(gap.isGap).toBe(false);
    });

    it('debe aceptar AC con **Spec** citation', () => {
      const report = `
        # Audit report
        Story 1.3 AC2: embedEnabled=false → 403
        **Spec quote**: "embedEnabled=false for the tenant, response is 403"
        PASS.
      `;
      const gap = detectSpecCitationGap({
        report,
        specACs: STORY_1_3_SPEC_ACS,
      });
      expect(gap.isGap).toBe(false);
    });
  });

  describe('AC WITHOUT spec citation (FAIL)', () => {
    it('debe detectar AC mencionado sin quote', () => {
      const report = `
        # Audit report
        Story 1.3 AC5: Validates origin is in embedAllowedOrigins
        Implementation does not validate origin.
        BUG: false positive AC.
      `;
      const gap = detectSpecCitationGap({
        report,
        specACs: STORY_1_3_SPEC_ACS,
      });
      expect(gap.isGap).toBe(true);
      expect(gap.uncitedACs).toContain('AC5');
    });
  });

  describe('Invented ACs (not in real spec)', () => {
    it('debe detectar AC8 inventado (no existe en spec real)', () => {
      const report = `
        # Audit report
        Story 1.4 AC2/AC8: cross-check header-vs-body
        > "Token in header must match token in request body"
        Implementation missing cross-check.
        BUG: missing cross-check.
      `;
      const gap = detectSpecCitationGap({
        report,
        specACs: ['AC1', 'AC2', 'AC3'], // Story 1.4 spec has only 3 ACs
      });
      expect(gap.isGap).toBe(true);
      expect(gap.inventedACs).toContain('AC8');
    });

    it('debe detectar AC con number mismatch (AC3 mentioned but spec has AC2, AC4)', () => {
      // Spec has AC1, AC2, AC4, AC5 (no AC3 in this hypothetical)
      const report = `
        Story 1.3 AC3: refreshAfter field missing
        > "response includes refreshAfter"
        BUG: missing field.
      `;
      const gap = detectSpecCitationGap({
        report,
        specACs: ['AC1', 'AC2', 'AC4', 'AC5'],
      });
      // AC3 is in mentioned but NOT in spec → invented
      // BUT AC3 has citation, so uncited is empty
      expect(gap.inventedACs).toContain('AC3');
    });
  });

  describe('"Best practice" markers', () => {
    it('debe detectar "should also validate" como AC inferido', () => {
      const report = `
        # Audit
        The endpoint should also validate the origin against embedAllowedOrigins.
        This is a security best practice.
      `;
      const gap = detectSpecCitationGap({
        report,
        specACs: STORY_1_3_SPEC_ACS,
      });
      expect(gap.isGap).toBe(true);
      expect(gap.reasons.some((r) => r.includes('best practice'))).toBe(true);
    });

    it('debe detectar "must also ensure" como AC inferido', () => {
      const report = `
        # Audit
        The handler must also ensure cross-tenant isolation.
        This follows standard security practices.
      `;
      const gap = detectSpecCitationGap({
        report,
        specACs: STORY_1_3_SPEC_ACS,
      });
      expect(gap.isGap).toBe(true);
    });
  });

  describe('PR #111 false positives (regression test)', () => {
    // Replicates the EXACT false positives from PR #111 PASS 3 review
    it('debe detectar los 3 ACs inventados del review de PR #111', () => {
      const pr111FalsePositives = `
        # PR #111 Acceptance Audit

        ### Story 1.3 AC5/AC9 — Origin validation NOT implemented (security)
        CreateEmbedTokenCommandHandler does not validate origin.

        ### Story 1.3 AC3 + Story 1.4 AC3 — Response missing fields
        embed.controller.ts does not return refreshAfter / refreshedAt.

        ### Story 1.4 AC2/AC8 — Cross-check header-vs-body NOT implemented
        RefreshEmbedTokenDto does not have bodyToken for cross-check.
      `;
      // Real Story 1.3 has 5 ACs (AC1-AC5), Story 1.4 has 3 (AC1-AC3)
      const gap = detectSpecCitationGap({
        report: pr111FalsePositives,
        specACs: ['AC1', 'AC2', 'AC3', 'AC4', 'AC5'],
      });
      expect(gap.isGap).toBe(true);
      // AC9 is invented (not in Story 1.3)
      expect(gap.inventedACs).toContain('AC9');
      // AC8 is invented (not in Story 1.4)
      expect(gap.inventedACs).toContain('AC8');
      // All 3 ACs lack spec citations
      expect(gap.uncitedACs.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Sanity checks (valid reports)', () => {
    it('debe aceptar report sin ACs (no relevant audit)', () => {
      const report = `
        # Code style review
        Variable naming is clear. Lint passes. Build succeeds.
      `;
      const gap = detectSpecCitationGap({
        report,
        specACs: STORY_1_3_SPEC_ACS,
      });
      expect(gap.isGap).toBe(false);
    });

    it('debe aceptar report con todos los ACs citados correctamente', () => {
      const report = `
        # Audit
        Story 1.3 AC1: PASS
        > "the response is 200 OK with { token, expiresAt }"
        Story 1.3 AC2: PASS
        > "embedEnabled=false for the tenant, response is 403"
        Story 1.3 AC3: PASS
        > "userId does not belong to companyId, response is 403"
        Story 1.3 AC4: PASS
        > "invalid or missing X-Api-Key, response is 401"
        Story 1.3 AC5: PASS
        > "API key companyId does not match request companyId, response is 403"
      `;
      const gap = detectSpecCitationGap({
        report,
        specACs: STORY_1_3_SPEC_ACS,
      });
      expect(gap.isGap).toBe(false);
      expect(gap.uncitedACs).toEqual([]);
      expect(gap.inventedACs).toEqual([]);
    });
  });
});
