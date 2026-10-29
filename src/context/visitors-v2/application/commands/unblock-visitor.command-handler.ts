import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UnblockVisitorCommand } from './unblock-visitor.command';
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
import { VisitorBlockForbiddenError } from '../../domain/errors/visitor-block.error';
import {
  COMMERCIAL_REPOSITORY,
  CommercialRepository,
} from '../../../commercial/domain/commercial.repository';
import { CommercialId } from '../../../commercial/domain/value-objects/commercial-id';
import { WebSocketGatewayBasic } from '../../../../websocket/websocket.gateway';

@CommandHandler(UnblockVisitorCommand)
export class UnblockVisitorCommandHandler
  implements ICommandHandler<UnblockVisitorCommand, Result<void, DomainError>>
{
  constructor(
    @Inject(VISITOR_V2_REPOSITORY)
    private readonly visitors: VisitorV2Repository,
    @Inject(COMMERCIAL_REPOSITORY)
    private readonly commercials: CommercialRepository,
    @Inject('WEBSOCKET_GATEWAY')
    private readonly websocketGateway: WebSocketGatewayBasic,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(
    command: UnblockVisitorCommand,
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

    const block = visitor.getBlock();
    if (!block) {
      return err(new VisitorV2DataError('El visitante no está bloqueado'));
    }
    if (!this.canUnblock(command, block.blockedBy)) {
      return err(new VisitorBlockForbiddenError());
    }

    const unblockedByName = await this.resolveName(
      command.actorId,
      command.actorName,
    );

    try {
      visitor.unblockVisitor({
        unblockedBy: command.actorId,
        unblockedByName,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo desbloquear';
      return err(new VisitorV2DataError(message));
    }

    const aggregate = this.publisher.mergeObjectContext(visitor);
    const saveResult = await this.visitors.save(aggregate);
    if (saveResult.isErr()) {
      return saveResult;
    }
    aggregate.commit();

    const payload = { visitorId: command.visitorId, blocked: false };
    this.websocketGateway.emitToRoom(
      `tenant:${command.companyId}`,
      'visitor:unblocked',
      payload,
    );
    this.websocketGateway.emitToRoom(
      `visitor:${command.visitorId}`,
      'visitor:unblocked',
      payload,
    );
    return okVoid();
  }

  private canUnblock(command: UnblockVisitorCommand, blockedBy: string): boolean {
    const roles = command.actorRoles ?? [];
    if (roles.includes('admin') || roles.includes('supervisor')) {
      return true;
    }
    return command.actorId === blockedBy;
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
      // Sin ficha de comercial, se usa el nombre de la sesión.
    }
    return fallback?.trim() || 'Comercial';
  }
}
