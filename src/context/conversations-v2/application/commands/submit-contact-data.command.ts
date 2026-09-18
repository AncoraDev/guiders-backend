import { ICommand } from '@nestjs/cqrs';
import { ContactRequestPayload } from '../../domain/entities/message.aggregate';

export interface SubmitContactDataPayload extends ContactRequestPayload {
  acceptedPrivacyPolicy?: boolean;
  acceptedMarketing?: boolean;
}

export class SubmitContactDataCommand implements ICommand {
  constructor(
    public readonly chatId: string,
    public readonly visitorId: string,
    public readonly data: SubmitContactDataPayload,
    public readonly ipAddress: string = '',
    public readonly userAgent?: string,
  ) {}
}
