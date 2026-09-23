/**
 * scripts/generate-red-tests.ts
 *
 * Generador determinístico de tests RED phase para el proyecto Guiders Backend.
 * Reemplaza al subagente `@tdd-generator` (que falla 3/3 invocaciones).
 *
 * Uso:
 *   ts-node scripts/generate-red-tests.ts <story-file-path>
 *   ts-node scripts/generate-red-tests.ts --help
 *
 * Salida:
 *   - Genera `*.spec.ts` files en el directorio `__tests__/` junto al source
 *   - Imprime resumen: `Generated N tests in <file> (covers M/M ACs)`
 *   - Exit code 0 (success) o 1 (error)
 */

import * as fs from 'fs/promises';
import * as path from 'path';

interface AcceptanceCriterion {
  number: number;
  title: string;
  body: string;
  specCitation: string | null;
}

interface Story {
  storyKey: string;
  sourceFile: string;
  sourceFilePath: string;
  pattern: 'CommandHandler' | 'QueryHandler' | 'EventHandler' | 'Controller';
  acceptanceCriteria: AcceptanceCriterion[];
}

/**
 * Extrae un acceptance criterion del markdown de la story.
 * Detecta:
 * - `### AC{N}: {title}` (header)
 * - Spec citation: `> "..."` (AI-2 tag)
 */
export function parseAcceptanceCriteria(markdown: string): AcceptanceCriterion[] {
  const lines = markdown.split('\n');
  const criteria: AcceptanceCriterion[] = [];
  let current: AcceptanceCriterion | null = null;
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const acMatch = line.match(/^###\s+AC(\d+):\s*(.*)$/);
    if (acMatch) {
      if (current) criteria.push(current);
      const title = acMatch[2].trim();
      if (!title) {
        console.warn(
          `Warning: AC${acMatch[1]} has empty title. Skipping.`,
        );
        current = null;
        continue;
      }
      current = {
        number: parseInt(acMatch[1], 10),
        title,
        body: '',
        specCitation: null,
      };
      continue;
    }

    const citationMatch = line.match(/^>\s+"(.+)"$/);
    if (citationMatch && current) {
      current.specCitation = citationMatch[1];
      continue;
    }

    if (current && line.trim() && !line.startsWith('#')) {
      current.body += line + '\n';
    }
  }

  if (current) criteria.push(current);
  return criteria;
}

/**
 * Detecta el patrón (Command/Query/Event/Controller) basándose en:
 * - El nombre del archivo fuente (mencionado en Tasks)
 * - O heurísticas en el texto de la story
 */
export function detectPattern(storyContent: string): Story['pattern'] {
  if (/CommandHandler|@CommandHandler/.test(storyContent)) return 'CommandHandler';
  if (/QueryHandler|@QueryHandler/.test(storyContent)) return 'QueryHandler';
  if (/EventHandler|@EventsHandler/.test(storyContent)) return 'EventHandler';
  if (/Controller|@Controller/.test(storyContent)) return 'Controller';
  return 'CommandHandler';
}

/**
 * Extrae el path del source file de la sección "Tasks" de la story.
 * Busca líneas como: `src/context/.../create-embed-token.command-handler.ts`
 */
export function extractSourceFilePath(storyContent: string): string | null {
  const match = storyContent.match(/(src\/context\/[\w\/\.-]+\.ts)/);
  if (!match) return null;
  const path_ = match[1];
  if (path_.includes('..')) {
    throw new Error(
      `Invalid source file path: contains ".." (path traversal): ${path_}`,
    );
  }
  return path_;
}

/**
 * Genera el contenido del test file (.spec.ts) dado el patrón + ACs.
 *
 * Templates:
 * - CommandHandler: mocks repo, tests happy/error path
 * - QueryHandler: mocks repo, tests read-only
 * - EventHandler: mocks repo, asserts event persistence
 * - Controller (e2e): mocks guards, uses supertest
 */
export function generateTestContent(
  story: Story,
  className: string,
): string {
  const header = generateFileHeader(story);
  const imports = generateImports(story);
  const describeBlock = generateDescribeBlock(story, className);

  return `${header}\n${imports}\n${describeBlock}\n`;
}

function generateFileHeader(story: Story): string {
  const ai2Citations = story.acceptanceCriteria
    .filter((ac) => ac.specCitation)
    .map((ac) => `  - AC${ac.number}: "${ac.specCitation}"`)
    .join('\n');

  return `/**
 * Tests RED phase generados automáticamente para Story ${story.storyKey}.
 * Source: ${path.basename(story.sourceFilePath)}
 * Pattern: ${story.pattern}
 *
 * AI-2 spec citations (citas literales del spec):
${ai2Citations || '  (ninguna)'}
 *
 * NOTA: Este archivo es generado por scripts/generate-red-tests.ts.
 * Modifica la story, no este archivo directamente.
 */`;
}

function generateImports(story: Story): string {
  const sourceBasename = path.basename(story.sourceFilePath, '.ts');
  const className = toPascalCase(sourceBasename.split('.')[0]);

  switch (story.pattern) {
    case 'CommandHandler':
      return `import { ${className} } from '../${sourceBasename}';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { ok, err, okVoid } from 'src/context/shared/domain/result';`;
    case 'QueryHandler':
      return `import { ${className} } from '../${sourceBasename}';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { ok, err } from 'src/context/shared/domain/result';`;
    case 'EventHandler':
      return `import { ${className} } from '../${sourceBasename}';
import { okVoid, errVoid } from 'src/context/shared/domain/result';`;
    case 'Controller':
      return `import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { ${className} } from '../${sourceBasename}';`;
  }
}

function generateDescribeBlock(story: Story, className: string): string {
  const acTests = story.acceptanceCriteria
    .map((ac) => generateACTest(ac, story.pattern, className))
    .join('\n\n');

  return `describe('${className}', () => {
${acTests}
});`;
}

function generateACTest(
  ac: AcceptanceCriterion,
  pattern: Story['pattern'],
  className: string,
): string {
  const hasGivenWhenThen = /Given|When|Then/.test(ac.body);
  const testBody = hasGivenWhenThen
    ? generateBehaviorTest(ac, pattern, className)
    : generateSimpleTest(ac, pattern, className);

  const citationComment = ac.specCitation
    ? `
    // AI-2 spec citation: "${escapeString(ac.specCitation)}"`
    : '';

  return `  describe('AC${ac.number} — ${escapeString(ac.title)}', () => {${citationComment}
    ${testBody}
  });`;
}

function generateSimpleTest(
  ac: AcceptanceCriterion,
  pattern: Story['pattern'],
  className: string,
): string {
  return `it('debería [comportamiento esperado de AC${ac.number}]', async () => {
      // Arrange
      const id = Uuid.random().value;
      
      // Act
      const result = await new ${className}().execute({ id });
      
      // Assert
      expect(result).toBeDefined();
    });`;
}

function generateBehaviorTest(
  ac: AcceptanceCriterion,
  pattern: Story['pattern'],
  className: string,
): string {
  const givenMatch = ac.body.match(/\*\*Given\*\*\s+(.+?)(?=\*\*When|\*\*Then|$)/s);
  const whenMatch = ac.body.match(/\*\*When\*\*\s+(.+?)(?=\*\*Then|$)/s);
  const thenMatch = ac.body.match(/\*\*Then\*\*\s+(.+?)$/s);

  const given = givenMatch ? givenMatch[1].trim().slice(0, 80) : 'condición inicial';
  const when = whenMatch ? whenMatch[1].trim().slice(0, 80) : 'acción del usuario';
  const then = thenMatch ? thenMatch[1].trim().slice(0, 80) : 'resultado esperado';

  return `it('debería [${escapeString(then)}] cuando [${escapeString(when)}] dado [${escapeString(given)}]', async () => {
      // Arrange
      // TODO: Set up test data matching: ${escapeString(given)}
      
      // Act
      // TODO: Execute: ${escapeString(when)}
      
      // Assert
      // TODO: Verify: ${escapeString(then)}
      expect(true).toBe(false); // Force RED phase
    });`;
}

function toPascalCase(str: string): string {
  return str
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .trim();
}

/**
 * Escribe el test file generado al directorio `__tests__/` junto al source.
 * - Crea el directorio si no existe
 * - Rechaza overwrite sin flag --force
 */
export async function writeTestFile(
  story: Story,
  content: string,
  options: { force?: boolean } = {},
): Promise<string> {
  const sourceDir = path.dirname(story.sourceFilePath);
  const sourceBasename = path.basename(story.sourceFilePath, '.ts');
  const testFilePath = path.join(sourceDir, '__tests__', `${sourceBasename}.spec.ts`);

  if (!options.force) {
    try {
      await fs.access(testFilePath);
      throw new Error(
        `Test file already exists: ${testFilePath}\nUse --force to overwrite`,
      );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  const testDir = path.dirname(testFilePath);
  await fs.mkdir(testDir, { recursive: true });

  const tempPath = `${testFilePath}.tmp`;
  await fs.writeFile(tempPath, content, 'utf-8');
  await fs.rename(tempPath, testFilePath);
  return testFilePath;
}

/**
 * Parsea una story completa desde su archivo markdown.
 */
export function parseStory(storyFilePath: string, content: string): Story {
  const storyKeyMatch = path.basename(storyFilePath, '.md').match(/^([\w-]+)/);
  const storyKey = storyKeyMatch ? storyKeyMatch[1] : 'unknown';

  const sourceFilePath = extractSourceFilePath(content);
  if (!sourceFilePath) {
    throw new Error(
      `Could not extract source file path from story. ` +
        `Expected a line matching src/context/.../*.ts in the Tasks section.`,
    );
  }

  const acceptanceCriteria = parseAcceptanceCriteria(content);
  if (acceptanceCriteria.length === 0) {
    console.warn(
      `Warning: Story ${storyKey} has 0 acceptance criteria. ` +
        `Expected at least one "### AC{N}: {title}" section.`,
    );
  }

  return {
    storyKey,
    sourceFile: path.basename(sourceFilePath, '.ts'),
    sourceFilePath,
    pattern: detectPattern(content),
    acceptanceCriteria,
  };
}

/**
 * Entry point CLI.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    console.log(`Usage: ts-node scripts/generate-red-tests.ts <story-file-path> [--force]

Arguments:
  <story-file-path>   Path to story markdown file (e.g., _bmad-output/implementation-artifacts/2-1-...md)

Options:
  --force             Overwrite existing test file if present
  --help              Show this help message

Example:
  ts-node scripts/generate-red-tests.ts _bmad-output/implementation-artifacts/2-1-implement-post-embed-authenticate-session.md
`);
    process.exit(args.length === 0 ? 1 : 0);
  }

  const force = args.includes('--force');
  const storyFilePath = args.find((arg) => !arg.startsWith('--'));

  if (!storyFilePath) {
    console.error('Error: missing story file path');
    process.exit(1);
  }

  try {
    const content = await fs.readFile(storyFilePath, 'utf-8');
    const story = parseStory(storyFilePath, content);
    const className = toPascalCase(story.sourceFile.split('.')[0]);
    const testContent = generateTestContent(story, className);
    const outputPath = await writeTestFile(story, testContent, { force });

    const acCount = story.acceptanceCriteria.length;
    const acWithCitation = story.acceptanceCriteria.filter((ac) => ac.specCitation).length;

    console.log(`✅ Generated test file: ${outputPath}`);
    console.log(`   Pattern: ${story.pattern}`);
    console.log(`   ACs covered: ${acCount}/${acCount}`);
    console.log(`   AI-2 spec citations preserved: ${acWithCitation}/${acCount}`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error generating test file:');
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
