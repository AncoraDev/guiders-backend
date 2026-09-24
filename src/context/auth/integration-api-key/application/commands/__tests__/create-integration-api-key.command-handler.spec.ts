import { CreateIntegrationApiKeyCommandHandler } from '../create-integration-api-key.command-handler';
import { CreateIntegrationApiKeyCommand } from '../create-integration-api-key.command';
import { IntegrationApiKeyRepository } from '../../../domain/repository/integration-api-key.repository';
import { IntegrationApiKeyGenerator } from '../../services/integration-api-key-generator';
import { UuidValueObject } from 'src/context/shared/domain/uuid-value-object';

describe('CreateIntegrationApiKeyCommandHandler', () => {
  let handler: CreateIntegrationApiKeyCommandHandler;
  let mockRepository: jest.Mocked<IntegrationApiKeyRepository>;
  let mockGenerator: jest.Mocked<IntegrationApiKeyGenerator>;

  const companyId = UuidValueObject.generate();
  const fakeHash = 'a'.repeat(64);
  const fakePlainToken = 'gdr_live_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
  const fakePrefix = 'gdr_live_a1b2...';

  beforeEach(() => {
    mockRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
      findByCompanyId: jest.fn(),
      findByTokenHash: jest.fn(),
      deleteByCompanyId: jest.fn(),
    };

    mockGenerator = {
      generate: jest.fn().mockResolvedValue({
        plainToken: fakePlainToken,
        tokenPrefix: fakePrefix,
        tokenHash: fakeHash,
      }),
    };

    handler = new CreateIntegrationApiKeyCommandHandler(
      mockRepository,
      mockGenerator,
    );
  });

  it('debe crear una API Key de integración con entorno live', async () => {
    const command = new CreateIntegrationApiKeyCommand(
      companyId,
      'Mi integración CRM',
      'live',
    );

    const result = await handler.execute(command);

    expect(result.isOk()).toBe(true);
    const data = result.unwrap();
    expect(data.plainToken).toBe(fakePlainToken);
    expect(data.tokenPrefix).toBe(fakePrefix);
    expect(data.environment).toBe('live');
    expect(data.name).toBe('Mi integración CRM');
    expect(data.id).toBeDefined();
    expect(data.createdAt).toBeInstanceOf(Date);
  });

  it('debe crear una API Key de integración con entorno test', async () => {
    const testHash = 'b'.repeat(64);
    const testToken = 'gdr_test_b1b2c3d4e5f6b1b2c3d4e5f6b1b2c3d4';
    mockGenerator.generate.mockResolvedValue({
      plainToken: testToken,
      tokenPrefix: 'gdr_test_b1b2...',
      tokenHash: testHash,
    });

    const command = new CreateIntegrationApiKeyCommand(
      companyId,
      'Test key',
      'test',
    );
    const result = await handler.execute(command);

    expect(result.isOk()).toBe(true);
    expect(result.unwrap().environment).toBe('test');
  });

  it('debe persistir la API Key en el repositorio', async () => {
    const command = new CreateIntegrationApiKeyCommand(
      companyId,
      'Mi CRM',
      'live',
    );
    await handler.execute(command);

    expect(mockRepository.save).toHaveBeenCalledTimes(1);
  });

  it('debe llamar al generador con el entorno correcto', async () => {
    const command = new CreateIntegrationApiKeyCommand(
      companyId,
      'Mi CRM',
      'test',
    );
    await handler.execute(command);

    expect(mockGenerator.generate).toHaveBeenCalledWith('test');
  });
});
