import { ListConnectionSessionsQueryHandler } from '../list-connection-sessions.query-handler';
import { ListConnectionSessionsQuery } from '../list-connection-sessions.query';
import { CommercialConnectionSessionRepository } from '../../../domain/commercial-connection-session.repository';
import { UserAccountRepository } from 'src/context/auth/auth-user/domain/user-account.repository';
import { UserAccount } from 'src/context/auth/auth-user/domain/user-account.aggregate';
import { UserAccountKeycloakId } from 'src/context/auth/auth-user/domain/value-objects/user-account-keycloak-id';
import { Optional } from 'src/context/shared/domain/optional';
import { ok } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

describe('ListConnectionSessionsQueryHandler', () => {
  let handler: ListConnectionSessionsQueryHandler;
  let sessionRepository: jest.Mocked<CommercialConnectionSessionRepository>;
  let userAccountRepository: jest.Mocked<UserAccountRepository>;

  const companyId = Uuid.random().value;
  const internalUserId = Uuid.random().value;
  const keycloakId = Uuid.random().value;

  const emptyPage = {
    sessions: [],
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
  };

  const filters = { page: 1, limit: 20 };

  beforeEach(() => {
    sessionRepository = {
      openSession: jest.fn(),
      closeOpenSession: jest.fn(),
      listOpenSessions: jest.fn(),
      search: jest.fn().mockResolvedValue(ok(emptyPage)),
      listByCommercial: jest.fn(),
      listByCompany: jest.fn(),
    };

    userAccountRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findByKeycloakId: jest.fn(),
      save: jest.fn(),
      findByCompanyId: jest.fn(),
      findAll: jest.fn(),
      delete: jest.fn(),
    };

    handler = new ListConnectionSessionsQueryHandler(
      sessionRepository,
      userAccountRepository,
    );
  });

  /** UserAccount con el id de Keycloak que usa la Console al conectar. */
  function userAccountWithKeycloakId(value: string): UserAccount {
    return {
      keycloakId: Optional.of(UserAccountKeycloakId.fromString(value)),
    } as unknown as UserAccount;
  }

  it('un comercial ve sus sesiones buscando por su id interno y el de Keycloak', async () => {
    userAccountRepository.findById.mockResolvedValue(
      userAccountWithKeycloakId(keycloakId),
    );

    await handler.execute(
      new ListConnectionSessionsQuery(
        companyId,
        internalUserId,
        ['commercial'],
        filters,
      ),
    );

    expect(userAccountRepository.findById).toHaveBeenCalledWith(internalUserId);
    expect(sessionRepository.search).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        commercialIds: [internalUserId, keycloakId],
      }),
    );
  });

  it('un comercial sin id de Keycloak sigue filtrando por su id interno', async () => {
    userAccountRepository.findById.mockResolvedValue(null);

    await handler.execute(
      new ListConnectionSessionsQuery(
        companyId,
        internalUserId,
        ['commercial'],
        filters,
      ),
    );

    expect(sessionRepository.search).toHaveBeenCalledWith(
      expect.objectContaining({ commercialIds: [internalUserId] }),
    );
  });

  it('un comercial ve sus sesiones aunque falle la lectura del usuario', async () => {
    userAccountRepository.findById.mockRejectedValue(new Error('sin conexión'));

    const result = await handler.execute(
      new ListConnectionSessionsQuery(
        companyId,
        internalUserId,
        ['commercial'],
        filters,
      ),
    );

    expect(result.isOk()).toBe(true);
    expect(sessionRepository.search).toHaveBeenCalledWith(
      expect.objectContaining({ commercialIds: [internalUserId] }),
    );
  });

  it('un admin ve toda la empresa sin filtrar por comercial', async () => {
    await handler.execute(
      new ListConnectionSessionsQuery(
        companyId,
        internalUserId,
        ['admin'],
        filters,
      ),
    );

    expect(userAccountRepository.findById).not.toHaveBeenCalled();
    expect(sessionRepository.search).toHaveBeenCalledWith(
      expect.objectContaining({ companyId, commercialIds: undefined }),
    );
  });

  it('un admin puede filtrar por un comercial concreto', async () => {
    const otherCommercialId = Uuid.random().value;

    await handler.execute(
      new ListConnectionSessionsQuery(
        companyId,
        internalUserId,
        ['supervisor'],
        {
          ...filters,
          commercialId: otherCommercialId,
        },
      ),
    );

    expect(sessionRepository.search).toHaveBeenCalledWith(
      expect.objectContaining({ commercialIds: [otherCommercialId] }),
    );
  });

  it('un comercial no puede filtrar por otro comercial', async () => {
    userAccountRepository.findById.mockResolvedValue(
      userAccountWithKeycloakId(keycloakId),
    );

    await handler.execute(
      new ListConnectionSessionsQuery(
        companyId,
        internalUserId,
        ['commercial'],
        {
          ...filters,
          commercialId: Uuid.random().value,
        },
      ),
    );

    expect(sessionRepository.search).toHaveBeenCalledWith(
      expect.objectContaining({
        commercialIds: [internalUserId, keycloakId],
      }),
    );
  });
});
