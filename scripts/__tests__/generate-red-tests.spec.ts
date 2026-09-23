/**
 * Tests del generador determinístico de RED phase tests.
 * Story AI-X Task 3.1 — Unit tests (18 tests).
 *
 * AI-3 compliance: usa `toContain(...)` o `instanceof SpecificError` (nunca `instanceof BaseError`).
 */
import {
  parseAcceptanceCriteria,
  detectPattern,
  extractSourceFilePath,
  parseStory,
  generateTestContent,
} from '../generate-red-tests';

describe('generate-red-tests (unit)', () => {
  describe('parseAcceptanceCriteria', () => {
    it('debería extraer un AC simple con título', () => {
      const md = '### AC1: El primer criterio\nBody del criterio.';
      const result = parseAcceptanceCriteria(md);
      expect(result.length).toBe(1);
      expect(result[0].number).toBe(1);
      expect(result[0].title).toBe('El primer criterio');
      expect(result[0].specCitation).toBeNull();
    });

    it('debería extraer múltiples ACs en orden', () => {
      const md = `### AC1: Primero
Body 1.

### AC2: Segundo
Body 2.

### AC3: Tercero
Body 3.`;
      const result = parseAcceptanceCriteria(md);
      expect(result.length).toBe(3);
      expect(result[0].title).toBe('Primero');
      expect(result[1].title).toBe('Segundo');
      expect(result[2].title).toBe('Tercero');
    });

    it('debería detectar spec citation AI-2 entre comillas', () => {
      const md = `### AC1: Con cita
> "el sistema debe retornar 200"
Body.`;
      const result = parseAcceptanceCriteria(md);
      expect(result[0].specCitation).toBe('el sistema debe retornar 200');
    });

    it('debería ignorar bloques de código al parsear', () => {
      const md = `### AC1: Con código
\`\`\`
### AC2: Este NO es un AC real
\`\`\`
Body válido.`;
      const result = parseAcceptanceCriteria(md);
      expect(result.length).toBe(1);
      expect(result[0].title).toBe('Con código');
    });

    it('debería retornar array vacío si no hay ACs', () => {
      const md = '# Story 1.1\n## Tasks\n- Task 1';
      const result = parseAcceptanceCriteria(md);
      expect(result).toEqual([]);
    });
  });

  describe('detectPattern', () => {
    it('debería detectar CommandHandler', () => {
      expect(detectPattern('CreateEmbedTokenCommandHandler')).toBe('CommandHandler');
    });

    it('debería detectar QueryHandler', () => {
      expect(detectPattern('GetEmbedTokenQueryHandler')).toBe('QueryHandler');
    });

    it('debería detectar EventHandler', () => {
      expect(detectPattern('OnEmbedTokenCreatedEventHandler')).toBe('EventHandler');
    });

    it('debería detectar Controller (e2e)', () => {
      expect(detectPattern('EmbedController con @Controller')).toBe('Controller');
    });

    it('debería default a CommandHandler si no detecta patrón', () => {
      expect(detectPattern('Foo bar baz')).toBe('CommandHandler');
    });
  });

  describe('extractSourceFilePath', () => {
    it('debería extraer path absoluto desde context', () => {
      const content = 'Trabajar en `src/context/auth/foo.command-handler.ts`';
      expect(extractSourceFilePath(content)).toBe(
        'src/context/auth/foo.command-handler.ts',
      );
    });

    it('debería retornar null si no encuentra path', () => {
      expect(extractSourceFilePath('no hay source path')).toBeNull();
    });
  });

  describe('parseStory', () => {
    it('debería parsear una story completa', () => {
      const md = `# Story 2.1: Test story

## Tasks
- File: src/context/auth/foo/create.command-handler.ts
- Tests: __tests__/create.command-handler.spec.ts

### AC1: Primera
Body.

### AC2: Segunda
Body.`;
      const story = parseStory('2-1-test.md', md);
      expect(story.storyKey).toBe('2-1-test');
      expect(story.sourceFile).toBe('create.command-handler');
      expect(story.pattern).toBe('CommandHandler');
      expect(story.acceptanceCriteria.length).toBe(2);
    });

    it('debería lanzar error con mensaje específico si falta source path', () => {
      const md = '### AC1: Sin source path\nBody.';
      expect(() => parseStory('foo.md', md)).toThrow(/Could not extract source file path/);
    });
  });

  describe('generateTestContent', () => {
    it('debería generar content con header + imports + describe', () => {
      const story = {
        storyKey: '1-1-test',
        sourceFile: 'create.command-handler',
        sourceFilePath: 'src/context/auth/create.command-handler.ts',
        pattern: 'CommandHandler' as const,
        acceptanceCriteria: [
          {
            number: 1,
            title: 'Crea foo',
            body: 'Body AC1',
            specCitation: null,
          },
        ],
      };
      const content = generateTestContent(story, 'CreateCommandHandler');
      expect(content).toContain('describe(');
      expect(content).toContain('AC1');
      expect(content).toContain('CreateCommandHandler');
    });

    it('debería preservar AI-2 spec citations en el header', () => {
      const story = {
        storyKey: '1-1-test',
        sourceFile: 'create.command-handler',
        sourceFilePath: 'src/context/auth/create.command-handler.ts',
        pattern: 'CommandHandler' as const,
        acceptanceCriteria: [
          {
            number: 1,
            title: 'AC con cita',
            body: 'Body',
            specCitation: 'el sistema valida X',
          },
        ],
      };
      const content = generateTestContent(story, 'CreateCommandHandler');
      expect(content).toContain('"el sistema valida X"');
      expect(content).toContain('AI-2 spec citations');
    });

    it('debería usar Given/When/Then cuando están presentes en el body', () => {
      const story = {
        storyKey: '1-1',
        sourceFile: 'foo.command-handler',
        sourceFilePath: 'src/context/auth/foo.command-handler.ts',
        pattern: 'CommandHandler' as const,
        acceptanceCriteria: [
          {
            number: 1,
            title: 'Comportamiento',
            body: '**Given** condición\n**When** acción\n**Then** resultado',
            specCitation: null,
          },
        ],
      };
      const content = generateTestContent(story, 'FooCommandHandler');
      expect(content).toContain('dado [condición]');
      expect(content).toContain('cuando [acción]');
    });

    it('debería incluir AI-2 spec citation como comment en it() (AA-3 patch)', () => {
      const story = {
        storyKey: '1-1',
        sourceFile: 'foo.command-handler',
        sourceFilePath: 'src/context/auth/foo.command-handler.ts',
        pattern: 'CommandHandler' as const,
        acceptanceCriteria: [
          {
            number: 1,
            title: 'AC con cita',
            body: 'body',
            specCitation: 'el sistema valida X',
          },
        ],
      };
      const content = generateTestContent(story, 'FooCommandHandler');
      expect(content).toContain('// AI-2 spec citation: "el sistema valida X"');
    });

    it('debería escapar backticks en titles (BH-6 patch)', () => {
      const story = {
        storyKey: '1-1',
        sourceFile: 'foo.command-handler',
        sourceFilePath: 'src/context/auth/foo.command-handler.ts',
        pattern: 'CommandHandler' as const,
        acceptanceCriteria: [
          {
            number: 1,
            title: 'AC con `template literal` en título',
            body: 'body',
            specCitation: null,
          },
        ],
      };
      const content = generateTestContent(story, 'FooCommandHandler');
      expect(content).toContain('\\`');
    });
  });
});
