import { IntegrationApiKey } from '../model/integration-api-key.aggregate';
import { IntegrationApiKeyId } from '../model/integration-api-key-id';
import { IntegrationApiKeyCompanyId } from '../model/integration-api-key-company-id';
import { IntegrationApiKeyToken } from '../model/integration-api-key-token';

export const INTEGRATION_API_KEY_REPOSITORY = 'INTEGRATION_API_KEY_REPOSITORY';

export interface IntegrationApiKeyRepository {
  save(key: IntegrationApiKey): Promise<void>;
  findById(id: IntegrationApiKeyId): Promise<IntegrationApiKey | null>;
  findByCompanyId(
    companyId: IntegrationApiKeyCompanyId,
  ): Promise<IntegrationApiKey[]>;
  findByTokenHash(
    tokenHash: IntegrationApiKeyToken,
  ): Promise<IntegrationApiKey | null>;

  deleteByCompanyId(companyId: string): Promise<void>;
}
