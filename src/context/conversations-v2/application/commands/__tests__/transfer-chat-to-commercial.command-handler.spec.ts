import { Test, TestingModule } from '@nestjs/testing';
import { EventPublisher } from '@nestjs/cqrs';
import {
  TransferChatToCommercialCommandHandler,
  TransferChatToCommercialError,
} from '../transfer-chat-to-commercial.command-handler';
import { TransferChatToCommercialCommand } from '../transfer-chat-to-commercial.command';
import { CHAT_V2_REPOSITORY } from '../../../domain/chat.repository';
import { MESSAGE_V2_REPOSITORY } from '../../../domain/message.repository';
import { COMMERCIAL_CONNECTION_DOMAIN_SERVICE } from '../../../../commercial/domain/commercial-connection.domain-service';
import { COMMERCIAL_REPOSITORY } from '../../../../commercial/domain/commercial.repository';
import { ok, err, okVoid } from '../../../../shared/domain/result';
import { Uuid } from '../../../../shared/domain/value-objects/uuid';

describe('TransferChatToCommercialCommandHandler', () => {
  let handler: TransferChatToCommercialCommandHandler;
  let mockChatRepository: jest.Mocked<any>;
  let mockMessageRepository: jest.Mocked<any>;
  let mockCommercialConnectionService: jest.Mocked<any>;
  let mockCommercialRepository: jest.Mocked<any>;
  let mockEventPublisher: jest.Mocked<EventPublisher>;

  beforeEach(async () => {
    mockChatRepository = {
      findById: jest.fn(),
      update: jest.fn(),
    };

    mockMessageRepository = {
      save: jest.fn().mockResolvedValue(okVoid()),
    };

    mockCommercialConnectionService = {
      isCommercialOnline: jest.fn(),
    };

    mockCommercialRepository = {
      findById: jest.fn().mockResolvedValue(
        ok({
          name: { value: 'Comercial Test' },
        }),
      ),
    };

    mockEventPublisher = {
      mergeObjectContext: jest.fn().mockImplementation((agg) => ({
        ...agg,
        commit: jest.fn(),
      })),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransferChatToCommercialCommandHandler,
        {
          provide: CHAT_V2_REPOSITORY,
          useValue: mockChatRepository,
        },
        {
          provide: MESSAGE_V2_REPOSITORY,
          useValue: mockMessageRepository,
        },
        {
          provide: COMMERCIAL_CONNECTION_DOMAIN_SERVICE,
          useValue: mockCommercialConnectionService,
        },
        {
          provide: COMMERCIAL_REPOSITORY,
          useValue: mockCommercialRepository,
        },
        {
          provide: EventPublisher,
          useValue: mockEventPublisher,
        },
      ],
    }).compile();

    handler = module.get(TransferChatToCommercialCommandHandler);
  });

  describe('execute', () => {
    const chatId = Uuid.random().value;
    const fromCommercialId = Uuid.random().value;
    const toCommercialId = Uuid.random().value;

    const validCommand = new TransferChatToCommercialCommand({
      chatId,
      commercialId: toCommercialId,
      transferredBy: fromCommercialId,
    });

    it('debe transferir exitosamente y guardar mensaje de sistema', async () => {
      const mockChat = {
        status: { canBeTransferred: () => true, value: 'ASSIGNED' },
        assignedCommercialId: {
          isPresent: () => true,
          get: () => ({ getValue: () => fromCommercialId }),
        },
        transferTo: jest.fn().mockReturnValue('transferred-chat'),
      };

      mockChatRepository.findById.mockResolvedValue(ok(mockChat));
      mockChatRepository.update.mockResolvedValue(ok(undefined));
      mockCommercialConnectionService.isCommercialOnline.mockResolvedValue(
        true,
      );

      const result = await handler.execute(validCommand);

      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toEqual({
        assignedCommercialId: toCommercialId,
      });
      expect(mockChat.transferTo).toHaveBeenCalledWith(toCommercialId, {
        transferredBy: fromCommercialId,
      });
      expect(mockMessageRepository.save).toHaveBeenCalled();
      expect(mockEventPublisher.mergeObjectContext).toHaveBeenCalled();
    });

    it('debe retornar error si el comercial de destino está offline', async () => {
      const mockChat = {
        status: { canBeTransferred: () => true, value: 'ACTIVE' },
        assignedCommercialId: {
          isPresent: () => true,
          get: () => ({ getValue: () => fromCommercialId }),
        },
        transferTo: jest.fn(),
      };

      mockChatRepository.findById.mockResolvedValue(ok(mockChat));
      mockCommercialConnectionService.isCommercialOnline.mockResolvedValue(
        false,
      );

      const result = await handler.execute(validCommand);

      expect(result.isErr()).toBe(true);
      result.fold(
        (error) => expect(error.message).toContain('no está conectado'),
        () => {
          throw new Error('Se esperaba un error');
        },
      );
      expect(mockChat.transferTo).not.toHaveBeenCalled();
      expect(mockMessageRepository.save).not.toHaveBeenCalled();
    });

    it('debe retornar error si quien transfiere no es el asignado', async () => {
      const otherId = Uuid.random().value;
      const mockChat = {
        status: { canBeTransferred: () => true, value: 'ACTIVE' },
        assignedCommercialId: {
          isPresent: () => true,
          get: () => ({ getValue: () => otherId }),
        },
        transferTo: jest.fn(),
      };

      mockChatRepository.findById.mockResolvedValue(ok(mockChat));

      const result = await handler.execute(validCommand);

      expect(result.isErr()).toBe(true);
      result.fold(
        (error) =>
          expect(error.message).toContain(
            'Solo el comercial asignado puede transferir',
          ),
        () => {
          throw new Error('Se esperaba un error');
        },
      );
      expect(mockChat.transferTo).not.toHaveBeenCalled();
    });

    it('debe retornar error si el chat no puede transferirse', async () => {
      const mockChat = {
        status: { canBeTransferred: () => false, value: 'PENDING' },
        assignedCommercialId: {
          isPresent: () => false,
        },
      };

      mockChatRepository.findById.mockResolvedValue(ok(mockChat));

      const result = await handler.execute(validCommand);

      expect(result.isErr()).toBe(true);
      result.fold(
        (error) => expect(error.message).toContain('no puede transferirse'),
        () => {
          throw new Error('Se esperaba un error');
        },
      );
    });

    it('debe retornar error si el chat no existe', async () => {
      mockChatRepository.findById.mockResolvedValue(
        err(new TransferChatToCommercialError('Chat no encontrado')),
      );

      const result = await handler.execute(validCommand);

      expect(result.isErr()).toBe(true);
      result.fold(
        (error) => expect(error.message).toContain('Chat no encontrado'),
        () => {
          throw new Error('Se esperaba un error');
        },
      );
    });
  });
});
