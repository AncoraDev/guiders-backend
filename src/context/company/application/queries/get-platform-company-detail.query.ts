import { IQuery } from '@nestjs/cqrs';

export class GetPlatformCompanyDetailQuery implements IQuery {
  constructor(public readonly companyId: string) {}
}
