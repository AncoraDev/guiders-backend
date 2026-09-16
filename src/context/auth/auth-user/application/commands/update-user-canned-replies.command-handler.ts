import { CommandHandler, ICommandHandler, EventPublisher } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { UpdateUserCannedRepliesCommand } from './update-user-canned-replies.command';
import {
  UserAccountRepository,
  USER_ACCOUNT_REPOSITORY,
} from '../../domain/user-account.repository';
import { Result, ok, err } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { CannedReplyPrimitives } from 'src/context/shared/domain/canned-reply';
import { UserAccountCannedReplies } from '../../domain/value-objects/user-account-canned-replies';

export class UserNotFoundForCannedRepliesError extends DomainError {
  constructor(userId: string) {
    super(`Usuario con ID ${userId} no encontrado`);
  }
}

export class CannedRepliesInvalidError extends DomainError {
  constructor(reason: string) {
    super(reason);
  }
}

@CommandHandler(UpdateUserCannedRepliesCommand)
export class UpdateUserCannedRepliesCommandHandler
  implements ICommandHandler<UpdateUserCannedRepliesCommand>
{
  private readonly logger = new Logger(
    UpdateUserCannedRepliesCommandHandler.name,
  );

  constructor(
    @Inject(USER_ACCOUNT_REPOSITORY)
    private readonly userRepository: UserAccountRepository,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(
    command: UpdateUserCannedRepliesCommand,
  ): Promise<Result<CannedReplyPrimitives[], DomainError>> {
    const user = await this.userRepository.findById(command.userId);
    if (!user) {
      return err(new UserNotFoundForCannedRepliesError(command.userId));
    }

    let replies: UserAccountCannedReplies;
    try {
      replies = UserAccountCannedReplies.fromInput(command.items);
    } catch (error) {
      return err(
        new CannedRepliesInvalidError(
          error instanceof Error ? error.message : 'Frases no válidas',
        ),
      );
    }

    const updated = user.updateCannedReplies(replies.getValue());
    const userCtx = this.publisher.mergeObjectContext(updated);
    await this.userRepository.save(userCtx);
    userCtx.commit();

    this.logger.log(
      `Frases rápidas actualizadas para usuario ${command.userId} (${replies.getValue().length})`,
    );

    return ok(replies.getValue());
  }
}
