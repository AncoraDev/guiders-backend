import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { WhiteLabelConfigController } from '../src/context/white-label/infrastructure/controllers/white-label-config.controller';
import {
  IWhiteLabelConfigRepository,
  WHITE_LABEL_CONFIG_REPOSITORY,
} from '../src/context/white-label/domain/white-label-config.repository';
import { WhiteLabelConfig } from '../src/context/white-label/domain/entities/white-label-config';
import { WhiteLabelConfigNotFoundError } from '../src/context/white-label/domain/errors/white-label.error';
import { ok, err } from '../src/context/shared/domain/result';
import { DomainError } from '../src/context/shared/domain/domain.error';
import { DualAuthGuard } from '../src/context/shared/infrastructure/guards/dual-auth.guard';
import { RolesGuard } from '../src/context/shared/infrastructure/guards/role.guard';
import { WhiteLabelFileUploadService } from '../src/context/white-label/infrastructure/services/white-label-file-upload.service';
import { Uuid } from '../src/context/shared/domain/value-objects/uuid';

/**
 * E2E tests para Story 1.1 — Extend white_label_configs schema for embed.
 *
 * Cubre el flujo completo de la API HTTP real:
 * - GET /v2/companies/:companyId/white-label → defaults embed
 * - PATCH válido embedEnabled + origins → 200 y persiste
 * - PATCH inválido (cross-field, regex, etc.) → 400
 * - PATCH parcial preserva el otro campo
 *
 * Mockeamos DualAuthGuard, RolesGuard, repository, y file upload service.
 */

class MockDualAuthGuard {
  canActivate(): boolean {
    return true;
  }
}

class MockRolesGuard {
  canActivate(): boolean {
    return true;
  }
}

class MockFileUploadService {
  async uploadLogo(): Promise<string> {
    return 'https://storage.example.com/logo.png';
  }
  async uploadFavicon(): Promise<string> {
    return 'https://storage.example.com/favicon.ico';
  }
  async uploadFont(): Promise<{ name: string; url: string }> {
    return { name: 'font.ttf', url: 'https://storage.example.com/font.ttf' };
  }
  async deleteFile(): Promise<void> {}
  async deleteFiles(): Promise<void> {}
}

describe('WhiteLabelConfigController - Story 1.1 embed (e2e)', () => {
  let app: INestApplication;
  let mockRepository: jest.Mocked<IWhiteLabelConfigRepository>;
  const COMPANY_ID = Uuid.random().value;
  const OTHER_COMPANY_ID = Uuid.random().value;

  // Storage in-memory para simular MongoDB
  let storage: Map<string, WhiteLabelConfig>;

  beforeEach(async () => {
    storage = new Map();

    mockRepository = {
      save: jest.fn(),
      findByCompanyId: jest.fn(),
      delete: jest.fn(),
      exists: jest.fn(),
    };

    // save() upsert: persiste en storage
    mockRepository.save.mockImplementation(async (config: WhiteLabelConfig) => {
      storage.set(config.companyId, config);
      return ok(undefined);
    });

    // findByCompanyId: lee de storage o retorna notFound
    mockRepository.findByCompanyId.mockImplementation(
      async (companyId: string) => {
        const config = storage.get(companyId);
        if (!config) {
          return err(new WhiteLabelConfigNotFoundError(companyId));
        }
        return ok(config);
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhiteLabelConfigController],
      providers: [
        {
          provide: WHITE_LABEL_CONFIG_REPOSITORY,
          useValue: mockRepository,
        },
        {
          provide: WhiteLabelFileUploadService,
          useClass: MockFileUploadService,
        },
      ],
    })
      .overrideGuard(DualAuthGuard)
      .useClass(MockDualAuthGuard)
      .overrideGuard(RolesGuard)
      .useClass(MockRolesGuard)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /v2/companies/:companyId/white-label', () => {
    it('debería devolver configuración con embedEnabled=false y embedAllowedOrigins=[] por defecto', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v2/companies/${COMPANY_ID}/white-label`)
        .expect(200);

      expect(response.body.embedEnabled).toBe(false);
      expect(response.body.embedAllowedOrigins).toEqual([]);
      expect(response.body.companyId).toBe(COMPANY_ID);
    });

    it('debería devolver embedEnabled=true y los origins cuando están persistidos', async () => {
      // Arrange: pre-llenar storage con embed habilitado
      const persisted = WhiteLabelConfig.createDefault(
        Uuid.random().value,
        COMPANY_ID,
        'Test',
      ).update({
        embed: {
          embedEnabled: true,
          embedAllowedOrigins: ['https://app.integrator.com'],
        },
      });
      storage.set(COMPANY_ID, persisted);

      // Act
      const response = await request(app.getHttpServer())
        .get(`/v2/companies/${COMPANY_ID}/white-label`)
        .expect(200);

      // Assert
      expect(response.body.embedEnabled).toBe(true);
      expect(response.body.embedAllowedOrigins).toEqual([
        'https://app.integrator.com',
      ]);
    });
  });

  describe('PATCH /v2/companies/:companyId/white-label - casos válidos', () => {
    it('debería aceptar embedEnabled=true con origins válidos', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/v2/companies/${COMPANY_ID}/white-label`)
        .send({
          embedEnabled: true,
          embedAllowedOrigins: ['https://app.integrator.com'],
        })
        .expect(200);

      expect(response.body.embedEnabled).toBe(true);
      expect(response.body.embedAllowedOrigins).toEqual([
        'https://app.integrator.com',
      ]);
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
    });

    it('debería aceptar múltiples origins https con puerto', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/v2/companies/${COMPANY_ID}/white-label`)
        .send({
          embedEnabled: true,
          embedAllowedOrigins: [
            'https://app.integrator.com',
            'https://staging.integrator.com:8080',
            'https://localhost:4200',
          ],
        })
        .expect(200);

      expect(response.body.embedAllowedOrigins).toEqual([
        'https://app.integrator.com',
        'https://staging.integrator.com:8080',
        'https://localhost:4200',
      ]);
    });

    it('debería persistir el cambio y ser visible en GET posterior', async () => {
      // PATCH
      await request(app.getHttpServer())
        .patch(`/v2/companies/${COMPANY_ID}/white-label`)
        .send({
          embedEnabled: true,
          embedAllowedOrigins: ['https://app.integrator.com'],
        })
        .expect(200);

      // GET
      const response = await request(app.getHttpServer())
        .get(`/v2/companies/${COMPANY_ID}/white-label`)
        .expect(200);

      expect(response.body.embedEnabled).toBe(true);
      expect(response.body.embedAllowedOrigins).toEqual([
        'https://app.integrator.com',
      ]);
    });

    it('debería permitir PATCH solo de embedEnabled (preserva origins existentes)', async () => {
      // Arrange: precargar con origins
      const persisted = WhiteLabelConfig.createDefault(
        Uuid.random().value,
        COMPANY_ID,
        'Test',
      ).update({
        embed: {
          embedEnabled: true,
          embedAllowedOrigins: ['https://app.integrator.com'],
        },
      });
      storage.set(COMPANY_ID, persisted);

      // Act: PATCH solo embedEnabled a false
      const response = await request(app.getHttpServer())
        .patch(`/v2/companies/${COMPANY_ID}/white-label`)
        .send({ embedEnabled: false })
        .expect(200);

      // Assert: embedEnabled cambió pero origins preservados
      expect(response.body.embedEnabled).toBe(false);
      expect(response.body.embedAllowedOrigins).toEqual([
        'https://app.integrator.com',
      ]);
    });

    it('debería permitir PATCH solo de embedAllowedOrigins (preserva embedEnabled=true)', async () => {
      // Arrange: precargar con embedEnabled=true
      const persisted = WhiteLabelConfig.createDefault(
        Uuid.random().value,
        COMPANY_ID,
        'Test',
      ).update({
        embed: {
          embedEnabled: true,
          embedAllowedOrigins: ['https://app.integrator.com'],
        },
      });
      storage.set(COMPANY_ID, persisted);

      // Act: PATCH solo origins
      const response = await request(app.getHttpServer())
        .patch(`/v2/companies/${COMPANY_ID}/white-label`)
        .send({
          embedAllowedOrigins: ['https://new-origin.com'],
        })
        .expect(200);

      // Assert: embedEnabled preservado, origins actualizados
      expect(response.body.embedEnabled).toBe(true);
      expect(response.body.embedAllowedOrigins).toEqual([
        'https://new-origin.com',
      ]);
    });
  });

  describe('PATCH /v2/companies/:companyId/white-label - casos inválidos (400)', () => {
    it('debería rechazar embedEnabled=true con embedAllowedOrigins=[] (cross-field)', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/v2/companies/${COMPANY_ID}/white-label`)
        .send({
          embedEnabled: true,
          embedAllowedOrigins: [],
        })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            'embedAllowedOrigins debe contener al menos un origen',
          ),
        ]),
      );
    });

    it('debería rechazar origin con scheme javascript:', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/v2/companies/${COMPANY_ID}/white-label`)
        .send({
          embedAllowedOrigins: ['javascript:alert(1)'],
        })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('cada origen debe tener formato https://'),
        ]),
      );
    });

    it('debería rechazar origin con scheme http:// (no https)', async () => {
      await request(app.getHttpServer())
        .patch(`/v2/companies/${COMPANY_ID}/white-label`)
        .send({
          embedAllowedOrigins: ['http://app.integrator.com'],
        })
        .expect(400);
    });

    it('debería rechazar origin con path', async () => {
      await request(app.getHttpServer())
        .patch(`/v2/companies/${COMPANY_ID}/white-label`)
        .send({
          embedAllowedOrigins: ['https://app.integrator.com/dashboard'],
        })
        .expect(400);
    });

    it('debería rechazar origin con query string', async () => {
      await request(app.getHttpServer())
        .patch(`/v2/companies/${COMPANY_ID}/white-label`)
        .send({
          embedAllowedOrigins: ['https://app.integrator.com?foo=bar'],
        })
        .expect(400);
    });

    it('debería rechazar origin con fragment', async () => {
      await request(app.getHttpServer())
        .patch(`/v2/companies/${COMPANY_ID}/white-label`)
        .send({
          embedAllowedOrigins: ['https://app.integrator.com#section'],
        })
        .expect(400);
    });

    it('debería rechazar wildcard *', async () => {
      await request(app.getHttpServer())
        .patch(`/v2/companies/${COMPANY_ID}/white-label`)
        .send({
          embedAllowedOrigins: ['*'],
        })
        .expect(400);
    });

    it('debería rechazar string vacío como origin', async () => {
      await request(app.getHttpServer())
        .patch(`/v2/companies/${COMPANY_ID}/white-label`)
        .send({
          embedAllowedOrigins: [''],
        })
        .expect(400);
    });

    it('debería rechazar array con más de 50 elementos', async () => {
      const origins = Array(51).fill('https://app.integrator.com');
      await request(app.getHttpServer())
        .patch(`/v2/companies/${COMPANY_ID}/white-label`)
        .send({
          embedEnabled: true,
          embedAllowedOrigins: origins,
        })
        .expect(400);
    });

    it('debería aceptar exactamente 50 elementos (límite)', async () => {
      const origins = Array(50).fill('https://app.integrator.com');
      await request(app.getHttpServer())
        .patch(`/v2/companies/${COMPANY_ID}/white-label`)
        .send({
          embedEnabled: true,
          embedAllowedOrigins: origins,
        })
        .expect(200);
    });

    it('debería rechazar embedEnabled que no sea boolean', async () => {
      await request(app.getHttpServer())
        .patch(`/v2/companies/${COMPANY_ID}/white-label`)
        .send({
          embedEnabled: 'true', // string en lugar de boolean
        })
        .expect(400);
    });

    it('debería rechazar embedAllowedOrigins que no sea array', async () => {
      await request(app.getHttpServer())
        .patch(`/v2/companies/${COMPANY_ID}/white-label`)
        .send({
          embedAllowedOrigins: 'https://app.integrator.com', // string en lugar de array
        })
        .expect(400);
    });
  });

  describe('multi-tenant isolation', () => {
    it('debería aislar configs entre empresas diferentes', async () => {
      // PATCH empresa A
      await request(app.getHttpServer())
        .patch(`/v2/companies/${COMPANY_ID}/white-label`)
        .send({
          embedEnabled: true,
          embedAllowedOrigins: ['https://a.integrator.com'],
        })
        .expect(200);

      // PATCH empresa B
      await request(app.getHttpServer())
        .patch(`/v2/companies/${OTHER_COMPANY_ID}/white-label`)
        .send({
          embedEnabled: true,
          embedAllowedOrigins: ['https://b.integrator.com'],
        })
        .expect(200);

      // GET empresa A solo ve sus origins
      const responseA = await request(app.getHttpServer())
        .get(`/v2/companies/${COMPANY_ID}/white-label`)
        .expect(200);
      expect(responseA.body.embedAllowedOrigins).toEqual([
        'https://a.integrator.com',
      ]);

      // GET empresa B solo ve sus origins
      const responseB = await request(app.getHttpServer())
        .get(`/v2/companies/${OTHER_COMPANY_ID}/white-label`)
        .expect(200);
      expect(responseB.body.embedAllowedOrigins).toEqual([
        'https://b.integrator.com',
      ]);
    });
  });
});
