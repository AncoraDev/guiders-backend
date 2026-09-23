/**
 * Tests para MongoEmbedTokenAuditLogRepositoryImpl (TD-8).
 *
 * Verifica que el repositorio persiste audit log events correctamente
 * incluso cuando el campo `origin` está vacío (no hay header Origin
 * ni Referer en la request). El schema requiere `origin` como `string`
 * no vacío en algunos casos.
 *
 * TD-8 BUG: el schema declara `origin` como `required: true` SIN
 * permitir empty string. En producción, cuando `extractAuditContext`
 * retorna `origin: ''` (sin headers), Mongoose rechaza la inserción
 * con `ValidationError: origin: Path 'origin' is required`.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ok, err, okVoid } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { EmbedTokenAuditLogSchema } from '../../schemas/embed-token-audit-log.schema';
import { MongoEmbedAuditLogPersistenceError } from '../mongo-embed-token-audit-log.repository.impl';

/**
 * Mock del Mongoose Model que simula el comportamiento de validación.
 *
 * - `required: true` rechaza `undefined` PERO acepta empty string `''`
 *   por defecto en Mongoose (porque `''` es un string válido).
 *
 * TD-8 REAL: Si schema se cambia a `required: () => true` o se añade
 * `minlength: 1`, Mongoose rechazaría empty string. El test verifica
 * el comportamiento actual y documenta el contrato esperado.
 */
function createMockModel(opts: { shouldFailOnEmptyOrigin?: boolean }): {
  create: jest.Mock;
  aggregate: jest.Mock;
  db: { close: jest.Mock };
} {
  const createMock = jest.fn(async (doc: Record<string, unknown>) => {
    // Simula validación Mongoose para `origin`
    const origin = doc['origin'];
    if (opts.shouldFailOnEmptyOrigin) {
      if (origin === undefined || origin === '' || origin === null) {
        throw new Error(
          `EmbedTokenAuditLogSchema validation failed: origin: Path 'origin' is required`,
        );
      }
    } else {
      // Comportamiento por defecto de Mongoose: empty string es válido
      if (origin === undefined || origin === null) {
        throw new Error(
          `EmbedTokenAuditLogSchema validation failed: origin: Path 'origin' is required`,
        );
      }
    }
    return doc;
  });

  const aggregateMock = jest.fn().mockReturnValue({
    exec: jest.fn().mockResolvedValue([{ total: [{ count: 0 }], events: [] }]),
  });

  return {
    create: createMock,
    aggregate: aggregateMock,
    db: { close: jest.fn().mockResolvedValue(undefined) },
  };
}

describe('MongoEmbedTokenAuditLogRepositoryImpl - TD-8 origin validation', () => {
  let module: TestingModule;

  afterEach(async () => {
    if (module) await module.close();
  });

  describe('save() — comportamiento de validación de origin', () => {
    it('debe aceptar origin con valor HTTP URL estándar', async () => {
      const mockModel = createMockModel({ shouldFailOnEmptyOrigin: true });
      const { MongoEmbedTokenAuditLogRepositoryImpl } = await import(
        '../mongo-embed-token-audit-log.repository.impl'
      );

      module = await Test.createTestingModule({
        providers: [
          MongoEmbedTokenAuditLogRepositoryImpl,
          {
            provide: getModelToken(EmbedTokenAuditLogSchema.name),
            useValue: mockModel,
          },
        ],
      }).compile();

      const repo = module.get(MongoEmbedTokenAuditLogRepositoryImpl);

      const result = await repo.save({
        id: Uuid.random().value,
        companyId: Uuid.random().value,
        userId: Uuid.random().value,
        origin: 'https://app.integrator.com',
        timestamp: new Date(),
        ipAddressHash: 'a'.repeat(16),
        userAgent: 'Mozilla/5.0',
        endpoint: '/v2/integration/embed/start',
        result: 'success',
      });

      expect(result.isOk()).toBe(true);
    });

    it('debe aceptar origin vacío cuando NO hay headers (server-to-server, ej: curl)', async () => {
      // TD-8 contrato esperado: `origin` puede ser empty string cuando
      // ni Origin ni Referer están presentes (caso de integradores que
      // llaman desde backend sin browser). El repository NO debe rechazar
      // la inserción — el audit log sigue siendo válido (companyId +
      // endpoint + timestamp son los identificadores reales).
      //
      // BUG ACTUAL (TD-8): el handler `extractAuditContext` retorna
      // `origin: ''` por defecto. Si el schema se configura para
      // rechazar empty strings, TODAS las inserciones fallan en
      // producción para integradores que no envían Origin.
      const mockModel = createMockModel({ shouldFailOnEmptyOrigin: true });
      const { MongoEmbedTokenAuditLogRepositoryImpl } = await import(
        '../mongo-embed-token-audit-log.repository.impl'
      );

      module = await Test.createTestingModule({
        providers: [
          MongoEmbedTokenAuditLogRepositoryImpl,
          {
            provide: getModelToken(EmbedTokenAuditLogSchema.name),
            useValue: mockModel,
          },
        ],
      }).compile();

      const repo = module.get(MongoEmbedTokenAuditLogRepositoryImpl);

      const result = await repo.save({
        id: Uuid.random().value,
        companyId: Uuid.random().value,
        userId: Uuid.random().value,
        origin: '', // ← empty string (TD-8 case)
        timestamp: new Date(),
        ipAddressHash: 'a'.repeat(16),
        userAgent: '',
        endpoint: '/v2/integration/embed/refresh',
        result: 'success',
      });

      // Aceptar empty string es el comportamiento correcto (current Mongoose default)
      expect(result.isOk()).toBe(true);
      expect(mockModel.create).toHaveBeenCalledTimes(1);
    });

    it('debe normalizar origin undefined a sentinel (none) (defensivo)', async () => {
      // TD-8: incluso si un caller bug pasa `undefined`, el repository
      // normaliza a `'(none)'` en lugar de propagar el bug al schema
      // (que podría fallar la validación).
      const mockModel = createMockModel({ shouldFailOnEmptyOrigin: true });
      const { MongoEmbedTokenAuditLogRepositoryImpl } = await import(
        '../mongo-embed-token-audit-log.repository.impl'
      );

      module = await Test.createTestingModule({
        providers: [
          MongoEmbedTokenAuditLogRepositoryImpl,
          {
            provide: getModelToken(EmbedTokenAuditLogSchema.name),
            useValue: mockModel,
          },
        ],
      }).compile();

      const repo = module.get(MongoEmbedTokenAuditLogRepositoryImpl);

      const result = await repo.save({
        id: Uuid.random().value,
        companyId: Uuid.random().value,
        userId: Uuid.random().value,
        origin: undefined as unknown as string, // ← bug en caller
        timestamp: new Date(),
        ipAddressHash: 'a'.repeat(16),
        userAgent: '',
        endpoint: '/embed/authenticate-session',
        result: 'success',
      });

      // TD-8 contract: undefined se trata como "no había Origin header" → '(none)'
      expect(result.isOk()).toBe(true);
      const createdDoc = mockModel.create.mock.calls[0][0];
      expect(createdDoc.origin).toBe('(none)');
    });

    it('debe preservar origin URL real (no normaliza)', async () => {
      const mockModel = createMockModel({ shouldFailOnEmptyOrigin: true });
      const { MongoEmbedTokenAuditLogRepositoryImpl } = await import(
        '../mongo-embed-token-audit-log.repository.impl'
      );

      module = await Test.createTestingModule({
        providers: [
          MongoEmbedTokenAuditLogRepositoryImpl,
          {
            provide: getModelToken(EmbedTokenAuditLogSchema.name),
            useValue: mockModel,
          },
        ],
      }).compile();

      const repo = module.get(MongoEmbedTokenAuditLogRepositoryImpl);

      const result = await repo.save({
        id: Uuid.random().value,
        companyId: Uuid.random().value,
        userId: Uuid.random().value,
        origin: 'https://app.integrator.com',
        timestamp: new Date(),
        ipAddressHash: 'a'.repeat(16),
        userAgent: 'Mozilla/5.0',
        endpoint: '/v2/integration/embed/start',
        result: 'success',
      });

      expect(result.isOk()).toBe(true);
      const createdDoc = mockModel.create.mock.calls[0][0];
      expect(createdDoc.origin).toBe('https://app.integrator.com');
    });
  });

  describe('extractAuditContext — siempre retorna string', () => {
    it('debe retornar origin como string vacío cuando no hay headers', async () => {
      const { extractAuditContext } = await import(
        'src/context/shared/utils/audit-context'
      );

      const fakeReq = {
        headers: {},
        ip: '127.0.0.1',
      } as unknown as import('express').Request;

      const ctx = extractAuditContext(fakeReq);

      // AI-3: verificación específica
      expect(typeof ctx.origin).toBe('string');
      expect(ctx.origin).toBe('');
      expect(typeof ctx.ipAddress).toBe('string');
      expect(typeof ctx.userAgent).toBe('string');
    });

    it('debe retornar origin desde header Origin cuando está presente', async () => {
      const { extractAuditContext } = await import(
        'src/context/shared/utils/audit-context'
      );

      const fakeReq = {
        headers: { origin: 'https://app.integrator.com' },
        ip: '127.0.0.1',
      } as unknown as import('express').Request;

      const ctx = extractAuditContext(fakeReq);

      expect(ctx.origin).toBe('https://app.integrator.com');
    });

    it('debe retornar origin desde Referer cuando Origin no está', async () => {
      const { extractAuditContext } = await import(
        'src/context/shared/utils/audit-context'
      );

      const fakeReq = {
        headers: {
          referer: 'https://example.com/page',
        },
        ip: '127.0.0.1',
      } as unknown as import('express').Request;

      const ctx = extractAuditContext(fakeReq);

      expect(ctx.origin).toBe('https://example.com/page');
    });
  });
});
