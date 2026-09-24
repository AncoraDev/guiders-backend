import { DomainError } from 'src/context/shared/domain/domain.error';

export type ExternalCommercialSyncCode =
  | 'EXTERNAL_USER_INVALID'
  | 'EXTERNAL_USER_EMAIL_TAKEN'
  | 'EXTERNAL_USER_OTHER_COMPANY'
  | 'EXTERNAL_USER_NOT_FOUND';

export class ExternalCommercialSyncError extends DomainError {
  constructor(
    public readonly code: ExternalCommercialSyncCode,
    message: string,
  ) {
    super(message);
  }
}
