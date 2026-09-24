import { DomainError } from 'src/context/shared/domain/domain.error';

export type ManagedCompanyCode = 'MANAGED_COMPANY_NOT_FOUND';

export class ManagedCompanyError extends DomainError {
  constructor(
    readonly code: ManagedCompanyCode,
    message: string,
  ) {
    super(message);
  }
}
