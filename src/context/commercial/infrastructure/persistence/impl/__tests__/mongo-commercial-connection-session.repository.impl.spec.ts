import { Model } from 'mongoose';
import { MongoCommercialConnectionSessionRepositoryImpl } from '../mongo-commercial-connection-session.repository.impl';
import { CommercialConnectionSessionSchema } from '../../schemas/commercial-connection-session.schema';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

type ModelMock = {
  findOne: jest.Mock;
  find: jest.Mock;
  create: jest.Mock;
  countDocuments: jest.Mock;
};

interface SessionDocMock {
  id: string;
  commercialId: string;
  companyId: string;
  commercialDisplayName: string | null;
  startedAt: Date;
  endedAt: Date | null;
  durationMs: number | null;
  endReason: string | null;
  save: jest.Mock;
  toObject: () => Record<string, unknown>;
}

describe('MongoCommercialConnectionSessionRepositoryImpl', () => {
  let model: ModelMock;
  let repository: MongoCommercialConnectionSessionRepositoryImpl;

  const commercialId = Uuid.random().value;
  const companyId = Uuid.random().value;

  beforeEach(() => {
    model = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      countDocuments: jest.fn(),
    };

    repository = new MongoCommercialConnectionSessionRepositoryImpl(
      model as unknown as Model<CommercialConnectionSessionSchema>,
    );
  });

  /** Documento de Mongoose reducido a lo que usa el repositorio. */
  function sessionDoc(overrides: Partial<SessionDocMock> = {}): SessionDocMock {
    const doc = {
      id: Uuid.random().value,
      commercialId,
      companyId,
      commercialDisplayName: null,
      startedAt: new Date('2026-09-18T09:00:00.000Z'),
      endedAt: null,
      durationMs: null,
      endReason: null,
      save: jest.fn(),
      ...overrides,
    } as SessionDocMock;
    // toObject lee el estado actual: el repositorio muta el documento y guarda.
    doc.toObject = () => ({ ...doc });
    return doc;
  }

  describe('openSession', () => {
    it('reutiliza la sesión abierta en vez de crear otra', async () => {
      const open = sessionDoc();
      model.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(open),
      });

      const result = await repository.openSession({ commercialId, companyId });

      expect(result.isOk()).toBe(true);
      expect(result.unwrap().id).toBe(open.id);
      expect(model.create).not.toHaveBeenCalled();
    });

    it('completa el nombre de la sesión abierta cuando estaba vacío', async () => {
      const open = sessionDoc();
      model.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(open),
      });

      await repository.openSession({
        commercialId,
        companyId,
        commercialDisplayName: 'Ana Comercial',
      });

      expect(open.commercialDisplayName).toBe('Ana Comercial');
      expect(open.save).toHaveBeenCalled();
    });

    it('crea la sesión cuando no hay ninguna abierta', async () => {
      model.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      model.create.mockImplementation((doc: Partial<SessionDocMock>) =>
        Promise.resolve(sessionDoc(doc)),
      );

      const result = await repository.openSession({
        commercialId,
        companyId,
        commercialDisplayName: 'Ana Comercial',
      });

      expect(result.isOk()).toBe(true);
      expect(model.create).toHaveBeenCalledWith(
        expect.objectContaining({
          commercialId,
          companyId,
          commercialDisplayName: 'Ana Comercial',
          endedAt: null,
        }),
      );
    });

    it('devuelve la sesión ganadora si el índice único rechaza una carrera', async () => {
      const winner = sessionDoc();
      model.findOne
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) })
        .mockReturnValueOnce({
          lean: () => ({ exec: jest.fn().mockResolvedValue(winner) }),
        });
      model.create.mockRejectedValue({ code: 11000 });

      const result = await repository.openSession({ commercialId, companyId });

      expect(result.isOk()).toBe(true);
      expect(result.unwrap().id).toBe(winner.id);
    });
  });

  describe('closeOpenSession', () => {
    it('cierra con duración y motivo', async () => {
      const startedAt = new Date('2026-09-18T09:00:00.000Z');
      const endedAt = new Date('2026-09-18T09:30:00.000Z');
      const open = sessionDoc({ startedAt });
      model.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(open),
      });

      const result = await repository.closeOpenSession({
        commercialId,
        endedAt,
        endReason: 'logout',
      });

      expect(result.isOk()).toBe(true);
      const closed = result.unwrap()!;
      expect(closed.endedAt).toEqual(endedAt);
      expect(closed.durationMs).toBe(30 * 60 * 1000);
      expect(closed.endReason).toBe('logout');
      expect(open.save).toHaveBeenCalled();
    });

    it('usa unknown cuando no llega motivo', async () => {
      const open = sessionDoc();
      model.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(open),
      });

      const result = await repository.closeOpenSession({ commercialId });

      expect(result.unwrap()!.endReason).toBe('unknown');
    });

    it('no falla cuando no hay sesión abierta', async () => {
      model.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await repository.closeOpenSession({
        commercialId,
        endReason: 'manual',
      });

      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBeNull();
    });
  });

  describe('search', () => {
    beforeEach(() => {
      model.find.mockReturnValue({
        sort: () => ({
          skip: () => ({
            limit: () => ({
              lean: () => ({ exec: jest.fn().mockResolvedValue([]) }),
            }),
          }),
        }),
      });
      model.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      });
    });

    it('filtra por un único comercial sin usar $in', async () => {
      await repository.search({
        companyId,
        commercialIds: [commercialId],
        page: 1,
        limit: 20,
      });

      expect(model.find).toHaveBeenCalledWith({ companyId, commercialId });
    });

    it('filtra por varios identificadores del mismo comercial', async () => {
      const keycloakId = Uuid.random().value;

      await repository.search({
        companyId,
        commercialIds: [commercialId, keycloakId],
        page: 1,
        limit: 20,
      });

      expect(model.find).toHaveBeenCalledWith({
        companyId,
        commercialId: { $in: [commercialId, keycloakId] },
      });
    });

    it('sin comerciales devuelve toda la empresa', async () => {
      await repository.search({ companyId, page: 1, limit: 20 });

      expect(model.find).toHaveBeenCalledWith({ companyId });
    });
  });

  describe('listOpenSessions', () => {
    it('devuelve solo las sesiones sin cerrar', async () => {
      const exec = jest.fn().mockResolvedValue([sessionDoc().toObject()]);
      model.find.mockReturnValue({
        sort: () => ({ limit: () => ({ lean: () => ({ exec }) }) }),
      });

      const result = await repository.listOpenSessions();

      expect(model.find).toHaveBeenCalledWith({ endedAt: null });
      expect(result.unwrap()).toHaveLength(1);
    });
  });
});
