/**
 * Replay tests — verifica que el generador produce output estructuralmente válido
 * para los mismos inputs que las Stories 2.1, 2.2, 2.3 usaron.
 *
 * Story AI-X Task 3.2 — Replay tests (3 tests).
 *
 * Estrategia: NO sobrescribimos los test files existentes. En su lugar:
 * 1. Parseamos el story file real
 * 2. Generamos el content SIN escribir al filesystem
 * 3. Verificamos que la estructura (ACs, AI-2, describe blocks) coincide
 */
import * as path from 'path';
import {
  parseStory,
  generateTestContent,
  parseAcceptanceCriteria,
  detectPattern,
} from '../generate-red-tests';

const ARTIFACTS_DIR = path.join(
  __dirname,
  '..',
  '..',
  '_bmad-output',
  'implementation-artifacts',
);

describe('generate-red-tests (replay)', () => {
  describe('Story 2.1 — POST /embed/authenticate-session', () => {
    const storyPath = path.join(
      ARTIFACTS_DIR,
      '2-1-implement-post-embed-authenticate-session-to-create-bff-session-from-token.md',
    );

    it('debería parsear la story 2.1 con 5+ ACs', () => {
      const fs = require('fs');
      const content = fs.readFileSync(storyPath, 'utf-8');
      const story = parseStory(storyPath, content);
      expect(story.storyKey).toContain('2-1');
      expect(story.acceptanceCriteria.length).toBeGreaterThanOrEqual(5);
    });

    it('debería detectar patrón CommandHandler en story 2.1', () => {
      const fs = require('fs');
      const content = fs.readFileSync(storyPath, 'utf-8');
      const pattern = detectPattern(content);
      expect(pattern).toBe('CommandHandler');
    });

    it('debería generar content con todos los ACs de story 2.1', () => {
      const fs = require('fs');
      const content = fs.readFileSync(storyPath, 'utf-8');
      const story = parseStory(storyPath, content);
      const testContent = generateTestContent(story, 'AuthenticateEmbedSessionCommandHandler');

      story.acceptanceCriteria.forEach((ac) => {
        expect(testContent).toContain(`AC${ac.number}`);
      });
    });
  });

  describe('Story 2.2 — EmbedTokenAuthenticated event + audit log', () => {
    const storyPath = path.join(
      ARTIFACTS_DIR,
      '2-2-implement-embedtokenauthenticated-event-and-audit-log-persistence.md',
    );

    it('debería parsear story 2.2 con 4+ ACs', () => {
      const fs = require('fs');
      const content = fs.readFileSync(storyPath, 'utf-8');
      const acs = parseAcceptanceCriteria(content);
      expect(acs.length).toBeGreaterThanOrEqual(4);
    });

    it('debería detectar CommandHandler o EventHandler en story 2.2', () => {
      const fs = require('fs');
      const content = fs.readFileSync(storyPath, 'utf-8');
      const pattern = detectPattern(content);
      expect(['CommandHandler', 'EventHandler']).toContain(pattern);
    });
  });

  describe('Story 2.3 — Logout cascade revocation', () => {
    const storyPath = path.join(
      ARTIFACTS_DIR,
      '2-3-implement-token-revocation-on-logout-from-parent.md',
    );

    it('debería parsear story 2.3 con 5+ ACs', () => {
      const fs = require('fs');
      const content = fs.readFileSync(storyPath, 'utf-8');
      const acs = parseAcceptanceCriteria(content);
      expect(acs.length).toBeGreaterThanOrEqual(5);
    });

    it('debería detectar patrón CommandHandler en story 2.3', () => {
      const fs = require('fs');
      const content = fs.readFileSync(storyPath, 'utf-8');
      const pattern = detectPattern(content);
      expect(pattern).toBe('CommandHandler');
    });
  });
});
