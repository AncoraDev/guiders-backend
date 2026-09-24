export const PROVIDER_COMPANY_LINK_REPOSITORY =
  'PROVIDER_COMPANY_LINK_REPOSITORY';

export interface ProviderCompanyLink {
  id: string;
  providerCompanyId: string;
  childCompanyId: string;
}

export interface ProviderCompanyLinkRepository {
  save(providerCompanyId: string, childCompanyId: string): Promise<void>;

  findByChild(childCompanyId: string): Promise<ProviderCompanyLink | null>;

  deleteByChild(childCompanyId: string): Promise<void>;

  deleteByProvider(providerCompanyId: string): Promise<void>;

  countByProvider(providerCompanyId: string): Promise<number>;
}
