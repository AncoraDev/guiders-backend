import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { BlockVisitorCommand } from './block-visitor.command';
import {
  VISITOR_V2_REPOSITORY,
  VisitorV2Repository,
} from '../../domain/visitor-v2.repository';
import { VisitorId } from '../../domain/value-objects/visitor-id';
import { Result, err, okVoid } from '../../../shared/domain/result';
import { DomainError } from '../../../shared/domain/domain.error';
import {
  VisitorV2DataError,
  VisitorV2NotFoundError,
} from '../../domain/errors/visitor-v2.error';
import {
  COMMERCIAL_REPOSITORY,
  CommercialRepository,
} from '../../../commercial/domain/commercial.repository';
import { CommercialId } from '../../../commercial/domain/value-objects/commercial-id';

@CommandHandler(BlockVisitorCommand)
export class BlockVisitorCommandHandler
  implements ICommandHandler<BlockVisitorCommand, Result<void, DomainError>>
{
  constructor(
    @Inject(VISITOR_V2_REPOSITORY)
    private readonly visitors: VisitorV2Repository,
    @Inject(COMMERCIAL_REPOSITORY)
    private readonly commercials: CommercialRepository,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(
    command: BlockVisitorCommand,
  ): Promise<Result<void, DomainError>> {
    const visitorResult = await this.visitors.findById(
      new VisitorId(command.visitorId),
    );
    if (visitorResult.isErr()) {
      return err(new VisitorV2NotFoundError());
    }
    const visitor = visitorResult.unwrap();
    if (visitor.getTenantId().getValue() !== command.companyId) {
      return err(new VisitorV2NotFoundError());
    }

    const blockedByName = await this.resolveName(
      command.actorId,
      command.actorName,
    );

    try {
      visitor.blockVisitor({
        blockedBy: command.actorId,
        blockedByName,
        reason: command.reason,
        note: command.note,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo bloquear';
      return err(new VisitorV2DataError(message));
    }

    const aggregate = this.publisher.mergeObjectContext(visitor);
    const saveResult = await this.visitors.save(aggregate);
    if (saveResult.isErr()) {
      return saveResult;
    }
    aggregate.commit();
    return okVoid();
  }

  private async resolveName(actorId: string, fallback: string): Promise<string> {
    try {
      const result = await this.commercials.findById(new CommercialId(actorId));
      if (result.isOk()) {
        const commercial = result.unwrap();
        const name = commercial?.name.value?.trim();
        if (name) return name;
      }
    } catch {
      // El id del actor puede no ser un comercial todavía.
    }
    return fallback?.trim() || 'Comercial';
  }
}
