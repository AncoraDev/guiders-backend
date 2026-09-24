import { Inject, Injectable } from '@nestjs/common';
import {
  PROVIDER_COMPANY_LINK_REPOSITORY,
  ProviderCompanyLinkRepository,
} from '../../domain/repository/provider-company-link.repository';

/**
 * La clave puede operar sobre su propia empresa o sobre una hija que ella creó.
 */
@Injectable()
export class ManagedCompanyAccess {
  constructor(
    @Inject(PROVIDER_COMPANY_LINK_REPOSITORY)
    private readonly links: ProviderCompanyLinkRepository,
  ) {}

  async allows(
    providerCompanyId: string,
    targetCompanyId: string,
  ): Promise<boolean> {
    if (providerCompanyId === targetCompanyId) return true;
    const link = await this.links.findByChild(targetCompanyId);
    return link?.providerCompanyId === providerCompanyId;
  }
}
