import 'reflect-metadata';
import { EventPublisher } from '@nestjs/cqrs';
import { JoinWaitingRoomCommandHandler } from '../join-waiting-room.command-handler';
import { JoinWaitingRoomCommand } from '../join-waiting-room.command';
import { IChatRepository } from '../../../domain/chat.repository';
import { ok, err } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';

describe('JoinWaitingRoomCommandHandler', () => {
  let handler: JoinWaitingRoomCommandHandler;
  let chatRepository: jest.Mocked<IChatRepository>;
  let publisher: jest.Mocked<EventPublisher>;
  let commitMock: jest.Mock;

  beforeEach(() => {
    commitMock = jest.fn();
    chatRepository = {
      save: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      findOne: jest.fn(),
      match: jest.fn(),
      findByCommercialId: jest.fn(),
      findByVisitorId: jest.fn(),
      getPendingQueue: jest.fn(),
      getAvailableChats: jest.fn(),
      findByDateRange: jest.fn(),
      countByStatus: jest.fn(),
      getCommercialMetrics: jest.fn(),
      findWithUnreadMessages: jest.fn(),
      findByDepartment: jest.fn(),
      findOverdueChats: jest.fn(),
      getResponseTimeStats: jest.fn(),
      countPendingCreatedBefore: jest.fn(),
    } as unknown as jest.Mocked<IChatRepository>;

    publisher = {
      mergeObjectContext: jest.fn((aggregate: { commit: () => void }) => {
        aggregate.commit = commitMock;
        return aggregate;
      }),
    } as unknown as jest.Mocked<EventPublisher>;

    handler = new JoinWaitingRoomCommandHandler(chatRepository, publisher);
  });

  it('crea un chat pendiente, publica eventos y devuelve posición (sumando 1)', async () => {
    const command = new JoinWaitingRoomCommand(
      '550e8400-e29b-41d4-a716-446655440000',
      { name: 'Test' },
      { department: 'sales' },
      '21908c1b-8836-42f1-b0c9-74d36a05d8ff',
    );
    chatRepository.save.mockResolvedValue(ok(undefined));
    chatRepository.countPendingCreatedBefore.mockResolvedValue(ok(4));

    const result = await handler.execute(command);

    expect(publisher.mergeObjectContext).toHaveBeenCalledTimes(1);
    expect(chatRepository.save).toHaveBeenCalledTimes(1);
    expect(chatRepository.countPendingCreatedBefore).toHaveBeenCalledTimes(1);
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(result.position).toBe(5);
    expect(result.chatId).toBeDefined();
  });

  it('retorna posición 1 si el conteo falla', async () => {
    const command = new JoinWaitingRoomCommand(
      '6f1a7c18-2e8e-4d3a-9b4f-2bb2b5f8a111',
      {},
      {},
    );
    chatRepository.save.mockResolvedValue(ok(undefined));

    class DummyError extends DomainError {
      constructor() {
        super('fail');
      }
    }
    chatRepository.countPendingCreatedBefore.mockResolvedValue(
      err(new DummyError()),
    );

    const result = await handler.execute(command);

    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(result.position).toBe(1);
  });

  it('lanza error si save falla y no hace commit', async () => {
    const command = new JoinWaitingRoomCommand(
      '9a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
      {},
      {},
    );
    class SaveError extends DomainError {
      constructor() {
        super('save error');
      }
    }
    chatRepository.save.mockResolvedValue(err(new SaveError()));

    await expect(handler.execute(command)).rejects.toBeInstanceOf(SaveError);
    expect(commitMock).not.toHaveBeenCalled();
  });
});
