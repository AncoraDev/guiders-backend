export interface SyncCommercialFromExternalResult {
  userId: string;
  externalUserId: string;
  active: boolean;
  created: boolean;
}

export class SyncCommercialFromExternalCommand {
  constructor(
    public readonly companyId: string,
    public readonly externalUserId: string,
    public readonly email: string,
    public readonly firstName: string,
    public readonly lastName: string = '',
    public readonly roles: string[] = ['commercial'],
    public readonly active: boolean = true,
  ) {}
}
