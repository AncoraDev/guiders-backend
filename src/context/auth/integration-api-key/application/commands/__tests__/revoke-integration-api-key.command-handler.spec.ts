import { RevokeIntegrationApiKeyCommandHandler } from '../revoke-integration-api-key.command-handler';
import { RevokeIntegrationApiKeyCommand } from '../revoke-integration-api-key.command';
import { IntegrationApiKeyRepository } from '../../../domain/repository/integration-api-key.repository';
import { IntegrationApiKey } from '../../../domain/model/integration-api-key.aggregate';
import { IntegrationApiKeyCompanyId } from '../../../domain/model/integration-api-key-company-id';
import { IntegrationApiKeyName } from '../../../domain/model/integration-api-key-name';
import { IntegrationApiKeyToken } from '../../../domain/model/integration-api-key-token';
import { IntegrationApiKeyEnvironment } from '../../../domain/model/integration-api-key-environment';
import {
  IntegrationApiKeyNotFoundError,
  IntegrationApiKeyAlreadyRevokedError,
} from '../../../domain/errors/integration-api-key.errors';
import { UuidValueObject } from 'src/context/shared/domain/uuid-value-object';

describe('RevokeIntegrationApiKeyCommandHandler', () => {
  let handler: RevokeIntegrationApiKeyCommandHandler;
  let mockRepository: jest.Mocked<IntegrationApiKeyRepository>;

  const companyId = UuidValueObject.generate();
  const keyId = UuidValueObject.generate();

  function buildActiveKey(overrideCompanyId?: string): IntegrationApiKey {
    return IntegrationApiKey.create({
      companyId: IntegrationApiKeyCompanyId.create(
        overrideCompanyId ?? companyId,
      ),
      name: IntegrationApiKeyName.of('Test Key'),
      tokenHash: IntegrationApiKeyToken.of('a'.repeat(64)),
      tokenPrefix: 'gdr_live_a1b2...',
      environment: IntegrationApiKeyEnvironment.LIVE,
    });
  }

  beforeEach(() => {
    mockRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
      findByCompanyId: jest.fn(),
      findByTokenHash: jest.fn(),
      deleteByCompanyId: jest.fn(),
    };

    handler = new RevokeIntegrationApiKeyCommandHandler(mockRepository);
  });

  it('debe revocar una API Key activa', async () => {
    const activeKey = buildActiveKey();
    mockRepository.findById.mockResolvedValue(activeKey);

    const command = new RevokeIntegrationApiKeyCommand(
      activeKey.id.getValue(),
      companyId,
    );
    const result = await handler.execute(command);

    expect(result.isOk()).toBe(true);
    expect(mockRepository.save).toHaveBeenCalledTimes(1);
    const savedKey = mockRepository.save.mock.calls[0][0];
    expect(savedKey.status.isRevoked()).toBe(true);
    expect(savedKey.revokedAt).toBeInstanceOf(Date);
  });

  it('debe retornar error si la API Key no existe', async () => {
    mockRepository.findById.mockResolvedValue(null);

    const command = new RevokeIntegrationApiKeyCommand(keyId, companyId);
    const result = await handler.execute(command);

    expect(result.isErr()).toBe(true);
    expect((result as any).error).toBeInstanceOf(
      IntegrationApiKeyNotFoundError,
    );
  });

  it('debe retornar error si la API Key pertenece a otra compañía', async () => {
    const otherCompanyId = UuidValueObject.generate();
    const keyFromOtherCompany = buildActiveKey(otherCompanyId);
    mockRepository.findById.mockResolvedValue(keyFromOtherCompany);

    const command = new RevokeIntegrationApiKeyCommand(
      keyFromOtherCompany.id.getValue(),
      companyId,
    );
    const result = await handler.execute(command);

    expect(result.isErr()).toBe(true);
    expect((result as any).error).toBeInstanceOf(
      IntegrationApiKeyNotFoundError,
    );
  });

  it('debe retornar error si la API Key ya está revocada', async () => {
    const activeKey = buildActiveKey();
    const revokedKey = activeKey.revoke();
    mockRepository.findById.mockResolvedValue(revokedKey);

    const command = new RevokeIntegrationApiKeyCommand(
      revokedKey.id.getValue(),
      companyId,
    );
    const result = await handler.execute(command);

    expect(result.isErr()).toBe(true);
    expect((result as any).error).toBeInstanceOf(
      IntegrationApiKeyAlreadyRevokedError,
    );
  });
});
