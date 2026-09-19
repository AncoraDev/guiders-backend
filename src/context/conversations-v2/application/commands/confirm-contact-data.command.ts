import { ICommand } from '@nestjs/cqrs';

export class ConfirmContactDataCommand implements ICommand {
  constructor(
    public readonly chatId: string,
    public readonly commercialId: string,
    public readonly requestId: string,
    public readonly commercialName?: string,
  ) {}
}
