export const PROVIDER_REPOSITORY = Symbol('ProviderRepository');

export interface ProviderRecord {
  id: string;
  companyId: string;
  createdAt: Date;
  accessToken: string;
  demoAdminEmail: string;
  demoAdminPassword: string;
}

export interface ProviderSaveInput {
  companyId: string;
  accessToken: string;
  demoAdminEmail: string;
  demoAdminPassword: string;
}

export interface ProviderRepository {
  save(input: ProviderSaveInput): Promise<ProviderRecord>;
  findById(id: string): Promise<ProviderRecord | null>;
  findByCompanyId(companyId: string): Promise<ProviderRecord | null>;
  findByDemoAdminEmail(email: string): Promise<ProviderRecord | null>;
  findAll(): Promise<ProviderRecord[]>;
  companyIds(): Promise<string[]>;
  updateAccess(
    id: string,
    input: {
      accessToken?: string;
      demoAdminEmail?: string;
      demoAdminPassword?: string;
    },
  ): Promise<void>;
  delete(id: string): Promise<void>;
}
