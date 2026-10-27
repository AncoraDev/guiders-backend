import { ICommand } from '@nestjs/cqrs';

export class JoinWaitingRoomCommand implements ICommand {
  constructor(
    public readonly visitorId: string,
    public readonly visitorInfo: Record<string, any> = {},
    public readonly metadata: Record<string, any> = {},
    public readonly companyId: string = '',
    public readonly actorId: string = '',
  ) {}
}
