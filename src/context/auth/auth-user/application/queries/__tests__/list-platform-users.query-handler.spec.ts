import { Test, TestingModule } from '@nestjs/testing';
import { ListPlatformUsersQueryHandler } from '../list-platform-users.query-handler';
import { ListPlatformUsersQuery } from '../list-platform-users.query';
import { USER_ACCOUNT_REPOSITORY } from '../../../domain/user-account.repository';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

describe('ListPlatformUsersQueryHandler', () => {
  let handler: ListPlatformUsersQueryHandler;
  let findAll: jest.Mock;

  beforeEach(async () => {
    findAll = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListPlatformUsersQueryHandler,
        { provide: USER_ACCOUNT_REPOSITORY, useValue: { findAll } },
      ],
    }).compile();
    handler = module.get(ListPlatformUsersQueryHandler);
  });

  it('debe devolver usuarios y summary por rol', async () => {
    const companyId = Uuid.random().value;
    findAll.mockResolvedValue([
      {
        toPrimitives: () => ({
          id: Uuid.random().value,
          email: 'a@test.com',
          name: 'Ada',
          password: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastLoginAt: null,
          roles: ['admin'],
          companyId,
          isActive: true,
          keycloakId: null,
          avatarUrl: null,
        }),
      },
      {
        toPrimitives: () => ({
          id: Uuid.random().value,
          email: 'b@test.com',
          name: 'Bob',
          password: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastLoginAt: null,
          roles: ['commercial', 'supervisor'],
          companyId,
          isActive: false,
          keycloakId: null,
          avatarUrl: null,
        }),
      },
    ]);

    const result = await handler.execute(new ListPlatformUsersQuery());
    expect(result.users).toHaveLength(2);
    expect(result.summary.total).toBe(2);
    expect(result.summary.active).toBe(1);
    expect(result.summary.inactive).toBe(1);
    expect(result.summary.byRole.admin).toBe(1);
    expect(result.summary.byRole.commercial).toBe(1);
    expect(result.summary.byRole.supervisor).toBe(1);
  });
});
