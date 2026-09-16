import { CommandHandler, ICommandHandler, EventPublisher } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { UpdateUserGreetingMessageCommand } from './update-user-greeting-message.command';
import {
  UserAccountRepository,
  USER_ACCOUNT_REPOSITORY,
} from '../../domain/user-account.repository';
import { Result, ok, err } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { UserAccountGreetingMessage } from '../../domain/value-objects/user-account-greeting-message';

export class UserNotFoundForGreetingError extends DomainError {
  constructor(userId: string) {
    super(`Usuario con ID ${userId} no encontrado`);
  }
}

export class GreetingMessageInvalidError extends DomainError {
  constructor(reason: string) {
    super(reason);
  }
}

@CommandHandler(UpdateUserGreetingMessageCommand)
export class UpdateUserGreetingMessageCommandHandler
  implements ICommandHandler<UpdateUserGreetingMessageCommand>
{
  private readonly logger = new Logger(
    UpdateUserGreetingMessageCommandHandler.name,
  );

  constructor(
    @Inject(USER_ACCOUNT_REPOSITORY)
    private readonly userRepository: UserAccountRepository,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(
    command: UpdateUserGreetingMessageCommand,
  ): Promise<Result<string | null, DomainError>> {
    const user = await this.userRepository.findById(command.userId);
    if (!user) {
      return err(new UserNotFoundForGreetingError(command.userId));
    }

    let greeting: UserAccountGreetingMessage;
    try {
      greeting = UserAccountGreetingMessage.fromInput(command.greetingMessage);
    } catch (error) {
      return err(
        new GreetingMessageInvalidError(
          error instanceof Error
            ? error.message
            : 'Mensaje de saludo no válido',
        ),
      );
    }

    const updated = user.updateGreetingMessage(greeting.getValue());
    const userCtx = this.publisher.mergeObjectContext(updated);
    await this.userRepository.save(userCtx);
    userCtx.commit();

    this.logger.log(
      `Saludo actualizado para usuario ${command.userId} (${greeting.getValue() ? 'personalizado' : 'por defecto'})`,
    );

    return ok(greeting.getValue());
  }
}
