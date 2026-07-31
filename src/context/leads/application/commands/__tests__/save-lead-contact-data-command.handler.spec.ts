import { Test } from '@nestjs/testing';
import { EventBus, EventPublisher } from '@nestjs/cqrs';
import {
  SaveLeadContactDataCommandHandler,
  meetsLeadCriteria,
} from '../save-lead-contact-data-command.handler';
import { SaveLeadContactDataCommand } from '../save-lead-contact-data.command';
import {
  ILeadContactDataRepository,
  LEAD_CONTACT_DATA_REPOSITORY,
} from '../../../domain/lead-contact-data.repository';
import {
  VisitorV2Repository,
  VISITOR_V2_REPOSITORY,
} from 'src/context/visitors-v2/domain/visitor-v2.repository';
import { ok, okVoid, err } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { LeadsPersistenceError } from '../../../domain/errors/leads.error';
import { VisitorLifecycleVO } from 'src/context/visitors-v2/domain/value-objects/visitor-lifecycle';

describe('meetsLeadCriteria', () => {
  it('requiere nombre y email', () => {
    expect(
      meetsLeadCriteria({ nombre: 'Juan', email: 'a@b.com', telefono: undefined }),
    ).toBe(true);
  });

  it('requiere nombre y telefono', () => {
    expect(
      meetsLeadCriteria({ nombre: 'Juan', email: undefined, telefono: '600' }),
    ).toBe(true);
  });

  it('rechaza solo nombre', () => {
    expect(
      meetsLeadCriteria({ nombre: 'Juan', email: undefined, telefono: undefined }),
    ).toBe(false);
  });

  it('rechaza email sin nombre', () => {
    expect(
      meetsLeadCriteria({ nombre: undefined, email: 'a@b.com', telefono: undefined }),
    ).toBe(false);
  });

  it('rechaza espacios en blanco', () => {
    expect(
      meetsLeadCriteria({ nombre: '  ', email: 'a@b.com', telefono: undefined }),
    ).toBe(false);
  });
});

describe('SaveLeadContactDataCommandHandler', () => {
  let handler: SaveLeadContactDataCommandHandler;
  let repository: jest.Mocked<ILeadContactDataRepository>;
  let eventBus: jest.Mocked<EventBus>;
  let visitorRepository: jest.Mocked<VisitorV2Repository>;
  let eventPublisher: jest.Mocked<EventPublisher>;

  const companyId = Uuid.random().value;
  const visitorId = Uuid.random().value;

  const createAnonVisitorMock = () => {
    const commit = jest.fn();
    const convertToLead = jest.fn();
    const getLifecycle = jest.fn().mockReturnValue(VisitorLifecycleVO.anon());
    const visitor = {
      convertToLead,
      getLifecycle,
      commit,
    };
    convertToLead.mockImplementation(() => {
      // simulate domain transition for assertions
    });
    return visitor;
  };

  beforeEach(async () => {
    repository = {
      save: jest.fn(),
      findByVisitorId: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findByEmail: jest.fn(),
      exists: jest.fn(),
      findByChatId: jest.fn(),
      findById: jest.fn(),
      findByCompanyId: jest.fn(),
    };

    eventBus = {
      publish: jest.fn(),
    } as any;

    visitorRepository = {
      findById: jest.fn(),
      save: jest.fn().mockResolvedValue(okVoid()),
    } as any;

    eventPublisher = {
      mergeObjectContext: jest.fn((agg) => agg),
    } as any;

    const module = await Test.createTestingModule({
      providers: [
        SaveLeadContactDataCommandHandler,
        {
          provide: LEAD_CONTACT_DATA_REPOSITORY,
          useValue: repository,
        },
        {
          provide: EventBus,
          useValue: eventBus,
        },
        {
          provide: VISITOR_V2_REPOSITORY,
          useValue: visitorRepository,
        },
        {
          provide: EventPublisher,
          useValue: eventPublisher,
        },
      ],
    }).compile();

    handler = module.get<SaveLeadContactDataCommandHandler>(
      SaveLeadContactDataCommandHandler,
    );
  });

  describe('execute', () => {
    it('debe crear nuevos datos de contacto cuando no existen', async () => {
      repository.findByVisitorId.mockResolvedValue(ok(null));
      repository.save.mockResolvedValue(okVoid());
      const visitor = createAnonVisitorMock();
      visitorRepository.findById.mockResolvedValue(ok(visitor as any));

      const command = new SaveLeadContactDataCommand({
        visitorId,
        companyId,
        nombre: 'Juan',
        email: 'juan@test.com',
      });

      const result = await handler.execute(command);

      expect(result.isOk()).toBe(true);
      expect(repository.save).toHaveBeenCalled();
      expect(eventBus.publish).toHaveBeenCalled();
      expect(visitor.convertToLead).toHaveBeenCalled();
      expect(visitorRepository.save).toHaveBeenCalled();
      expect(visitor.commit).toHaveBeenCalled();
    });

    it('no debe promover a LEAD con solo nombre', async () => {
      repository.findByVisitorId.mockResolvedValue(ok(null));
      repository.save.mockResolvedValue(okVoid());

      const command = new SaveLeadContactDataCommand({
        visitorId,
        companyId,
        nombre: 'Juan',
      });

      const result = await handler.execute(command);

      expect(result.isOk()).toBe(true);
      expect(visitorRepository.findById).not.toHaveBeenCalled();
    });

    it('debe promover a LEAD con nombre y telefono al crear', async () => {
      repository.findByVisitorId.mockResolvedValue(ok(null));
      repository.save.mockResolvedValue(okVoid());
      const visitor = createAnonVisitorMock();
      visitorRepository.findById.mockResolvedValue(ok(visitor as any));

      const command = new SaveLeadContactDataCommand({
        visitorId,
        companyId,
        nombre: 'Juan',
        telefono: '612345678',
      });

      const result = await handler.execute(command);

      expect(result.isOk()).toBe(true);
      expect(visitor.convertToLead).toHaveBeenCalled();
      expect(visitor.commit).toHaveBeenCalled();
    });

    it('debe promover a LEAD en update cuando se completa el criterio', async () => {
      const existingId = Uuid.random().value;
      repository.findByVisitorId.mockResolvedValue(
        ok({
          id: existingId,
          visitorId,
          companyId,
          nombre: 'Juan',
          extractedAt: new Date(),
        }),
      );
      repository.update.mockResolvedValue(okVoid());
      const visitor = createAnonVisitorMock();
      visitorRepository.findById.mockResolvedValue(ok(visitor as any));

      const command = new SaveLeadContactDataCommand({
        visitorId,
        companyId,
        telefono: '612345678',
      });

      const result = await handler.execute(command);

      expect(result.isOk()).toBe(true);
      expect(visitor.convertToLead).toHaveBeenCalled();
      expect(visitor.commit).toHaveBeenCalled();
    });

    it('no debe promover si el visitor ya es LEAD', async () => {
      repository.findByVisitorId.mockResolvedValue(ok(null));
      repository.save.mockResolvedValue(okVoid());
      const commit = jest.fn();
      const convertToLead = jest.fn();
      const visitor = {
        convertToLead,
        getLifecycle: jest.fn().mockReturnValue(VisitorLifecycleVO.lead()),
        commit,
      };
      visitorRepository.findById.mockResolvedValue(ok(visitor as any));

      const command = new SaveLeadContactDataCommand({
        visitorId,
        companyId,
        nombre: 'Juan',
        email: 'juan@test.com',
      });

      const result = await handler.execute(command);

      expect(result.isOk()).toBe(true);
      expect(convertToLead).not.toHaveBeenCalled();
      expect(commit).not.toHaveBeenCalled();
    });

    it('debe actualizar datos existentes haciendo merge parcial', async () => {
      const existingId = Uuid.random().value;
      repository.findByVisitorId.mockResolvedValue(
        ok({
          id: existingId,
          visitorId,
          companyId,
          nombre: 'Juan',
          email: 'juan@test.com',
          extractedAt: new Date(),
        }),
      );
      repository.update.mockResolvedValue(okVoid());
      const visitor = createAnonVisitorMock();
      visitorRepository.findById.mockResolvedValue(ok(visitor as any));

      const command = new SaveLeadContactDataCommand({
        visitorId,
        companyId,
        telefono: '612345678',
      });

      const result = await handler.execute(command);

      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe(existingId);
      expect(repository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          nombre: 'Juan',
          email: 'juan@test.com',
          telefono: '612345678',
        }),
      );
    });

    it('debe preservar datos existentes cuando los nuevos son undefined', async () => {
      const existingId = Uuid.random().value;
      repository.findByVisitorId.mockResolvedValue(
        ok({
          id: existingId,
          visitorId,
          companyId,
          nombre: 'Juan',
          apellidos: 'Garcia',
          email: 'juan@test.com',
          extractedAt: new Date(),
        }),
      );
      repository.update.mockResolvedValue(okVoid());
      const visitor = createAnonVisitorMock();
      visitorRepository.findById.mockResolvedValue(ok(visitor as any));

      const command = new SaveLeadContactDataCommand({
        visitorId,
        companyId,
        nombre: 'Pedro',
      });

      const result = await handler.execute(command);

      expect(result.isOk()).toBe(true);
      expect(repository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          nombre: 'Pedro',
          apellidos: 'Garcia',
        }),
      );
    });

    it('no debe fallar el guardado si la promocion a LEAD falla', async () => {
      repository.findByVisitorId.mockResolvedValue(ok(null));
      repository.save.mockResolvedValue(okVoid());
      visitorRepository.findById.mockResolvedValue(
        err(new LeadsPersistenceError('visitor missing') as any),
      );

      const command = new SaveLeadContactDataCommand({
        visitorId,
        companyId,
        nombre: 'Juan',
        email: 'juan@test.com',
      });

      const result = await handler.execute(command);

      expect(result.isOk()).toBe(true);
    });

    it('debe retornar error si falla la busqueda', async () => {
      repository.findByVisitorId.mockResolvedValue(
        err(new LeadsPersistenceError('DB error')),
      );

      const command = new SaveLeadContactDataCommand({
        visitorId,
        companyId,
        nombre: 'Juan',
      });

      const result = await handler.execute(command);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('DB error');
      }
    });

    it('debe retornar error si falla el guardado', async () => {
      repository.findByVisitorId.mockResolvedValue(ok(null));
      repository.save.mockResolvedValue(
        err(new LeadsPersistenceError('Save failed')),
      );

      const command = new SaveLeadContactDataCommand({
        visitorId,
        companyId,
        nombre: 'Juan',
      });

      const result = await handler.execute(command);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Save failed');
      }
    });

    it('debe retornar error si falla la actualizacion', async () => {
      repository.findByVisitorId.mockResolvedValue(
        ok({
          id: Uuid.random().value,
          visitorId,
          companyId,
          nombre: 'Juan',
          extractedAt: new Date(),
        }),
      );
      repository.update.mockResolvedValue(
        err(new LeadsPersistenceError('Update failed')),
      );

      const command = new SaveLeadContactDataCommand({
        visitorId,
        companyId,
        telefono: '612345678',
      });

      const result = await handler.execute(command);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Update failed');
      }
    });
  });
});
