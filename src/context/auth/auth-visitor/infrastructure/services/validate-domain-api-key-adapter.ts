import { Inject, Injectable, Logger } from '@nestjs/common';
import { ValidateDomainApiKey } from '../../application/services/validate-domain-api-key';
import { VisitorAccountApiKey } from '../../domain/models/visitor-account-api-key';
import {
  API_KEY_REPOSITORY,
  ApiKeyRepository,
} from 'src/context/auth/api-key/domain/repository/api-key.repository';
import { ConfigService } from '@nestjs/config';
import {
  domainsMatch,
  normalizeDomainForMatching,
} from 'src/context/shared/domain/domain-matching.util';

@Injectable()
export class ValidateDomainApiKeyAdapter implements ValidateDomainApiKey {
  private readonly logger = new Logger(ValidateDomainApiKeyAdapter.name);
  constructor(
    @Inject(API_KEY_REPOSITORY) private readonly repository: ApiKeyRepository,
    private readonly configService: ConfigService,
  ) {}

  async validate(params: {
    apiKey: VisitorAccountApiKey;
    domain: string;
  }): Promise<boolean> {
    const apiKey = await this.repository.getApiKeyByApiKey(params.apiKey);
    if (!apiKey) {
      return false;
    }

    // Ignorar www. y puerto: example.com:8083 ≡ example.com
    const normalizedStoredDomain = normalizeDomainForMatching(
      apiKey.domain.getValue(),
    );
    const normalizedProvidedDomain = normalizeDomainForMatching(params.domain);

    this.logger.log('Stored domain (normalized): ' + normalizedStoredDomain);
    this.logger.log(
      'Provided domain (normalized): ' + normalizedProvidedDomain,
    );

    return domainsMatch(apiKey.domain.getValue(), params.domain);
  }

  /** @deprecated Usar normalizeDomainForMatching — se mantiene por tests legacy */
  private normalizeDomain(domain: string): string {
    return normalizeDomainForMatching(domain);
  }
}
