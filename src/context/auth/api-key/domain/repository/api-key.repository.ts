import { ApiKey } from '../model/api-key';
import { ApiKeyDomain } from '../model/api-key-domain';
import { ApiKeyValue } from '../model/api-key-value';
import { ApiKeyCompanyId } from '../model/api-key-company-id';
export const API_KEY_REPOSITORY = 'API_KEY_REPOSITORY';
export interface ApiKeyRepository {
  save(apiKey: ApiKey): Promise<void>;
  getApiKeyByDomain(domain: ApiKeyDomain): Promise<ApiKey | null>;
  getApiKeyByApiKey(apiKey: ApiKeyValue): Promise<ApiKey | null>;
  getAllApiKeys(): Promise<ApiKey[]>;
  getApiKeysByCompanyId(companyId: ApiKeyCompanyId): Promise<ApiKey[]>;
  deleteByCompanyId(companyId: string): Promise<void>;
}
