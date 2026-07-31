import { UserAccount } from './user-account.aggregate';
import { UserAccountCompanyId } from './value-objects/user-account-company-id';
import { UserAccountKeycloakId } from './value-objects/user-account-keycloak-id';
export const USER_ACCOUNT_REPOSITORY = 'USER_ACCOUNT_REPOSITORY';

export interface UserAccountRepository {
  findByEmail(email: string): Promise<UserAccount | null>;
  findById(id: string): Promise<UserAccount | null>;
  findByKeycloakId(
    keycloakId: UserAccountKeycloakId,
  ): Promise<UserAccount | null>;
  save(userAccount: UserAccount): Promise<void>;
  findByCompanyId(companyId: UserAccountCompanyId): Promise<UserAccount[]>;
  delete(id: string): Promise<void>;
}
