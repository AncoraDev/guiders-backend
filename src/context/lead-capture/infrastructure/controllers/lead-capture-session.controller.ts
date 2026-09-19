import {
  BadRequestException,
  Body,
  Controller,
  Get,
  InternalServerErrorException,
  Logger,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DualAuthGuard } from 'src/context/shared/infrastructure/guards/dual-auth.guard';
import { RolesGuard } from 'src/context/shared/infrastructure/guards/role.guard';
import { Roles } from 'src/context/shared/infrastructure/roles.decorator';
import { AuthenticatedRequest } from 'src/context/shared/infrastructure/guards/auth.guard';
import {
  ApiAuthErrors,
  ApiInternalServerError,
  ApiValidationError,
} from 'src/context/shared/infrastructure/swagger';
import { Result } from 'src/context/shared/domain/result';
import {
  LeadCaptureSessionEnvelopeDto,
  LeadCaptureSessionResponseDto,
  SaveLeadCaptureSessionDto,
} from '../../application/dtos/lead-capture-session.dto';
import { SaveLeadCaptureSessionCommand } from '../../application/commands/save-lead-capture-session.command';
import { GetLeadCaptureSessionQuery } from '../../application/queries/get-lead-capture-session.query';
import { LeadCaptureSessionPrimitives } from '../../domain/entities/lead-capture-session';
import {
  InvalidLeadCaptureSessionError,
  LeadCaptureError,
} from '../../domain/errors/lead-capture.error';

/**
 * Progreso del asistente de captación. Es del visitante, no del chat: el SDK
 * abre un chat nuevo en cada visita sin conversación, y la captación a medias
 * tiene que sobrevivir a eso para poder reanudarla.
 */
@ApiTags('Lead Capture')
@ApiAuthErrors()
@ApiInternalServerError()
@Controller('v2/lead-capture')
@ApiBearerAuth()
@ApiCookieAuth('access_token')
@UseGuards(DualAuthGuard, RolesGuard)
@Roles(['visitor'])
export class LeadCaptureSessionController {
  private readonly logger = new Logger(LeadCaptureSessionController.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('session')
  @ApiOperation({
    summary: 'Recuperar la captación a medias del visitante',
    description:
      'Endpoint del SDK para reanudar el guion. `session` es null cuando el visitante nunca entró en él.',
  })
  @ApiResponse({ status: 200, type: LeadCaptureSessionEnvelopeDto })
  async getSession(
    @Req() req: AuthenticatedRequest,
  ): Promise<LeadCaptureSessionEnvelopeDto> {
    const visitorId = this.requireVisitorId(req);

    const result = await this.queryBus.execute<
      GetLeadCaptureSessionQuery,
      Result<LeadCaptureSessionPrimitives | null, LeadCaptureError>
    >(new GetLeadCaptureSessionQuery(visitorId));

    if (result.isErr()) {
      this.logger.error(
        `No se pudo leer la captación de ${visitorId}: ${result.error.message}`,
      );
      throw new InternalServerErrorException(
        'No se pudo leer el progreso de la captación',
      );
    }

    const session = result.unwrap();
    return {
      session: session
        ? LeadCaptureSessionResponseDto.fromPrimitives(session)
        : null,
    };
  }

  @Put('session')
  @ApiOperation({
    summary: 'Guardar el avance del asistente de captación',
    description:
      'Se llama en cada paso del guion. Es idempotente y no toca una captación ya enviada.',
  })
  @ApiBody({ type: SaveLeadCaptureSessionDto })
  @ApiResponse({ status: 200, type: LeadCaptureSessionEnvelopeDto })
  @ApiValidationError('El progreso no es válido')
  async saveSession(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SaveLeadCaptureSessionDto,
  ): Promise<LeadCaptureSessionEnvelopeDto> {
    const visitorId = this.requireVisitorId(req);

    const result = await this.commandBus.execute<
      SaveLeadCaptureSessionCommand,
      Result<void, LeadCaptureError>
    >(
      new SaveLeadCaptureSessionCommand({
        visitorId,
        companyId: req.user?.companyId,
        chatId: dto.chatId ?? null,
        flowId: dto.flowId,
        phase: dto.phase,
        stepId: dto.stepId ?? null,
        answers: dto.answers ?? [],
        trail: dto.trail ?? [],
      }),
    );

    if (result.isErr()) {
      if (result.error instanceof InvalidLeadCaptureSessionError) {
        throw new BadRequestException(result.error.message);
      }
      this.logger.error(
        `No se pudo guardar la captación de ${visitorId}: ${result.error.message}`,
      );
      throw new InternalServerErrorException(
        'No se pudo guardar el progreso de la captación',
      );
    }

    return this.getSession(req);
  }

  /** El progreso es del visitante autenticado, nunca de uno que venga en el cuerpo. */
  private requireVisitorId(req: AuthenticatedRequest): string {
    const visitorId = req.user?.id;
    if (!visitorId) {
      throw new BadRequestException('No se pudo identificar al visitante');
    }
    return visitorId;
  }
}
