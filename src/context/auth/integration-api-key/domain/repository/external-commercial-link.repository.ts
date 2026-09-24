export const EXTERNAL_COMMERCIAL_LINK_REPOSITORY =
  'EXTERNAL_COMMERCIAL_LINK_REPOSITORY';

export const LEADCARS_PROVIDER = 'leadcars';

export interface ExternalCommercialLink {
  id: string;
  companyId: string;
  externalUserId: string;
  userAccountId: string;
  provider: string;
}

export interface ExternalCommercialLinkRepository {
  findByExternalUserId(
    companyId: string,
    externalUserId: string,
    provider?: string,
  ): Promise<ExternalCommercialLink | null>;

  save(link: ExternalCommercialLink): Promise<void>;

  deleteByExternalUserId(
    companyId: string,
    externalUserId: string,
    provider?: string,
  ): Promise<void>;

  deleteByCompanyId(companyId: string): Promise<void>;
}
