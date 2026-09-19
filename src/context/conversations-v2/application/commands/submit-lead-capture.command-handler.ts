import {
  BadRequestException,
  Inject,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import {
  CommandBus,
  CommandHandler,
  EventPublisher,
  ICommandHandler,
} from '@nestjs/cqrs';
import { SubmitLeadCaptureCommand } from './submit-lead-capture.command';
import { RecordConsentCommand } from 'src/context/consent/application/commands/record-consent.command';
import { getCurrentConsentVersion } from 'src/context/consent/domain/config/consent-version.config';
import { ConsentError } from 'src/context/consent/domain/errors/consent.error';
import { SaveLeadContactDataCommand } from 'src/context/leads/application/commands/save-lead-contact-data.command';
import { CompleteLeadCaptureSessionCommand } from 'src/context/lead-capture/application/commands/complete-lead-capture-session.command';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { Result } from 'src/context/shared/domain/result';
import {
  CHAT_V2_REPOSITORY,
  IChatRepository,
} from '../../domain/chat.repository';
import {
  IMessageRepository,
  MESSAGE_V2_REPOSITORY,
} from '../../domain/message.repository';
import {
  LeadCaptureAnswer,
  Message,
} from '../../domain/entities/message.aggregate';
import { ChatId } from '../../domain/value-objects/chat-id';
import { MessageResponseDto } from '../dtos/message-response.dto';

/** Campos que van a la ficha del lead; el resto acaba en additionalData. */
const LEAD_FIELDS = new Set([
  'nombre',
  'apellidos',
  'email',
  'telefono',
  'poblacion',
]);

@CommandHandler(SubmitLeadCaptureCommand)
export class SubmitLeadCaptureCommandHandler
  implements ICommandHandler<SubmitLeadCaptureCommand, MessageResponseDto>
{
  private readonly logger = new Logger(SubmitLeadCaptureCommandHandler.name);

  constructor(
    @Inject(CHAT_V2_REPOSITORY)
    private readonly chatRepository: IChatRepository,
    @Inject(MESSAGE_V2_REPOSITORY)
    private readonly messageRepository: IMessageRepository,
    private readonly publisher: EventPublisher,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(
    command: SubmitLeadCaptureCommand,
  ): Promise<MessageResponseDto> {
    const chatResult = await this.chatRepository.findById(
      ChatId.create(command.chatId),
    );
    if (chatResult.isErr()) {
      throw new BadRequestException(
        `Chat no encontrado: ${chatResult.error.message}`,
      );
    }

    const chat = chatResult.unwrap();
    if (chat.visitorId.value !== command.visitorId) {
      throw new BadRequestException('El visitante no pertenece a este chat');
    }

    if (command.data.acceptedPrivacyPolicy !== true) {
      throw new BadRequestException('Debes aceptar la política de privacidad');
    }

    const nombre = command.data.nombre?.trim() ?? '';
    const email = command.data.email?.trim() ?? '';
    const telefono = command.data.telefono?.trim() ?? '';
    // Mismo criterio de lead que aplica el contexto leads: nombre + una vía de contacto.
    if (!nombre || (!email && !telefono)) {
      throw new BadRequestException(
        'Necesitamos el nombre y un email o teléfono de contacto',
      );
    }

    const answers = command.data.answers ?? [];
    const acceptedMarketing = command.data.acceptedMarketing === true;
    const contact = {
      nombre,
      apellidos: command.data.apellidos?.trim() || undefined,
      email: email || undefined,
      telefono: telefono || undefined,
      poblacion: command.data.poblacion?.trim() || undefined,
    };

    // El lead es el objetivo de la captación, así que se guarda antes de dejar
    // el mensaje en el hilo: si falla, el visitante puede reintentar.
    await this.saveLead(command, chat.companyId, contact, acceptedMarketing);

    const submission = Message.createInteractiveMessage({
      chatId: command.chatId,
      senderId: command.visitorId,
      content: 'Datos de contacto recogidos por el asistente',
      systemData: {
        action: 'lead_capture_submission',
        status: 'submitted',
        fromUserId: command.visitorId,
        flowId: command.data.flowId,
        answers,
        capturedWithoutAgent: true,
        acceptedPrivacyPolicy: true,
        acceptedMarketing,
        data: contact,
      },
    });

    const aggregate = this.publisher.mergeObjectContext(submission);
    const saved = await this.messageRepository.save(aggregate);
    if (saved.isErr()) {
      // El lead ya está guardado, así que no se pierde el contacto.
      this.logger.error(
        `No se pudo dejar el resumen de captación en el chat ${command.chatId}: ${saved.error.message}`,
      );
      throw new InternalServerErrorException(
        'No se pudo registrar el resumen en la conversación',
      );
    }
    aggregate.commit();

    await this.closeCaptureSession(command, chat.companyId);
    await this.recordConsents(command, chat.companyId, acceptedMarketing);

    this.logger.log(
      `Captación sin agentes completada en chat ${command.chatId} (guion ${
        command.data.flowId ?? 'sin id'
      })`,
    );

    const primitives = submission.toPrimitives();
    return {
      id: primitives.id,
      chatId: primitives.chatId,
      senderId: primitives.senderId,
      content: primitives.content,
      type: primitives.type,
      systemData: primitives.systemData,
      isInternal: primitives.isInternal,
      isFirstResponse: primitives.isFirstResponse,
      isRead: primitives.isRead,
      isAI: primitives.isAI,
      createdAt: primitives.createdAt.toISOString(),
      updatedAt: primitives.updatedAt.toISOString(),
    };
  }

  private async saveLead(
    command: SubmitLeadCaptureCommand,
    companyId: string,
    contact: {
      nombre: string;
      apellidos?: string;
      email?: string;
      telefono?: string;
      poblacion?: string;
    },
    acceptedMarketing: boolean,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      SaveLeadContactDataCommand,
      Result<string, DomainError>
    >(
      new SaveLeadContactDataCommand({
        visitorId: command.visitorId,
        companyId,
        ...contact,
        acceptedPrivacyPolicy: true,
        acceptedMarketing,
        additionalData: this.buildAdditionalData(command),
        extractedFromChatId: command.chatId,
      }),
    );

    if (result.isErr()) {
      this.logger.error(
        `No se pudo guardar el lead de la captación del chat ${command.chatId}: ${result.error.message}`,
      );
      throw new InternalServerErrorException(
        'No se pudieron guardar tus datos, inténtalo de nuevo',
      );
    }
  }

  /**
   * Cierra la captación del visitante para que el asistente no se le vuelva a
   * ofrecer. Un fallo aquí no invalida el lead: como mucho el visitante vería
   * el guion otra vez, y el resumen del hilo ya lo evita en este chat.
   */
  private async closeCaptureSession(
    command: SubmitLeadCaptureCommand,
    companyId: string,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      CompleteLeadCaptureSessionCommand,
      Result<void, DomainError>
    >(
      new CompleteLeadCaptureSessionCommand(
        command.visitorId,
        command.chatId,
        companyId,
      ),
    );

    if (result.isErr()) {
      this.logger.error(
        `No se pudo cerrar la captación del visitante ${command.visitorId}: ${result.error.message}`,
      );
    }
  }

  /**
   * Las respuestas que no encajan en la ficha del lead se guardan tal cual,
   * más el recorrido completo para que el comercial entienda el contexto.
   */
  private buildAdditionalData(
    command: SubmitLeadCaptureCommand,
  ): Record<string, unknown> {
    const answers = command.data.answers ?? [];
    const extra: Record<string, unknown> = {};

    for (const answer of answers) {
      if (answer.field && !LEAD_FIELDS.has(answer.field)) {
        extra[answer.field] = answer.answer;
      }
    }

    return {
      ...extra,
      leadCapture: {
        flowId: command.data.flowId,
        capturedWithoutAgent: true,
        answers: answers.map((answer: LeadCaptureAnswer) => ({
          prompt: answer.prompt,
          answer: answer.answer,
        })),
      },
    };
  }

  private async recordConsents(
    command: SubmitLeadCaptureCommand,
    companyId: string,
    acceptedMarketing: boolean,
  ): Promise<void> {
    const metadata = {
      source: 'lead_capture',
      chatId: command.chatId,
      companyId,
    };

    await this.recordConsent(command, 'privacy_policy', metadata);
    if (acceptedMarketing) {
      await this.recordConsent(command, 'marketing', metadata);
    }
  }

  /**
   * Un fallo aquí no invalida el lead ya guardado, pero se deja constancia en
   * el log porque afecta al rastro de RGPD.
   */
  private async recordConsent(
    command: SubmitLeadCaptureCommand,
    consentType: 'privacy_policy' | 'marketing',
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      const result = await this.commandBus.execute<
        RecordConsentCommand,
        Result<string, ConsentError>
      >(
        new RecordConsentCommand(
          command.visitorId,
          consentType,
          getCurrentConsentVersion(),
          command.ipAddress,
          command.userAgent,
          metadata,
        ),
      );
      if (result.isErr()) {
        this.logger.error(
          `No se pudo registrar el consentimiento ${consentType} de la captación: ${result.error.message}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error al registrar el consentimiento ${consentType} de la captación: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
