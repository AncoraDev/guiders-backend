import { IQuery } from '@nestjs/cqrs';

export class GetVisitorPageHistoryQuery implements IQuery {
  constructor(
    public readonly visitorId: string,
    public readonly limit: number = 50,
  ) {}
}
